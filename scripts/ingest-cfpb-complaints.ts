import { spawn } from "node:child_process";
import { parse } from "csv-parse";
import { prisma } from "../lib/db";
import {
  CFPB_COMPLAINTS_CSV_ZIP_URL,
  CFPB_COMPLAINTS_INFO_URL,
  CFPB_SOURCE_SYSTEM_ID,
  parseConsumerComplaintRecord,
  persistConsumerComplaintBatch,
  type ConsumerComplaintInput,
} from "../lib/consumer-storage";
import {
  createEmptyStats,
  downloadVersionedFile,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
  upsertRawArtifact,
} from "../lib/ingestion-utils";

interface ParsedArgs {
  batchSize: number;
  downloadDir: string;
  forceDownload: boolean;
  maxRows?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    batchSize: 2_000,
    downloadDir: "data/consumer",
    forceDownload: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--batch-size") {
      const next = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(next) && next > 0) parsed.batchSize = next;
      continue;
    }
    if (arg === "--download-dir") {
      parsed.downloadDir = argv[++i] ?? parsed.downloadDir;
      continue;
    }
    if (arg === "--max-rows") {
      const next = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(next) && next > 0) parsed.maxRows = next;
      continue;
    }
    if (arg === "--force-download") {
      parsed.forceDownload = true;
    }
  }

  return parsed;
}

async function* streamCsvRows(zipPath: string) {
  const unzip = spawn("unzip", ["-p", zipPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parser = unzip.stdout.pipe(
    parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    })
  );

  let stderr = "";
  unzip.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf-8");
  });

  try {
    for await (const record of parser) {
      yield record as Record<string, string>;
    }
    const exitCode: number = await new Promise((resolve, reject) => {
      unzip.on("error", reject);
      unzip.on("close", resolve);
    });
    if (exitCode !== 0) {
      throw new Error(
        `unzip exited with code ${exitCode}: ${stderr.trim() || "no stderr"}`
      );
    }
  } finally {
    unzip.kill();
  }
}

async function flushBatch(
  batch: ConsumerComplaintInput[],
  sourcePublishedAt: Date | null,
  stats: ReturnType<typeof createEmptyStats>
) {
  if (batch.length === 0) return;
  const result = await persistConsumerComplaintBatch(batch, sourcePublishedAt);
  stats.rowsInserted += result.inserted;
  stats.rowsUpdated += result.updated;
  batch.length = 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { run } = await startIngestionRun({
    sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
  });
  const stats = createEmptyStats();
  stats.bytesDownloaded = 0; // Initialize to avoid undefined

  try {
    const download = await downloadVersionedFile({
      url: CFPB_COMPLAINTS_CSV_ZIP_URL,
      downloadRoot: args.downloadDir,
      fileName: "complaints.csv.zip",
      forceDownload: args.forceDownload,
      defaultContentType: "application/zip",
    });
    if (download.downloaded) {
      stats.bytesDownloaded += download.byteSize;
    }

    await upsertRawArtifact({
      sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
      ingestionRunId: run.id,
      artifactType: "cfpb_complaints_csv_zip",
      originalUrl: CFPB_COMPLAINTS_CSV_ZIP_URL,
      parserVersion: "cfpb-consumer-v1",
      status: "fetched",
      download,
    });

    const batch: ConsumerComplaintInput[] = [];
    for await (const record of streamCsvRows(download.localPath)) {
      if (args.maxRows && stats.rowsRead >= args.maxRows) break;
      const parsed = parseConsumerComplaintRecord(record);
      if (!parsed) {
        stats.rowsSkipped++;
        continue;
      }
      stats.rowsRead++;
      batch.push(parsed);

      if (batch.length >= args.batchSize) {
        await flushBatch(batch, download.sourcePublishedAt, stats);
        process.stdout.write(
          `\rrows: ${stats.rowsRead.toLocaleString()} inserted: ${stats.rowsInserted.toLocaleString()} updated: ${stats.rowsUpdated.toLocaleString()}`
        );
      }
    }
    await flushBatch(batch, download.sourcePublishedAt, stats);
    process.stdout.write("\n");

    await prisma.rawArtifact.update({
      where: { storageKey: download.storageKey },
      data: {
        parsedAt: new Date(),
        parserVersion: "cfpb-consumer-v1",
        status: "parsed",
        errorSummary: null,
      },
    });

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
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
          sourceInfoUrl: CFPB_COMPLAINTS_INFO_URL,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failIngestionRun({
      runId: run.id,
      sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
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
