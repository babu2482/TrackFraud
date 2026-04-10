import fs from "node:fs/promises";
import path from "node:path";
import { searchOrganizations } from "../lib/api";
import { isValidEin, normalizeEin } from "../lib/charity-detail";

interface ParsedArgs {
  pages: number;
  delayMs: number;
  outputPath?: string;
  cCode?: number;
  ntee?: number;
  state?: string;
  query?: string;
}

interface ProPublicaOrganization {
  ein: number;
  strein?: string;
  name?: string;
}

interface ProPublicaSearchResponse {
  organizations?: ProPublicaOrganization[];
  total_results?: number;
  num_pages?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    pages: 5,
    delayMs: 250,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pages") {
      const value = Number.parseInt(argv[i + 1] ?? "", 10);
      parsed.pages = Number.isFinite(value) && value > 0 ? value : parsed.pages;
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
    if (arg === "--output") {
      parsed.outputPath = argv[i + 1];
      i++;
      continue;
    }
    if (arg === "--c-code") {
      const value = Number.parseInt(argv[i + 1] ?? "", 10);
      parsed.cCode = Number.isFinite(value) ? value : undefined;
      i++;
      continue;
    }
    if (arg === "--ntee") {
      const value = Number.parseInt(argv[i + 1] ?? "", 10);
      parsed.ntee = Number.isFinite(value) ? value : undefined;
      i++;
      continue;
    }
    if (arg === "--state") {
      parsed.state = argv[i + 1]?.toUpperCase();
      i++;
      continue;
    }
    if (arg === "--query") {
      parsed.query = argv[i + 1];
      i++;
      continue;
    }
  }

  return parsed;
}

function validateArgs(parsed: ParsedArgs): void {
  if (parsed.cCode != null && (parsed.cCode < 2 || parsed.cCode > 29)) {
    throw new Error("Classification code must be between 2 and 29.");
  }
  if (parsed.ntee != null && (parsed.ntee < 1 || parsed.ntee > 10)) {
    throw new Error("NTEE category must be between 1 and 10.");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  validateArgs(parsed);

  const seen = new Set<string>();
  const eins: string[] = [];
  let skippedInvalid = 0;
  let totalResults: number | null = null;
  let reportedPages: number | null = null;

  for (let page = 0; page < parsed.pages; page++) {
    if (page > 0 && parsed.delayMs > 0) {
      await sleep(parsed.delayMs);
    }

    const response = (await searchOrganizations({
      q: parsed.query,
      page,
      state: parsed.state,
      ntee: parsed.ntee,
      c_code: parsed.cCode,
    })) as ProPublicaSearchResponse;

    totalResults =
      typeof response.total_results === "number"
        ? response.total_results
        : totalResults;
    reportedPages =
      typeof response.num_pages === "number" ? response.num_pages : reportedPages;

    const organizations = response.organizations ?? [];
    if (organizations.length === 0) {
      break;
    }

    for (const organization of organizations) {
      const ein = normalizeEin(
        organization.strein ?? String(organization.ein ?? "")
      );
      if (!isValidEin(ein)) {
        skippedInvalid++;
        continue;
      }
      if (seen.has(ein)) {
        continue;
      }
      seen.add(ein);
      eins.push(ein);
    }
  }

  const output = `${eins.join("\n")}${eins.length > 0 ? "\n" : ""}`;
  if (parsed.outputPath) {
    const resolved = path.resolve(parsed.outputPath);
    await fs.writeFile(resolved, output, "utf8");
  } else {
    process.stdout.write(output);
  }

  console.error(
    JSON.stringify(
      {
        collected: eins.length,
        skippedInvalid,
        totalResults,
        reportedPages,
        pagesRequested: parsed.pages,
        outputPath: parsed.outputPath
          ? path.resolve(parsed.outputPath)
          : null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
