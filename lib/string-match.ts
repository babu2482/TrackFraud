/**
 * String Matching Utilities for Sanctions Cross-Referencing
 *
 * Provides name normalization, similarity scoring, and fuzzy matching
 * functions used by sanctions detectors (OFAC, SAM, HHS exclusions).
 *
 * Key functions:
 * - normalize() — Clean and canonicalize a name string
 * - jaccardSimilarity() — Word-set overlap ratio
 * - levenshteinDistance() — Edit distance between two strings
 * - nameMatches() — High-level name comparison with configurable threshold
 */

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Strip common corporate suffixes for comparison purposes.
 */
const CORP_SUFFIXES = [
  " inc.",
  " corp.",
  " corporation",
  " llc.",
  " llc",
  " l.l.c.",
  " l.p.",
  " l.p",
  " lp.",
  " l.l.p.",
  " ltd.",
  " limited",
  " co.",
  " company",
  " association",
  " foundation",
  " fund",
  " trust",
  " organization",
  " group",
  " international",
  " global",
  " holdings",
  " enterprises",
  " industries",
  " services",
  " solutions",
  " systems",
  " technologies",
  " management",
  " partners",
];

/**
 * Normalize a name string for comparison:
 * - Lowercase
 * - Remove punctuation except hyphens and apostrophes
 * - Collapse whitespace
 * - Optional: strip corporate suffixes
 */
