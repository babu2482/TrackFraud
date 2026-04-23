import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { prisma } from "../lib/db";
import {
  createEmptyStats,
  downloadVersionedFile,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
  upsertRawArtifact,
  withDatabaseRetry,
} from "../lib/ingestion-utils";
import {
  CMS_OPEN_PAYMENTS_CATALOG_URL,
  CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
  fetchCmsOpenPaymentsDatasets,
  parseHealthcarePaymentRecord,
  parseHealthcareRecipientSupplementRecord,
  persistHealthcarePaymentBatch,
  persistHealthcareRecipientSupplementBatch,
  type CmsOpenPaymentsDatasetKind,
  type HealthcarePaymentInput,
  type HealthcareRecipientSupplementInput,
} from "../lib/healthcare-storage";

interface ParsedArgs {
  batchSize: number;
  downloadDir: string;
  forceDownload: boolean;
  maxRows?: number;
  years?: Set<number>;
  kinds?: Set<CmsOpenPaymentsDatasetKind>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    batchSize: 2_000,
    downloadDir: "data/healthcare",
    forceDownload: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--batch-size") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.batchSize = value;
      continue;
    }
    if (arg === "--download-dir") {
      parsed.downloadDir = argv[++i] ?? parsed.downloadDir;
      continue;
    }
    if (arg === "--max-rows") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.maxRows = value;
      continue;
    }
    if (arg === "--years") {
      parsed.years = new Set(
        (argv[++i] ?? "")
          .split(",")
          .map((part) => Number.parseInt(part.trim(), 10))
          .filter((value) => Number.isFinite(value))
      );
      continue;
    }
    if (arg === "--types") {
      parsed.kinds = new Set(
        (argv[++i] ?? "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean) as CmsOpenPaymentsDatasetKind[]
      );
      continue;
    }
    if (arg === "--force-download") {
      parsed.forceDownload = true;
    }
  }

  return parsed;
}

async function flushPaymentBatch(
  batch: HealthcarePaymentInput[],
  sourcePublishedAt: Date | null,
  stats: ReturnType<typeof createEmptyStats>
) {
  if (batch.length === 0) return;
  const result = await withDatabaseRetry("persist healthcare payment batch", () =>
    persistHealthcarePaymentBatch({
      rows: batch,
      sourcePublishedAt,
    })
  );
  stats.rowsInserted += result.inserted;
  stats.rowsUpdated += result.updated;
  batch.length = 0;
}

async function flushSupplementBatch(
  batch: HealthcareRecipientSupplementInput[],
  sourcePublishedAt: Date | null,
  stats: ReturnType<typeof createEmptyStats>
) {
  if (batch.length === 0) return;
  const result = await withDatabaseRetry(
    "persist healthcare recipient supplement batch",
    () =>
      persistHealthcareRecipientSupplementBatch({
        rows: batch,
        sourcePublishedAt,
      })
  );
  stats.rowsInserted += result.inserted;
  stats.rowsUpdated += result.updated;
  batch.length = 0;
}

