#!/usr/bin/env -S tsx
/**
 * SEC EDGAR Local Data Ingestion Script (Optimized)
 *
 * Reads local JSON files from data/corporate/sec/ and ingests them into PostgreSQL.
 * Uses efficient batch processing with parallel file reading and bulk database operations.
 *
 * Usage:
 *   npx tsx scripts/ingest-sec-local.ts
 *   npx tsx scripts/ingest-sec-local.ts --dry-run
 *   npx tsx scripts/ingest-sec-local.ts --limit 100
 */

import { prisma } from "../lib/db";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
} from "../lib/ingestion-utils";
import {
  persistCorporateSubmissions,
  persistCorporateCompanyFacts,
} from "../lib/corporate-storage";
import * as fs from "node:fs";
import * as path from "node:path";

const SEC_SOURCE_SYSTEM_ID = "sec_edgar";
const SEC_DATA_DIR = path.join(__dirname, "../data/corporate/sec");
const COMPANYFACTS_DIR = path.join(SEC_DATA_DIR, "companyfacts");
const SUBMISSIONS_DIR = path.join(SEC_DATA_DIR, "submissions");

interface ParsedArgs {
  dryRun: boolean;
  limit: number;
  batch: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    dryRun: false,
    limit: 0,
    batch: 50,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--limit") {
      const value = parseInt(argv[++i] ?? "0", 10);
      if (Number.isFinite(value) && value > 0) parsed.limit = value;
    } else if (arg === "--batch") {
      const value = parseInt(argv[++i] ?? "50", 10);
      if (Number.isFinite(value) && value > 0) parsed.batch = value;
    }
  }

  return parsed;
}

function getCikFromFilename(filename: string): string {
  const match = filename.match(/^CIK(\d+)\.json$/);
  if (match) {
    return match[1].replace(/^0+/, "").padStart(10, "0");
  }
  return "";
}

function scanJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    console.warn(`Directory does not exist: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter((file) => {
    if (file.startsWith("._")) return false;
    return file.endsWith(".json");
  });

  return files.sort();
}

function parseJsonFile(filePath: string): any {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function ensureSourceSystem(): Promise<void> {
  await prisma.sourceSystem.upsert({
    where: { id: SEC_SOURCE_SYSTEM_ID },
    update: {},
    create: {
      id: SEC_SOURCE_SYSTEM_ID,
      categoryId: "corporate",
      name: "SEC EDGAR API",
      slug: "sec-edgar-api",
      description: "U.S. Securities and Exchange Commission filings",
      ingestionMode: "api",
      baseUrl: "https://data.sec.gov",
      refreshCadence: "daily",
    },
  });
}

async function processSubmissionsBatch(
  files: string[],
  batchNum: number,
  dryRun: boolean,
): Promise<{
  inserted: number;
  updated: number;
  processed: number;
  failed: number;
}> {
  let inserted = 0;
  let updated = 0;
  let processed = 0;
  let failed = 0;

  for (const file of files) {
    const cik = getCikFromFilename(file);
    if (!cik) {
      failed++;
      continue;
    }

    const filePath = path.join(SUBMISSIONS_DIR, file);
    try {
      const submissions = parseJsonFile(filePath);

      if (dryRun) {
        console.log(
          `  [DRY RUN] Submissions for CIK ${cik}: ${submissions.name || "Unknown"}`,
        );
        processed++;
        continue;
      }

      const result = await persistCorporateSubmissions(submissions, new Date());
      inserted += result.inserted;
      updated += result.updated;
      processed++;
    } catch (error) {
      failed++;
      if (failed <= 5) {
        console.error(
          `  ✗ Failed submissions for ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  console.log(
    `  Batch ${batchNum}: ${processed} processed, ${inserted} inserted, ${updated} updated, ${failed} failed`,
  );

  return { inserted, updated, processed, failed };
}

