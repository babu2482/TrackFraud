/**
 * ingest-usaspending-bulk.ts
 *
 * Downloads USASpending.gov federal contract awards via the bulk CSV download
 * endpoint instead of the paginated search API. This gets millions of records
 * instead of the ~10k cap on the search endpoint.
 *
 * Process per fiscal year:
 *   1. POST /api/v2/bulk_download/awards/ → receive file_name
 *   2. Poll /api/v2/download/status/?file_name=<name> until "finished"
 *   3. Download the ZIP archive
 *   4. Stream-extract each CSV from the ZIP
 *   5. Parse rows and upsert into GovernmentAwardRecord
 *
 * Fiscal years: FY2008–FY2025 (each = Oct 1 – Sep 30)
 * Award types: contracts (A, B, C, D) only — same scope as existing data.
 *
 * Usage:
 *   npx tsx scripts/ingest-usaspending-bulk.ts
 *   npx tsx scripts/ingest-usaspending-bulk.ts --years 2024,2023
 *   npx tsx scripts/ingest-usaspending-bulk.ts --start-year 2020
 */

import fs from "node:fs";
import path from "node:path";
import * as https from "node:https";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { parse as csvParse } from "csv-parse";
import { prisma } from "../lib/db";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
} from "../lib/ingestion-utils";
import {
  persistGovernmentAwardSummaries,
  USASPENDING_SOURCE_SYSTEM_ID,
} from "../lib/government-storage";
import type { SpendingAward } from "../lib/usaspending";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DOWNLOAD_DIR = "data/government/usaspending-bulk";
const BATCH_SIZE = 500;
const POLL_INTERVAL_MS = 10_000; // 10s between status polls
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 min max wait per job

