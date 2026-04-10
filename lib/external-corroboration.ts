import { strFromU8, unzipSync } from "fflate";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import type { ExternalCorroborationMatch } from "./types";

const IRS_REVOCATION_ZIP_URL =
  "https://apps.irs.gov/pub/epostcard/data-download-revocation.zip";
const IRS_REVOCATION_INFO_URL =
  "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads";
const OFAC_SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.csv";
const OFAC_INFO_URL =
  "https://ofac.treasury.gov/specially-designated-nationals-list-sdn-human-readable-lists";
const STATE_ENFORCEMENT_PATH = path.join(
  process.cwd(),
  "data",
  "state-enforcement.csv"
);
const WATCHDOG_PATH = path.join(process.cwd(), "data", "watchdog-flags.csv");

const SOURCE_TTL_MS = 24 * 60 * 60 * 1000;
const REVOCATION_TIMEOUT_MS = 8000;
const OFAC_TIMEOUT_MS = 6000;
const LOCAL_CSV_TIMEOUT_MS = 1000;

type RevocationIndex = {
  expires: number;
  loadedAt: string;
  sourceLastModified?: string;
  eins: Set<string>;
};

type OfacIndex = {
  expires: number;
  loadedAt: string;
  sourceLastModified?: string;
  names: Set<string>;
};

type LocalEntry = {
  sourceName: string;
  severity: "info" | "medium" | "high";
  description: string;
  url?: string;
  observedAt?: string;
};

type LocalCsvIndex = {
  expires: number;
  loadedAt: string;
  byEin: Map<string, LocalEntry[]>;
};

let revocationCache: RevocationIndex | null = null;
let revocationPromise: Promise<RevocationIndex> | null = null;

let ofacCache: OfacIndex | null = null;
let ofacPromise: Promise<OfacIndex> | null = null;

let stateCache: LocalCsvIndex | null = null;
let statePromise: Promise<LocalCsvIndex> | null = null;

let watchdogCache: LocalCsvIndex | null = null;
let watchdogPromise: Promise<LocalCsvIndex> | null = null;

const loggedSourceFailures = new Set<string>();

function normalizeEin(value: string): string {
  return value.replace(/\D/g, "").padStart(9, "0");
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(field.trim());
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field.trim());
  return out.map((f) => f.replace(/^"(.*)"$/, "$1").trim());
}

function emptyLocalIndex(): LocalCsvIndex {
  return {
    expires: Date.now() + SOURCE_TTL_MS,
    loadedAt: new Date().toISOString(),
    byEin: new Map(),
  };
}

function logSourceFailureOnce(sourceId: string, error: unknown): void {
  if (loggedSourceFailures.has(sourceId)) return;
  loggedSourceFailures.add(sourceId);
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[external-corroboration] ${sourceId} unavailable: ${message}`);
}

async function loadOptionalSource<T>(
  sourceId: string,
  loader: () => Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  const guarded = loader().catch((error) => {
    logSourceFailureOnce(sourceId, error);
    return null;
  });

  let timedOut = false;
  let handle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    handle = setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, timeoutMs);
  });

  const result = await Promise.race<T | null>([
    guarded as Promise<T | null>,
    timeout as Promise<null>,
  ]).finally(() => {
    if (handle) clearTimeout(handle);
  });

  if (timedOut) {
    logSourceFailureOnce(
      sourceId,
      new Error(`Timed out after ${timeoutMs}ms while loading source`)
    );
  }
  return result;
}

function severityRank(value: "info" | "medium" | "high"): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

async function fetchBytes(url: string): Promise<{
  bytes: Uint8Array;
  lastModified?: string;
}> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    throw new Error(`External source failed: ${res.status} ${url}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const lastModified = res.headers.get("last-modified") ?? undefined;
  return { bytes, lastModified };
}

