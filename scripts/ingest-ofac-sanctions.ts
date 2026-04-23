#!/usr/bin/env tsx
/**
 * OFAC Sanctions List Ingestion Script
 *
 * Downloads and ingests the Specially Designated Nationals (SDN) list
 * from the U.S. Treasury Department's Office of Foreign Assets Control.
 *
 * Source: https://www.treasury.gov/ofac/downloads/
 * Data Format: CSV
 * Update Frequency: Daily (typically)
 * Records: ~12,000+ sanctioned individuals and entities
 *
 * This is a CRITICAL data source for financial fraud detection as it includes:
 * - Terrorist organizations and individuals
 * - Narcotics traffickers
 * - Cyber threat actors
 * - Human rights abusers
 * - Countries under comprehensive sanctions (Iran, North Korea, Syria, Cuba)
 * - Russia-related sanctions (UKRAINE-EO13662, etc.)
 *
 * Usage:
 *   npx tsx scripts/ingest-ofac-sanctions.ts [--max-rows N] [--full]
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { parse } from "csv-parse/sync";

const SOURCE_SYSTEM_SLUG = "ofac-sdn-list";
const STORAGE_DIR = "./data/treasury/ofac";

interface ParsedSanction {
  ofacId: string;
  programs: string[];
  name?: string;
  entityType: "Individual" | "Entity";
  addresses: Array<{
    address?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    country?: string;
  }>;
  ids: Array<{
    idType: string;
    idNumber: string;
    issuingCountry: string;
  }>;
  datesOfBirth?: string[];
  placesOfBirth?: string[];
  citizenCountries?: string[];
}

async function getSourceSystemId(): Promise<string> {
  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: SOURCE_SYSTEM_SLUG },
  });

  if (!sourceSystem) {
    let financialCategory = await prisma.fraudCategory.findUnique({
      where: { slug: "financial" },
    });

    if (!financialCategory) {
      financialCategory = await prisma.fraudCategory.create({
        data: {
          id: "financial",
          name: "Financial Fraud",
          slug: "financial",
          description:
            "Securities fraud, money laundering, sanctions violations, and financial crimes",
          status: "active",
          iconName: "dollar-sign",
          sortOrder: 3,
        },
      });
    }

    if (!financialCategory) {
      throw new Error(
        "Financial fraud category not found. Please seed the database first.",
      );
    }

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: SOURCE_SYSTEM_SLUG,
        categoryId: financialCategory.id,
        name: "OFAC SDN List",
        slug: SOURCE_SYSTEM_SLUG,
        description:
          "Specially Designated Nationals and Blocked Persons List from U.S. Treasury",
        ingestionMode: "csv_download",
        baseUrl: "https://www.treasury.gov/ofac/downloads/",
        refreshCadence: "daily",
        freshnessSlaHours: 24,
        supportsIncremental: false,
      },
    });

    console.log(`Created new source system: ${sourceSystem.name}`);
  }

  return sourceSystem.id;
}

/**
 * Parse simplified CSV format from downloaded OFAC files
 * Format: Target_ID,"Name",Program,Country,... (simplified)
 */
function parseSimplifiedCSVRow(row: string[]): ParsedSanction {
  const targetId = row[0]?.trim() || "";
  const name = row[1]?.replace(/^"|"$/g, "").trim() || undefined;

  // Program is typically in column 2 or 3
  let programStr = row[2] || row[3];
  if (programStr === "-0-" || !programStr) {
    programStr = "Unknown";
  }

  const program = [programStr.trim()].filter(Boolean);

  // Country is typically in column 3 or 4 - look for uppercase country codes/names
  let country = "";
  for (let i = 2; i < Math.min(6, row.length); i++) {
    const val = row[i]?.trim();
    if (val && val !== "-0-" && /^[A-Z]{2,}$/.test(val)) {
      country = val;
      break;
    }
  }

  // Parse addresses
  const addresses: Array<{
    address?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    country?: string;
  }> = [];

  if (country) {
    addresses.push({
      address: undefined,
      city: undefined,
      stateOrProvince: undefined,
      postalCode: undefined,
      country: country.trim(),
    });
  }

  // Determine entity type from name pattern or default to Entity
  const entityType = row.some((r) => r?.toLowerCase().includes("individual"))
    ? "Individual"
    : "Entity";

  return {
    ofacId: targetId,
    programs: program.length > 0 ? program : ["Unknown"],
    name,
    entityType,
    addresses,
    ids: [],
    datesOfBirth: undefined,
    placesOfBirth: undefined,
    citizenCountries: country ? [country] : undefined,
  };
}