interface ParsedArgs {
  years?: number[];
  startYear: number;
  endYear: number;
  forceDownload: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const currentFY = getCurrentFiscalYear();
  const parsed: ParsedArgs = {
    startYear: 2008,
    endYear: currentFY,
    forceDownload: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--years") {
      parsed.years = (argv[++i] ?? "")
        .split(",")
        .map((v) => parseInt(v.trim(), 10))
        .filter(Number.isFinite);
    } else if (arg === "--start-year") {
      const v = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(v)) parsed.startYear = v;
    } else if (arg === "--end-year") {
      const v = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(v)) parsed.endYear = v;
    } else if (arg === "--force-download") {
      parsed.forceDownload = true;
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Fiscal year helpers
// ---------------------------------------------------------------------------

function getCurrentFiscalYear(): number {
  const now = new Date();
  // US fiscal year starts Oct 1; if we're in Oct-Dec, FY = year + 1
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

function fiscalYearDateRange(fy: number): { start: string; end: string } {
  return {
    start: `${fy - 1}-10-01`,
    end: `${fy}-09-30`,
  };
}

// ---------------------------------------------------------------------------
// HTTPS helpers (bypass undici/fetch for this server)
// ---------------------------------------------------------------------------

function httpsPost<T>(host: string, path: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: host,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CharityProject/1.0",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`USASpending ${res.statusCode}: ${text.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(text) as T); }
          catch { reject(new Error(`JSON parse error: ${text.slice(0, 200)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function httpsGet<T>(host: string, urlPath: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, path: urlPath, method: "GET",
        headers: { "User-Agent": "CharityProject/1.0" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`USASpending ${res.statusCode}: ${text.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(text) as T); }
          catch { reject(new Error(`JSON parse error: ${text.slice(0, 200)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  // Use curl for large-file downloads: handles ZIP64, resumes partial downloads,
  // follows redirects, and won't time out on multi-GB files.
  const { execSync } = await import("node:child_process");
  const tmpPath = `${destPath}.tmp`;

  // -C - : resume if tmpPath already partially downloaded
  // -L   : follow redirects
  // -f   : fail on HTTP errors (exits non-zero)
  // --retry 3 --retry-delay 5 : retry on transient failures
  execSync(
    `curl -L -f --retry 3 --retry-delay 5 -C - -o "${tmpPath}" "${url}"`,
    { stdio: "pipe" }
  );

  fs.renameSync(tmpPath, destPath);

  // Strip macOS provenance attribute so Node.js can read the ZIP back
  try {
    execSync(`xattr -d com.apple.provenance "${destPath}"`, { stdio: "pipe" });
  } catch { /* non-macOS or attribute absent */ }
}

// ---------------------------------------------------------------------------
// USASpending bulk download API
// ---------------------------------------------------------------------------

interface BulkDownloadResponse {
  status: string;
  file_url: string | null;
  file_name: string;
  message: string | null;
  total_rows: number | null;
  total_size: string | null;
}

async function requestBulkDownload(fy: number): Promise<string> {
  const range = fiscalYearDateRange(fy);
  const resp = await httpsPost<BulkDownloadResponse>(
    "api.usaspending.gov",
    "/api/v2/bulk_download/awards/",
    {
      filters: {
        prime_award_types: ["A", "B", "C", "D"],
        date_type: "action_date",
        date_range: { start_date: range.start, end_date: range.end },
      },
      columns: [],
      file_format: "csv",
    }
  );
  if (!resp.file_name) throw new Error(`No file_name in bulk download response: ${JSON.stringify(resp)}`);
  console.log(`FY${fy}: bulk download job created → ${resp.file_name} (${resp.total_rows ?? "?"} rows)`);
  return resp.file_name;
}

async function pollUntilReady(fileName: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await httpsGet<BulkDownloadResponse>(
      "api.usaspending.gov",
      `/api/v2/download/status/?file_name=${encodeURIComponent(fileName)}`
    );
    if ((status.status === "finished" || status.status === "ready" || status.status === "complete") && status.file_url) {
      console.log(`  → ready (${status.status}): ${status.file_url}`);
      return status.file_url;
    }
    if (status.status === "failed") {
      throw new Error(`Bulk download job failed: ${status.message ?? "unknown"}`);
    }
    console.log(`  → status: ${status.status} — waiting ${POLL_INTERVAL_MS / 1000}s...`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Bulk download timed out after ${POLL_TIMEOUT_MS / 60000} min`);
}

// ---------------------------------------------------------------------------
// CSV parsing — maps USASpending column names to SpendingAward fields
// ---------------------------------------------------------------------------

function mapCsvRow(row: Record<string, string>): SpendingAward | null {
  // The bulk CSV uses different column names than the search API response.
  const uniqueKey =
    row["Contract Award Unique Key"] ||
    row["Assistance Award Unique Key"] ||
    row["Award Unique Key"] ||
    row["unique_award_key"];
  if (!uniqueKey) return null;

  const awardAmount = parseFloat(
    row["Award Amount"] || row["Total Obligated Amount"] || "0"
  );

  return {
    internal_id: 0, // not available in CSV, set 0
    generated_internal_id: uniqueKey,
    Award_ID:
      row["Award ID"] || row["PIID"] || row["FAIN"] || undefined,
    Recipient_Name:
      row["Recipient Name"] || row["recipient_name"] || undefined,
    Awarding_Agency:
      row["Awarding Agency"] || row["awarding_agency_name"] || undefined,
    Award_Amount: Number.isFinite(awardAmount) ? awardAmount : undefined,
    Description:
      row["Award Description"] || row["Description"] || row["award_description"] || undefined,
    Start_Date:
      row["Period of Performance Start Date"] ||
      row["Start Date"] || row["period_of_performance_start_date"] || undefined,
    End_Date:
      row["Period of Performance Current End Date"] ||
      row["End Date"] || row["period_of_performance_current_end_date"] || undefined,
    Award_Type:
      row["Award Type"] || row["award_type"] || undefined,
  };
}

async function parseCsvFile(
  csvPath: string,
  stats: ReturnType<typeof createEmptyStats>,
  sourceUpdatedAt: Date
): Promise<void> {
  const batch: SpendingAward[] = [];

  const parser = fs.createReadStream(csvPath).pipe(
    csvParse({ columns: true, skip_empty_lines: true, relax_column_count: true })
  );

  for await (const row of parser) {
    const award = mapCsvRow(row as Record<string, string>);
    if (!award) continue;
    batch.push(award);
    stats.rowsRead++;

    if (batch.length >= BATCH_SIZE) {
      const result = await persistGovernmentAwardSummaries([...batch], sourceUpdatedAt);
      stats.rowsInserted += result.inserted;
      stats.rowsUpdated += result.updated;
      batch.length = 0;

      if (stats.rowsRead % 50_000 === 0) {
        console.log(
          `  parsed ${stats.rowsRead.toLocaleString()} rows` +
          ` (inserted: ${stats.rowsInserted.toLocaleString()}` +
          ` updated: ${stats.rowsUpdated.toLocaleString()})`
        );
      }
    }
  }

  if (batch.length > 0) {
    const result = await persistGovernmentAwardSummaries(batch, sourceUpdatedAt);
    stats.rowsInserted += result.inserted;
    stats.rowsUpdated += result.updated;
  }
}

// ---------------------------------------------------------------------------
// ZIP extraction — extract CSV files one at a time using streaming unzip
// ---------------------------------------------------------------------------

async function extractAndParseCsvs(
  zipPath: string,
  stats: ReturnType<typeof createEmptyStats>,
  sourceUpdatedAt: Date,
  extractDir: string
): Promise<void> {
  // Use unzip command (available on macOS/Linux) to extract, then parse each CSV
  const { execSync } = await import("node:child_process");
  fs.mkdirSync(extractDir, { recursive: true });

  console.log(`  Extracting ${path.basename(zipPath)}...`);
  // USASpending ZIPs are ZIP64. macOS `unzip` can't handle them; use `ditto` instead.
  try {
    execSync(`ditto -x -k "${zipPath}" "${extractDir}"`, { stdio: "pipe" });
  } catch {
    // fallback: python3 handles ZIP64 universally
    execSync(
      `python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "${zipPath}" "${extractDir}"`,
      { stdio: "pipe" }
    );
  }

  const csvFiles = fs
    .readdirSync(extractDir)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => path.join(extractDir, f));

  console.log(`  Found ${csvFiles.length} CSV file(s) in archive`);

  for (const csvFile of csvFiles) {
    const sizeMB = (fs.statSync(csvFile).size / 1024 / 1024).toFixed(1);
    console.log(`  Parsing ${path.basename(csvFile)} (${sizeMB} MB)...`);
    await parseCsvFile(csvFile, stats, sourceUpdatedAt);
    console.log(`  Done parsing ${path.basename(csvFile)}`);
    // Remove CSV after parsing to save disk space
    fs.unlinkSync(csvFile);
  }
}

// ---------------------------------------------------------------------------
// Per fiscal year orchestration
// ---------------------------------------------------------------------------

async function ingestFiscalYear(
  fy: number,
  stats: ReturnType<typeof createEmptyStats>,
  forceDownload: boolean
): Promise<void> {
  const fyDir = path.join(DOWNLOAD_DIR, `FY${fy}`);
  const zipPath = path.join(fyDir, `contracts_FY${fy}.zip`);
  const extractDir = path.join(fyDir, "extracted");
  const doneMarker = path.join(fyDir, ".parsed");

  // Skip if already fully parsed
  if (!forceDownload && fs.existsSync(doneMarker)) {
    console.log(`FY${fy}: already parsed, skipping`);
    return;
  }

  fs.mkdirSync(fyDir, { recursive: true });

  // Helper: test whether an existing ZIP is valid (not truncated/corrupt)
  const isValidZip = (p: string): boolean => {
    try {
      const { execSync: es } = require("node:child_process");
      es(`unzip -t "${p}"`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };

  const needsDownload = (): boolean => {
    if (forceDownload) return true;
    if (!fs.existsSync(zipPath)) return true;
    const sizeMB = fs.statSync(zipPath).size / 1024 / 1024;
    if (sizeMB < 5) {
      console.log(`FY${fy}: existing ZIP is only ${sizeMB.toFixed(1)} MB — likely corrupt, re-downloading`);
      fs.unlinkSync(zipPath);
      return true;
    }
    if (!isValidZip(zipPath)) {
      console.log(`FY${fy}: existing ZIP failed integrity check — re-downloading`);
      fs.unlinkSync(zipPath);
      return true;
    }
    return false;
  };

  if (needsDownload()) {
    // Request bulk download job
    const fileName = await requestBulkDownload(fy);
    // Poll until ready
    const fileUrl = await pollUntilReady(fileName);
    // Download ZIP
    console.log(`FY${fy}: downloading ZIP...`);
    await downloadFile(fileUrl, zipPath);
    const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
    console.log(`FY${fy}: downloaded ${sizeMB} MB`);
    stats.bytesDownloaded += fs.statSync(zipPath).size;
  } else {
    console.log(`FY${fy}: ZIP already downloaded and valid, parsing...`);
  }

  // Extract + parse
  await extractAndParseCsvs(zipPath, stats, new Date(), extractDir);

  // Clean up ZIP after successful parse
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Mark done
  fs.writeFileSync(doneMarker, new Date().toISOString());
  console.log(
    `FY${fy}: complete — ${stats.rowsInserted.toLocaleString()} inserted,` +
    ` ${stats.rowsUpdated.toLocaleString()} updated`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const years = args.years?.length
    ? args.years
    : Array.from(
        { length: args.endYear - args.startYear + 1 },
        (_, i) => args.endYear - i  // newest first
      );

  console.log(`USASpending bulk download: FY${years[0]}–FY${years[years.length - 1]}`);
  console.log(`Fiscal years to process: ${years.join(", ")}`);

  const { run } = await startIngestionRun({ sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID });
  const stats = createEmptyStats();

  try {
    for (const fy of years) {
      console.log(`\n=== Processing FY${fy} ===`);
      await ingestFiscalYear(fy, stats, args.forceDownload);
    }

    console.log(
      `\nAll years complete — total:` +
      ` ${stats.rowsRead.toLocaleString()} read,` +
      ` ${stats.rowsInserted.toLocaleString()} inserted,` +
      ` ${stats.rowsUpdated.toLocaleString()} updated`
    );

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failIngestionRun({
      runId: run.id,
      sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
      stats,
      errorSummary: message,
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