function extractSingleTextEntry(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const entryName = Object.keys(files).find((name) =>
    name.toLowerCase().endsWith(".txt")
  );
  if (!entryName) throw new Error("No .txt file found in IRS revocation ZIP");
  return files[entryName];
}

function buildRevocationEinIndex(textBytes: Uint8Array): Set<string> {
  const out = new Set<string>();
  let lineStart = 0;

  for (let i = 0; i <= textBytes.length; i++) {
    if (i !== textBytes.length && textBytes[i] !== 10) continue;

    let firstPipe = i;
    for (let j = lineStart; j < i; j++) {
      if (textBytes[j] === 124) {
        firstPipe = j;
        break;
      }
    }

    let ein = "";
    for (let j = lineStart; j < firstPipe; j++) {
      const b = textBytes[j];
      if (b >= 48 && b <= 57) {
        ein += String.fromCharCode(b);
      } else if (b === 13 || b === 32 || b === 9) {
        continue;
      } else {
        ein = "";
        break;
      }
    }
    if (/^\d{9}$/.test(ein)) out.add(ein);
    lineStart = i + 1;
  }

  return out;
}

async function loadRevocationIndex(): Promise<RevocationIndex> {
  const now = Date.now();
  if (revocationCache && now < revocationCache.expires) return revocationCache;
  if (revocationPromise) return revocationPromise;

  revocationPromise = (async () => {
    const { bytes, lastModified } = await fetchBytes(IRS_REVOCATION_ZIP_URL);
    const textEntry = extractSingleTextEntry(bytes);
    const eins = buildRevocationEinIndex(textEntry);
    const next: RevocationIndex = {
      expires: Date.now() + SOURCE_TTL_MS,
      loadedAt: new Date().toISOString(),
      sourceLastModified: lastModified,
      eins,
    };
    revocationCache = next;
    revocationPromise = null;
    return next;
  })().catch((error) => {
    revocationPromise = null;
    throw error;
  });

  return revocationPromise;
}

async function loadStoredRevocationMatch(
  ein: string
): Promise<ExternalCorroborationMatch | null> {
  const record = await prisma.charityAutomaticRevocationRecord.findUnique({
    where: { ein },
    select: {
      revocationDate: true,
      revocationDateRaw: true,
      revocationPostingDate: true,
      revocationPostingDateRaw: true,
      exemptionReinstatementDate: true,
      exemptionReinstatementDateRaw: true,
      sourcePublishedAt: true,
    },
  });

  if (!record) return null;

  const reinstated =
    record.exemptionReinstatementDateRaw || record.exemptionReinstatementDate;
  const observedAt =
    record.revocationPostingDate?.toISOString() ??
    record.revocationPostingDateRaw ??
    record.sourcePublishedAt?.toISOString() ??
    undefined;
  const revocationDate =
    record.revocationDate?.toISOString() ?? record.revocationDateRaw ?? null;

  return {
    sourceId: "irs_auto_revocation",
    sourceName: "IRS Automatic Revocation List",
    category: "revocation",
    severity: reinstated ? "medium" : "high",
    matchedOn: "ein",
    matchValue: ein,
    description: reinstated
      ? `This organization appears in the IRS automatic revocation list and also shows a reinstatement date.${revocationDate ? ` Revocation date: ${revocationDate}.` : ""}`
      : "This organization appears in the IRS automatic revocation list for failure to file required annual returns for three consecutive years.",
    observedAt,
    url: IRS_REVOCATION_INFO_URL,
  };
}

function buildOfacNameIndex(csv: string): Set<string> {
  const out = new Set<string>();
  let start = 0;

  for (let i = 0; i <= csv.length; i++) {
    if (i !== csv.length && csv.charCodeAt(i) !== 10) continue;
    const line = csv.slice(start, i).trim();
    start = i + 1;
    if (!line) continue;

    const cols = splitCsvLine(line);
    if (cols.length < 2) continue;
    const normalized = normalizeName(cols[1]);
    if (normalized.length >= 6) out.add(normalized);
  }

  return out;
}