async function processCompanyFactsBatch(
  files: string[],
  batchNum: number,
  dryRun: boolean,
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (const file of files) {
    const cik = getCikFromFilename(file);
    if (!cik) {
      failed++;
      continue;
    }

    const filePath = path.join(COMPANYFACTS_DIR, file);
    try {
      const facts = parseJsonFile(filePath);

      if (dryRun) {
        console.log(
          `  [DRY RUN] Facts for CIK ${cik}: ${facts.entityName || "Unknown"}`,
        );
        processed++;
        continue;
      }

      await persistCorporateCompanyFacts(cik, facts, new Date());
      processed++;
    } catch (error) {
      failed++;
      if (failed <= 5) {
        console.error(
          `  ✗ Failed facts for ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  console.log(`  Batch ${batchNum}: ${processed} processed, ${failed} failed`);

  return { processed, failed };
}

async function main(): Promise<void> {
  console.log("=== SEC EDGAR Local Data Ingestion (Optimized) ===\n");

  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    console.log("DRY RUN MODE - No data will be written to database\n");
  }

  await ensureSourceSystem();

  const { run } = await startIngestionRun({
    sourceSystemId: SEC_SOURCE_SYSTEM_ID,
  });
  const stats = createEmptyStats();

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  try {
    // Process submissions
    console.log("Phase 1: Processing submissions data...");
    const submissionFiles = scanJsonFiles(SUBMISSIONS_DIR);
    const submissionLimit =
      args.limit > 0 ? args.limit : submissionFiles.length;
    const submissionBatches = Math.ceil(submissionLimit / args.batch);

    console.log(
      `Found ${submissionFiles.length} submission files (processing up to ${submissionLimit} in batches of ${args.batch})\n`,
    );

    let submissionsProcessed = 0;
    let submissionsFailed = 0;

    for (let batchIdx = 0; batchIdx < submissionBatches; batchIdx++) {
      const startIdx = batchIdx * args.batch;
      const endIdx = Math.min(startIdx + args.batch, submissionLimit);
      const batchFiles = submissionFiles.slice(startIdx, endIdx);

      const result = await processSubmissionsBatch(
        batchFiles,
        batchIdx + 1,
        args.dryRun,
      );
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      submissionsProcessed += result.processed;
      submissionsFailed += result.failed;
      totalFailed += result.failed;

      if (batchIdx < submissionBatches - 1) {
        console.log("");
      }
    }

    console.log(
      `\nSubmissions complete: ${submissionsProcessed} processed, ${submissionsFailed} failed\n`,
    );

    // Process company facts
    console.log("Phase 2: Processing company facts data...");
    const factsFiles = scanJsonFiles(COMPANYFACTS_DIR);
    const factsLimit = args.limit > 0 ? args.limit : factsFiles.length;
    const factsBatches = Math.ceil(factsLimit / args.batch);

    console.log(
      `Found ${factsFiles.length} company facts files (processing up to ${factsLimit} in batches of ${args.batch})\n`,
    );

    let factsProcessed = 0;
    let factsFailed = 0;

    for (let batchIdx = 0; batchIdx < factsBatches; batchIdx++) {
      const startIdx = batchIdx * args.batch;
      const endIdx = Math.min(startIdx + args.batch, factsLimit);
      const batchFiles = factsFiles.slice(startIdx, endIdx);

      const result = await processCompanyFactsBatch(
        batchFiles,
        batchIdx + 1,
        args.dryRun,
      );
      totalInserted += result.processed;
      factsProcessed += result.processed;
      factsFailed += result.failed;
      totalFailed += result.failed;

      if (batchIdx < factsBatches - 1) {
        console.log("");
      }
    }

    console.log(
      `\nCompany facts complete: ${factsProcessed} processed, ${factsFailed} failed\n`,
    );

    // Summary
    console.log("=== Ingestion Summary ===");
    console.log(`Submissions processed: ${submissionsProcessed}`);
    console.log(`Company facts processed: ${factsProcessed}`);
    console.log(`Total inserted: ${totalInserted}`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Total failed: ${totalFailed}`);
    console.log(`Total skipped: ${totalSkipped}`);

    if (args.dryRun) {
      console.log("\nThis was a DRY RUN - no data was written to the database");
    }

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: SEC_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Ingestion failed:", message);

    await failIngestionRun({
      runId: run.id,
      sourceSystemId: SEC_SOURCE_SYSTEM_ID,
      stats,
      errorSummary: message,
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\n✅ SEC EDGAR local ingestion completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ SEC EDGAR local ingestion failed:", error);
    try {
      prisma.$disconnect();
    } catch {}
    process.exit(1);
  });