/**
 * Parse standard OFAC CSV format with headers
 */
function parseStandardCSVRow(row: Record<string, string>): ParsedSanction {
  // Parse addresses
  const addresses: Array<{
    address?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    country?: string;
  }> = [];

  if (row.Address || row.City || row.Country) {
    addresses.push({
      address: row.Address?.trim() || undefined,
      city: row.City?.trim() || undefined,
      stateOrProvince: row.State_or_Province?.trim() || undefined,
      postalCode: row.Postal_Code?.trim() || undefined,
      country: row.Country?.trim() || undefined,
    });
  }

  // Parse IDs
  const ids: Array<{
    idType: string;
    idNumber: string;
    issuingCountry: string;
  }> = [];

  if (row.ID_Type_1 && row.ID_Number_1) {
    ids.push({
      idType: row.ID_Type_1.trim(),
      idNumber: row.ID_Number_1.trim(),
      issuingCountry: row.ID_Country_1?.trim() || "Unknown",
    });
  }

  // Parse programs (can be multiple, separated by semicolons)
  const programs = row.Program
    ? row.Program.split(";")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  // Collect alternative names
  const altNames: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const key = `Alt_Name_${i}` as keyof typeof row;
    const value = row[key];
    if (value && value.trim() !== "") {
      altNames.push(value.trim());
    }
  }

  // Parse dates of birth
  const datesOfBirth: string[] = [];
  if (row.Date_of_Birth?.trim()) {
    datesOfBirth.push(row.Date_of_Birth.trim());
  }

  // Parse places of birth
  const placesOfBirth: string[] = [];
  if (row.Place_of_Birth?.trim()) {
    placesOfBirth.push(row.Place_of_Birth.trim());
  }

  // Parse nationalities
  const citizenCountries: string[] = [];
  if (row.Nationality?.trim()) {
    citizenCountries.push(row.Nationality.trim());
  }

  return {
    ofacId: row.Target_ID?.trim() || "",
    programs,
    name: row.Title?.trim() || altNames[0] || undefined,
    entityType: row.Type === "Individual" ? "Individual" : "Entity",
    addresses,
    ids,
    datesOfBirth: datesOfBirth.length > 0 ? datesOfBirth : undefined,
    placesOfBirth: placesOfBirth.length > 0 ? placesOfBirth : undefined,
    citizenCountries:
      citizenCountries.length > 0 ? citizenCountries : undefined,
  };
}

/**
 * Detect CSV format and parse accordingly
 * OFAC files use \x1A (ASCII File Separator) as record separator for multi-line records
 */
function detectAndParseCSV(content: string): ParsedSanction[] {
  // Check if first line looks like a header
  const lines = content.split("\n").filter((l) => l.trim());
  const firstLine = lines[0] || "";

  // If it has standard OFAC headers, use standard parser
  if (firstLine.includes("Target_ID") && firstLine.includes("Program")) {
    console.log("Detected standard OFAC CSV format with headers");
    try {
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // Handle multi-line fields
      });

      return (records as Record<string, string>[]).map((row) =>
        parseStandardCSVRow(row),
      );
    } catch (error) {
      console.error("Failed to parse standard format:", error);
      console.log("Falling back to simplified format");
    }
  }

  // Otherwise use simplified parser with OFAC's \x1A record separator
  console.log(
    "Detected simplified CSV format without headers (using \\x1A as record separator)",
  );

  try {
    // Split by CRLF (\r\n) as primary record separator for this file format
    const records = content
      .split(/\r?\n/)
      .map((record) => {
        // Remove any newlines within the record and trim
        const cleanedRecord = record.replace(/\r?\n/g, " ").trim();
        if (!cleanedRecord || cleanedRecord.length < 5) return null;

        // Manually parse CSV to handle quotes properly without strict validation
        try {
          const fields: string[] = [];
          let currentField = "";
          let inQuotes = false;

          for (let i = 0; i < cleanedRecord.length; i++) {
            const char = cleanedRecord[i];

            if (char === '"') {
              if (inQuotes && cleanedRecord[i + 1] === '"') {
                // Escaped quote
                currentField += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === "," && !inQuotes) {
              fields.push(currentField.trim());
              currentField = "";
            } else {
              currentField += char;
            }
          }
          // Don't forget the last field
          fields.push(currentField.trim());

          return fields.length > 0 ? fields : null;
        } catch (e) {
          console.debug(
            `Failed to parse record: ${cleanedRecord.substring(0, 50)}...`,
          );
          return null;
        }
      })
      .filter(
        (row): row is string[] =>
          row !== null && Array.isArray(row) && row.length > 0,
      );

    console.log(`Parsed ${records.length} records from \\x1A-separated file`);
    return records.map((row) => parseSimplifiedCSVRow(row));
  } catch (error) {
    console.error("Failed to parse simplified format:", error);
    throw new Error("Could not parse CSV in any known format");
  }
}