async function loadOfacIndex(): Promise<OfacIndex> {
  const now = Date.now();
  if (ofacCache && now < ofacCache.expires) return ofacCache;
  if (ofacPromise) return ofacPromise;

  ofacPromise = (async () => {
    const { bytes, lastModified } = await fetchBytes(OFAC_SDN_URL);
    const csv = strFromU8(bytes);
    const names = buildOfacNameIndex(csv);
    const next: OfacIndex = {
      expires: Date.now() + SOURCE_TTL_MS,
      loadedAt: new Date().toISOString(),
      sourceLastModified: lastModified,
      names,
    };
    ofacCache = next;
    ofacPromise = null;
    return next;
  })().catch((error) => {
    ofacPromise = null;
    throw error;
  });

  return ofacPromise;
}

function parseSeverity(value: string | undefined): "info" | "medium" | "high" {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "info";
}

function buildLocalCsvIndex(params: {
  text: string;
  defaultSourceName: string;
  defaultDescription: string;
  descriptionMutator?: (description: string, row: Record<string, string>) => string;
}): LocalCsvIndex {
  const lines = params.text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return emptyLocalIndex();

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    ein: header.indexOf("ein"),
    source: header.indexOf("source"),
    severity: header.indexOf("severity"),
    description: header.indexOf("description"),
    url: header.indexOf("url"),
    observedAt: header.indexOf("observed_at"),
    state: header.indexOf("state"),
    rating: header.indexOf("rating"),
  };

  const byEin = new Map<string, LocalEntry[]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: Record<string, string> = {
      state: idx.state >= 0 ? cols[idx.state] ?? "" : "",
      rating: idx.rating >= 0 ? cols[idx.rating] ?? "" : "",
    };
    const ein = idx.ein >= 0 ? normalizeEin(cols[idx.ein] ?? "") : "";
    if (!/^\d{9}$/.test(ein)) continue;

    let description =
      idx.description >= 0 && cols[idx.description]
        ? cols[idx.description]
        : params.defaultDescription;
    if (params.descriptionMutator) {
      description = params.descriptionMutator(description, row);
    }

    const entry: LocalEntry = {
      sourceName:
        idx.source >= 0 && cols[idx.source]
          ? cols[idx.source]
          : params.defaultSourceName,
      severity: parseSeverity(idx.severity >= 0 ? cols[idx.severity] : "medium"),
      description,
      url: idx.url >= 0 ? cols[idx.url] || undefined : undefined,
      observedAt: idx.observedAt >= 0 ? cols[idx.observedAt] || undefined : undefined,
    };

    const list = byEin.get(ein) ?? [];
    list.push(entry);
    byEin.set(ein, list);
  }

  return {
    expires: Date.now() + SOURCE_TTL_MS,
    loadedAt: new Date().toISOString(),
    byEin,
  };
}

async function loadStateEnforcementIndex(): Promise<LocalCsvIndex> {
  const now = Date.now();
  if (stateCache && now < stateCache.expires) return stateCache;
  if (statePromise) return statePromise;

  statePromise = (async () => {
    let text = "";
    try {
      text = await fs.readFile(STATE_ENFORCEMENT_PATH, "utf8");
    } catch {
      const empty = emptyLocalIndex();
      stateCache = empty;
      statePromise = null;
      return empty;
    }

    const next = buildLocalCsvIndex({
      text,
      defaultSourceName: "State enforcement dataset",
      defaultDescription: "State enforcement action",
      descriptionMutator: (description, row) =>
        row.state ? `${description} (${row.state})` : description,
    });
    stateCache = next;
    statePromise = null;
    return next;
  })().catch((error) => {
    statePromise = null;
    throw error;
  });

  return statePromise;
}

