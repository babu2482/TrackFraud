import type { CharitySearchResult } from "@/lib/types";

const STOP_WORDS = new Set([
  "and",
  "the",
  "of",
  "for",
  "a",
  "an",
  "inc",
  "llc",
  "co",
  "corp",
  "corporation",
]);

const ORG_SUFFIXES = new Set([
  "foundation",
  "trust",
  "charity",
  "charitable",
  "fund",
  "hospital",
  "university",
  "clinic",
  "institute",
  "association",
]);

export function normalizeCharitySearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeCharitySearch(value: string): string[] {
  const normalized = normalizeCharitySearchText(value);
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

function dedupeStrings(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const value = normalizeCharitySearchText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildCharitySearchFallbackQueries(query: string): string[] {
  const tokens = tokenizeCharitySearch(query);
  if (tokens.length === 0) return [];

  const normalizedOriginal = normalizeCharitySearchText(query);
  const candidates: string[] = [];

  if (
    tokens.includes("gates") &&
    (tokens.includes("bill") || tokens.includes("melinda"))
  ) {
    candidates.push("gates foundation");
  }

  const withoutStopWords = tokens.filter((token) => !STOP_WORDS.has(token));
  if (withoutStopWords.length > 0) {
    candidates.push(withoutStopWords.join(" "));
  }

  if (tokens.length >= 3) {
    candidates.push(tokens.slice(1).join(" "));
  }

  if (tokens.length >= 2) {
    candidates.push(tokens.slice(-2).join(" "));
  }

  const lastToken = tokens[tokens.length - 1];
  const secondLastToken = tokens[tokens.length - 2];
  if (secondLastToken && ORG_SUFFIXES.has(lastToken)) {
    candidates.push(`${secondLastToken} ${lastToken}`);
  }
  if (secondLastToken && !ORG_SUFFIXES.has(lastToken)) {
    candidates.push(`${lastToken} foundation`);
  }
  candidates.push(lastToken);

  return dedupeStrings(candidates).filter(
    (candidate) => candidate !== normalizedOriginal
  );
}

export function relevanceBoost(name: string, query: string): number {
  const normalizedName = normalizeCharitySearchText(name);
  const normalizedQuery = normalizeCharitySearchText(query);
  if (!normalizedQuery) return 0;

  let score = 0;
  if (normalizedName === normalizedQuery) score += 1000;
  if (normalizedName.startsWith(normalizedQuery)) score += 350;
  if (normalizedName.includes(normalizedQuery)) score += 200;

  const queryTokens = tokenizeCharitySearch(normalizedQuery);
  const nameTokens = new Set(tokenizeCharitySearch(normalizedName));
  let matches = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      matches += 1;
      score += 35;
    }
  }
  if (queryTokens.length > 0 && matches === queryTokens.length) score += 120;

  return score;
}

export function sortCharityResultsByRelevance<T extends CharitySearchResult>(
  results: T[],
  query: string
): T[] {
  return [...results].sort((a, b) => {
    const aScore = (a.score ?? 0) * 10 + relevanceBoost(a.name, query);
    const bScore = (b.score ?? 0) * 10 + relevanceBoost(b.name, query);
    return bScore - aScore;
  });
}