async function ingestSanctions(
  filePath: string,
  maxRows: number | null = null,
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const sourceSystemId = await getSourceSystemId();

  console.log(`Reading CSV file: ${filePath}...`);

  // Read and parse CSV
  const fileContent = readFileSync(filePath, "utf-8");
  const records = detectAndParseCSV(fileContent);

  console.log(`Total records parsed: ${records.length}`);

  if (maxRows && records.length > maxRows) {
    console.log(`Limiting to first ${maxRows} records for testing`);
    records.splice(maxRows);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 50;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (sanction) => {
        try {
          // Skip invalid records
          if (!sanction.ofacId || sanction.ofacId === "") {
            skipped++;
            return;
          }

          // Check if record exists
          const existing = await prisma.oFACSanction.findUnique({
            where: { ofacId: sanction.ofacId },
          });

          if (existing) {
            // Update existing record
            await prisma.oFACSanction.update({
              where: { ofacId: sanction.ofacId },
              data: {
                programs: sanction.programs,
                name: sanction.name,
                entityType: sanction.entityType,
                addresses: sanction.addresses,
                ids: sanction.ids,
                datesOfBirth: sanction.datesOfBirth,
                placesOfBirth: sanction.placesOfBirth,
                citizenCountries: sanction.citizenCountries,
                updatedAt: new Date(),
              },
            });
            updated++;
          } else {
            // Insert new record
            await prisma.oFACSanction.create({
              data: {
                sourceSystemId,
                ofacId: sanction.ofacId,
                programs: sanction.programs,
                name: sanction.name,
                entityType: sanction.entityType,
                addresses: sanction.addresses,
                ids: sanction.ids,
                datesOfBirth: sanction.datesOfBirth,
                placesOfBirth: sanction.placesOfBirth,
                citizenCountries: sanction.citizenCountries,
              },
            });
            inserted++;
          }
        } catch (error) {
          console.error(`Error processing ${sanction.ofacId}:`, error);
          failed++;
        }
      }),
    );

    // Update progress every 10 batches
    const processed = Math.min(i + batchSize, records.length);
    if ((processed / batchSize) % 10 === 0 || processed >= records.length) {
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
      id: `ofac_${Date.now()}`,
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

function findLatestOFACFile(): string | null {
  if (!existsSync(STORAGE_DIR)) {
    return null;
  }

  const files = readdirSync(STORAGE_DIR)
    .filter((f) => f.startsWith("ofac-sdn-") && f.endsWith(".csv"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  return `${STORAGE_DIR}/${files[0]}`;
}

async function main() {
  const args = process.argv.slice(2);

  let maxRows: number | null = null;
  let filePath: string | null = null;
  let fullMode = false;

  // Parse arguments
  for (const arg of args) {
    if (arg.startsWith("--max-rows=")) {
      maxRows = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--full") {
      fullMode = true;
    } else if (arg.startsWith("--file=")) {
      filePath = arg.split("=")[1];
    }
  }

  console.log("=".repeat(60));
  console.log("OFAC SDN List Ingestion");
  console.log("=".repeat(60));
  console.log(
    `Mode: ${fullMode ? "Full" : maxRows ? `Test (${maxRows} rows)` : "Incremental"}`,
  );
  console.log();

  const startTime = Date.now();

  try {
    // Determine which file to use
    if (!filePath) {
      filePath = findLatestOFACFile();

      if (!filePath) {
        throw new Error(
          `No OFAC CSV files found in ${STORAGE_DIR}. Please download manually or run with --file=path/to/file.csv`,
        );
      }

      console.log(`Using local file: ${filePath}`);
    }

    // Get file size
    const fileSize = statSync(filePath).size;
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Ingest records
    console.log("\nIngesting sanctions...");
    const results = await ingestSanctions(filePath, maxRows);

    // Update source system status
    const sourceSystemId = await getSourceSystemId();
    await updateSourceSystemStatus(sourceSystemId, results, fileSize);

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
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
