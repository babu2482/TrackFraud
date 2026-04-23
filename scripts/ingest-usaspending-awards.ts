import { prisma } from "../lib/db";
import { getAwardDetail, searchAwards } from "../lib/usaspending";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
  upsertRawArtifact,
  writeJsonSnapshot,
} from "../lib/ingestion-utils";
import {
  persistGovernmentAwardDetail,
  persistGovernmentAwardSummaries,
  USASPENDING_SOURCE_SYSTEM_ID,
} from "../lib/government-storage";

interface ParsedArgs {
  maxPages?: number;
  hydrateDetails: boolean;
  snapshotDir: string;
  keyword: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    maxPages: 1,
    hydrateDetails: true,
    snapshotDir: "data/government/usaspending",
    keyword: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max-pages") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.maxPages = value;
      continue;
    }
    if (arg === "--all-pages") {
      parsed.maxPages = undefined;
      continue;
    }
    if (arg === "--no-detail") {
      parsed.hydrateDetails = false;
      continue;
    }
    if (arg === "--snapshot-dir") {
      parsed.snapshotDir = argv[++i] ?? parsed.snapshotDir;
      continue;
    }
    if (arg === "--keyword") {
      parsed.keyword = argv[++i] ?? parsed.keyword;
    }
  }

  return parsed;
}

async function snapshotPayload(params: {
  snapshotDir: string;
  subdir: string;
  fileName: string;
  payload: unknown;
  runId: string;
  artifactType: string;
  originalUrl: string;
}) {
  const snapshot = await writeJsonSnapshot({
    rootDir: params.snapshotDir,
    versionDir: params.subdir,
    fileName: params.fileName,
    payload: params.payload,
  });
  await upsertRawArtifact({
    sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
    ingestionRunId: params.runId,
    artifactType: params.artifactType,
    originalUrl: params.originalUrl,
    parserVersion: "usaspending-awards-v1",
    status: "parsed",
    download: snapshot,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { run } = await startIngestionRun({
    sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
  });
  const stats = createEmptyStats();

  try {
    for (let page = 1; args.maxPages == null || page <= args.maxPages; page++) {
      const response = await searchAwards(args.keyword, page);
      await snapshotPayload({
        snapshotDir: args.snapshotDir,
        subdir: "pages",
        fileName: `page-${String(page).padStart(5, "0")}.json`,
        payload: response,
        runId: run.id,
        artifactType: "usaspending_awards_page",
        originalUrl: `https://api.usaspending.gov/api/v2/search/spending_by_award/`,
      });

      const result = await persistGovernmentAwardSummaries(
        response.results,
        new Date()
      );
      stats.rowsRead += response.results.length;
      stats.rowsInserted += result.inserted;
      stats.rowsUpdated += result.updated;
      console.log(`page ${page}: +${result.inserted} inserted +${result.updated} updated (total read: ${stats.rowsRead}) hasNext=${response.page_metadata.hasNext}`);

      if (args.hydrateDetails) {
        for (const award of response.results) {
          const detail = await getAwardDetail(award.generated_internal_id);
          await snapshotPayload({
            snapshotDir: args.snapshotDir,
            subdir: "details",
            fileName: `${award.generated_internal_id}.json`,
            payload: detail,
            runId: run.id,
            artifactType: "usaspending_award_detail",
            originalUrl: `https://api.usaspending.gov/api/v2/awards/${encodeURIComponent(
              award.generated_internal_id
            )}/`,
          });
          await persistGovernmentAwardDetail(award.generated_internal_id, detail);
          stats.rowsUpdated++;
        }
      }

      if (!response.page_metadata.hasNext) break;
    }

    console.log(`Completed: ${stats.rowsRead} read, ${stats.rowsInserted} inserted, ${stats.rowsUpdated} updated, ${stats.rowsFailed} failed`);
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

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
