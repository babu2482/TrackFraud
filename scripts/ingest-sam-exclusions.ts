#!/usr/bin/env tsx
/**
 * SAM.gov Exclusions Ingestion Script
 *
 * Ingests the System for Award Management (SAM) exclusions list via the
 * official SAM.gov Exclusions API (v4).
 *
 * Source: https://api.sam.gov/entity-information/v4/exclusions
 * Data Format: JSON API (paginated) or async CSV extract
 * Update Frequency: Daily
 * Records: ~163,000+ excluded entities
 *
 * This is a CRITICAL data source for fraud detection as it includes:
 * - Debarred contractors (excluded from federal contracts)
 * - Suspended entities under investigation
 * - Entities excluded from non-contract federal assistance
 * - HHS OIG exclusions (Medicare/Medicaid ineligible)
 *
 * API Key Required: Register at SAM.gov → Account Details → Generate API Key
 *   Free personal key: 10 records/page, max 10,000 synchronous records
 *   System account key: Higher limits, required for full extraction
 *
 * Usage:
 *   export SAM_API_KEY="your-sam-gov-api-key"
 *   npx tsx scripts/ingest-sam-exclusions.ts [--max-rows N] [--full]
 *
 * API Documentation:
 *   https://open.gsa.gov/api/exclusions-api/
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "fs";
import { parse } from "csv-parse/sync";

// ============================================================
// Configuration
// ============================================================

const SOURCE_SYSTEM_SLUG = "sam-exclusions-list";
const STORAGE_DIR = "./data/government/sam";

// SAM.gov Exclusions API v4 endpoint (requires API key)
const SAM_API_BASE = process.env.SAM_API_BASE || "https://api.sam.gov";
const SAM_API_KEY = process.env.SAM_API_KEY || "";

// API endpoint for exclusions
const SAM_EXCLUSIONS_API = `${SAM_API_BASE}/entity-information/v4/exclusions`;

// Page size (max 10 for free personal key, can be higher for system accounts)
const PAGE_SIZE = 10;
const MAX_SYNC_RECORDS = 10000; // API limit for synchronous queries

interface SAMExclusionRecord {
  exclusionDetails: {
    classificationType: string; // "Firm" | "Individual" | "Special Entity Designation"
    exclusionType: string; // "Ineligible (Proceedings Pending)" | "Ineligible (Proceedings Completed)" | "Prohibition/Restriction"
    exclusionProgram: string; // "Reciprocal" | "Primary"
    excludingAgencyCode: string;
    excludingAgencyName: string;
  };
  exclusionIdentification: {
    ueiSAM?: string | null;
    cageCode?: string | null;
    npi?: string | null;
    prefix?: string | null;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    suffix?: string | null;
    entityName?: string | null;
    dnbOpenData?: any | null;
  };
  exclusionActions?: {
    listOfActions: Array<{
      createDate: string;
      updateDate: string;
      activateDate: string;
      terminationDate?: string | null;
      terminationType?: string | null; // "Definite" | "Indefinite"
      recordStatus: string; // "Active"
    }>;
  };
  exclusionPrimaryAddress?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateOrProvinceCode?: string | null;
    zipCode?: string | null;
    zipCodePlus4?: string | null;
    countryCode?: string | null;
  };
  exclusionSecondaryAddress?: any[];
  exclusionOtherInformation?: {
    isFASCSAOrder?: string; // "Yes" | "No"
    additionalComments?: string | null;
    ctCode?: string | null;
    evsInvestigationStatus?: string | null;
    references?: {
      referencesList: Array<{
        exclusionName?: string | null;
        type?: string | null;
      }>;
    };
    moreLocations?: Array<{
      exclusionName?: string | null;
      ueiSAM?: string | null;
      cageCode?: string | null;
      npi?: string | null;
      primaryAddress?: {
        addressLine1?: string | null;
        city?: string | null;
        stateOrProvinceCode?: string | null;
        zipCode?: string | null;
        countryCode?: string | null;
      };
    }>;
  };
  vesselDetails?: {
    callSign?: string | null;
    type?: string | null;
    tonnage?: string | null;
    grt?: string | null;
    flag?: string | null;
    owner?: string | null;
  };
}

interface SAMAPIResponse {
  totalRecords: number;
  excludedEntity: SAMExclusionRecord[];
  links?: {
    selfLink?: string;
    nextLink?: string;
  };
}

interface ParsedExclusion {
  uei: string;
  legalName: string;
  exclusionReasons: string[];
  effectiveDate: Date;
  expirationDate?: Date;
  issuingAgency: string;
  entityType: string; // "firm" | "individual" | "special_entity"
  exclusionType: string;
  countryCode?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  additionalInfo?: Record<string, any>;
}

// ============================================================
// Source System Management
// ============================================================

async function getSourceSystemId(): Promise<string> {
  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: SOURCE_SYSTEM_SLUG },
  });

  if (!sourceSystem) {
    // categoryId is a plain slug string (source of truth: lib/categories.ts)
    const categoryId = "government";

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: SOURCE_SYSTEM_SLUG,
        categoryId,
        name: "SAM.gov Exclusions List",
        slug: SOURCE_SYSTEM_SLUG,
        description:
          "Excluded entities from System for Award Management (SAM.gov). Includes debarred, suspended, and ineligible entities excluded from federal contracts and assistance programs.",
        ingestionMode: "api",
        baseUrl: "https://api.sam.gov/entity-information/v4/exclusions",
        refreshCadence: "daily",
        freshnessSlaHours: 24,
        supportsIncremental: false,
      },
    });

    console.log(`✅ Created source system: ${sourceSystem.name}`);
  }

  return sourceSystem.id;
}

// ============================================================
// API Client
// ============================================================

async function fetchExclusionsPage(
  page: number,
  size: number = PAGE_SIZE,
): Promise<SAMAPIResponse | null> {
  const url = `${SAM_EXCLUSIONS_API}?api_key=${SAM_API_KEY}&page=${page}&size=${size}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrackFraud/1.0 (Fraud Tracking Platform)",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Authentication failed (HTTP ${response.status}). Check your SAM_API_KEY. ` +
            `Generate a key at: https://sam.gov → Account Details → API Key`,
        );
      }
      if (response.status === 429) {
        // Rate limited — wait and retry
        console.log(`  ⏳ Rate limited. Waiting 5 seconds...`);
        await new Promise((r) => setTimeout(r, 5000));
        return fetchExclusionsPage(page, size);
      }
      throw new Error(`API request failed: HTTP ${response.status}`);
    }

    const data: SAMAPIResponse = await response.json();
    return data;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.warn(`  ⚠️ Request timeout for page ${page}`);
    } else {
      console.warn(`  ⚠️ Error fetching page ${page}: ${error.message}`);
    }
    return null;
  }
}

async function fetchAllExclusions(
  maxRows: number | null = null,
): Promise<SAMExclusionRecord[]> {
  console.log(`📡 Connecting to SAM.gov Exclusions API...`);
  console.log(`   Endpoint: ${SAM_EXCLUSIONS_API}`);
  console.log(`   API Key: ${SAM_API_KEY ? "✅ Set" : "❌ Not set"}`);
  console.log("");

  if (!SAM_API_KEY) {
    console.error(
      "❌ SAM_API_KEY is required. Set it in your .env file or export it:",
    );
    console.error("");
    console.error("   export SAM_API_KEY='your-api-key'");
    console.error("");
    console.error(
      "Get a free key at: https://sam.gov → Account Details → API Key",
    );
    throw new Error("SAM_API_KEY environment variable is not set");
  }

  const allRecords: SAMExclusionRecord[] = [];
  let currentPage = 0;
  let totalPages = 0;
  let totalRecords = 0;

  // Fetch first page to get total count
  const firstPage = await fetchExclusionsPage(currentPage);
  if (!firstPage) {
    throw new Error("Failed to fetch first page from SAM.gov API");
  }

  totalRecords = firstPage.totalRecords;
  totalPages = Math.ceil(totalRecords / PAGE_SIZE);

  console.log(`📊 Total records available: ${totalRecords.toLocaleString()}`);
  console.log(`📊 Total pages: ${totalPages}`);

  if (maxRows) {
    const limitedPages = Math.min(Math.ceil(maxRows / PAGE_SIZE), totalPages);
    console.log(`⚠️ Limiting to ${maxRows} records (${limitedPages} pages)`);
    totalPages = limitedPages;
  }

  // Add first page records
  allRecords.push(...(firstPage.excludedEntity || []));
  currentPage++;

  // Fetch remaining pages
  while (currentPage < totalPages) {
    console.log(
      `   Fetching page ${currentPage + 1}/${totalPages} (${allRecords.length}/${totalRecords})...`,
    );

    const page = await fetchExclusionsPage(currentPage);
    if (!page) {
      console.warn(`   ⚠️ Failed to fetch page ${currentPage}. Skipping...`);
      currentPage++;
      continue;
    }

    if (page.excludedEntity && page.excludedEntity.length > 0) {
      allRecords.push(...page.excludedEntity);
    }

    currentPage++;

    // Rate limiting: small delay between requests
    if (currentPage < totalPages) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(
    `\n✅ Fetched ${allRecords.length} exclusion records from SAM.gov`,
  );
  return allRecords;
}

// ============================================================
// Data Parsing
// ============================================================

function parseSAMDate(dateStr: string | undefined | null): Date | undefined {
  if (!dateStr || dateStr.trim() === "" || dateStr.toLowerCase() === "null")
    return undefined;

  const trimmed = dateStr.trim();

  // SAM.gov uses MM-DD-YYYY format
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // Fallback
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;

  return undefined;
}

function parseExclusionRecord(
  record: SAMExclusionRecord,
): ParsedExclusion | null {
  try {
    const identification = record.exclusionIdentification || {};
    const details = record.exclusionDetails || {};
    const actions = record.exclusionActions || {};
    const address = record.exclusionPrimaryAddress || {};
    const otherInfo = record.exclusionOtherInformation || {};

    // Generate a unique ID: prefer UEI, then CAGE, then NPI, then name-based
    const uei = identification.ueiSAM?.trim() || "";
    const cageCode = identification.cageCode?.trim() || "";
    const npi = identification.npi?.trim() || "";

    let uniqueId = uei || cageCode || npi || "";

    // For individuals without UEI, generate ID from name
    if (!uniqueId) {
      const firstName = identification.firstName?.trim() || "";
      const lastName = identification.lastName?.trim() || "";
      const entityName = identification.entityName?.trim() || "";
      uniqueId = `SAM_${entityName || `${firstName}_${lastName}`}`
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 50);
    }

    // Build display name
    let legalName = identification.entityName?.trim() || "";
    if (!legalName) {
      const prefix = identification.prefix?.trim() || "";
      const firstName = identification.firstName?.trim() || "";
      const middleName = identification.middleName?.trim() || "";
      const lastName = identification.lastName?.trim() || "";
      const suffix = identification.suffix?.trim() || "";
      legalName = [prefix, firstName, middleName, lastName, suffix]
        .filter(Boolean)
        .join(" ");
    }

    if (!legalName) {
      return null;
    }

    // Collect exclusion reasons
    const exclusionReasons: string[] = [];
    if (details.exclusionType) exclusionReasons.push(details.exclusionType);
    if (details.exclusionProgram)
      exclusionReasons.push(details.exclusionProgram);
    if (details.excludingAgencyName)
      exclusionReasons.push(`Agency: ${details.excludingAgencyName}`);

    // Parse dates from actions
    const actionList = actions.listOfActions || [];
    let effectiveDate: Date | undefined;
    let expirationDate: Date | undefined;

    if (actionList.length > 0) {
      const action = actionList[actionList.length - 1]; // Most recent action
      effectiveDate = parseSAMDate(action.activateDate);
      expirationDate = parseSAMDate(action.terminationDate);
    }

    // If no action dates, try other sources
    if (!effectiveDate) {
      effectiveDate = parseSAMDate(actionList[0]?.createDate) || new Date();
    }

    if (!effectiveDate) {
      return null; // Require at least an effective date
    }

    // Entity type mapping
    const entityType =
      details.classificationType?.toLowerCase().replace(/\s+/g, "_") ||
      "unknown";

    // Build address string
    const addressParts = [
      address.addressLine1?.trim(),
      address.addressLine2?.trim(),
      address.city?.trim(),
      address.stateOrProvinceCode?.trim(),
      address.zipCode?.trim(),
    ].filter(Boolean);

    // Additional info for storage
    const additionalInfo: Record<string, any> = {
      cageCode: cageCode || undefined,
      npi: npi || undefined,
      countryCode: address.countryCode?.trim() || undefined,
      isFASCSAOrder: otherInfo.isFASCSAOrder || undefined,
      additionalComments: otherInfo.additionalComments?.trim() || undefined,
      recordStatus: actionList[0]?.recordStatus || undefined,
      terminationType: actionList[0]?.terminationType || undefined,
      moreLocations: otherInfo.moreLocations || undefined,
      vesselDetails: record.vesselDetails || undefined,
    };

    return {
      uei: uniqueId,
      legalName,
      exclusionReasons:
        exclusionReasons.length > 0 ? exclusionReasons : ["Unknown"],
      effectiveDate,
      expirationDate,
      issuingAgency:
        details.excludingAgencyName || details.excludingAgencyCode || "Unknown",
      entityType,
      exclusionType: details.exclusionType || "Unknown",
      countryCode: address.countryCode?.trim() || undefined,
      address: addressParts.length > 0 ? addressParts.join(", ") : undefined,
      city: address.city?.trim() || undefined,
      state: address.stateOrProvinceCode?.trim() || undefined,
      zipCode: address.zipCode?.trim() || undefined,
      additionalInfo:
        Object.keys(additionalInfo).length > 0 ? additionalInfo : undefined,
    };
  } catch (error) {
    console.error(`  ❌ Error parsing record:`, error);
    return null;
  }
}

// ============================================================
// Ingestion
// ============================================================

async function ingestExclusions(
  records: SAMExclusionRecord[],
  maxRows: number | null = null,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const sourceSystemId = await getSourceSystemId();

  console.log(`\n🔄 Processing exclusion records...`);

  // Limit if testing
  let recordsToProcess = records;
  if (maxRows && records.length > maxRows) {
    console.log(`⚠️ Limiting to first ${maxRows} records for testing`);
    recordsToProcess = records.slice(0, maxRows);
  }

  console.log(`📊 Records to process: ${recordsToProcess.length}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 100;

  for (let i = 0; i < recordsToProcess.length; i += batchSize) {
    const batch = recordsToProcess.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (rawRecord) => {
        try {
          const exclusion = parseExclusionRecord(rawRecord);

          if (!exclusion) {
            skipped++;
            return;
          }

          // Upsert record
          const result = await prisma.sAMExclusion.upsert({
            where: { uei: exclusion.uei },
            update: {
              legalName: exclusion.legalName,
              exclusionReasons: exclusion.exclusionReasons,
              effectiveDate: exclusion.effectiveDate,
              expirationDate: exclusion.expirationDate,
              issuingAgency: exclusion.issuingAgency,
              updatedAt: new Date(),
            },
            create: {
              sourceSystemId,
              uei: exclusion.uei,
              legalName: exclusion.legalName,
              exclusionReasons: exclusion.exclusionReasons,
              effectiveDate: exclusion.effectiveDate,
              expirationDate: exclusion.expirationDate,
              issuingAgency: exclusion.issuingAgency,
            },
          });

          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`  ❌ Error processing record:`, error);
          failed++;
        }
      }),
    );

    // Progress update
    const processed = Math.min(i + batchSize, recordsToProcess.length);
    const percent = Math.round((processed / recordsToProcess.length) * 100);
    console.log(
      `   Progress: ${percent}% (${processed}/${recordsToProcess.length}) — ` +
        `Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
    );

    // Small delay between batches
    if (i + batchSize < recordsToProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  return { inserted, updated, skipped, failed };
}

// ============================================================
// Status Tracking
// ============================================================

async function updateSourceSystemStatus(
  sourceSystemId: string,
  stats: { inserted: number; updated: number; skipped: number; failed: number },
  bytesDownloaded: number,
): Promise<void> {
  await prisma.sourceSystem.update({
    where: { id: sourceSystemId },
    data: {
      lastAttemptedSyncAt: new Date(),
      lastSuccessfulSyncAt: stats.failed === 0 ? new Date() : undefined,
      lastError:
        stats.failed > 0 ? `${stats.failed} records failed to process` : null,
    },
  });

  // Create ingestion run record
  await prisma.ingestionRun.create({
    data: {
      sourceSystemId,
      runType: "full",
      status: stats.failed > 0 ? "partial_success" : "completed",
      rowsRead: stats.inserted + stats.updated + stats.skipped,
      rowsInserted: stats.inserted,
      rowsUpdated: stats.updated,
      rowsSkipped: stats.skipped,
      rowsFailed: stats.failed,
      bytesDownloaded: BigInt(bytesDownloaded),
    },
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const maxRowsArg = args.find(
    (a) => a.startsWith("--max-rows=") || a.startsWith("--max-rows"),
  );
  const maxRows = maxRowsArg
    ? parseInt(
        (maxRowsArg as string).split("=")[1] ||
          args[args.indexOf(maxRowsArg) + 1] ||
          "0",
        10,
      )
    : null;
  const fullMode = args.includes("--full");

  console.log("═".repeat(70));
  console.log("🏛️  SAM.gov Exclusions List Ingestion");
  console.log("═".repeat(70));
  console.log(`Source: ${SAM_EXCLUSIONS_API}`);
  console.log(
    `Mode: ${fullMode ? "Full" : maxRows ? `Test (${maxRows} rows)` : "Full (no limit)"}`,
  );
  console.log("");

  const startTime = Date.now();

  try {
    // Step 1: Ensure source system exists
    const sourceSystemId = await getSourceSystemId();

    // Step 2: Fetch exclusions via API
    console.log("📡 Fetching exclusions from SAM.gov API...");
    const records = await fetchAllExclusions(maxRows);

    if (records.length === 0) {
      console.log("⚠️ No exclusion records returned from API.");
      console.log("   Verify your SAM_API_KEY has access to exclusion data.");
      return;
    }

    // Step 3: Ingest records
    const results = await ingestExclusions(records, maxRows);

    // Step 4: Update source system status
    const estimatedBytes = records.length * 1024; // ~1KB per record average
    await updateSourceSystemStatus(sourceSystemId, results, estimatedBytes);

    // Print summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("");
    console.log("═".repeat(70));
    console.log("✅ Ingestion Complete");
    console.log("═".repeat(70));
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`➕ Inserted: ${results.inserted}`);
    console.log(`🔄 Updated: ${results.updated}`);
    console.log(`⏭️  Skipped: ${results.skipped}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(
      `📊 Total processed: ${results.inserted + results.updated + results.skipped}`,
    );
    console.log(`📡 API records fetched: ${records.length}`);
    console.log("");
  } catch (error) {
    console.error("\n❌ Ingestion failed:", error);

    // Update source system with error
    try {
      const sourceSystemId = await getSourceSystemId();
      await prisma.sourceSystem.update({
        where: { id: sourceSystemId },
        data: {
          lastAttemptedSyncAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (updateError) {
      console.error("Failed to update source system:", updateError);
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
