import { prisma } from "../lib/db";
import {
  getCompanyFacts,
  getCompanySubmissions,
  getCompanyTickers,
} from "../lib/sec";
import {
  createEmptyStats,
  downloadVersionedFile,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
  upsertRawArtifact,
  writeJsonSnapshot,
} from "../lib/ingestion-utils";
import {
  persistCorporateCompanyFacts,
  persistCorporateSubmissions,
  persistCorporateTickerUniverse,
  SEC_SOURCE_SYSTEM_ID,
} from "../lib/corporate-storage";

interface ParsedArgs {
  snapshotDir: string;
  hydrateDetails: boolean;
  limit: number;
  ciks?: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    snapshotDir: "data/corporate/sec",
    hydrateDetails: false,
    limit: 50,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--snapshot-dir") {
      parsed.snapshotDir = argv[++i] ?? parsed.snapshotDir;
      continue;
    }
    if (arg === "--hydrate-details") {
      parsed.hydrateDetails = true;
      continue;
    }
    if (arg === "--limit") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.limit = value;
      continue;
    }
    if (arg === "--ciks") {
      parsed.ciks = (argv[++i] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
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
    sourceSystemId: SEC_SOURCE_SYSTEM_ID,
    ingestionRunId: params.runId,
    artifactType: params.artifactType,
    originalUrl: params.originalUrl,
    parserVersion: "sec-edgar-v1",
    status: "parsed",
    download: snapshot,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { run } = await startIngestionRun({ sourceSystemId: SEC_SOURCE_SYSTEM_ID });
  const stats = createEmptyStats();

  try {
    const tickers = await getCompanyTickers();
    const tickerEntries = Object.values(tickers);
    await snapshotPayload({
      snapshotDir: args.snapshotDir,
      subdir: "tickers",
      fileName: "company_tickers.json",
      payload: tickers,
      runId: run.id,
      artifactType: "sec_company_tickers",
      originalUrl: "https://www.sec.gov/files/company_tickers.json",
    });
    const tickerResult = await persistCorporateTickerUniverse(
      tickerEntries,
      new Date()
    );
    stats.rowsRead += tickerEntries.length;
    stats.rowsInserted += tickerResult.inserted;
    stats.rowsUpdated += tickerResult.updated;

    if (args.hydrateDetails) {
      const targetCiks =
        args.ciks ??
        tickerEntries
          .slice(0, args.limit)
          .map((entry) => String(entry.cik_str).padStart(10, "0"));

      console.log(`Hydrating ${targetCiks.length} companies...`);
      let processed = 0;

      for (const cik of targetCiks) {
        // SEC rate limit: 10 req/sec. Two calls per CIK → ~200ms gap keeps us safe.
        await new Promise((resolve) => setTimeout(resolve, 110));

        try {
          const submissions = await getCompanySubmissions(cik);
          await snapshotPayload({
            snapshotDir: args.snapshotDir,
            subdir: "submissions",
            fileName: `CIK${cik}.json`,
            payload: submissions,
            runId: run.id,
            artifactType: "sec_submissions_json",
            originalUrl: `https://data.sec.gov/submissions/CIK${cik}.json`,
          });
          const subResult = await persistCorporateSubmissions(
            submissions,
            new Date()
          );
          stats.rowsInserted += subResult.inserted;
          stats.rowsUpdated += subResult.updated;
        } catch (error) {
          stats.rowsFailed++;
          console.warn(
            `Skipping SEC submissions hydration for ${cik}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          continue;
        }

        try {
          const facts = await getCompanyFacts(cik);
          await snapshotPayload({
            snapshotDir: args.snapshotDir,
            subdir: "companyfacts",
            fileName: `CIK${cik}.json`,
            payload: facts,
            runId: run.id,
            artifactType: "sec_companyfacts_json",
            originalUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
          });
          await persistCorporateCompanyFacts(cik, facts, new Date());
        } catch (error) {
          stats.rowsFailed++;
          console.warn(
            `Skipping SEC company facts hydration for ${cik}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        processed++;
        if (processed % 100 === 0) {
          console.log(`Progress: ${processed}/${targetCiks.length} companies (inserted: ${stats.rowsInserted} updated: ${stats.rowsUpdated} failed: ${stats.rowsFailed})`);
        }
      }
      console.log(`Done hydrating. Total: ${processed}/${targetCiks.length}`);
    }

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: SEC_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
