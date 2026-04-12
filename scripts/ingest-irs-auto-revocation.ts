import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { strFromU8, unzipSync } from "fflate";
import { prisma } from "../lib/db";
import {
  IRS_AUTO_REVOCATION_INFO_URL,
  IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID,
  IRS_AUTO_REVOCATION_ZIP_URL,
  parseIrsAutoRevocationLine,
  persistIrsAutoRevocationBatch,
  type IrsAutoRevocationRow,
} from "../lib/irs-auto-revocation";

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
    downloadDir: path.resolve("data/irs/auto-revocation"),
    forceDownload: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--download-dir") {
      parsed.downloadDir = path.resolve(argv[i + 1] ?? parsed.downloadDir);
      i++;
      continue;
    }
    if (arg === "--batch-size") {
      const size = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(size) && size > 0) {
        parsed.batchSize = size;
      }
      i++;
      continue;
    }
    if (arg === "--max-rows") {
      const maxRows = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(maxRows) && maxRows > 0) {
        parsed.maxRows = maxRows;
      }
      i++;
      continue;
    }
    if (arg === "--force-download") {
      parsed.forceDownload = true;
      continue;
    }
  }

  return parsed;
}

function parseHttpDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checksumFile(filePath: string): Promise<{
  checksum: string;
  byteSize: number;
}> {
  const hash = createHash("sha256");
  let byteSize = 0;

  await pipeline(
    fs.createReadStream(filePath),
    new Transform({
      transform(chunk, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        byteSize += buffer.length;
        callback(null, buffer);
      },
    }),
    new Transform({
      transform(_chunk, _encoding, callback) {
        callback();
      },
    })
  );

  return {
    checksum: hash.digest("hex"),
    byteSize,
  };
}

async function fetchHeadMetadata(url: string): Promise<{
  sourcePublishedAt: Date | null;
  contentType: string | null;
} | null> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    return {
      sourcePublishedAt: parseHttpDate(response.headers.get("last-modified")),
      contentType: response.headers.get("content-type"),
    };
  } catch {
    return null;
  }
}

async function downloadRevocationZip(params: {
  downloadDir: string;
  forceDownload: boolean;
}): Promise<DownloadResult> {
  const head = await fetchHeadMetadata(IRS_AUTO_REVOCATION_ZIP_URL);
  const sourcePublishedAt = head?.sourcePublishedAt ?? null;
  const versionDir = sourcePublishedAt
    ? sourcePublishedAt.toISOString().slice(0, 10)
    : "undated";
  const localDir = path.join(params.downloadDir, versionDir);
  const localPath = path.join(localDir, "data-download-revocation.zip");
  const storageKey = path
    .relative(process.cwd(), localPath)
    .split(path.sep)
    .join("/");

  if (!params.forceDownload && (await fileExists(localPath))) {
    const existing = await checksumFile(localPath);
    return {
      downloaded: false,
      storageKey,
      localPath,
      byteSize: existing.byteSize,
      checksum: existing.checksum,
      contentType: head?.contentType ?? "application/zip",
      sourcePublishedAt,
    };
  }

  await ensureDir(localDir);
  const response = await fetch(IRS_AUTO_REVOCATION_ZIP_URL, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Revocation ZIP download failed: ${response.status}`);
  }

  const hash = createHash("sha256");
  let byteSize = 0;
  const tempPath = `${localPath}.tmp`;
  await pipeline(
    Readable.fromWeb(response.body as any),
    new Transform({
      transform(chunk, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        byteSize += buffer.length;
        callback(null, buffer);
      },
    }),
    fs.createWriteStream(tempPath)
  );
  await fsPromises.rename(tempPath, localPath);

  return {
    downloaded: true,
    storageKey,
    localPath,
    byteSize,
    checksum: hash.digest("hex"),
    contentType: response.headers.get("content-type") ?? head?.contentType ?? "application/zip",
    sourcePublishedAt:
      parseHttpDate(response.headers.get("last-modified")) ?? sourcePublishedAt,
  };
}

function extractSingleTextEntry(zipBytes: Uint8Array): string {
  const files = unzipSync(zipBytes);
  const entryName = Object.keys(files).find((name) =>
    name.toLowerCase().endsWith(".txt")
  );
  if (!entryName) {
    throw new Error("No .txt file found in IRS revocation ZIP");
  }
  return strFromU8(files[entryName]);
}

async function upsertRawArtifact(params: {
  runId: string;
  download: DownloadResult;
}): Promise<void> {
  await prisma.rawArtifact.upsert({
    where: {
      storageKey: params.download.storageKey,
    },
    update: {
      originalUrl: IRS_AUTO_REVOCATION_ZIP_URL,
      checksum: params.download.checksum,
      contentType: params.download.contentType,
      byteSize: params.download.byteSize,
      sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
      fetchedAt: new Date(),
      parserVersion: "irs-auto-revocation-v1",
      status: "fetched",
      errorSummary: null,
    },
    create: {
          id: `artifact_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      sourceSystemId: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID,
      ingestionRunId: params.runId,
      artifactType: "irs_auto_revocation_zip",
      storageProvider: "local",
      storageKey: params.download.storageKey,
      originalUrl: IRS_AUTO_REVOCATION_ZIP_URL,
      checksum: params.download.checksum,
      contentType: params.download.contentType,
      byteSize: params.download.byteSize,
      sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
      fetchedAt: new Date(),
      parserVersion: "irs-auto-revocation-v1",
      status: "fetched",
    },
  });
}

