/**
 * ingest-usaspending-cached.ts
 *
 * Ingests pre-downloaded USASpending JSON pages from data/government/usaspending/pages/
 * into the GovernmentAwardRecord table.
 *
 * Usage:
 *   npx tsx scripts/ingest-usaspending-cached.ts
 *   npx tsx scripts/ingest-usaspending-cached.ts --max-pages 100
 */

import fs from "node:fs";
import path from "node:path";
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

interface ParsedArgs {
  maxPages?: number;
  pagesDir: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    maxPages: undefined,
    pagesDir: "data/government/usaspending/pages",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--max-pages") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.maxPages = value;
    } else if (arg === "--pages-dir") {
      parsed.pagesDir = argv[++i] ?? parsed.pagesDir;
    }
  }

  return parsed;
}

interface UsaSpendingPage {
  spending_level: string;
  results: Array<{
    internal_id: number;
    generated_internal_id: string;
    Award_ID?: string;
    Recipient_Name?: string;
    Awarding_Agency?: string;
    Award_Amount?: number;
    Total_Outlays?: number;
    Description?: string;
    Start_Date?: string;
    End_Date?: string;
  }>;
  page_metadata: {
    hasNext: boolean;
    hasPrev: boolean;
    nextPage: number | null;
    prevPage: number | null;
    total: number;
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { run } = await startIngestionRun({
    sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
  });
  const stats = createEmptyStats();

  try {
    // Get all page files sorted by name
    const pagesDir = path.join(process.cwd(), args.pagesDir);
    if (!fs.existsSync(pagesDir)) {
      throw new Error(`Pages directory not found: ${pagesDir}`);
    }

    const pageFiles = fs
      .readdirSync(pagesDir)
      .filter((f) => f.startsWith("page-") && f.endsWith(".json"))
      .sort();

    console.log(`Found ${pageFiles.length} page files in ${args.pagesDir}`);

    if (args.maxPages && args.maxPages < pageFiles.length) {
      console.log(`Limiting to first ${args.maxPages} pages`);
    }

    const filesToProcess = args.maxPages
      ? pageFiles.slice(0, args.maxPages)
      : pageFiles;

    for (const [index, pageFile] of filesToProcess.entries()) {
      const filePath = path.join(pagesDir, pageFile);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const pageData: UsaSpendingPage = JSON.parse(fileContent);

      console.log(
        `Processing ${pageFile}: ${pageData.results.length} awards`
      );

      const result = await persistGovernmentAwardSummaries(
        pageData.results,
        new Date()
      );

      stats.rowsRead += pageData.results.length;
      stats.rowsInserted += result.inserted;
      stats.rowsUpdated += result.updated;

      if ((index + 1) % 50 === 0 || index === filesToProcess.length - 1) {
        console.log(
          `Progress: ${index + 1}/${filesToProcess.length} pages` +
            ` | Total: ${stats.rowsRead.toLocaleString()} read,` +
            ` ${stats.rowsInserted.toLocaleString()} inserted,` +
            ` ${stats.rowsUpdated.toLocaleString()} updated`
        );
      }
    }

    console.log(
      `\nIngestion complete:` +
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
    console.error("Ingestion failed:", message);
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