export function normalize(
  name: string | null | undefined,
  options: { stripSuffixes?: boolean } = {},
): string {
  if (!name) return "";

  let result = name.toLowerCase();

  // Remove punctuation except hyphens and apostrophes
  result = result.replace(/[.,&()/@"#]/g, "");

  // Collapse whitespace
  result = result.replace(/\s+/g, " ").trim();

  // Optionally strip corporate suffixes
  if (options.stripSuffixes) {
    for (const suffix of CORP_SUFFIXES) {
      if (result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length).trim();
        break;
      }
    }
  }

  return result;
}

/**
 * Normalize a name into a set of tokens (words).
 * Used for Jaccard similarity calculations.
 */
export function tokenize(name: string | null | undefined): Set<string> {
  if (!name) return new Set();
  const normalized = normalize(name);
  return new Set(normalized.split(" ").filter((w) => w.length > 0));
}

// ---------------------------------------------------------------------------
// Similarity Metrics
// ---------------------------------------------------------------------------

/**
 * Compute the Jaccard similarity between two sets of tokens.
 * Returns a value between 0 (no overlap) and 1 (identical).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Compute the Levenshtein (edit) distance between two strings.
 * Returns the minimum number of single-character edits required.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aNorm = normalize(a);
  const bNorm = normalize(b);

  const m = aNorm.length;
  const n = bNorm.length;

  // Early exit for empty strings
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows for space efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = aNorm[i - 1] === bNorm[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }

    // Swap rows
    const temp = prev;
    prev = curr;
    curr = temp;
  }

  return prev[n];
}

/**
 * Compute a normalized similarity score from Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(
    normalize(a).length,
    normalize(b).length,
  );

  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

/**
 * Check if one name contains all the tokens of another (subsequence match).
 * Useful for matching "John Smith" against "John Smith Jr".
 */
export function tokensContain(haystack: string, needle: string): boolean {
  const haystackTokens = tokenize(haystack);
  const needleTokens = tokenize(needle);

  if (needleTokens.size === 0) return false;

  for (const token of needleTokens) {
    if (!haystackTokens.has(token)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if any word in one name matches any word in the other.
 * Used for quick pre-filtering before more expensive matching.
 */
export function hasCommonToken(a: string, b: string): boolean {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  for (const token of tokensA) {
    if (tokensB.has(token)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// High-Level Name Matching
// ---------------------------------------------------------------------------

/**
 * Result of a name matching comparison.
 */
export interface NameMatchResult {
  /** Whether the names are considered a match */
  match: boolean;
  /** Primary similarity score (0-1) */
  similarity: number;
  /** Which method produced the best score */
  method: "jaccard" | "levenshtein" | "exact" | "contains";
  /** All individual scores for reference */
  scores: {
    exact: boolean;
    jaccard: number;
    levenshtein: number;
    contains: boolean;
  };
}

/**
 * Configuration for name matching.
 */
export interface NameMatchOptions {
  /** Minimum similarity threshold to consider a match (default: 0.85) */
  threshold?: number;
  /** Also strip corporate suffixes before comparing (default: true) */
  stripSuffixes?: boolean;
  /** Require at least one common token before doing expensive matching (default: true) */
  requireCommonToken?: boolean;
}

const DEFAULT_OPTIONS: Required<NameMatchOptions> = {
  threshold: 0.85,
  stripSuffixes: true,
  requireCommonToken: true,
};

/**
 * Compare two names and determine if they likely refer to the same entity.
 *
 * Uses a multi-method approach:
 * 1. Exact match (after normalization)
 * 2. Token containment (one name contains all tokens of the other)
 * 3. Jaccard similarity (word-set overlap)
 * 4. Levenshtein similarity (character-level edit distance)
 *
 * Returns a match if any method produces a score >= threshold.
 */
export function nameMatches(
  a: string | null | undefined,
  b: string | null | undefined,
  options: NameMatchOptions = {},
): NameMatchResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Handle null/empty inputs
  if (!a || !b) {
    return {
      match: false,
      similarity: 0,
      method: "exact",
      scores: {
        exact: false,
        jaccard: 0,
        levenshtein: 0,
        contains: false,
      },
    };
  }

  const normA = normalize(a, { stripSuffixes: opts.stripSuffixes });
  const normB = normalize(b, { stripSuffixes: opts.stripSuffixes });

  // Empty after normalization
  if (!normA || !normB) {
    return {
      match: false,
      similarity: 0,
      method: "exact",
      scores: {
        exact: false,
        jaccard: 0,
        levenshtein: 0,
        contains: false,
      },
    };
  }

  // 1. Exact match
  const exact = normA === normB;
  if (exact) {
    return {
      match: true,
      similarity: 1.0,
      method: "exact",
      scores: {
        exact: true,
        jaccard: 0, // not computed
        levenshtein: 0, // not computed
        contains: false, // not computed
      },
    };
  }

  // 2. Quick common-token check (pre-filter)
  if (opts.requireCommonToken && !hasCommonToken(normA, normB)) {
    return {
      match: false,
      similarity: 0,
      method: "jaccard",
      scores: {
        exact: false,
        jaccard: 0,
        levenshtein: 0,
        contains: false,
      },
    };
  }

  // 3. Compute all similarity scores
  const jaccard = jaccardSimilarity(normA, normB);
  const levenshtein = levenshteinSimilarity(normA, normB);

  // Check containment in both directions
  const containsAB = tokensContain(normA, normB);
  const containsBA = tokensContain(normB, normA);
  const contains = containsAB || containsBA;

  // If one name fully contains the other, boost the score
  let bestScore: number;
  let bestMethod: "jaccard" | "levenshtein" | "contains";

  if (contains) {
    bestScore = Math.max(jaccard, levenshtein);
    bestMethod = bestScore === jaccard ? "jaccard" : "levenshtein";
  } else {
    bestScore = Math.max(jaccard, levenshtein);
    bestMethod = bestScore === jaccard ? "jaccard" : "levenshtein";
  }

  const match = bestScore >= opts.threshold;

  return {
    match,
    similarity: bestScore,
    method: bestMethod,
    scores: {
      exact: false,
      jaccard,
      levenshtein,
      contains,
    },
  };
}

// ---------------------------------------------------------------------------
// EIN / ID Normalization (used by sanctions matching)
// ---------------------------------------------------------------------------

/**
 * Normalize an EIN to a 9-digit zero-padded string.
 * Handles formats like "12-3456789", "123456789", "012345678".
 */
export function normalizeEIN(ein: string | null | undefined): string {
  if (!ein) return "";
  return ein.replace(/[-\s]/g, "").padStart(9, "0").slice(0, 9);
}

/**
 * Normalize a UEI (Unique Entity Identifier) to uppercase trimmed string.
 */
export function normalizeUEI(uei: string | null | undefined): string {
  if (!uei) return "";
  return uei.toUpperCase().trim();
}

/**
 * Check if two EINs represent the same value after normalization.
 */
export function einsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeEIN(a) === normalizeEIN(b) && normalizeEIN(a) !== "";
}

/**
 * Check if two UEIs represent the same value after normalization.
 */
export function ueisMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeUEI(a) === normalizeUEI(b) && normalizeUEI(a) !== "";
}