async function markRawArtifactStatus(params: {
  storageKey: string;
  status: "parsed" | "failed";
  errorSummary?: string | null;
}): Promise<void> {
  await prisma.rawArtifact.update({
    where: { storageKey: params.storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "irs-auto-revocation-v1",
      status: params.status,
      errorSummary: params.errorSummary ?? null,
    },
  });
}

async function flushBatch(
  batch: IrsAutoRevocationRow[],
  stats: AggregateStats
): Promise<void> {
  if (batch.length === 0) return;
  const persisted = await persistIrsAutoRevocationBatch(batch);
  stats.rowsInserted += persisted.inserted;
  stats.rowsUpdated += persisted.updated;
  batch.length = 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  const sourceSystem = await prisma.sourceSystem.findUnique({
    where: { id: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID },
    select: { id: true },
  });
  if (!sourceSystem) {
    throw new Error(
      "Missing source system irs_auto_revocation. Run `npm run db:seed` after migrating."
    );
  }

  const run = await prisma.ingestionRun.create({
    data: {
      sourceSystemId: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID,
      runType: "manual_bulk_status",
      status: "running",
      triggeredBy: "cli",
      startedAt,
      updatedAt: startedAt,
    },
  });

  await prisma.sourceSystem.update({
    where: { id: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID },
    data: {
      lastAttemptedSyncAt: startedAt,
      lastError: null,
    },
  });

  const stats: AggregateStats = {
    rowsRead: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    bytesDownloaded: 0,
  };
  const failures: string[] = [];

  try {
    const download = await downloadRevocationZip({
      downloadDir: args.downloadDir,
      forceDownload: args.forceDownload,
    });
    if (download.downloaded) {
      stats.bytesDownloaded += download.byteSize;
    }

    await upsertRawArtifact({
      runId: run.id,
      download,
    });

    const zipBytes = new Uint8Array(await fsPromises.readFile(download.localPath));
    const text = extractSingleTextEntry(zipBytes);
    const lines = text.split(/\r?\n/);
    const batch: IrsAutoRevocationRow[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (args.maxRows && stats.rowsRead >= args.maxRows) break;

      stats.rowsRead += 1;
      try {
        batch.push(parseIrsAutoRevocationLine(trimmed, download.sourcePublishedAt));
      } catch (error) {
        stats.rowsFailed += 1;
        failures.push(error instanceof Error ? error.message : String(error));
      }

      if (batch.length >= args.batchSize) {
        await flushBatch(batch, stats);
      }
    }

    await flushBatch(batch, stats);
    await markRawArtifactStatus({
      storageKey: download.storageKey,
      status: "parsed",
    });

    const completedAt = new Date();
    const errorSummary =
      failures.length > 0 ? failures.slice(0, 10).join(" | ") : null;
    const status =
      failures.length === 0
        ? "completed"
        : stats.rowsInserted + stats.rowsUpdated > 0
          ? "completed_with_errors"
          : "failed";

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status,
        rowsRead: stats.rowsRead,
        rowsInserted: stats.rowsInserted,
        rowsUpdated: stats.rowsUpdated,
        rowsSkipped: stats.rowsSkipped,
        rowsFailed: stats.rowsFailed,
        bytesDownloaded: stats.bytesDownloaded,
        errorSummary,
        completedAt,
      },
    });

    await prisma.sourceSystem.update({
      where: { id: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID },
      data: {
        lastSuccessfulSyncAt:
          status === "completed" || status === "completed_with_errors"
            ? completedAt
            : undefined,
        lastError: errorSummary,
      },
    });

    console.log(
      JSON.stringify(
        {
          runId: run.id,
          rowsRead: stats.rowsRead,
          rowsInserted: stats.rowsInserted,
          rowsUpdated: stats.rowsUpdated,
          rowsFailed: stats.rowsFailed,
          bytesDownloaded: stats.bytesDownloaded,
          sourceInfoUrl: IRS_AUTO_REVOCATION_INFO_URL,
          failures,
        },
        null,
        2
      )
    );

    if (status === "failed") {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        rowsRead: stats.rowsRead,
        rowsInserted: stats.rowsInserted,
        rowsUpdated: stats.rowsUpdated,
        rowsSkipped: stats.rowsSkipped,
        rowsFailed: stats.rowsFailed,
        bytesDownloaded: stats.bytesDownloaded,
        errorSummary: message,
        completedAt: new Date(),
      },
    });
    await prisma.sourceSystem.update({
      where: { id: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID },
      data: {
        lastError: message,
      },
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {
    // Best effort disconnect only.
  }
  process.exit(1);
});