async function loadWatchdogIndex(): Promise<LocalCsvIndex> {
  const now = Date.now();
  if (watchdogCache && now < watchdogCache.expires) return watchdogCache;
  if (watchdogPromise) return watchdogPromise;

  watchdogPromise = (async () => {
    let text = "";
    try {
      text = await fs.readFile(WATCHDOG_PATH, "utf8");
    } catch {
      const empty = emptyLocalIndex();
      watchdogCache = empty;
      watchdogPromise = null;
      return empty;
    }

    const next = buildLocalCsvIndex({
      text,
      defaultSourceName: "Watchdog dataset",
      defaultDescription: "Watchdog signal",
      descriptionMutator: (description, row) =>
        row.rating ? `${description} (rating: ${row.rating})` : description,
    });
    watchdogCache = next;
    watchdogPromise = null;
    return next;
  })().catch((error) => {
    watchdogPromise = null;
    throw error;
  });

  return watchdogPromise;
}

export async function getExternalCorroboration(params: {
  ein: string;
  organizationName?: string;
}): Promise<ExternalCorroborationMatch[]> {
  const ein = normalizeEin(params.ein);
  if (!/^\d{9}$/.test(ein)) return [];

  const storedRevocation = await loadStoredRevocationMatch(ein);

  const [revocation, ofac, state, watchdog] = await Promise.all([
    storedRevocation
      ? Promise.resolve(null)
      : loadOptionalSource(
          "irs_revocation",
          loadRevocationIndex,
          REVOCATION_TIMEOUT_MS
        ),
    loadOptionalSource("ofac_sdn", loadOfacIndex, OFAC_TIMEOUT_MS),
    loadOptionalSource(
      "state_enforcement",
      loadStateEnforcementIndex,
      LOCAL_CSV_TIMEOUT_MS
    ),
    loadOptionalSource("watchdog", loadWatchdogIndex, LOCAL_CSV_TIMEOUT_MS),
  ]);

  const matches: ExternalCorroborationMatch[] = [];

  if (storedRevocation) {
    matches.push(storedRevocation);
  } else if (revocation && revocation.eins.has(ein)) {
    matches.push({
      sourceId: "irs_auto_revocation",
      sourceName: "IRS Automatic Revocation List",
      category: "revocation",
      severity: "high",
      matchedOn: "ein",
      matchValue: ein,
      description:
        "This organization appears in the IRS automatic revocation list for failure to file required annual returns for three consecutive years.",
      observedAt: revocation.sourceLastModified,
      url: IRS_REVOCATION_INFO_URL,
    });
  }

  if (state) {
    const stateMatches = state.byEin.get(ein) ?? [];
    for (const match of stateMatches) {
      matches.push({
        sourceId: "state_enforcement",
        sourceName: match.sourceName,
        category: "state_enforcement",
        severity: match.severity,
        matchedOn: "ein",
        matchValue: ein,
        description: match.description,
        observedAt: match.observedAt,
        url: match.url,
      });
    }
  }

  if (watchdog) {
    const watchdogMatches = watchdog.byEin.get(ein) ?? [];
    for (const match of watchdogMatches) {
      matches.push({
        sourceId: "watchdog_dataset",
        sourceName: match.sourceName,
        category: "watchdog",
        severity: match.severity,
        matchedOn: "ein",
        matchValue: ein,
        description: match.description,
        observedAt: match.observedAt,
        url: match.url,
      });
    }
  }

  const normalizedName = normalizeName(params.organizationName ?? "");
  if (normalizedName && ofac && ofac.names.has(normalizedName)) {
    matches.push({
      sourceId: "ofac_sdn_name",
      sourceName: "OFAC Specially Designated Nationals",
      category: "sanction",
      severity: "high",
      matchedOn: "name",
      matchValue: normalizedName,
      description:
        "Organization name exactly matches an entry in the U.S. sanctions list. This is a name-based corroboration and may require manual confirmation.",
      observedAt: ofac.sourceLastModified,
      url: OFAC_INFO_URL,
    });
  }

  return matches.sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.sourceName.localeCompare(b.sourceName);
  });
}
