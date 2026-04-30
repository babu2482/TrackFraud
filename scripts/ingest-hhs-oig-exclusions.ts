#!/usr/bin/env tsx
/**
 * HHS OIG Exclusion List Ingestion Script
 *
 * Downloads and ingests the List of Excluded Individuals/Entities (LEIE)
 * from HHS Office of Inspector General.
 *
 * Source: https://oig.hhs.gov/exclusions/leie-database-supplement-downloads/
 * Data Format: CSV (UPDATED.csv)
 * Update Frequency: Monthly
 * Records: ~10,000+ excluded individuals and entities
 *
 * Actual CSV columns:
 *   LASTNAME, FIRSTNAME, MIDNAME, BUSNAME, GENERAL, SPECIALTY, UPIN, NPI,
 *   DOB, ADDRESS, CITY, STATE, ZIP, EXCLTYPE, EXCLDATE, REINDATE,
 *   WAIVERDATE, WVRSTATE
 *
 * Date format: YYYYMMDD (00000000 = null/empty)
 *
 * Usage:
 *   npx tsx scripts/ingest-hhs-oig-exclusions.ts [--max-rows N] [--full]
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { createHash } from "crypto";

const prisma = new PrismaClient();

// Official HHS OIG LEIE download URL
const HHS_OIG_CSV_URL =
  process.env.HHS_OIG_LEIE_CSV_URL ||
  "https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv";

const SOURCE_SYSTEM_SLUG = "hhs-oig-leie";
const STORAGE_DIR = "./data/hhs-oig";

// ---------------------------------------------------------------------------
// Types matching the actual CSV format
// ---------------------------------------------------------------------------

interface HHSCSVRow {
  LASTNAME: string;
  FIRSTNAME: string;
  MIDNAME: string;
  BUSNAME: string;
  GENERAL: string;
  SPECIALTY: string;
  UPIN: string;
  NPI: string;
  DOB: string;
  ADDRESS: string;
  CITY: string;
  STATE: string;
  ZIP: string;
  EXCLTYPE: string;
  EXCLDATE: string;
  REINDATE: string;
  WAIVERDATE: string;
  WVRSTATE: string;
}

interface ParsedExclusion {
  uiEProviderId: string;
  lastName: string;
  firstName?: string;
  middleName?: string;
  organizationName?: string;
  exclusionReasons: string[];
  programInvolvement: string[];
  effectiveDate: Date;
  terminationDate?: Date;
  stateLicenseInfo?: any[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse YYYYMMDD date format. Returns undefined for "00000000" or empty.
 */
function parseHHSDate(dateStr: string): Date | undefined {
  if (!dateStr || dateStr.trim() === "" || dateStr === "00000000") {
    return undefined;
  }
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(4, 6), 10);
  const d = parseInt(dateStr.substring(6, 8), 10);
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return new Date(y, m - 1, d);
}

/**
 * Generate a unique provider ID from the available fields.
 * Prefer NPI if valid, otherwise UPIN, otherwise hash of name + date.
 */
function generateProviderId(row: HHSCSVRow): string {
  // Use NPI if valid (not all zeros)
  const npi = (row.NPI || "").trim();
  if (npi && npi !== "0000000000") {
    return `npi-${npi}`;
  }

  // Use UPIN if valid (not all zeros)
  const upin = (row.UPIN || "").trim();
  if (upin && upin !== "0000000000") {
    return `upin-${upin}`;
  }

  // Generate hash from name + date combo
  const namePart =
    row.BUSNAME || `${row.LASTNAME} ${row.FIRSTNAME} ${row.MIDNAME}`;
  const hashInput = `${namePart}||${row.EXCLDATE}||${row.STATE}||${row.ZIP}`;
  const hash = createHash("md5")
    .update(hashInput)
    .digest("hex")
    .substring(0, 12);
  return `gen-${hash}`;
}

/**
 * Parse a CSV row into our internal exclusion format.
 */
function parseCSVRow(row: HHSCSVRow): ParsedExclusion | null {
  // Skip completely empty rows
  if (!row.LASTNAME?.trim() && !row.FIRSTNAME?.trim() && !row.BUSNAME?.trim()) {
    return null;
  }

  const providerId = generateProviderId(row);

  // Parse exclusion type code
  const exclusionReasons: string[] = [];
  if (row.EXCLTYPE?.trim()) {
    exclusionReasons.push(row.EXCLTYPE.trim());
  }

  // Parse program involvement from GENERAL and SPECIALTY
  const programInvolvement: string[] = [];
  if (row.GENERAL?.trim()) {
    programInvolvement.push(row.GENERAL.trim());
  }
  if (row.SPECIALTY?.trim()) {
    programInvolvement.push(row.SPECIALTY.trim());
  }

  // Parse effective date (required)
  const effectiveDate = parseHHSDate(row.EXCLDATE);
  if (!effectiveDate) {
    return null; // Can't ingest without effective date
  }

  return {
    uiEProviderId: providerId,
    lastName: (row.LASTNAME || "").trim().toUpperCase(),
    firstName: row.FIRSTNAME?.trim() || undefined,
    middleName: row.MIDNAME?.trim() || undefined,
    organizationName: row.BUSNAME?.trim() || undefined,
    exclusionReasons,
    programInvolvement,
    effectiveDate,
    terminationDate: parseHHSDate(row.REINDATE),
    stateLicenseInfo: undefined, // Not available in current CSV format
  };
}

// ---------------------------------------------------------------------------
// Source System
// ---------------------------------------------------------------------------

