import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface DownloadResult {
  downloaded: boolean;
  storageKey: string;
  localPath: string;
  byteSize: number;
  checksum: string;
  contentType: string | null;
  sourcePublishedAt: Date | null;
}

export interface BasicIngestionStats {
  rowsRead: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  bytesDownloaded?: number;
}

export function createEmptyStats(): BasicIngestionStats & {
  bytesDownloaded: number;
} {
  return {
    rowsRead: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    bytesDownloaded: 0,
  };
}

export interface IngestionParams {
  sourceSystemId: string;
  runType?: string;
  triggeredBy?: string;
}

export function parseHttpDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function checksumFile(
  filePath: string,
): Promise<{ checksum: string; byteSize: number }> {
  const hash = createHash("sha256");
  let byteSize = 0;

  await pipeline(
    fs.createReadStream(filePath),
    new Transform({
      transform(chunk, _, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hash.update(buffer);
        byteSize += buffer.length;
        callback(null, buffer);
      },
    }),
    new Transform({
      transform(_, __, callback) {
        callback();
      },
    }),
  );

  return { checksum: hash.digest("hex"), byteSize };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableDatabaseError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P1001", "P1002", "P1008", "P1017"].includes(error.code)
  ) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /can't reach database server|connection.+closed|econnrefused|terminated unexpectedly/i.test(
    message,
  );
}

export async function withDatabaseRetry<T>(
  operationLabel: string,
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  },
): Promise<T> {
  const retries = options?.retries ?? 6;
  const initialDelayMs = options?.initialDelayMs ?? 1_000;
  const maxDelayMs = options?.maxDelayMs ?? 15_000;

  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDatabaseError(error) || attempt >= retries) {
        throw error;
      }

      const backoffMs = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
      const jitterMs = Math.floor(Math.random() * 250);
      const delayMs = backoffMs + jitterMs;
      const message = error instanceof Error ? error.message : String(error);

      console.warn(
        `Retrying database operation "${operationLabel}" after transient failure (${attempt + 1}/${
          retries + 1
        }): ${message}`,
      );
      await sleep(delayMs);
    }
  }
}

export async function fetchHeadMetadata(url: string): Promise<{
  sourcePublishedAt: Date | null;
  contentType: string | null;
} | null> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(30_000),
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

