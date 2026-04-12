import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { parse } from "csv-parse";
import { prisma } from "../lib/db";
import {
  fetchOfficialIrsEoBmfRecordCount,
  IRS_EO_BMF_SOURCE_SYSTEM_ID,
  isValidIrsEoBmfCode,
  listIrsEoBmfTargets,
  parseIrsEoBmfCsvRow,
  persistIrsEoBmfBatch,
  type IrsEoBmfFileCode,
  type IrsEoBmfRow,
} from "../lib/irs-eo-bmf";

interface ParsedArgs {
  all: boolean;
  batchSize: number;
  codes: IrsEoBmfFileCode[];
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
    all: false,
    batchSize: 500,
    codes: [],
    downloadDir: path.resolve("data/irs/eo-bmf"),
    forceDownload: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      parsed.all = true;
      continue;
    }
    if (arg === "--codes") {
      const rawValue = argv[i + 1] ?? "";
      parsed.codes = rawValue
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is IrsEoBmfFileCode =>
          isValidIrsEoBmfCode(value),
        );
      i++;
      continue;
    }
    if (arg === "--download-dir") {
      parsed.downloadDir = path.resolve(argv[i + 1] ?? parsed.downloadDir);
      i++;
      continue;
    }
    if (arg === "--batch-size") {
      const parsedSize = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(parsedSize) && parsedSize > 0) {
        parsed.batchSize = parsedSize;
      }
      i++;
      continue;
    }
    if (arg === "--max-rows") {
      const parsedMax = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(parsedMax) && parsedMax > 0) {
        parsed.maxRows = parsedMax;
      }
      i++;
      continue;
    }
    if (arg === "--force-download") {
      parsed.forceDownload = true;
      continue;
    }
  }

  if (!parsed.all && parsed.codes.length === 0) {
    throw new Error(
      "Usage: npm run ingest:irs-eo-bmf -- --all | --codes pr,ca,xx [--max-rows 1000] [--batch-size 500] [--force-download]",
    );
  }

  if (parsed.all) {
    parsed.codes = listIrsEoBmfTargets().map((target) => target.code);
  }

  parsed.codes = Array.from(new Set(parsed.codes));
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
    }),
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

async function downloadEoBmfFile(params: {
  url: string;
  fileCode: IrsEoBmfFileCode;
  downloadDir: string;
  forceDownload: boolean;
}): Promise<DownloadResult> {
  const head = await fetchHeadMetadata(params.url);
  const sourcePublishedAt = head?.sourcePublishedAt ?? null;
  const versionDir = sourcePublishedAt
    ? sourcePublishedAt.toISOString().slice(0, 10)
    : "undated";
  const filename = `eo_${params.fileCode}.csv`;
  const localDir = path.join(params.downloadDir, versionDir);
  const localPath = path.join(localDir, filename);
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
      contentType: head?.contentType ?? "text/csv",
      sourcePublishedAt,
    };
  }

  await ensureDir(localDir);
  const response = await fetch(params.url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `EO BMF download failed for ${params.fileCode}: ${response.status}`,
    );
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
    fs.createWriteStream(tempPath),
  );
  await fsPromises.rename(tempPath, localPath);

  // Strip macOS provenance attribute so Node.js can read the file back
  try {
    const { execSync } = await import("node:child_process");
    execSync(`xattr -d com.apple.provenance "${localPath}"`, { stdio: "pipe" });
  } catch {
    /* attribute may not exist on non-macOS or already absent */
  }

  return {
    downloaded: true,
    storageKey,
    localPath,
    byteSize,
    checksum: hash.digest("hex"),
    contentType:
      response.headers.get("content-type") ?? head?.contentType ?? "text/csv",
    sourcePublishedAt:
      parseHttpDate(response.headers.get("last-modified")) ?? sourcePublishedAt,
  };
}

async function upsertRawArtifact(params: {
  runId: string;
  fileCode: IrsEoBmfFileCode;
  url: string;
  download: DownloadResult;
}): Promise<void> {
  await prisma.rawArtifact.upsert({
    where: {
      storageKey: params.download.storageKey,
    },
    update: {
      originalUrl: params.url,
      checksum: params.download.checksum,
      contentType: params.download.contentType,
      byteSize: params.download.byteSize,
      sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
      fetchedAt: new Date(),
      parserVersion: "irs-eo-bmf-v1",
      status: "fetched",
      errorSummary: null,
    },
    create: {
      sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
      ingestionRunId: params.runId,
      artifactType: "eo_bmf_csv",
      storageProvider: "local",
      storageKey: params.download.storageKey,
      originalUrl: params.url,
      checksum: params.download.checksum,
      contentType: params.download.contentType,
      byteSize: params.download.byteSize,
      sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
      fetchedAt: new Date(),
      parserVersion: "irs-eo-bmf-v1",
      status: "fetched",
    },
  });
}

async function markRawArtifactParsed(storageKey: string): Promise<void> {
  await prisma.rawArtifact.update({
    where: { storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "irs-eo-bmf-v1",
      status: "parsed",
      errorSummary: null,
    },
  });
}

