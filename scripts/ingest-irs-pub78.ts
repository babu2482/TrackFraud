/**
 * IRS Publication 78 ingestor.
 * Downloads and persists the IRS cumulative list of organizations eligible
 * to receive tax-deductible charitable contributions.
 *
 * Usage:
 *   npm run ingest:irs-pub78
 *   npm run ingest:irs-pub78 -- --force-download
 *   npm run ingest:irs-pub78 -- --max-rows 100 --batch-size 500
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { strFromU8, unzipSync } from "fflate";
import { prisma } from "../lib/db";
import {
  IRS_PUB78_SOURCE_SYSTEM_ID,
  IRS_PUB78_ZIP_URL,
  IRS_PUB78_INFO_URL,
  parseIrsPub78Line,
  persistIrsPub78Batch,
  type IrsPub78Row,
} from "../lib/irs-pub78";

interface ParsedArgs {
  batchSize: number;
  downloadDir: string;
  forceDownload: boolean;
  maxRows?: number;
}

interface DownloadResult {
  downloaded: boolean;
  storageKey: string;
  localPath: string;
  byteSize: number;
  checksum: string;
  contentType: string | null;
  sourcePublishedAt: Date | null;
}

interface AggregateStats {
  rowsRead: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  bytesDownloaded: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    batchSize: 5000,
    downloadDir: path.resolve("data/irs/pub78"),
    forceDownload: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--download-dir") { parsed.downloadDir = path.resolve(argv[++i] ?? parsed.downloadDir); continue; }
    if (arg === "--batch-size") { const n = Number.parseInt(argv[++i] ?? "", 10); if (Number.isFinite(n) && n > 0) parsed.batchSize = n; continue; }
    if (arg === "--max-rows") { const n = Number.parseInt(argv[++i] ?? "", 10); if (Number.isFinite(n) && n > 0) parsed.maxRows = n; continue; }
    if (arg === "--force-download") { parsed.forceDownload = true; continue; }
  }
  return parsed;
}

function parseHttpDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function ensureDir(p: string) { await fsPromises.mkdir(p, { recursive: true }); }
async function fileExists(p: string): Promise<boolean> { try { await fsPromises.access(p); return true; } catch { return false; } }

async function checksumFile(filePath: string): Promise<{ checksum: string; byteSize: number }> {
  const hash = createHash("sha256");
  let byteSize = 0;
  await pipeline(
    fs.createReadStream(filePath),
    new Transform({ transform(chunk, _, cb) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); hash.update(b); byteSize += b.length; cb(null, b); } }),
    new Transform({ transform(_, __, cb) { cb(); } })
  );
  return { checksum: hash.digest("hex"), byteSize };
}

async function fetchHead(url: string): Promise<{ sourcePublishedAt: Date | null; contentType: string | null } | null> {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return { sourcePublishedAt: parseHttpDate(r.headers.get("last-modified")), contentType: r.headers.get("content-type") };
  } catch { return null; }
}

async function downloadZip(params: { downloadDir: string; forceDownload: boolean }): Promise<DownloadResult> {
  const head = await fetchHead(IRS_PUB78_ZIP_URL);
  const sourcePublishedAt = head?.sourcePublishedAt ?? null;
  const versionDir = sourcePublishedAt ? sourcePublishedAt.toISOString().slice(0, 10) : "undated";
  const localDir = path.join(params.downloadDir, versionDir);
  const localPath = path.join(localDir, "data-download-pub78.zip");
  const storageKey = path.relative(process.cwd(), localPath).split(path.sep).join("/");

  if (!params.forceDownload && (await fileExists(localPath))) {
    const existing = await checksumFile(localPath);
    return { downloaded: false, storageKey, localPath, ...existing, contentType: head?.contentType ?? "application/zip", sourcePublishedAt };
  }

  await ensureDir(localDir);
  const response = await fetch(IRS_PUB78_ZIP_URL, { signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error(`Pub78 ZIP download failed: ${response.status}`);

  const hash = createHash("sha256");
  let byteSize = 0;
  const tempPath = `${localPath}.tmp`;
  await pipeline(
    Readable.fromWeb(response.body as any),
    new Transform({ transform(chunk, _, cb) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); hash.update(b); byteSize += b.length; cb(null, b); } }),
    fs.createWriteStream(tempPath)
  );
  await fsPromises.rename(tempPath, localPath);
  return {
    downloaded: true, storageKey, localPath, byteSize,
    checksum: hash.digest("hex"),
    contentType: response.headers.get("content-type") ?? head?.contentType ?? "application/zip",
    sourcePublishedAt: parseHttpDate(response.headers.get("last-modified")) ?? sourcePublishedAt,
  };
}

function extractText(zipBytes: Uint8Array): string {
  const files = unzipSync(zipBytes);
  const entry = Object.keys(files).find((n) => n.toLowerCase().endsWith(".txt"));
  if (!entry) throw new Error("No .txt file found in Pub78 ZIP");
  return strFromU8(files[entry]);
}

async function flushBatch(batch: IrsPub78Row[], sourcePublishedAt: Date | null, stats: AggregateStats) {
  if (batch.length === 0) return;
  const result = await persistIrsPub78Batch(batch, sourcePublishedAt);
  stats.rowsInserted += result.inserted;
  stats.rowsUpdated += result.updated;
  batch.length = 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  const sourceSystem = await prisma.sourceSystem.findUnique({ where: { id: IRS_PUB78_SOURCE_SYSTEM_ID }, select: { id: true } });
  if (!sourceSystem) throw new Error("Missing source system irs_pub78. Run `npm run db:seed`.");

  const run = await prisma.ingestionRun.create({
    data: { id: `ingest_${Date.now()}`, sourceSystemId: IRS_PUB78_SOURCE_SYSTEM_ID, runType: "manual_bulk", status: "running", triggeredBy: "cli", startedAt },
  });
  await prisma.sourceSystem.update({ where: { id: IRS_PUB78_SOURCE_SYSTEM_ID }, data: { lastAttemptedSyncAt: startedAt, lastError: null } });

  const stats: AggregateStats = { rowsRead: 0, rowsInserted: 0, rowsUpdated: 0, rowsSkipped: 0, rowsFailed: 0, bytesDownloaded: 0 };
  const failures: string[] = [];

  try {
    console.log("Downloading IRS Publication 78...");
    const download = await downloadZip({ downloadDir: args.downloadDir, forceDownload: args.forceDownload });
    if (download.downloaded) { stats.bytesDownloaded += download.byteSize; console.log(`Downloaded ${(download.byteSize / 1_048_576).toFixed(1)} MB`); }
    else console.log("Using cached file.");

    await prisma.rawArtifact.upsert({
      where: { storageKey: download.storageKey },
      update: { originalUrl: IRS_PUB78_ZIP_URL, checksum: download.checksum, contentType: download.contentType, byteSize: download.byteSize, sourcePublishedAt: download.sourcePublishedAt ?? undefined, fetchedAt: new Date(), parserVersion: "irs-pub78-v1", status: "fetched", errorSummary: null },
      create: {
          id: `artifact_${Date.now()}_${Math.random().toString(36).substring(7)}`, sourceSystemId: IRS_PUB78_SOURCE_SYSTEM_ID, ingestionRunId: run.id, artifactType: "irs_pub78_zip", storageProvider: "local", storageKey: download.storageKey, originalUrl: IRS_PUB78_ZIP_URL, checksum: download.checksum, contentType: download.contentType, byteSize: download.byteSize, sourcePublishedAt: download.sourcePublishedAt ?? undefined, fetchedAt: new Date(),
          updatedAt: new Date(), parserVersion: "irs-pub78-v1", status: "fetched" },
    });

    console.log("Extracting and parsing...");
    const zipBytes = new Uint8Array(await fsPromises.readFile(download.localPath));
    const text = extractText(zipBytes);
    const lines = text.split(/\r?\n/);
    const batch: IrsPub78Row[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (args.maxRows && stats.rowsRead >= args.maxRows) break;

      const row = parseIrsPub78Line(trimmed);
      if (!row) { stats.rowsSkipped++; continue; }

      stats.rowsRead++;
      batch.push(row);

      if (batch.length >= args.batchSize) {
        await flushBatch(batch, download.sourcePublishedAt, stats);
        process.stdout.write(`\r  rows: ${stats.rowsRead.toLocaleString()} inserted: ${stats.rowsInserted.toLocaleString()} updated: ${stats.rowsUpdated.toLocaleString()}`);
      }
    }
    await flushBatch(batch, download.sourcePublishedAt, stats);
    console.log();

    await prisma.rawArtifact.update({ where: { storageKey: download.storageKey }, data: { parsedAt: new Date(), parserVersion: "irs-pub78-v1", status: "parsed", errorSummary: null } });

    const completedAt = new Date();
    const errorSummary = failures.length > 0 ? failures.slice(0, 10).join(" | ") : null;
    const status = failures.length === 0 ? "completed" : stats.rowsInserted + stats.rowsUpdated > 0 ? "completed_with_errors" : "failed";

    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status, rowsRead: stats.rowsRead, rowsInserted: stats.rowsInserted, rowsUpdated: stats.rowsUpdated, rowsSkipped: stats.rowsSkipped, rowsFailed: stats.rowsFailed, bytesDownloaded: stats.bytesDownloaded, errorSummary, completedAt } });
    await prisma.sourceSystem.update({ where: { id: IRS_PUB78_SOURCE_SYSTEM_ID }, data: { lastSuccessfulSyncAt: status !== "failed" ? completedAt : undefined, lastError: errorSummary } });

    console.log(JSON.stringify({ runId: run.id, status, rowsRead: stats.rowsRead, rowsInserted: stats.rowsInserted, rowsUpdated: stats.rowsUpdated, rowsFailed: stats.rowsFailed, bytesDownloaded: stats.bytesDownloaded, sourceInfoUrl: IRS_PUB78_INFO_URL }, null, 2));
    if (status === "failed") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: "failed", rowsRead: stats.rowsRead, rowsInserted: stats.rowsInserted, rowsUpdated: stats.rowsUpdated, rowsSkipped: stats.rowsSkipped, rowsFailed: stats.rowsFailed, bytesDownloaded: stats.bytesDownloaded, errorSummary: message, completedAt: new Date() } });
    await prisma.sourceSystem.update({ where: { id: IRS_PUB78_SOURCE_SYSTEM_ID }, data: { lastError: message } });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); try { await prisma.$disconnect(); } catch {} process.exit(1); });
