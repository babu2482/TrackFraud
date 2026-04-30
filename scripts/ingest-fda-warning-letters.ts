#!/usr/bin/env tsx
/**
 * FDA Enforcement Reports & Warning Letters Ingestion Script
 *
 * Ingests FDA enforcement reports (recalls, warning letters, import alerts)
 * via the openFDA API and bulk download endpoints.
 *
 * Sources:
 *   - Drug Enforcement Reports: https://api.fda.gov/drug/enforcement.json
 *   - Device Enforcement Reports: https://api.fda.gov/device/enforcement.json
 *   - Food Enforcement Reports: https://api.fda.gov/food/enforcement.json
 *
 * Bulk Downloads:
 *   - Drug: https://download.open.fda.gov/drug/enforcement/drug-enforcement-0001-of-0001.json.zip
 *   - Device: https://download.open.fda.gov/device/enforcement/device-enforcement-0001-of-0001.json.zip
 *   - Food: https://download.open.fda.gov/food/enforcement/food-enforcement-0001-of-0001.json.zip
 *
 * Note: openFDA does NOT have a dedicated "Warning Letters" endpoint.
 * Warning letters must be scraped from the FDA website separately.
 * This script focuses on enforcement reports (recalls, seizures, imports bans).
 *
 * Auth: None required (rate limited: 10 req/sec without key).
 *       Optional API key from https://open.fda.gov/apis/ for higher limits.
 *
 * Usage:
 *   npx tsx scripts/ingest-fda-warning-letters.ts [--type drug|device|food|all] [--max-rows N] [--bulk]
 *
 * API Documentation:
 *   https://open.fda.gov/apis/drug/enforcement/
 *   https://open.fda.gov/apis/device/enforcement/
 *   https://open.fda.gov/apis/food/enforcement/
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "fs";
import https from "https";
import { execSync } from "child_process";
import { createHash } from "crypto";

// ============================================================
// Configuration
// ============================================================

const STORAGE_DIR = "./data/healthcare/fda";

const OPENFDA_API_KEY = process.env.OPENFDA_API_KEY || "";

const ENDPOINTS = {
  drug: {
    api: "https://api.fda.gov/drug/enforcement.json",
    bulk: "https://download.open.fda.gov/drug/enforcement/drug-enforcement-0001-of-0001.json.zip",
    sourceSlug: "fda-drug-enforcement",
    name: "FDA Drug Enforcement Reports",
    description:
      "FDA drug product recall enforcement reports. Includes voluntary and mandatory recalls of pharmaceutical products.",
    category: "healthcare",
  },
  device: {
    api: "https://api.fda.gov/device/enforcement.json",
    bulk: "https://download.open.fda.gov/device/enforcement/device-enforcement-0001-of-0001.json.zip",
    sourceSlug: "fda-device-enforcement",
    name: "FDA Device Enforcement Reports",
    description:
      "FDA medical device recall enforcement reports. Includes Class I, II, III device recalls and market withdrawals.",
    category: "healthcare",
  },
  food: {
    api: "https://api.fda.gov/food/enforcement.json",
    bulk: "https://download.open.fda.gov/food/enforcement/food-enforcement-0001-of-0001.json.zip",
    sourceSlug: "fda-food-enforcement",
    name: "FDA Food Enforcement Reports",
    description:
      "FDA food recall enforcement reports. Includes Class I, II, III food recalls and market withdrawals.",
    category: "healthcare",
  },
} as const;

type EndpointKey = keyof typeof ENDPOINTS;

interface OpenFDAResponse<T> {
  meta: {
    disclaimer: string;
    terms: string;
    license: string;
    last_updated: string;
    results: {
      skip: number;
      limit: number;
      total: number;
    };
  };
  results: T[];
}

interface DrugEnforcementRecord {
  brand_name?: string;
  case_id?: string;
  company_name?: string;
  distribution_pattern?: string;
  event_date?: string;
  event_id?: string;
  event_reason?: string;
  initial_firm_notification_date?: string;
  product_code?: string;
  product_description?: string;
  recall_initiated_by?: string;
  recall_status?: string;
  reporting_rei?: string;
  reporting_rei_address?: string;
  reporting_rei_city?: string;
  reporting_rei_state?: string;
  reporting_rei_type?: string;
  reporting_rei_zip?: string;
  sorting_code?: string;
  status?: string;
  voluntary_mandated?: string;
  reporting_rei_county?: string;
  report_date?: string;
  [key: string]: any;
}

interface DeviceEnforcementRecord {
  brand_name?: string;
  case_id?: string;
  city?: string;
  classification?: string;
  code_info?: string;
  code_info_date?: string;
  company_name?: string;
  company_ordered_reason?: string;
  county?: string;
  date_info?: string;
  distribution_pattern?: string;
  event_date?: string;
  event_id?: string;
  event_reason?: string;
  initial_firm_notification_date?: string;
  product_code?: string;
  product_description?: string;
  product_problem?: string;
  recall_classification?: string;
  recall_initiated_by?: string;
  recall_status?: string;
  reporting_rei?: string;
  reporting_rei_address?: string;
  reporting_rei_city?: string;
  reporting_rei_county?: string;
  reporting_rei_state?: string;
  reporting_rei_type?: string;
  reporting_rei_zip?: string;
  sorting_code?: string;
  status?: string;
  street?: string;
  voluntary_mandated?: string;
  zip?: string;
  report_date?: string;
  [key: string]: any;
}

interface FoodEnforcementRecord {
  brand_name?: string;
  case_id?: string;
  city?: string;
  code_info?: string;
  code_info_date?: string;
  company_name?: string;
  company_ordered_reason?: string;
  county?: string;
  date_info?: string;
  distribution_pattern?: string;
  event_date?: string;
  event_id?: string;
  event_reason?: string;
  initial_firm_notification_date?: string;
  product_code?: string;
  product_description?: string;
  recall_class?: string;
  recall_initiated_by?: string;
  recall_status?: string;
  reporting_rei?: string;
  reporting_rei_address?: string;
  reporting_rei_city?: string;
  reporting_rei_county?: string;
  reporting_rei_state?: string;
  reporting_rei_type?: string;
  reporting_rei_zip?: string;
  reporting_rei_country?: string;
  sorting_code?: string;
  status?: string;
  street?: string;
  voluntary_mandated?: string;
  zip?: string;
  recall_reason?: string;
  product_seizure?: string;
  report_date?: string;
  [key: string]: any;
}

interface ParsedEnforcement {
  id: string;
  recipientName: string;
  recipientAddress?: string;
  issueDate: Date;
  violationTypes: string[];
  productCategory: string;
  summary?: string;
  url: string;
  eventType: string;
  recallClass?: string;
  voluntaryMandated?: string;
  productDescription?: string;
  distributionPattern?: string;
  recallStatus?: string;
  initiatedBy?: string;
  reportingREI?: string;
  rawRecord: Record<string, any>;
}

// ============================================================
// Source System Management
// ============================================================

async function ensureSourceSystem(endpoint: EndpointKey): Promise<string> {
  const config = ENDPOINTS[endpoint];

  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: config.sourceSlug },
  });

  if (!sourceSystem) {
    const category = await prisma.fraudCategory.findUnique({
      where: { slug: config.category },
    });

    if (!category) {
      throw new Error(
        `Category "${config.category}" not found. Please seed the database first.`,
      );
    }

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: config.sourceSlug,
        categoryId: category.id,
        name: config.name,
        slug: config.sourceSlug,
        description: config.description,
        ingestionMode: "api",
        baseUrl: config.api,
        refreshCadence: "weekly",
        freshnessSlaHours: 168,
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

async function fetchOpenFDAEndpoint<T = any>(
  url: string,
  searchQuery = "",
  limit = 100,
  skip = 0,
  retries = 3,
): Promise<OpenFDAResponse<T> | null> {
  const baseUrl = url.includes("?") ? `${url}&` : `${url}?`;
  const params = new URLSearchParams({
    limit: String(limit),
    skip: String(skip),
  });

  if (searchQuery) {
    params.set("search", searchQuery);
  }

  const fullUrl = `${baseUrl}${params.toString()}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "TrackFraud/1.0 (Fraud Tracking Platform)",
  };

  if (OPENFDA_API_KEY) {
    headers["X-Api-Key"] = OPENFDA_API_KEY;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(fullUrl, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited
          const waitTime = 1000 * Math.pow(2, attempt);
          console.log(
            `  ⏳ Rate limited. Waiting ${waitTime / 1000}s before retry...`,
          );
          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OpenFDAResponse<T> = await response.json();
      return data;
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.warn(`  ⚠️ Request timeout for ${url}`);
      } else {
        console.warn(
          `  ⚠️ Error fetching ${url} (attempt ${attempt + 1}/${retries}): ${error.message}`,
        );
      }

      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
      }
    }
  }

  return null;
}

async function fetchAllOpenFDARecords<T = any>(
  url: string,
  maxRecords: number | null = null,
): Promise<T[]> {
  const allRecords: T[] = [];
  let skip = 0;
  const batchSize = 100; // openFDA max is 100 per request

  console.log(`\n📡 Fetching records from openFDA API...`);
  console.log(`   Endpoint: ${url}`);

  // Fetch first batch to get total count
  const firstBatch = await fetchOpenFDAEndpoint<T>(url, "", batchSize, 0);
  if (!firstBatch || !firstBatch.results || firstBatch.results.length === 0) {
    console.log("   ⚠️ No records returned from API.");
    return [];
  }

  const totalCount = firstBatch.meta.results.total;
  console.log(`   Total records available: ${totalCount.toLocaleString()}`);

  if (maxRecords) {
    console.log(`   ⚠️ Limiting to ${maxRecords} records`);
  }

  allRecords.push(...firstBatch.results);
  skip += batchSize;

  // Fetch remaining batches
  while (skip < totalCount) {
    if (maxRecords && allRecords.length >= maxRecords) {
      break;
    }

    const remaining = maxRecords
      ? Math.min(batchSize, maxRecords - allRecords.length)
      : batchSize;

    const batch = await fetchOpenFDAEndpoint<T>(url, "", remaining, skip);
    if (!batch || !batch.results || batch.results.length === 0) {
      console.log(`   ⚠️ Empty batch at skip=${skip}. Stopping.`);
      break;
    }

    allRecords.push(...batch.results);
    skip += batch.results.length;

    // Progress
    const progress = Math.min(allRecords.length, totalCount);
    console.log(
      `   Progress: ${progress.toLocaleString()}/${totalCount.toLocaleString()} records`,
    );

    // Rate limiting: small delay
    await new Promise((r) => setTimeout(r, 300));
  }

  // Trim to maxRecords if specified
  if (maxRecords && allRecords.length > maxRecords) {
    allRecords.length = maxRecords;
  }

  console.log(`✅ Fetched ${allRecords.length} records from openFDA API`);
  return allRecords;
}

// ============================================================
// Bulk Download
// ============================================================

function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      rejectUnauthorized: true,
      timeout: 60000,
    });

    https
      .get(url, { agent, timeout: 60000 }, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          const location = response.headers.location;
          if (location) {
            console.log(`   → Redirect: ${location}`);
            downloadFile(location, filePath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const writer = createWriteStream(filePath);
        response.pipe(writer);

        writer.on("finish", () => resolve());
        writer.on("error", (err) => reject(err));
      })
      .on("error", reject);
  });
}

async function downloadBulkData(
  bulkUrl: string,
  maxRecords: number | null = null,
): Promise<any[]> {
  console.log(`\n📥 Downloading bulk data from openFDA...`);
  console.log(`   URL: ${bulkUrl}`);

  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }

  const fileName = `fda-bulk-${Date.now()}.json.zip`;
  const zipPath = `${STORAGE_DIR}/${fileName}`;
  const jsonPath = `${STORAGE_DIR}/${fileName.replace(".zip", ".json")}`;

  try {
    // Download ZIP
    await downloadFile(bulkUrl, zipPath);
    const zipSize = statSync(zipPath).size;
    console.log(
      `   ✅ Downloaded ZIP: ${(zipSize / 1024 / 1024).toFixed(2)} MB`,
    );

    // Extract JSON
    console.log(`   📦 Extracting JSON...`);
    try {
      execSync(`unzip -o "${zipPath}" -d "${STORAGE_DIR}"`, {
        stdio: "pipe",
      });

      // Find the extracted JSON file
      const files = execSync(`ls "${STORAGE_DIR}"/*.json`, {
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter((f) => f.endsWith(".json"));

      if (files.length === 0) {
        throw new Error("No JSON files found in ZIP");
      }

      // Use the first JSON file
      const extractedJson = files[0];
      console.log(`   ✅ Extracted: ${extractedJson}`);

      // Read and parse JSON (it's a JSONL format - one JSON object per line)
      console.log(`   📖 Parsing JSONL...`);
      const records: any[] = [];
      const fileStream = readFileSync(extractedJson, "utf-8");
      const lines = fileStream.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        if (maxRecords && records.length >= maxRecords) {
          break;
        }
        try {
          const record = JSON.parse(line);
          if (record && typeof record === "object") {
            records.push(record);
          }
        } catch {
          // Skip malformed lines (intentionally ignored)
        }
      }

      console.log(`   ✅ Parsed ${records.length} records`);

      // Cleanup temp files
      try {
        unlinkSync(zipPath);
      } catch {
        // ZIP cleanup failed (non-critical, ignore)
      }

      return records;
    } catch (extractError) {
      console.warn(`   ⚠️ Extraction failed: ${extractError}`);
      console.log(`   ℹ️ Falling back to API...`);

      // Cleanup ZIP
      try {
        unlinkSync(zipPath);
      } catch {
        // ZIP cleanup failed on extract error (non-critical, ignore)
      }

      return [];
    }
  } catch (error: any) {
    console.warn(`   ❌ Bulk download failed: ${error.message}`);
    console.log(`   ℹ️ Falling back to API...`);

    // Cleanup
    try {
      unlinkSync(zipPath);
    } catch {
      // ZIP cleanup failed on download error (non-critical, ignore)
    }

    return [];
  }
}

// ============================================================
// Data Parsing
// ============================================================

function generateId(
  record: Record<string, any>,
  endpoint: EndpointKey,
): string {
  // Use event_id if available, otherwise generate hash
  const eventId = record.event_id?.toString()?.trim();
  if (eventId) {
    return `FDA_${endpoint.toUpperCase()}_${eventId}`;
  }

  const caseId = record.case_id?.toString()?.trim();
  if (caseId) {
    return `FDA_${endpoint.toUpperCase()}_${caseId}`;
  }

  // Fallback: hash of key fields
  const hashInput = JSON.stringify({
    company: record.company_name,
    product: record.product_description,
    date: record.event_date || record.report_date,
  });
  const hash = createHash("md5")
    .update(hashInput)
    .digest("hex")
    .substring(0, 16);
  return `FDA_${endpoint.toUpperCase()}_${hash}`;
}

function parseDrugRecord(
  record: DrugEnforcementRecord,
): ParsedEnforcement | null {
  try {
    const eventName =
      record.brand_name || record.product_description || "Unknown Drug";
    const companyName = record.company_name || "Unknown Company";

    // Build violation types
    const violationTypes: string[] = [];
    if (record.event_reason) violationTypes.push(record.event_reason);
    if (record.sorting_code) violationTypes.push(record.sorting_code);
    if (record.voluntary_mandated)
      violationTypes.push(
        record.voluntary_mandated === "voluntary"
          ? "Voluntary Recall"
          : "Mandated Recall",
      );
    if (record.recall_status) violationTypes.push(record.recall_status);
    if (violationTypes.length === 0) violationTypes.push("Enforcement Action");

    // Parse date
    const dateStr = record.event_date || record.report_date || "";
    let issueDate: Date;
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        issueDate = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        );
      } else {
        issueDate = new Date(dateStr);
      }
    } else {
      issueDate = new Date();
    }

    if (isNaN(issueDate.getTime())) {
      issueDate = new Date();
    }

    // Build summary
    const summaryParts = [
      `Product: ${record.product_description || eventName}`,
      record.product_code ? `Code: ${record.product_code}` : null,
      `Recall Initiated By: ${record.recall_initiated_by || "Unknown"}`,
      `Status: ${record.recall_status || "Unknown"}`,
      record.distribution_pattern
        ? `Distribution: ${record.distribution_pattern}`
        : null,
    ].filter(Boolean);

    const summary = summaryParts.join(". ") + ".";

    // Build URL to the openFDA search for this record
    const url = `https://open.fda.gov/drug/enforcement/?search=event_id:${record.event_id || ""}`;

    return {
      id: generateId(record, "drug"),
      recipientName: companyName,
      recipientAddress:
        [
          record.reporting_rei_address?.trim(),
          record.reporting_rei_city?.trim(),
          record.reporting_rei_state?.trim(),
          record.reporting_rei_zip?.trim(),
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      issueDate,
      violationTypes,
      productCategory: "drug",
      summary,
      url,
      eventType: record.event_reason || "recall",
      voluntaryMandated: record.voluntary_mandated || undefined,
      productDescription: record.product_description || undefined,
      distributionPattern: record.distribution_pattern || undefined,
      recallStatus: record.recall_status || undefined,
      initiatedBy: record.recall_initiated_by || undefined,
      reportingREI: record.reporting_rei || undefined,
      rawRecord: record,
    };
  } catch (error) {
    console.error(`  ❌ Error parsing drug record:`, error);
    return null;
  }
}

function parseDeviceRecord(
  record: DeviceEnforcementRecord,
): ParsedEnforcement | null {
  try {
    const eventName =
      record.brand_name || record.product_description || "Unknown Device";
    const companyName = record.company_name || "Unknown Company";

    // Build violation types
    const violationTypes: string[] = [];
    if (record.event_reason) violationTypes.push(record.event_reason);
    if (record.sorting_code) violationTypes.push(record.sorting_code);
    if (record.classification)
      violationTypes.push(`Class ${record.classification}`);
    if (record.recall_classification)
      violationTypes.push(`Recall Class ${record.recall_classification}`);
    if (record.product_problem) violationTypes.push(record.product_problem);
    if (record.voluntary_mandated)
      violationTypes.push(
        record.voluntary_mandated === "voluntary"
          ? "Voluntary Recall"
          : "Mandated Recall",
      );
    if (record.recall_status) violationTypes.push(record.recall_status);
    if (violationTypes.length === 0) violationTypes.push("Enforcement Action");

    // Parse date
    const dateStr = record.event_date || record.report_date || "";
    let issueDate: Date;
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        issueDate = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        );
      } else {
        issueDate = new Date(dateStr);
      }
    } else {
      issueDate = new Date();
    }

    if (isNaN(issueDate.getTime())) {
      issueDate = new Date();
    }

    // Build summary
    const summaryParts = [
      `Device: ${record.product_description || eventName}`,
      record.product_code ? `Code: ${record.product_code}` : null,
      record.classification
        ? `Classification: Class ${record.classification}`
        : null,
      `Recall Initiated By: ${record.recall_initiated_by || "Unknown"}`,
      `Status: ${record.recall_status || "Unknown"}`,
      record.distribution_pattern
        ? `Distribution: ${record.distribution_pattern}`
        : null,
      record.product_problem ? `Problem: ${record.product_problem}` : null,
    ].filter(Boolean);

    const summary = summaryParts.join(". ") + ".";

    // Build URL
    const url = `https://open.fda.gov/device/enforcement/?search=event_id:${record.event_id || ""}`;

    return {
      id: generateId(record, "device"),
      recipientName: companyName,
      recipientAddress:
        [
          record.reporting_rei_address?.trim(),
          record.reporting_rei_city?.trim(),
          record.reporting_rei_state?.trim(),
          record.reporting_rei_zip?.trim(),
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      issueDate,
      violationTypes,
      productCategory: "device",
      summary,
      url,
      eventType: record.event_reason || "recall",
      recallClass:
        record.recall_classification || record.classification || undefined,
      voluntaryMandated: record.voluntary_mandated || undefined,
      productDescription: record.product_description || undefined,
      distributionPattern: record.distribution_pattern || undefined,
      recallStatus: record.recall_status || undefined,
      initiatedBy: record.recall_initiated_by || undefined,
      reportingREI: record.reporting_rei || undefined,
      rawRecord: record,
    };
  } catch (error) {
    console.error(`  ❌ Error parsing device record:`, error);
    return null;
  }
}

function parseFoodRecord(
  record: FoodEnforcementRecord,
): ParsedEnforcement | null {
  try {
    const eventName =
      record.brand_name || record.product_description || "Unknown Food Product";
    const companyName = record.company_name || "Unknown Company";

    // Build violation types
    const violationTypes: string[] = [];
    if (record.event_reason) violationTypes.push(record.event_reason);
    if (record.sorting_code) violationTypes.push(record.sorting_code);
    if (record.recall_class)
      violationTypes.push(`Recall Class ${record.recall_class}`);
    if (record.voluntary_mandated)
      violationTypes.push(
        record.voluntary_mandated === "voluntary"
          ? "Voluntary Recall"
          : "Mandated Recall",
      );
    if (record.recall_status) violationTypes.push(record.recall_status);
    if (record.product_seizure) violationTypes.push(record.product_seizure);
    if (record.recall_reason) violationTypes.push(record.recall_reason);
    if (violationTypes.length === 0) violationTypes.push("Enforcement Action");

    // Parse date
    const dateStr = record.event_date || record.report_date || "";
    let issueDate: Date;
    if (dateStr) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        issueDate = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        );
      } else {
        issueDate = new Date(dateStr);
      }
    } else {
      issueDate = new Date();
    }

    if (isNaN(issueDate.getTime())) {
      issueDate = new Date();
    }

    // Build summary
    const summaryParts = [
      `Food Product: ${record.product_description || eventName}`,
      record.product_code ? `Code: ${record.product_code}` : null,
      record.recall_class ? `Recall Class: ${record.recall_class}` : null,
      `Recall Initiated By: ${record.recall_initiated_by || "Unknown"}`,
      `Status: ${record.recall_status || "Unknown"}`,
      record.distribution_pattern
        ? `Distribution: ${record.distribution_pattern}`
        : null,
      record.recall_reason ? `Reason: ${record.recall_reason}` : null,
    ].filter(Boolean);

    const summary = summaryParts.join(". ") + ".";

    // Build URL
    const url = `https://open.fda.gov/food/enforcement/?search=event_id:${record.event_id || ""}`;

    return {
      id: generateId(record, "food"),
      recipientName: companyName,
      recipientAddress:
        [
          record.reporting_rei_address?.trim(),
          record.reporting_rei_city?.trim(),
          record.reporting_rei_state?.trim(),
          record.reporting_rei_zip?.trim(),
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      issueDate,
      violationTypes,
      productCategory: "food",
      summary,
      url,
      eventType: record.event_reason || "recall",
      recallClass: record.recall_class || undefined,
      voluntaryMandated: record.voluntary_mandated || undefined,
      productDescription: record.product_description || undefined,
      distributionPattern: record.distribution_pattern || undefined,
      recallStatus: record.recall_status || undefined,
      initiatedBy: record.recall_initiated_by || undefined,
      reportingREI: record.reporting_rei || undefined,
      rawRecord: record,
    };
  } catch (error) {
    console.error(`  ❌ Error parsing food record:`, error);
    return null;
  }
}

// ============================================================
// Ingestion
// ============================================================

async function ingestEnforcementRecords(
  sourceSystemId: string,
  parsedRecords: ParsedEnforcement[],
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  console.log(`\n🔄 Ingesting ${parsedRecords.length} enforcement records...`);

  let inserted = 0;
  let updated = 0;
  const skipped = 0;
  let failed = 0;

  const batchSize = 100;

  for (let i = 0; i < parsedRecords.length; i += batchSize) {
    const batch = parsedRecords.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (record) => {
        try {
          const result = await (prisma as any).fDAWarningLetter.upsert({
            where: {
              url: record.url,
            } as any,
            update: {
              recipientName: record.recipientName,
              recipientAddress: record.recipientAddress,
              violationTypes: record.violationTypes,
              productCategory: record.productCategory,
              summary: record.summary,
              updatedAt: new Date(),
            },
            create: {
              sourceSystemId,
              recipientName: record.recipientName,
              recipientAddress: record.recipientAddress,
              issueDate: record.issueDate,
              violationTypes: record.violationTypes,
              productCategory: record.productCategory,
              summary: record.summary,
              url: record.url,
            },
          });

          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`  ❌ Error ingesting record:`, error);
          failed++;
        }
      }),
    );

    // Progress
    const processed = Math.min(i + batchSize, parsedRecords.length);
    const percent = Math.round((processed / parsedRecords.length) * 100);
    console.log(
      `   Progress: ${percent}% (${processed}/${parsedRecords.length}) — ` +
        `Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
    );

    if (i + batchSize < parsedRecords.length) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { inserted, updated, skipped, failed };
}

// ============================================================
// Main Processing
// ============================================================

async function processEndpoint(
  endpoint: EndpointKey,
  maxRows: number | null = null,
  useBulk: boolean = false,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const config = ENDPOINTS[endpoint];

  console.log("");
  console.log("═".repeat(70));
  console.log(`🏥 Processing: ${config.name}`);
  console.log("═".repeat(70));

  // Ensure source system
  const sourceSystemId = await ensureSourceSystem(endpoint);

  // Fetch records
  let rawRecords: Record<string, any>[] = [];

  if (useBulk) {
    // Try bulk download first
    rawRecords = await downloadBulkData(config.bulk, maxRows);
  }

  // Fall back to API if bulk failed or not requested
  if (rawRecords.length === 0) {
    rawRecords = await fetchAllOpenFDARecords(config.api, maxRows);
  }

  if (rawRecords.length === 0) {
    console.log(`⚠️ No records fetched for ${endpoint}. Skipping.`);
    return { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  }

  // Parse records
  console.log(`\n📝 Parsing ${rawRecords.length} records...`);
  const parsedRecords: ParsedEnforcement[] = [];

  for (const record of rawRecords) {
    let parsed: ParsedEnforcement | null = null;

    if (endpoint === "drug") {
      parsed = parseDrugRecord(record as DrugEnforcementRecord);
    } else if (endpoint === "device") {
      parsed = parseDeviceRecord(record as DeviceEnforcementRecord);
    } else if (endpoint === "food") {
      parsed = parseFoodRecord(record as FoodEnforcementRecord);
    }

    if (parsed) {
      parsedRecords.push(parsed);
    }
  }

  console.log(`✅ Parsed ${parsedRecords.length}/${rawRecords.length} records`);

  if (parsedRecords.length === 0) {
    console.log(`⚠️ No valid records parsed for ${endpoint}. Skipping.`);
    return { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  }

  // Ingest records
  const stats = await ingestEnforcementRecords(sourceSystemId, parsedRecords);

  // Update source system status
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
      rowsRead: rawRecords.length,
      rowsInserted: stats.inserted,
      rowsUpdated: stats.updated,
      rowsSkipped: stats.skipped,
      rowsFailed: stats.failed,
      bytesDownloaded: BigInt(rawRecords.length * 1024), // Estimated
    },
  });

  return stats;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const typeArg = args.find((a) => a.startsWith("--type=") || a === "--type");
  const maxRowsArg = args.find(
    (a) => a.startsWith("--max-rows=") || a.startsWith("--max-rows"),
  );
  const useBulk = args.includes("--bulk");

  const typeStr = typeArg
    ? (typeArg as string).split("=")[1] || args[args.indexOf(typeArg) + 1]
    : "all";

  const maxRows = maxRowsArg
    ? parseInt(
        (maxRowsArg as string).split("=")[1] ||
          args[args.indexOf(maxRowsArg) + 1] ||
          "0",
        10,
      )
    : null;

  // Validate type
  const validTypes = ["drug", "device", "food", "all"] as const;
  const type = (
    typeStr === "all" ? "all" : validTypes.find((t) => t === typeStr)
  ) as "all" | EndpointKey;

  if (!type || type === undefined) {
    console.error(
      `Invalid type: ${typeStr}. Valid options: drug, device, food, all`,
    );
    process.exit(1);
  }

  // Determine endpoints to process
  const endpointsToProcess: EndpointKey[] =
    type === "all"
      ? ["drug", "device", "food"]
      : [type, type, type].filter((x): x is EndpointKey => x !== type)[0]
        ? [type]
        : [type as EndpointKey];

  // Fix: simpler logic
  const targets: EndpointKey[] =
    type === "all" ? ["drug", "device", "food"] : [type];

  console.log("═".repeat(70));
  console.log("🏥 FDA Enforcement Reports & Warning Letters Ingestion");
  console.log("═".repeat(70));
  console.log(`Source: openFDA API + Bulk Downloads`);
  console.log(`Type: ${type === "all" ? "All (drug, device, food)" : type}`);
  console.log(`Mode: ${useBulk ? "Bulk Download" : "API"}`);
  console.log(`Max Rows: ${maxRows ? maxRows.toLocaleString() : "No limit"}`);
  console.log(
    `API Key: ${OPENFDA_API_KEY ? "✅ Set" : "❌ Not set (rate limited)"}`,
  );
  console.log("");

  const startTime = Date.now();

  const totalStats = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const endpoint of targets) {
    try {
      const stats = await processEndpoint(endpoint, maxRows, useBulk);

      totalStats.inserted += stats.inserted;
      totalStats.updated += stats.updated;
      totalStats.skipped += stats.skipped;
      totalStats.failed += stats.failed;
    } catch (error) {
      console.error(`\n❌ Failed to process ${endpoint}:`, error);
      totalStats.failed++;
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log("═".repeat(70));
  console.log("✅ FDA Enforcement Reports Ingestion Complete");
  console.log("═".repeat(70));
  console.log(`⏱️  Duration: ${duration} seconds`);
  console.log(`➕ Inserted: ${totalStats.inserted}`);
  console.log(`🔄 Updated: ${totalStats.updated}`);
  console.log(`⏭️  Skipped: ${totalStats.skipped}`);
  console.log(`❌ Failed: ${totalStats.failed}`);
  console.log(
    `📊 Total processed: ${totalStats.inserted + totalStats.updated + totalStats.skipped}`,
  );
  console.log("");
  console.log(
    "ℹ️  Note: openFDA does not provide a dedicated Warning Letters endpoint.",
  );
  console.log(
    "   For FDA Warning Letters, consider scraping: https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters",
  );
  console.log("");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
