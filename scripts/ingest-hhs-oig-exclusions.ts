#!/usr/bin/env tsx
/**
 * HHS OIG Exclusion List Ingestion Script
 *
 * Downloads and ingests the List of Excluded Individuals/Entities (LEIE)
 * from HHS Office of Inspector General.
 *
 * Source: https://exclusions.hhs.gov/
 * Data Format: CSV via Socrata API
 * Update Frequency: Daily
 * Records: ~10,000+ excluded individuals and entities
 *
 * Usage:
 *   npx tsx scripts/ingest-hhs-oig-exclusions.ts [--max-rows N] [--full]
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { parse } from "csv-parse/sync";
import { createHash } from "crypto";

const prisma = new PrismaClient();

// Configuration - Use Socrata JSON API (no auth required) instead of CSV download
const HHS_OIG_JSON_URL =
  process.env.HHS_OIG_LEIE_JSON_URL ||
  "https://data.hhs.gov/resource/8i6q-9pqr.json";

const SOURCE_SYSTEM_SLUG = "hhs-oig-leie";
const STORAGE_DIR = "./data/hhs-oig";

// Fallback to direct CSV if JSON fails (requires proper headers)
const HHS_OIG_CSV_FALLBACK_URL =
  "https://exclusions.hhs.gov/sites/default/files/leie.csv";

interface HHSCSVRow {
  ui_e_provider_id: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  organization_name: string;
  exclusion_reason_1: string;
  exclusion_reason_2: string;
  program_involvement_1: string;
  program_involvement_2: string;
  effective_date: string;
  termination_date: string;
  state_license_number_1: string;
  state_license_state_1: string;
  state_license_action_type_1: string;
  state_license_effective_date_1: string;
  // ... additional license fields
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
        name: "HHS OIG Exclusion List",
        slug: SOURCE_SYSTEM_SLUG,
        description:
          "List of Excluded Individuals/Entities (LEIE) from HHS Office of Inspector General",
        ingestionMode: "csv_download",
        baseUrl: "https://exclusions.hhs.gov/",
        refreshCadence: "daily",
        freshnessSlaHours: 24,
        supportsIncremental: false,
      },
    });

    console.log(`Created new source system: ${sourceSystem.name}`);
  }

  return sourceSystem.id;
}

async function fetchExclusionsData(): Promise<any[]> {
  console.log("Fetching HHS OIG exclusion data from Socrata JSON API...");

  try {
    // Try JSON API first (no authentication required)
    const response = await fetch(HHS_OIG_JSON_URL, {
      headers: {
        "User-Agent": "TrackFraud/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `JSON API failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Socrata returns array of records with keys like "ui_e_provider_id" (underscores instead of spaces)
    console.log(`Fetched ${data.length} exclusion records from JSON API`);
    return data;
  } catch (jsonError) {
    const jsonErrorMessage =
      jsonError instanceof Error ? jsonError.message : String(jsonError);
    console.warn("JSON API failed, trying CSV fallback...", jsonErrorMessage);

    try {
      // Fallback to direct CSV download with proper headers
      const csvResponse = await fetch(HHS_OIG_CSV_FALLBACK_URL, {
        headers: {
          "User-Agent": "TrackFraud/1.0",
          Accept: "text/csv",
        },
      });

      if (!csvResponse.ok) {
        throw new Error(
          `CSV fallback also failed: ${csvResponse.status} ${csvResponse.statusText}`,
        );
      }

      const csvText = await csvResponse.text();

      // Parse CSV text directly in memory
      const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      console.log(
        `Fetched ${records.length} exclusion records from CSV fallback`,
      );
      return records;
    } catch (csvError) {
      const csvErrorMessage =
        csvError instanceof Error ? csvError.message : String(csvError);
      console.error("Both JSON and CSV sources failed");
      throw new Error(
        `All HHS OIG data sources failed: ${jsonErrorMessage}; CSV: ${csvErrorMessage}`,
      );
    }
  }
}

function parseCSVRow(row: HHSCSVRow): ParsedExclusion {
  // Parse dates (HHS uses MM/DD/YYYY format)
  const parseDate = (dateStr: string): Date | undefined => {
    if (!dateStr || dateStr.trim() === "") return undefined;
    const parts = dateStr.split("/");
    if (parts.length !== 3) return undefined;
    return new Date(
      parseInt(parts[2]),
      parseInt(parts[0]) - 1,
      parseInt(parts[1]),
    );
  };

  // Collect exclusion reasons
  const exclusionReasons: string[] = [];
  ["exclusion_reason_1", "exclusion_reason_2"].forEach((key) => {
    const value = row[key as keyof HHSCSVRow];
    if (value && value.trim() !== "") {
      exclusionReasons.push(value.trim());
    }
  });

  // Collect program involvement
  const programInvolvement: string[] = [];
  ["program_involvement_1", "program_involvement_2"].forEach((key) => {
    const value = row[key as keyof HHSCSVRow];
    if (value && value.trim() !== "") {
      programInvolvement.push(value.trim());
    }
  });

  // Parse state license info
  const stateLicenseInfo: any[] = [];
  if (row.state_license_state_1 && row.state_license_state_1.trim() !== "") {
    stateLicenseInfo.push({
      state: row.state_license_state_1,
      licenseNumber: row.state_license_number_1 || undefined,
      actionType: row.state_license_action_type_1 || undefined,
      effectiveDate: parseDate(row.state_license_effective_date_1 || ""),
    });
  }

  return {
    uiEProviderId: row.ui_e_provider_id.trim(),
    lastName: row.last_name.trim().toUpperCase(),
    firstName: row.first_name.trim() || undefined,
    middleName: row.middle_name.trim() || undefined,
    organizationName: row.organization_name.trim() || undefined,
    exclusionReasons,
    programInvolvement,
    effectiveDate: parseDate(row.effective_date)!,
    terminationDate: parseDate(row.termination_date),
    stateLicenseInfo:
      stateLicenseInfo.length > 0 ? stateLicenseInfo : undefined,
  };
}

async function ingestExclusions(
  exclusionData: any[],
  maxRows: number | null = null,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const sourceSystemId = await getSourceSystemId();

  console.log(`Processing exclusion data...`);

  const records = exclusionData as HHSCSVRow[];

  console.log(`Total records to process: ${records.length}`);

  if (maxRows && records.length > maxRows) {
    console.log(`Limiting to first ${maxRows} records for testing`);
    // Keep header row + maxRows data rows
    records.splice(maxRows);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 100;
  const batches: ParsedExclusion[][] = [];

  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize).map(parseCSVRow));
  }

  console.log(`Processing ${batches.length} batches...`);

  for (const [batchIndex, batch] of batches.entries()) {
    const results = await Promise.allSettled(
      batch.map(async (exclusion) => {
        try {
          // Check if record exists
          const existing = await prisma.hHSExclusion.findUnique({
            where: { uiEProviderId: exclusion.uiEProviderId },
          });

          if (existing) {
            // Update existing record
            await prisma.hHSExclusion.update({
              where: { uiEProviderId: exclusion.uiEProviderId },
              data: {
                lastName: exclusion.lastName,
                firstName: exclusion.firstName,
                middleName: exclusion.middleName,
                organizationName: exclusion.organizationName,
                exclusionReasons: exclusion.exclusionReasons,
                programInvolvement: exclusion.programInvolvement,
                effectiveDate: exclusion.effectiveDate,
                terminationDate: exclusion.terminationDate,
                stateLicenseInfo: exclusion.stateLicenseInfo,
                updatedAt: new Date(),
              },
            });
            updated++;
          } else {
            // Insert new record
            await prisma.hHSExclusion.create({
              data: {
                sourceSystemId,
                uiEProviderId: exclusion.uiEProviderId,
                lastName: exclusion.lastName,
                firstName: exclusion.firstName,
                middleName: exclusion.middleName,
                organizationName: exclusion.organizationName,
                exclusionReasons: exclusion.exclusionReasons,
                programInvolvement: exclusion.programInvolvement,
                effectiveDate: exclusion.effectiveDate,
                terminationDate: exclusion.terminationDate,
                stateLicenseInfo: exclusion.stateLicenseInfo,
              },
            });
            inserted++;
          }
        } catch (error) {
          console.error(`Error processing ${exclusion.uiEProviderId}:`, error);
          failed++;
        }
      }),
    );

    // Update progress every 10 batches
    if ((batchIndex + 1) % 10 === 0 || batchIndex === batches.length - 1) {
      const processed = (batchIndex + 1) * batchSize;
      const percent = Math.round((processed / records.length) * 100);
      console.log(
        `Progress: ${percent}% (${processed}/${records.length}) - Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`,
      );
    }

    // Small delay to avoid overwhelming the database
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return { inserted, updated, skipped, failed };
}

async function updateSourceSystemStatus(
  sourceSystemId: string,
  stats: { inserted: number; updated: number; skipped: number; failed: number },
  bytesDownloaded: number,
): Promise<void> {
  await prisma.sourceSystem.update({
    where: { id: sourceSystemId },
    data: {
      lastAttemptedSyncAt: new Date(),
      lastSuccessfulSyncAt: stats.failed === 0 ? new Date() : null,
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

async function main() {
  const args = process.argv.slice(2);
  const maxRowsArg = args.find((a) => a.startsWith("--max-rows="));
  const maxRows = maxRowsArg ? parseInt(maxRowsArg.split("=")[1], 10) : null;
  const fullMode = args.includes("--full");

  console.log("=".repeat(60));
  console.log("HHS OIG Exclusion List Ingestion (JSON API Version)");
  console.log("=".repeat(60));
  console.log(
    `Mode: ${fullMode ? "Full" : maxRows ? `Test (${maxRows} rows)` : "Incremental"}`,
  );
  console.log();

  const startTime = Date.now();

  try {
    // Fetch data from API (JSON or CSV fallback)
    const exclusionData = await fetchExclusionsData();

    // Limit records if testing
    if (maxRows && exclusionData.length > maxRows) {
      console.log(`Limiting to first ${maxRows} records for testing`);
      exclusionData.splice(maxRows);
    }

    // Ingest records
    console.log("\nIngesting exclusions...");
    const results = await ingestExclusions(exclusionData, maxRows);

    // Update source system status (use estimated size for API calls)
    const sourceSystemId = await getSourceSystemId();
    const estimatedSizeBytes = exclusionData.length * 500; // ~500 bytes per record average
    await updateSourceSystemStatus(sourceSystemId, results, estimatedSizeBytes);

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
