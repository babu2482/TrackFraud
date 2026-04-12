/**
 * IRS Form 990 XML ingestor.
 *
 * Phase breakdown:
 * - index: ingest yearly IRS CSV filing manifests into CharityFiling990Index
 * - parse: resolve archive membership, parse XML filings, write CharityFiling,
 *          and optionally recompute stored charity fraud snapshots
 * - all: run index, then parse
 *
 * Usage:
 *   npm run ingest:irs-990-xml
 *   npm run ingest:irs-990-xml -- --phase parse --years 2024 --max-rows 100
 *   npm run ingest:irs-990-xml -- --phase parse --years 2024 --compute-fraud
 *   npm run ingest:irs-990-xml -- --phase all --years 2024,2025
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { parse } from "csv-parse";
import { Unzip, UnzipInflate } from "fflate";
import { prisma } from "../lib/db";
import {
  ensureCharityEntity,
  recomputeStoredCharityFraud,
} from "../lib/charity-fraud-refresh";
import {
  IRS_990_XML_SOURCE_SYSTEM_ID,
  IRS_990_INDEX_INFO_URL,
  IRS_990_XML_BASE_URL,
  buildArchiveXmlReference,
  deriveObjectIdFromArchiveEntry,
  discoverIrs990XmlCatalog,
  extractFinancialFields,
  extractReturnTimestamp,
  extractTaxPeriodIdentifierFromXml,
  mapReturnTypeToFormType,
  markLatestFilings,
  parseIrs990IndexRecord,
  parseLooseIrsDate,
  parseTaxPeriodIdentifier,
  persistIrs990IndexBatch,
  selectIrs990CatalogYears,
  upsertCharityFiling,
  type Irs990IndexRow,
  type Irs990YearCatalog,
} from "../lib/irs-990-xml";

type Phase = "index" | "parse" | "all";

interface ParsedArgs {
  archiveDir: string;
  batchSize: number;
  computeFraud: boolean;
  downloadDir: string;
  forceDownload: boolean;
  maxRows?: number;
  parseConcurrency: number;
  phase: Phase;
  years?: number[];
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

interface IndexAggregateStats {
  rowsRead: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  bytesDownloaded: number;
}

interface ParseAggregateStats {
  archivesScanned: number;
  bytesDownloaded: number;
  entitiesCreated: number;
  filingsInserted: number;
  filingsParsed: number;
  filingsResolved: number;
  filingsSelected: number;
  filingsUpdated: number;
  missingArchiveEntries: number;
  rowsFailed: number;
  snapshotsRecomputed: number;
}

interface IndexParseTarget {
  objectId: string;
  ein: string;
  taxpayerName: string | null;
  returnType: string | null;
  taxPeriod: string | null;
  subDate: string | null;
  lastUpdated: string | null;
  archiveUrl: string | null;
  archiveFileName: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    archiveDir: path.resolve("data/irs/990-xml/archives"),
    batchSize: 5000,
    computeFraud: false,
    downloadDir: path.resolve("data/irs/990-xml/index"),
    forceDownload: false,
    parseConcurrency: 8,
    phase: "index",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--archive-dir") {
      parsed.archiveDir = path.resolve(argv[++i] ?? parsed.archiveDir);
      continue;
    }
    if (arg === "--download-dir") {
      parsed.downloadDir = path.resolve(argv[++i] ?? parsed.downloadDir);
      continue;
    }
    if (arg === "--batch-size") {
      const batchSize = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(batchSize) && batchSize > 0) {
        parsed.batchSize = batchSize;
      }
      continue;
    }
    if (arg === "--max-rows") {
      const maxRows = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(maxRows) && maxRows > 0) {
        parsed.maxRows = maxRows;
      }
      continue;
    }
    if (arg === "--parse-concurrency") {
      const parseConcurrency = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(parseConcurrency) && parseConcurrency > 0) {
        parsed.parseConcurrency = parseConcurrency;
      }
      continue;
    }
    if (arg === "--phase") {
      const phase = (argv[++i] ?? "").trim().toLowerCase();
      if (phase === "index" || phase === "parse" || phase === "all") {
        parsed.phase = phase;
      }
      continue;
    }
    if (arg === "--years") {
      const years = (argv[++i] ?? "")
        .split(",")
        .map((year) => Number.parseInt(year.trim(), 10))
        .filter((year) => Number.isFinite(year));
      if (years.length > 0) {
        parsed.years = years;
      }
      continue;
    }
    if (arg === "--force-download") {
      parsed.forceDownload = true;
      continue;
    }
    if (arg === "--compute-fraud") {
      parsed.computeFraud = true;
    }
  }

  return parsed;
}

function parseHttpDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function ensureDir(dirPath: string) {
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

  return {
    checksum: hash.digest("hex"),
    byteSize,
  };
}

async function fetchHead(url: string): Promise<{
  sourcePublishedAt: Date | null;
  contentType: string | null;
} | null> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return null;
    }

    return {
      sourcePublishedAt: parseHttpDate(response.headers.get("last-modified")),
      contentType: response.headers.get("content-type"),
    };
  } catch {
    return null;
  }
}

async function downloadVersionedFile(params: {
  url: string;
  downloadRoot: string;
  fileName: string;
  year: number;
  forceDownload: boolean;
  defaultContentType: string;
}): Promise<DownloadResult> {
  const head = await fetchHead(params.url);
  const sourcePublishedAt = head?.sourcePublishedAt ?? null;
  const versionDir = sourcePublishedAt
    ? sourcePublishedAt.toISOString().slice(0, 10)
    : "undated";
  const localDir = path.join(
    params.downloadRoot,
    String(params.year),
    versionDir,
  );
  const localPath = path.join(localDir, params.fileName);
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
      contentType: head?.contentType ?? params.defaultContentType,
      sourcePublishedAt,
    };
  }

  await ensureDir(localDir);
  const response = await fetch(params.url, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${params.url}: ${response.status}`);
  }

  const hash = createHash("sha256");
  let byteSize = 0;
  const tempPath = `${localPath}.tmp`;

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

  return {
    downloaded: true,
    storageKey,
    localPath,
    byteSize,
    checksum: hash.digest("hex"),
    contentType:
      response.headers.get("content-type") ??
      head?.contentType ??
      params.defaultContentType,
    sourcePublishedAt:
      parseHttpDate(response.headers.get("last-modified")) ?? sourcePublishedAt,
  };
}

async function upsertRawArtifact(params: {
  artifactType: string;
  contentType: string | null;
  download: DownloadResult;
  ingestionRunId: string;
  originalUrl: string;
  parserVersion: string;
  status: string;
}) {
  await prisma.rawArtifact.upsert({
    where: { storageKey: params.download.storageKey },
    update: {
      ingestionRunId: params.ingestionRunId,
      originalUrl: params.originalUrl,
      checksum: params.download.checksum,
      contentType: params.contentType,
      byteSize: params.download.byteSize,
      sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
      fetchedAt: new Date(),
      parserVersion: params.parserVersion,
      status: params.status,
      errorSummary: null,
    },
    create: {
          id: `artifact_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      sourceSystemId: IRS_990_XML_SOURCE_SYSTEM_ID,
      ingestionRunId: params.ingestionRunId,
      artifactType: params.artifactType,
      storageProvider: "local",
      storageKey: params.download.storageKey,
      originalUrl: params.originalUrl,
      checksum: params.download.checksum,
      contentType: params.contentType,
      byteSize: params.download.byteSize,
      sourcePublishedAt: params.download.sourcePublishedAt ?? undefined,
      fetchedAt: new Date(),
          updatedAt: new Date(),
      parserVersion: params.parserVersion,
      status: params.status,
    },
  });
}

async function flushIndexBatch(
  batch: Irs990IndexRow[],
  stats: IndexAggregateStats,
): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  const result = await persistIrs990IndexBatch(batch);
  stats.rowsInserted += result.inserted;
  stats.rowsUpdated += result.updated;
  batch.length = 0;
}

async function ingestYearIndex(params: {
  yearCatalog: Irs990YearCatalog;
  args: ParsedArgs;
  runId: string;
  stats: IndexAggregateStats;
}): Promise<void> {
  const { yearCatalog, args, runId, stats } = params;

  console.log(
    `\nIndex year ${yearCatalog.filingYear}: ${yearCatalog.archiveUrls.length} archive file(s) discovered`,
  );

  const download = await downloadVersionedFile({
    url: yearCatalog.indexUrl,
    downloadRoot: args.downloadDir,
    fileName: `index_${yearCatalog.filingYear}.csv`,
    year: yearCatalog.filingYear,
    forceDownload: args.forceDownload,
    defaultContentType: "text/csv",
  });

  if (download.downloaded) {
    stats.bytesDownloaded += download.byteSize;
    console.log(
      `  downloaded ${(download.byteSize / 1_048_576).toFixed(1)} MB index CSV`,
    );
  } else {
    console.log("  using cached index CSV");
  }

  await upsertRawArtifact({
    artifactType: "irs_990_xml_index_csv",
    contentType: download.contentType,
    download,
    ingestionRunId: runId,
    originalUrl: yearCatalog.indexUrl,
    parserVersion: "irs-990-xml-index-v1",
    status: "fetched",
  });

  const parser = fs.createReadStream(download.localPath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  ) as AsyncIterable<Record<string, string>>;

  const batch: Irs990IndexRow[] = [];
  for await (const record of parser) {
    if (args.maxRows && stats.rowsRead >= args.maxRows) {
      break;
    }

    const row = parseIrs990IndexRecord(
      record,
      yearCatalog.filingYear,
      yearCatalog.archiveUrls,
    );
    if (!row) {
      stats.rowsSkipped++;
      continue;
    }

    stats.rowsRead++;
    batch.push(row);

    if (batch.length >= args.batchSize) {
      await flushIndexBatch(batch, stats);
      process.stdout.write(
        `\r  rows: ${stats.rowsRead.toLocaleString()} inserted: ${stats.rowsInserted.toLocaleString()} updated: ${stats.rowsUpdated.toLocaleString()}`,
      );
    }
  }

  await flushIndexBatch(batch, stats);
  console.log();

  await prisma.rawArtifact.update({
    where: { storageKey: download.storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "irs-990-xml-index-v1",
      status: "parsed",
      errorSummary: null,
    },
  });
}

async function buildArchiveWorkList(
  yearCatalog: Irs990YearCatalog,
): Promise<string[]> {
  const archiveUrls = new Set(yearCatalog.archiveUrls);

  const storedRows = await prisma.charityFiling990Index.findMany({
    where: {
      filingYear: yearCatalog.filingYear,
      archiveUrl: { not: null },
    },
    select: { archiveUrl: true },
  });
  for (const row of storedRows) {
    if (row.archiveUrl) {
      archiveUrls.add(row.archiveUrl);
    }
  }

  if (archiveUrls.size === 0) {
    const batchRows = await prisma.charityFiling990Index.findMany({
      where: {
        filingYear: yearCatalog.filingYear,
        xmlBatchId: { not: null },
      },
      distinct: ["xmlBatchId"],
      select: { xmlBatchId: true },
    });
    for (const row of batchRows) {
      if (row.xmlBatchId) {
        archiveUrls.add(
          `${IRS_990_XML_BASE_URL}/${yearCatalog.filingYear}/${row.xmlBatchId}.zip`,
        );
      }
    }
  }

  return [...archiveUrls].sort();
}

async function downloadArchiveZip(params: {
  archiveUrl: string;
  args: ParsedArgs;
  filingYear: number;
}): Promise<DownloadResult> {
  const archiveFileName = path.posix.basename(params.archiveUrl);
  return downloadVersionedFile({
    url: params.archiveUrl,
    downloadRoot: params.args.archiveDir,
    fileName: archiveFileName,
    year: params.filingYear,
    forceDownload: params.args.forceDownload,
    defaultContentType: "application/zip",
  });
}

async function collectArchiveObjectIds(
  localPath: string,
): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const objectIds = new Set<string>();
    const unzip = new Unzip((file) => {
      const objectId = deriveObjectIdFromArchiveEntry(file.name);
      if (objectId) {
        objectIds.add(objectId);
      }
    });
    unzip.register(UnzipInflate);

    const readStream = fs.createReadStream(localPath, {
      highWaterMark: 1024 * 1024,
    });

    readStream.on("data", (chunk) => {
      try {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        unzip.push(new Uint8Array(buffer), false);
      } catch (error) {
        reject(error);
      }
    });
    readStream.on("end", () => {
      try {
        unzip.push(new Uint8Array(0), true);
        resolve(objectIds);
      } catch (error) {
        reject(error);
      }
    });
    readStream.on("error", reject);
  });
}

async function resolveArchiveAssignments(params: {
  archiveUrl: string;
  localPath: string;
  stats: ParseAggregateStats;
  yearCatalog: Irs990YearCatalog;
}) {
  const unresolvedCount = await prisma.charityFiling990Index.count({
    where: {
      filingYear: params.yearCatalog.filingYear,
      OR: [{ archiveFileName: null }, { xmlFetchStatus: "unresolved_archive" }],
    },
  });

  if (unresolvedCount === 0) {
    return;
  }

  const archiveFileName = path.posix.basename(params.archiveUrl);
  const objectIds = [...(await collectArchiveObjectIds(params.localPath))];
  if (objectIds.length === 0) {
    return;
  }

  for (let i = 0; i < objectIds.length; i += 2000) {
    const chunk = objectIds.slice(i, i + 2000);
    const result = await prisma.charityFiling990Index.updateMany({
      where: {
        filingYear: params.yearCatalog.filingYear,
        objectId: { in: chunk },
        OR: [
          { archiveFileName: null },
          { xmlFetchStatus: "unresolved_archive" },
        ],
      },
      data: {
        archiveFileName,
        archiveUrl: params.archiveUrl,
        xmlFetchStatus: "pending",
      },
    });
    params.stats.filingsResolved += result.count;
  }
}

async function loadArchiveTargets(params: {
  archiveUrl: string;
  filingYear: number;
  remainingLimit?: number;
}): Promise<IndexParseTarget[]> {
  const archiveFileName = path.posix.basename(params.archiveUrl);
  return prisma.charityFiling990Index.findMany({
    where: {
      filingYear: params.filingYear,
      archiveFileName,
      xmlFetchStatus: {
        in: ["pending", "parse_error"],
      },
    },
    orderBy: { objectId: "asc" },
    take: params.remainingLimit,
    select: {
      objectId: true,
      ein: true,
      taxpayerName: true,
      returnType: true,
      taxPeriod: true,
      subDate: true,
      lastUpdated: true,
      archiveUrl: true,
      archiveFileName: true,
    },
  });
}

function createConcurrencyLimiter(limit: number) {
  const inFlight = new Set<Promise<void>>();

  return async function run(task: () => Promise<void>): Promise<void> {
    while (inFlight.size >= limit) {
      await Promise.race(inFlight);
    }

    let promise!: Promise<void>;
    promise = task().finally(() => {
      inFlight.delete(promise);
    });
    inFlight.add(promise);
    await promise;
  };
}

async function markMissingArchiveEntries(params: {
  archiveUrl: string;
  missingObjectIds: string[];
}) {
  if (params.missingObjectIds.length === 0) {
    return;
  }

  const archiveFileName = path.posix.basename(params.archiveUrl);
  for (let i = 0; i < params.missingObjectIds.length; i += 1000) {
    const chunk = params.missingObjectIds.slice(i, i + 1000);
    await prisma.charityFiling990Index.updateMany({
      where: {
        objectId: { in: chunk },
      },
      data: {
        archiveFileName,
        archiveUrl: params.archiveUrl,
        xmlFetchStatus: "missing_archive_entry",
      },
    });
  }
}

async function parseArchiveTargets(params: {
  archiveUrl: string;
  localPath: string;
  parseConcurrency: number;
  stats: ParseAggregateStats;
  targets: IndexParseTarget[];
  touchedEntityIds: Set<string>;
}) {
  const targetMap = new Map(
    params.targets.map((target) => [target.objectId, target] as const),
  );
  const parsedObjectIds = new Set<string>();
  const archiveFileName = path.posix.basename(params.archiveUrl);
  const schedule = createConcurrencyLimiter(params.parseConcurrency);
  const scheduledTasks: Promise<void>[] = [];

  await new Promise<void>((resolve, reject) => {
    const unzip = new Unzip((file) => {
      const objectId = deriveObjectIdFromArchiveEntry(file.name);
      if (!objectId) {
        return;
      }

      const target = targetMap.get(objectId);
      if (!target) {
        return;
      }

      const chunks: Uint8Array[] = [];
      const rawSourceUrl = buildArchiveXmlReference(
        params.archiveUrl,
        file.name,
      );
      file.ondata = (error, chunk, final) => {
        if (error) {
          scheduledTasks.push(
            schedule(async () => {
              params.stats.rowsFailed++;
              await prisma.charityFiling990Index.update({
                where: { objectId },
                data: {
                  archiveFileName,
                  archiveUrl: params.archiveUrl,
                  archiveEntryPath: file.name,
                  xmlUrl: rawSourceUrl,
                  xmlFetchStatus: "parse_error",
                },
              });
            }),
          );
          return;
        }

        if (chunk?.length) {
          chunks.push(chunk);
        }

        if (!final) {
          return;
        }

        scheduledTasks.push(
          schedule(async () => {
            try {
              const xml = Buffer.concat(
                chunks.map((chunkData) => Buffer.from(chunkData)),
              ).toString("utf-8");

              let taxPeriod = parseTaxPeriodIdentifier(target.taxPeriod);
              if (taxPeriod.taxPeriod == null || taxPeriod.filingYear == null) {
                taxPeriod = extractTaxPeriodIdentifierFromXml(xml);
              }
              if (taxPeriod.taxPeriod == null || taxPeriod.filingYear == null) {
                throw new Error(
                  "Unable to determine tax period from index row or XML",
                );
              }

              const fields = extractFinancialFields(xml, target.returnType);
              if (fields.formType == null) {
                fields.formType = mapReturnTypeToFormType(target.returnType);
              }

              const sourceUpdatedAt =
                extractReturnTimestamp(xml) ??
                parseLooseIrsDate(target.lastUpdated) ??
                parseLooseIrsDate(target.subDate);

              const ensuredEntity = await ensureCharityEntity({
                ein: target.ein,
                displayName:
                  target.taxpayerName?.trim() || `Organization ${target.ein}`,
              });
              if (ensuredEntity.created) {
                params.stats.entitiesCreated++;
              }

              const filingResult = await upsertCharityFiling({
                entityId: ensuredEntity.entityId,
                sourceFilingKey: rawSourceUrl,
                taxPeriod: taxPeriod.taxPeriod,
                filingYear: taxPeriod.filingYear,
                fields,
                sourceUpdatedAt,
                rawSourceUrl,
              });

              await prisma.charityFiling990Index.update({
                where: { objectId },
                data: {
                  archiveFileName,
                  archiveUrl: params.archiveUrl,
                  archiveEntryPath: file.name,
                  xmlUrl: rawSourceUrl,
                  xmlFetchedAt: new Date(),
                  parsedAt: new Date(),
                  charityFilingId: filingResult.filingId,
                  xmlFetchStatus: "parsed",
                },
              });

              if (filingResult.action === "inserted") {
                params.stats.filingsInserted++;
              } else {
                params.stats.filingsUpdated++;
              }
              params.stats.filingsParsed++;
              parsedObjectIds.add(objectId);
              params.touchedEntityIds.add(ensuredEntity.entityId);
            } catch (error) {
              params.stats.rowsFailed++;
              await prisma.charityFiling990Index.update({
                where: { objectId },
                data: {
                  archiveFileName,
                  archiveUrl: params.archiveUrl,
                  archiveEntryPath: file.name,
                  xmlUrl: rawSourceUrl,
                  xmlFetchedAt: new Date(),
                  xmlFetchStatus: "parse_error",
                },
              });
              console.error(
                `Parse failure for ${objectId}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }),
        );
      };

      file.start();
    });
    unzip.register(UnzipInflate);

    // Ensure fflate is properly initialized for this archive
    const readStream = fs.createReadStream(params.localPath, {
      highWaterMark: 1024 * 1024,
    });

    readStream.on("data", (chunk) => {
      try {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        unzip.push(new Uint8Array(buffer), false);
      } catch (error) {
        reject(error);
      }
    });
    readStream.on("end", () => {
      try {
        unzip.push(new Uint8Array(0), true);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    readStream.on("error", reject);
  });

  await Promise.all(scheduledTasks);

  const missingObjectIds = params.targets
    .filter((target) => !parsedObjectIds.has(target.objectId))
    .map((target) => target.objectId);
  params.stats.missingArchiveEntries += missingObjectIds.length;
  await markMissingArchiveEntries({
    archiveUrl: params.archiveUrl,
    missingObjectIds,
  });
}

async function runIndexPhase(params: {
  args: ParsedArgs;
  runId: string;
  selectedYears: Irs990YearCatalog[];
}): Promise<IndexAggregateStats> {
  const stats: IndexAggregateStats = {
    rowsRead: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    bytesDownloaded: 0,
  };

  for (const yearCatalog of params.selectedYears) {
    if (params.args.maxRows && stats.rowsRead >= params.args.maxRows) {
      break;
    }

    try {
      await ingestYearIndex({
        yearCatalog,
        args: params.args,
        runId: params.runId,
        stats,
      });
    } catch (error) {
      stats.rowsFailed++;
      console.error(
        `Failed index year ${yearCatalog.filingYear}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return stats;
}

async function runParsePhase(params: {
  args: ParsedArgs;
  runId: string;
  selectedYears: Irs990YearCatalog[];
}): Promise<ParseAggregateStats> {
  const stats: ParseAggregateStats = {
    archivesScanned: 0,
    bytesDownloaded: 0,
    entitiesCreated: 0,
    filingsInserted: 0,
    filingsParsed: 0,
    filingsResolved: 0,
    filingsSelected: 0,
    filingsUpdated: 0,
    missingArchiveEntries: 0,
    rowsFailed: 0,
    snapshotsRecomputed: 0,
  };
  const touchedEntityIds = new Set<string>();

  for (const yearCatalog of params.selectedYears) {
    const archiveUrls = await buildArchiveWorkList(yearCatalog);
    if (archiveUrls.length === 0) {
      console.warn(
        `No archive URLs available for parse year ${yearCatalog.filingYear}`,
      );
      continue;
    }

    for (const archiveUrl of archiveUrls) {
      if (params.args.maxRows && stats.filingsSelected >= params.args.maxRows) {
        break;
      }

      let download: Awaited<ReturnType<typeof downloadArchiveZip>>;
      try {
        download = await downloadArchiveZip({
          archiveUrl,
          args: params.args,
          filingYear: yearCatalog.filingYear,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404")) {
          console.warn(`Skipping missing archive ${archiveUrl} (404)`);
          continue;
        }
        throw err;
      }
      if (download.downloaded) {
        stats.bytesDownloaded += download.byteSize;
      }
      stats.archivesScanned++;

      await upsertRawArtifact({
        artifactType: "irs_990_xml_archive_zip",
        contentType: download.contentType,
        download,
        ingestionRunId: params.runId,
        originalUrl: archiveUrl,
        parserVersion: "irs-990-xml-archive-v1",
        status: "fetched",
      });

      await resolveArchiveAssignments({
        archiveUrl,
        localPath: download.localPath,
        stats,
        yearCatalog,
      });

      const remainingLimit = params.args.maxRows
        ? Math.max(0, params.args.maxRows - stats.filingsSelected)
        : undefined;
      const targets = await loadArchiveTargets({
        archiveUrl,
        filingYear: yearCatalog.filingYear,
        remainingLimit,
      });

      if (targets.length === 0) {
        continue;
      }

      stats.filingsSelected += targets.length;
      console.log(
        `\nParse year ${yearCatalog.filingYear} archive ${path.posix.basename(
          archiveUrl,
        )}: ${targets.length.toLocaleString()} filing(s) selected`,
      );

      await parseArchiveTargets({
        archiveUrl,
        localPath: download.localPath,
        parseConcurrency: params.args.parseConcurrency,
        stats,
        targets,
        touchedEntityIds,
      });

      await prisma.rawArtifact.update({
        where: { storageKey: download.storageKey },
        data: {
          parsedAt: new Date(),
          parserVersion: "irs-990-xml-archive-v1",
          status: "parsed",
          errorSummary: null,
        },
      });
    }
  }

  const touchedEntities = [...touchedEntityIds];
  if (touchedEntities.length > 0) {
    await markLatestFilings(touchedEntities);

    if (params.args.computeFraud) {
      const schedule = createConcurrencyLimiter(params.args.parseConcurrency);
      await Promise.all(
        touchedEntities.map((entityId) =>
          schedule(async () => {
            const result = await recomputeStoredCharityFraud(entityId);
            if (result) {
              stats.snapshotsRecomputed++;
            }
          }),
        ),
      );
    }
  }

  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  const sourceSystem = await prisma.sourceSystem.findUnique({
    where: { id: IRS_990_XML_SOURCE_SYSTEM_ID },
    select: { id: true },
  });
  if (!sourceSystem) {
    throw new Error(
      "Missing source system irs_990_xml. Run `npm run db:seed`.",
    );
  }

  const catalog = await discoverIrs990XmlCatalog();
  const selectedYears = selectIrs990CatalogYears(catalog, args.years);
  if (selectedYears.length === 0) {
    throw new Error("No IRS 990 XML years selected for ingestion.");
  }

  const run = await prisma.ingestionRun.create({
    data: {
      id: `irs990_${startedAt.getTime()}`,
      sourceSystemId: IRS_990_XML_SOURCE_SYSTEM_ID,
      runType:
        args.phase === "index"
          ? "manual_bulk_index"
          : args.phase === "parse"
            ? "manual_bulk_parse"
            : "manual_bulk_index_and_parse",
      status: "running",
      triggeredBy: "cli",
      startedAt,
      updatedAt: startedAt,
    },
  });

  await prisma.sourceSystem.update({
    where: { id: IRS_990_XML_SOURCE_SYSTEM_ID },
    data: {
      lastAttemptedSyncAt: startedAt,
      lastError: null,
    },
  });

  let indexStats: IndexAggregateStats | null = null;
  let parseStats: ParseAggregateStats | null = null;
  const failures: string[] = [];

  try {
    console.log(
      `Discovered ${catalog.length} yearly index file(s); selected ${selectedYears
        .map((entry) => entry.filingYear)
        .join(", ")}; phase=${args.phase}; computeFraud=${args.computeFraud}`,
    );

    if (args.phase === "index" || args.phase === "all") {
      indexStats = await runIndexPhase({
        args,
        runId: run.id,
        selectedYears,
      });
    }

    if (args.phase === "parse" || args.phase === "all") {
      parseStats = await runParsePhase({
        args,
        runId: run.id,
        selectedYears,
      });
    }

    const rowsRead =
      (indexStats?.rowsRead ?? 0) + (parseStats?.filingsSelected ?? 0);
    const rowsInserted =
      (indexStats?.rowsInserted ?? 0) + (parseStats?.filingsInserted ?? 0);
    const rowsUpdated =
      (indexStats?.rowsUpdated ?? 0) + (parseStats?.filingsUpdated ?? 0);
    const rowsSkipped = indexStats?.rowsSkipped ?? 0;
    const rowsFailed =
      (indexStats?.rowsFailed ?? 0) + (parseStats?.rowsFailed ?? 0);
    const bytesDownloaded =
      (indexStats?.bytesDownloaded ?? 0) + (parseStats?.bytesDownloaded ?? 0);
    const unresolvedArchiveCount = await prisma.charityFiling990Index.count({
      where: {
        filingYear: { in: selectedYears.map((entry) => entry.filingYear) },
        xmlFetchStatus: "unresolved_archive",
      },
    });

    const completedAt = new Date();
    const errorSummary =
      failures.length > 0 ? failures.slice(0, 10).join(" | ") : null;
    const status =
      rowsFailed === 0
        ? "completed"
        : rowsInserted + rowsUpdated > 0
          ? "completed_with_errors"
          : "failed";

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status,
        rowsRead,
        rowsInserted,
        rowsUpdated,
        rowsSkipped,
        rowsFailed,
        bytesDownloaded,
        errorSummary,
        completedAt,
      },
    });

    await prisma.sourceSystem.update({
      where: { id: IRS_990_XML_SOURCE_SYSTEM_ID },
      data: {
        lastSuccessfulSyncAt: status !== "failed" ? completedAt : undefined,
        lastError: errorSummary,
      },
    });

    console.log(
      JSON.stringify(
        {
          runId: run.id,
          status,
          phase: args.phase,
          computeFraud: args.computeFraud,
          yearsProcessed: selectedYears.map((entry) => entry.filingYear),
          index: indexStats,
          parse: parseStats,
          unresolvedArchiveCount,
          sourceInfoUrl: IRS_990_INDEX_INFO_URL,
        },
        null,
        2,
      ),
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
        errorSummary: message,
        completedAt: new Date(),
      },
    });

    await prisma.sourceSystem.update({
      where: { id: IRS_990_XML_SOURCE_SYSTEM_ID },
      data: { lastError: message },
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
  } catch {}
  process.exit(1);
});