async function ingestDataset(params: {
  localPath: string;
  kind: CmsOpenPaymentsDatasetKind;
  programYear: number | null;
  sourcePublishedAt: Date | null;
  batchSize: number;
  maxRows?: number;
  stats: ReturnType<typeof createEmptyStats>;
}) {
  const parser = fs
    .createReadStream(params.localPath)
    .pipe(
      parse({
        columns: true,
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
      })
    );

  const paymentBatch: HealthcarePaymentInput[] = [];
  const supplementBatch: HealthcareRecipientSupplementInput[] = [];
  let processedRows = 0;
  const progressInterval = 50_000;

  for await (const record of parser) {
    if (params.maxRows && processedRows >= params.maxRows) break;

    if (params.kind === "supplement") {
      const parsed = parseHealthcareRecipientSupplementRecord(
        record as Record<string, string>
      );
      if (!parsed) {
        params.stats.rowsSkipped++;
        continue;
      }
      processedRows++;
      params.stats.rowsRead++;
      supplementBatch.push(parsed);
      if (processedRows % progressInterval === 0) {
        console.log(
          `Processed ${processedRows.toLocaleString()} ${params.kind} row(s) for ${params.programYear ?? "unknown"
          }`
        );
      }
      if (supplementBatch.length >= params.batchSize) {
        await flushSupplementBatch(
          supplementBatch,
          params.sourcePublishedAt,
          params.stats
        );
      }
      continue;
    }

    const parsed = parseHealthcarePaymentRecord({
      record: record as Record<string, string>,
      kind: params.kind,
      fallbackProgramYear: params.programYear,
    });
    if (!parsed) {
      params.stats.rowsSkipped++;
      continue;
    }
    processedRows++;
    params.stats.rowsRead++;
    paymentBatch.push(parsed);
    if (processedRows % progressInterval === 0) {
      console.log(
        `Processed ${processedRows.toLocaleString()} ${params.kind} row(s) for ${params.programYear ?? "unknown"
        }`
      );
    }
    if (paymentBatch.length >= params.batchSize) {
      await flushPaymentBatch(
        paymentBatch,
        params.sourcePublishedAt,
        params.stats
      );
    }
  }

  await flushPaymentBatch(paymentBatch, params.sourcePublishedAt, params.stats);
  await flushSupplementBatch(
    supplementBatch,
    params.sourcePublishedAt,
    params.stats
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { run } = await startIngestionRun({
    sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
  });
  const stats = createEmptyStats();
  stats.bytesDownloaded = 0;

  try {
    const catalog = await fetchCmsOpenPaymentsDatasets();
    const selectedDatasets = catalog.filter((dataset) => {
      if (args.kinds && !args.kinds.has(dataset.kind)) return false;
      if (
        dataset.programYear != null &&
        args.years &&
        !args.years.has(dataset.programYear)
      ) {
        return false;
      }
      return true;
    });

    for (const dataset of selectedDatasets) {
      const fileName = path.posix.basename(new URL(dataset.downloadUrl).pathname);
      const download = await downloadVersionedFile({
        url: dataset.downloadUrl,
        downloadRoot: args.downloadDir,
        fileName,
        year: dataset.programYear ?? undefined,
        forceDownload: args.forceDownload,
        defaultContentType: "text/csv",
      });
      if (download.downloaded) {
        stats.bytesDownloaded += download.byteSize;
      }
      await upsertRawArtifact({
        sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
        ingestionRunId: run.id,
        artifactType: `cms_open_payments_${dataset.kind}_csv`,
        originalUrl: dataset.downloadUrl,
        parserVersion: "cms-open-payments-v1",
        status: "fetched",
        download,
      });

      await ingestDataset({
        localPath: download.localPath,
        kind: dataset.kind,
        programYear: dataset.programYear,
        sourcePublishedAt: dataset.modifiedAt ?? download.sourcePublishedAt,
        batchSize: args.batchSize,
        maxRows: args.maxRows,
        stats,
      });

      await withDatabaseRetry(
        `mark healthcare raw artifact ${download.storageKey} parsed`,
        () =>
          prisma.rawArtifact.update({
            where: { storageKey: download.storageKey },
            data: {
              parsedAt: new Date(),
              parserVersion: "cms-open-payments-v1",
              status: "parsed",
              errorSummary: null,
            },
          })
      );
    }

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });

    console.log(
      JSON.stringify(
        {
          runId: run.id,
          rowsRead: stats.rowsRead,
          rowsInserted: stats.rowsInserted,
          rowsUpdated: stats.rowsUpdated,
          rowsSkipped: stats.rowsSkipped,
          rowsFailed: stats.rowsFailed,
          bytesDownloaded: stats.bytesDownloaded,
          sourceInfoUrl: CMS_OPEN_PAYMENTS_CATALOG_URL,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failIngestionRun({
      runId: run.id,
      sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
      stats,
      errorSummary: message,
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
  } catch { }
  process.exit(1);
});
