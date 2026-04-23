import os from "node:os";
import { spawn } from "node:child_process";
import { prisma } from "../lib/db";
import {
  IRS_990_XML_SOURCE_SYSTEM_ID,
  discoverIrs990XmlCatalog,
  type Irs990YearCatalog,
} from "../lib/irs-990-xml";

type YearPhase = "all" | "parse";
type PhaseMode = "auto" | YearPhase;

interface ParsedArgs {
  dryRun: boolean;
  parseConcurrency?: number;
  phaseMode: PhaseMode;
  retries: number;
  years?: number[];
  yearConcurrency: number;
}

function getAvailableParallelism(): number {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }

  return os.cpus().length;
}

function defaultYearConcurrency(): number {
  const parallelism = getAvailableParallelism();

  if (parallelism >= 8) {
    return 2;
  }

  return 1;
}

function defaultParseConcurrency(yearConcurrency: number): number {
  const parallelism = getAvailableParallelism();

  return Math.max(4, Math.min(8, Math.floor(parallelism / yearConcurrency)));
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    dryRun: false,
    phaseMode: "auto",
    yearConcurrency: defaultYearConcurrency(),
    retries: 3,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--retries") {
      const retries = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(retries) && retries >= 0) {
        parsed.retries = retries;
      }
      continue;
    }

    if (arg === "--years") {
      const years = (argv[++i] ?? "")
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value));
      if (years.length > 0) {
        parsed.years = years;
      }
      continue;
    }

    if (arg === "--year-concurrency") {
      const yearConcurrency = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(yearConcurrency) && yearConcurrency > 0) {
        parsed.yearConcurrency = yearConcurrency;
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
      const phaseMode = (argv[++i] ?? "").trim().toLowerCase();
      if (phaseMode === "auto" || phaseMode === "all" || phaseMode === "parse") {
        parsed.phaseMode = phaseMode;
      }
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
    }
  }

  return parsed;
}

function buildProcessingOrder(years: number[]): number[] {
  const currentYear = new Date().getUTCFullYear();
  const closedYears = years
    .filter((year) => year <= currentYear - 2)
    .sort((a, b) => b - a);
  const openYears = years
    .filter((year) => year > currentYear - 2)
    .sort((a, b) => a - b);

  return [...closedYears, ...openYears];
}

function pipeChildOutput(
  stream: NodeJS.ReadableStream | null,
  prefix: string,
  target: NodeJS.WriteStream
) {
  if (!stream) {
    return;
  }

  stream.setEncoding("utf8");

  let buffer = "";
  stream.on("data", (chunk: string) => {
    buffer += chunk.replace(/\r/g, "\n");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      target.write(`${prefix}${line}\n`);
    }
  });

  stream.on("end", () => {
    const line = buffer.trim();
    if (line.length > 0) {
      target.write(`${prefix}${line}\n`);
    }
  });
}

async function determineYearPhase(
  yearCatalog: Irs990YearCatalog,
  phaseMode: PhaseMode
): Promise<YearPhase> {
  if (phaseMode !== "auto") {
    return phaseMode;
  }

  const existingIndexCount = await prisma.charityFiling990Index.count({
    where: { filingYear: yearCatalog.filingYear },
  });

  if (existingIndexCount === 0) {
    return "all";
  }

  const parsedIndexArtifact = await prisma.rawArtifact.findFirst({
    where: {
      sourceSystemId: IRS_990_XML_SOURCE_SYSTEM_ID,
      artifactType: "irs_990_xml_index_csv",
      originalUrl: yearCatalog.indexUrl,
      status: "parsed",
    },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });

  return parsedIndexArtifact ? "parse" : "all";
}

function runYear(
  year: number,
  phase: YearPhase,
  parseConcurrency: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(
      npmExecutable,
      [
        "run",
        "ingest:irs-990-xml",
        "--",
        "--phase",
        phase,
        "--years",
        String(year),
        "--parse-concurrency",
        String(parseConcurrency),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    pipeChildOutput(child.stdout, `[year ${year}] `, process.stdout);
    pipeChildOutput(child.stderr, `[year ${year}] `, process.stderr);

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Year ${year} failed with ${
            signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`
          }`
        )
      );
    });
  });
}

async function processYearWithRetries(
  year: number,
  phase: YearPhase,
  retries: number,
  parseConcurrency: number,
  workerLabel: string
) {
  let attempt = 0;
  while (true) {
    attempt++;
    console.log(
      `\n=== ${workerLabel} starting IRS 990 XML year ${year} in ${phase} mode (attempt ${attempt}) ===`
    );
    try {
      await runYear(year, phase, parseConcurrency);
      console.log(`=== ${workerLabel} completed IRS 990 XML year ${year} ===`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt > retries) {
        throw new Error(
          `IRS 990 XML backfill stopped at year ${year} after ${attempt} attempts: ${message}`
        );
      }

      console.error(
        `${workerLabel} year ${year} attempt ${attempt} failed: ${message}. Retrying...`
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = await discoverIrs990XmlCatalog();
  const catalogByYear = new Map(
    catalog.map((entry) => [entry.filingYear, entry] as const)
  );
  const discoveredYears = catalog.map((entry) => entry.filingYear);
  const selectedYears = args.years?.length
    ? discoveredYears.filter((year) => args.years!.includes(year))
    : discoveredYears;

  if (selectedYears.length === 0) {
    throw new Error("No IRS 990 XML years available for backfill.");
  }

  const processingOrder = buildProcessingOrder(selectedYears);
  const processingPlan = await Promise.all(
    processingOrder.map(async (year) => {
      const yearCatalog = catalogByYear.get(year);
      if (!yearCatalog) {
        throw new Error(`Missing IRS 990 XML catalog entry for year ${year}`);
      }

      return {
        year,
        phase: await determineYearPhase(yearCatalog, args.phaseMode),
      };
    })
  );
  const yearConcurrency = Math.min(args.yearConcurrency, processingOrder.length);
  const parseConcurrency =
    args.parseConcurrency ?? defaultParseConcurrency(yearConcurrency);
  console.log(
    `Backfill order: ${processingPlan
      .map(({ year, phase }) => `${year}:${phase}`)
      .join(", ")} (retries per year: ${args.retries}; year concurrency: ${yearConcurrency}; parse concurrency per year: ${parseConcurrency})`
  );

  if (args.dryRun) {
    return;
  }

  let cursor = 0;
  let fatalError: Error | null = null;

  await Promise.all(
    Array.from({ length: yearConcurrency }, (_, index) => {
      const workerLabel = `worker-${index + 1}`;

      return (async () => {
        while (fatalError == null) {
          const plan = processingPlan[cursor];
          cursor++;

          if (plan == null) {
            return;
          }

          try {
            await processYearWithRetries(
              plan.year,
              plan.phase,
              args.retries,
              parseConcurrency,
              workerLabel
            );
          } catch (error) {
            fatalError =
              error instanceof Error ? error : new Error(String(error));
            return;
          }
        }
      })();
    })
  );

  if (fatalError) {
    throw fatalError;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  try {
    await prisma.$disconnect();
  } catch {}
});
