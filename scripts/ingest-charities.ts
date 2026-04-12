import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";
import {
  isValidEin,
  loadCharityComputation,
  normalizeEin,
} from "../lib/charity-detail";
import { persistCharityComputation } from "../lib/charity-storage";

interface ParsedArgs {
  filePath?: string;
  delayMs: number;
  eins: string[];
}

interface BatchFailure {
  ein: string;
  message: string;
}

const SOURCE_SYSTEM_ID = "propublica_nonprofit_explorer";

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    delayMs: 250,
    eins: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      parsed.filePath = argv[i + 1];
      i++;
      continue;
    }
    if (arg === "--delay-ms") {
      const value = Number.parseInt(argv[i + 1] ?? "", 10);
      parsed.delayMs =
        Number.isFinite(value) && value >= 0 ? value : parsed.delayMs;
      i++;
      continue;
    }
    parsed.eins.push(arg);
  }

  return parsed;
}

function tokenizeEinList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*/, "").split(/[\s,]+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

async function loadInputEins(parsed: ParsedArgs): Promise<{
  uniqueEins: string[];
  skippedDuplicates: number;
  skippedInvalid: number;
}> {
  const fromFile = parsed.filePath
    ? tokenizeEinList(await fs.readFile(path.resolve(parsed.filePath), "utf8"))
    : [];

  const rawInputs = [...parsed.eins, ...fromFile];
  if (rawInputs.length === 0) {
    throw new Error(
      "Usage: npm run ingest:charities -- <ein> [more eins] [--file path/to/eins.txt] [--delay-ms 250]",
    );
  }

  const seen = new Set<string>();
  const uniqueEins: string[] = [];
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (const rawEin of rawInputs) {
    const ein = normalizeEin(rawEin);
    if (!isValidEin(ein)) {
      skippedInvalid++;
      continue;
    }
    if (seen.has(ein)) {
      skippedDuplicates++;
      continue;
    }
    seen.add(ein);
    uniqueEins.push(ein);
  }

  if (uniqueEins.length === 0) {
    throw new Error("No valid non-zero EINs were provided.");
  }

  return { uniqueEins, skippedDuplicates, skippedInvalid };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { uniqueEins, skippedDuplicates, skippedInvalid } =
    await loadInputEins(parsed);
  const startedAt = new Date();

  const run = await prisma.ingestionRun.create({
    data: {
      id: `charities_${startedAt.getTime()}`,
      sourceSystemId: SOURCE_SYSTEM_ID,
      runType: "manual_batch",
      status: "running",
      triggeredBy: "cli",
      startedAt,
      updatedAt: startedAt,
    },
  });

  await prisma.sourceSystem.update({
    where: { id: SOURCE_SYSTEM_ID },
    data: {
      lastAttemptedSyncAt: startedAt,
      lastError: null,
    },
  });

  let createdEntities = 0;
  let updatedEntities = 0;
  const failures: BatchFailure[] = [];

  try {
    for (let i = 0; i < uniqueEins.length; i++) {
      const ein = uniqueEins[i];
      if (i > 0 && parsed.delayMs > 0) {
        await sleep(parsed.delayMs);
      }

      try {
        const record = await loadCharityComputation(ein);
        const persisted = await persistCharityComputation(record, {
          ingestionRunId: run.id,
        });
        if (persisted.createdEntity) {
          createdEntities++;
        } else {
          updatedEntities++;
        }
        console.log(
          `[${i + 1}/${uniqueEins.length}] Ingested ${ein} (${record.detail.name})`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ ein, message });
        console.error(
          `[${i + 1}/${uniqueEins.length}] Failed ${ein}: ${message}`,
        );
      }
    }

    const completedAt = new Date();
    const status =
      failures.length === 0
        ? "completed"
        : failures.length === uniqueEins.length
          ? "failed"
          : "completed_with_errors";
    const errorSummary =
      failures.length > 0
        ? failures
            .slice(0, 5)
            .map((failure) => `${failure.ein}: ${failure.message}`)
            .join(" | ")
        : null;

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status,
        rowsRead: uniqueEins.length,
        rowsInserted: createdEntities,
        rowsUpdated: updatedEntities,
        rowsSkipped: skippedDuplicates + skippedInvalid,
        rowsFailed: failures.length,
        errorSummary,
        completedAt,
      },
    });

    await prisma.sourceSystem.update({
      where: { id: SOURCE_SYSTEM_ID },
      data: {
        lastSuccessfulSyncAt:
          failures.length < uniqueEins.length ? completedAt : undefined,
        lastError: errorSummary,
      },
    });

    console.log(
      JSON.stringify(
        {
          runId: run.id,
          attempted: uniqueEins.length,
          createdEntities,
          updatedEntities,
          skippedDuplicates,
          skippedInvalid,
          failed: failures.length,
          failures,
        },
        null,
        2,
      ),
    );

    if (failures.length === uniqueEins.length) {
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