async function markRawArtifactFailed(
  storageKey: string,
  errorSummary: string,
): Promise<void> {
  await prisma.rawArtifact.update({
    where: { storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "irs-eo-bmf-v1",
      status: "failed",
      errorSummary,
    },
  });
}

async function flushBatch(
  batch: IrsEoBmfRow[],
  stats: AggregateStats,
): Promise<void> {
  if (batch.length === 0) return;
  const persisted = await persistIrsEoBmfBatch(batch);
  stats.rowsInserted += persisted.inserted;
  stats.rowsUpdated += persisted.updated;
  batch.length = 0;
}

async function processFile(params: {
  runId: string;
  target: ReturnType<typeof listIrsEoBmfTargets>[number];
  args: ParsedArgs;
  stats: AggregateStats;
  failures: string[];
}): Promise<void> {
  const download = await downloadEoBmfFile({
    url: params.target.url,
    fileCode: params.target.code,
    downloadDir: params.args.downloadDir,
    forceDownload: params.args.forceDownload,
  });

  if (download.downloaded) {
    params.stats.bytesDownloaded += download.byteSize;
  }

  await upsertRawArtifact({
    runId: params.runId,
    fileCode: params.target.code,
    url: params.target.url,
    download,
  });

  const parser = fs.createReadStream(download.localPath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );

  const batch: IrsEoBmfRow[] = [];
  let fileRowsProcessed = 0;

  try {
    for await (const rawRecord of parser as AsyncIterable<
      Record<string, string>
    >) {
      if (params.args.maxRows && params.stats.rowsRead >= params.args.maxRows) {
        break;
      }

      params.stats.rowsRead += 1;
      fileRowsProcessed += 1;

      try {
        const row = parseIrsEoBmfCsvRow(rawRecord, {
          sourceFileCode: params.target.code,
          sourceFileUrl: params.target.url,
          sourcePublishedAt: download.sourcePublishedAt,
        });
        batch.push(row);
      } catch (error) {
        params.stats.rowsFailed += 1;
        const message = error instanceof Error ? error.message : String(error);
        params.failures.push(`${params.target.code}: ${message}`);
      }

      if (batch.length >= params.args.batchSize) {
        await flushBatch(batch, params.stats);
      }
    }

    await flushBatch(batch, params.stats);
    await markRawArtifactParsed(download.storageKey);
    console.log(
      `Parsed ${params.target.filename}: ${fileRowsProcessed.toLocaleString()} rows`,
    );
  } catch (error) {
    await markRawArtifactFailed(
      download.storageKey,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = listIrsEoBmfTargets(args.codes);
  const startedAt = new Date();

  const sourceSystem = await prisma.sourceSystem.findUnique({
    where: { id: IRS_EO_BMF_SOURCE_SYSTEM_ID },
    select: { id: true },
  });
  if (!sourceSystem) {
    throw new Error(
      "Missing source system irs_eo_bmf. Run `npm run db:seed` after migrating.",
    );
  }

  const run = await prisma.ingestionRun.create({
    data: {
      id: `irsbmf_${startedAt.getTime()}`,
      sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
      runType: "manual_bulk_directory",
      status: "running",
      triggeredBy: "cli",
      startedAt,
      cursor: JSON.stringify({ codes: targets.map((target) => target.code) }),
    },
  });

  await prisma.sourceSystem.update({
    where: { id: IRS_EO_BMF_SOURCE_SYSTEM_ID },
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

  let officialTotal: number | null = null;
  if (args.all && !args.maxRows) {
    try {
      officialTotal = await fetchOfficialIrsEoBmfRecordCount();
    } catch (error) {
      failures.push(
        `official-count: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    for (const target of targets) {
      try {
        await processFile({
          runId: run.id,
          target,
          args,
          stats,
          failures,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${target.code}: ${message}`);
        console.error(`Failed ${target.filename}: ${message}`);
      }

      if (args.maxRows && stats.rowsRead >= args.maxRows) {
        break;
      }
    }

    const completedAt = new Date();
    const rowMismatch =
      officialTotal != null && officialTotal !== stats.rowsRead
        ? `official-count mismatch: expected ${officialTotal}, ingested ${stats.rowsRead}`
        : null;
    if (rowMismatch) {
      failures.push(rowMismatch);
    }

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
      where: { id: IRS_EO_BMF_SOURCE_SYSTEM_ID },
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
          filesRequested: targets.map((target) => target.code),
          rowsRead: stats.rowsRead,
          rowsInserted: stats.rowsInserted,
          rowsUpdated: stats.rowsUpdated,
          rowsFailed: stats.rowsFailed,
          bytesDownloaded: stats.bytesDownloaded,
          officialTotal,
          rowCountMatchesOfficial:
            officialTotal == null ? null : officialTotal === stats.rowsRead,
          failures,
        },
        null,
        2,
      ),
    );

    if (status === "failed") {
      process.exitCode = 1;
    }
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