async function getSourceSystemId(): Promise<string> {
  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: SOURCE_SYSTEM_SLUG },
  });

  if (!sourceSystem) {
    const category = await prisma.fraudCategory.findFirst({
      where: { slug: "healthcare" },
    });

    if (!category) {
      throw new Error(
        "Healthcare fraud category not found. Please seed the database first.",
      );
    }

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: SOURCE_SYSTEM_SLUG,
        categoryId: category.id,
        name: "HHS OIG Exclusion List (LEIE)",
        slug: SOURCE_SYSTEM_SLUG,
        description:
          "List of Excluded Individuals/Entities (LEIE) from HHS Office of Inspector General. Downloaded from oig.hhs.gov.",
        ingestionMode: "csv_download",
        baseUrl: "https://oig.hhs.gov/exclusions/",
        refreshCadence: "monthly",
        freshnessSlaHours: 720, // 30 days
        supportsIncremental: false,
      },
    });

    console.log(`Created new source system: ${sourceSystem.name}`);
  }

  return sourceSystem.id;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchExclusionsData(): Promise<HHSCSVRow[]> {
  console.log(`Fetching HHS OIG LEIE data from:\n  ${HHS_OIG_CSV_URL}`);

  // Ensure storage directory exists
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }

  const response = await fetch(HHS_OIG_CSV_URL, {
    headers: {
      "User-Agent": "TrackFraud/1.0",
      Accept: "text/csv",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HHS OIG CSV download failed: ${response.status} ${response.statusText}`,
    );
  }

  const csvText = await response.text();

  // Save raw CSV for reference
  const rawPath = `${STORAGE_DIR}/UPDATED.csv`;
  writeFileSync(rawPath, csvText);
  console.log(`Downloaded ${csvText.length} bytes, saved to ${rawPath}`);

  // Parse CSV
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as HHSCSVRow[];

  console.log(`Parsed ${records.length} exclusion records from CSV`);
  return records;
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

async function ingestExclusions(
  exclusionData: HHSCSVRow[],
  maxRows: number | null = null,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const sourceSystemId = await getSourceSystemId();

  // Limit if testing
  let records = exclusionData;
  if (maxRows && records.length > maxRows) {
    console.log(`Limiting to first ${maxRows} records for testing`);
    records = records.slice(0, maxRows);
  }

  console.log(`\nProcessing ${records.length} exclusion records...`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 50;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const parsed = parseCSVRow(row);
        if (!parsed) {
          skipped++;
          return;
        }

        try {
          const upserted = await prisma.hHSExclusion.upsert({
            where: { uiEProviderId: parsed.uiEProviderId },
            create: {
              sourceSystemId,
              uiEProviderId: parsed.uiEProviderId,
              lastName: parsed.lastName,
              firstName: parsed.firstName,
              middleName: parsed.middleName,
              organizationName: parsed.organizationName,
              exclusionReasons: parsed.exclusionReasons,
              programInvolvement: parsed.programInvolvement,
              effectiveDate: parsed.effectiveDate,
              terminationDate: parsed.terminationDate,
              stateLicenseInfo: parsed.stateLicenseInfo,
            },
            update: {
              lastName: parsed.lastName,
              firstName: parsed.firstName,
              middleName: parsed.middleName,
              organizationName: parsed.organizationName,
              exclusionReasons: parsed.exclusionReasons,
              programInvolvement: parsed.programInvolvement,
              effectiveDate: parsed.effectiveDate,
              terminationDate: parsed.terminationDate,
              updatedAt: new Date(),
            },
          });

          // Distinguish insert vs update by checking createdAt
          if (upserted.createdAt.getTime() === upserted.updatedAt.getTime()) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(
            `Error processing ${parsed.uiEProviderId} (${parsed.organizationName || parsed.lastName}):`,
            error instanceof Error ? error.message : String(error),
          );
          failed++;
        }
      }),
    );

    // Progress update
    const processed = Math.min(i + batchSize, records.length);
    const percent = Math.round((processed / records.length) * 100);
    console.log(
      `Progress: ${percent}% (${processed}/${records.length}) — ` +
        `Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`,
    );

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return { inserted, updated, skipped, failed };
}

// ---------------------------------------------------------------------------
// Source System Status
// ---------------------------------------------------------------------------

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
        stats.failed > 0
          ? `${stats.failed} records failed to process`
          : undefined,
    },
  });

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const maxRowsArg = args.find((a) => a.startsWith("--max-rows="));
  const maxRows = maxRowsArg ? parseInt(maxRowsArg.split("=")[1], 10) : null;
  const fullMode = args.includes("--full");

  console.log("=".repeat(60));
  console.log("HHS OIG Exclusion List Ingestion");
  console.log("=".repeat(60));
  console.log(
    `Mode: ${fullMode ? "Full" : maxRows ? `Test (${maxRows} rows)` : "Incremental"}`,
  );
  console.log();

  const startTime = Date.now();

  try {
    // Fetch data
    const exclusionData = await fetchExclusionsData();

    // Ingest records
    console.log("\nIngesting exclusions...");
    const results = await ingestExclusions(exclusionData, maxRows);

    // Update source system status
    const sourceSystemId = await getSourceSystemId();
    await updateSourceSystemStatus(
      sourceSystemId,
      results,
      exclusionData.length * 500, // estimated bytes
    );

    // Print summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log("=".repeat(60));
    console.log("Ingestion Complete");
    console.log("=".repeat(60));
    console.log(`Duration: ${duration} seconds`);
    console.log(`Inserted: ${results.inserted}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Failed: ${results.failed}`);
    console.log(
      `Total processed: ${results.inserted + results.updated + results.skipped}`,
    );
    console.log();
  } catch (error) {
    console.error("Ingestion failed:", error);

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