export async function downloadVersionedFile(params: {
  url: string;
  downloadRoot: string;
  fileName?: string;
  year?: number;
  forceDownload?: boolean;
  defaultContentType?: string;
}): Promise<DownloadResult> {
  const head = await fetchHeadMetadata(params.url);
  const sourcePublishedAt = head?.sourcePublishedAt ?? null;
  const versionDir = sourcePublishedAt
    ? sourcePublishedAt.toISOString().slice(0, 10)
    : "undated";
  const localDir = params.year
    ? path.join(params.downloadRoot, String(params.year), versionDir)
    : path.join(params.downloadRoot, versionDir);
  const fileName =
    params.fileName ?? path.posix.basename(new URL(params.url).pathname);
  const localPath = path.join(localDir, fileName);
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
      ...existing,
      contentType:
        head?.contentType ??
        params.defaultContentType ??
        "application/octet-stream",
      sourcePublishedAt,
    };
  }

  await ensureDir(localDir);
  const response = await fetch(params.url, {
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Download failed for ${params.url}: ${response.status} ${response.statusText}`,
    );
  }

  const tempPath = `${localPath}.tmp`;
  const hash = createHash("sha256");
  let byteSize = 0;

  await pipeline(
    Readable.fromWeb(response.body as never),
    new Transform({
      transform(chunk, _, callback) {
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
      response.headers.get("content-type") ??
      head?.contentType ??
      params.defaultContentType ??
      "application/octet-stream",
    sourcePublishedAt:
      parseHttpDate(response.headers.get("last-modified")) ?? sourcePublishedAt,
  };
}

export async function writeJsonSnapshot(params: {
  rootDir: string;
  fileName: string;
  payload: unknown;
  versionDir?: string;
}): Promise<DownloadResult> {
  const localDir = params.versionDir
    ? path.join(params.rootDir, params.versionDir)
    : params.rootDir;
  await ensureDir(localDir);
  const localPath = path.join(localDir, params.fileName);
  const bytes = Buffer.from(JSON.stringify(params.payload, null, 2), "utf-8");
  await fsPromises.writeFile(localPath, bytes);
  const { checksum, byteSize } = await checksumFile(localPath);
  return {
    downloaded: true,
    storageKey: path
      .relative(process.cwd(), localPath)
      .split(path.sep)
      .join("/"),
    localPath,
    byteSize,
    checksum,
    contentType: "application/json",
    sourcePublishedAt: null,
  };
}

export async function upsertRawArtifact(params: {
  sourceSystemId: string;
  ingestionRunId?: string;
  artifactType: string;
  originalUrl: string;
  parserVersion: string;
  status: string;
  download: DownloadResult;
  entityId?: string;
  errorSummary?: string | null;
}) {
  return withDatabaseRetry(
    `upsert raw artifact ${params.download.storageKey}`,
    () =>
      prisma.rawArtifact.upsert({
        where: { storageKey: params.download.storageKey },
        update: {
          ingestionRunId: params.ingestionRunId,
          entityId: params.entityId,
          originalUrl: params.originalUrl,
          checksum: params.download.checksum,
          contentType: params.download.contentType,
          byteSize: params.download.byteSize,
          sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
          fetchedAt: new Date(),
          parserVersion: params.parserVersion,
          status: params.status,
          errorSummary: params.errorSummary ?? null,
        },
        create: {
          sourceSystemId: params.sourceSystemId,
          ingestionRunId: params.ingestionRunId,
          entityId: params.entityId,
          artifactType: params.artifactType,
          storageProvider: "local",
          storageKey: params.download.storageKey,
          originalUrl: params.originalUrl,
          checksum: params.download.checksum,
          contentType: params.download.contentType,
          byteSize: params.download.byteSize,
          sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
          fetchedAt: new Date(),
          parserVersion: params.parserVersion,
          status: params.status,
          errorSummary: params.errorSummary ?? null,
        },
      }),
  );
}

export async function startIngestionRun(params: {
  sourceSystemId: string;
  runType?: string;
  triggeredBy?: string;
}) {
  const now = new Date();
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const run = await prisma.ingestionRun.create({
    data: {
      id: runId,
      sourceSystemId: params.sourceSystemId,
      runType: params.runType ?? "manual_bulk",
      status: "running",
      triggeredBy: params.triggeredBy ?? "cli",
      startedAt: now,
      updatedAt: now,
    },
  });
  await withDatabaseRetry(`mark ${params.sourceSystemId} attempted sync`, () =>
    prisma.sourceSystem.update({
      where: { id: params.sourceSystemId },
      data: {
        lastAttemptedSyncAt: now,
        lastError: null,
      },
    }),
  );
  return { run, startedAt: now };
}

export async function finishIngestionRun(params: {
  runId: string;
  sourceSystemId: string;
  stats: BasicIngestionStats;
  status?: string;
  errorSummary?: string | null;
}) {
  const completedAt = new Date();
  const status = params.status ?? "completed";
  await withDatabaseRetry(`finish ingestion run ${params.runId}`, () =>
    prisma.ingestionRun.update({
      where: { id: params.runId },
      data: {
        status,
        rowsRead: params.stats.rowsRead,
        rowsInserted: params.stats.rowsInserted,
        rowsUpdated: params.stats.rowsUpdated,
        rowsSkipped: params.stats.rowsSkipped,
        rowsFailed: params.stats.rowsFailed,
        bytesDownloaded: params.stats.bytesDownloaded,
        errorSummary: params.errorSummary ?? null,
        completedAt,
      },
    }),
  );
  await withDatabaseRetry(`update source system ${params.sourceSystemId}`, () =>
    prisma.sourceSystem.update({
      where: { id: params.sourceSystemId },
      data: {
        lastSuccessfulSyncAt: status !== "failed" ? completedAt : undefined,
        lastError: params.errorSummary ?? null,
      },
    }),
  );
}

export async function failIngestionRun(params: {
  runId: string;
  sourceSystemId: string;
  stats: BasicIngestionStats;
  errorSummary: string;
}) {
  await finishIngestionRun({
    runId: params.runId,
    sourceSystemId: params.sourceSystemId,
    stats: params.stats,
    status: "failed",
    errorSummary: params.errorSummary,
  });
}
