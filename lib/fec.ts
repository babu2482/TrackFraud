const FEC_BASE = "https://api.open.fec.gov/v1";
const API_KEY = process.env.FEC_API_KEY ?? "DEMO_KEY";
const USING_DEMO_KEY = API_KEY === "DEMO_KEY";
const SEARCH_TTL_MS = 10 * 60 * 1000;
const DETAIL_TTL_MS = 60 * 60 * 1000;
const STALE_MULTIPLIER = 6;
const FETCH_TIMEOUT_MS = 5000;
const RETRYABLE_BACKOFF_MS = 500;

const fecCache = new Map<
  string,
  { data: unknown; expires: number; staleUntil: number }
>();
const inflightRequests = new Map<string, Promise<unknown>>();

export class FECRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = "FECRequestError";
  }
}

export function isFECRequestError(error: unknown): error is FECRequestError {
  return error instanceof FECRequestError;
}

export function isFECRateLimitError(error: unknown): error is FECRequestError {
  return isFECRequestError(error) && error.status === 429;
}

function buildCacheKey(path: string, params: Record<string, string>): string {
  const url = new URL(`${FEC_BASE}${path}`);
  for (const [k, v] of Object.entries(params).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

function getCached<T>(key: string, allowStale = false): T | null {
  const entry = fecCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now <= entry.expires) return entry.data as T;
  if (allowStale && now <= entry.staleUntil) return entry.data as T;
  return null;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  const now = Date.now();
  fecCache.set(key, {
    data,
    expires: now + ttlMs,
    staleUntil: now + ttlMs * STALE_MULTIPLIER,
  });
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, dateMs - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fecFetch<T>(
  path: string,
  params: Record<string, string> = {},
  ttlMs = DETAIL_TTL_MS
): Promise<T> {
  const cacheKey = buildCacheKey(path, params);
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing as Promise<T>;

  const url = new URL(`${FEC_BASE}${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const request = (async () => {
    const stale = getCached<T>(cacheKey, true);

    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        if (stale) return stale;
        if (attempt < 2) {
          await sleep((attempt + 1) * RETRYABLE_BACKOFF_MS);
          continue;
        }
        throw new FECRequestError(
          502,
          "The Federal Election Commission API is temporarily unavailable. Please try again in a minute."
        );
      }

      if (res.ok) {
        const data = (await res.json()) as T;
        setCached(cacheKey, data, ttlMs);
        return data;
      }

      if (res.status === 429) {
        if (stale) return stale;
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        throw new FECRequestError(
          429,
          USING_DEMO_KEY
            ? "The Federal Election Commission API demo key is being rate limited. Add FEC_API_KEY to .env for a higher request quota, or wait a minute and try again."
            : "The Federal Election Commission API is temporarily rate limiting requests. Please wait a minute and try again.",
          retryAfterMs
        );
      }

      if (res.status >= 500 && attempt < 2) {
        await sleep((attempt + 1) * RETRYABLE_BACKOFF_MS);
        continue;
      }

      const text = await res.text();
      throw new FECRequestError(
        res.status,
        `FEC API ${res.status}: ${text.slice(0, 200) || res.statusText}`
      );
    }

    throw new FECRequestError(500, "FEC request failed");
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, request as Promise<unknown>);
  return request;
}

export interface FECCandidate {
  candidate_id: string;
  name: string;
  party_full?: string;
  party?: string;
  office_full?: string;
  office?: string;
  state?: string;
  district?: string;
  incumbent_challenge_full?: string;
  candidate_status?: string;
  election_years?: number[];
  federal_funds_flag?: boolean;
  has_raised_funds?: boolean;
  cycles?: number[];
}

export interface FECCommittee {
  committee_id: string;
  name: string;
  committee_type_full?: string;
  committee_type?: string;
  designation_full?: string;
  party_full?: string;
  state?: string;
  treasurer_name?: string;
  candidate_ids?: string[];
  cycles?: number[];
  organization_type_full?: string;
}

export interface FECTotals {
  cycle: number;
  receipts?: number;
  disbursements?: number;
  individual_contributions?: number;
  other_political_committee_contributions?: number;
  operating_expenditures?: number;
  cash_on_hand_end_period?: number;
  debts_owed_by_committee?: number;
  contributions?: number;
  last_report_year?: number;
}

export interface FECSearchResponse<T> {
  results: T[];
  pagination: { count: number; pages: number; page: number; per_page: number };
}

export async function listCandidates(page = 1, perPage = 100): Promise<FECSearchResponse<FECCandidate>> {
  return fecFetch<FECSearchResponse<FECCandidate>>(
    "/candidates/",
    {
      page: String(page),
      per_page: String(perPage),
    },
    SEARCH_TTL_MS
  );
}

export async function listCommittees(page = 1, perPage = 100): Promise<FECSearchResponse<FECCommittee>> {
  return fecFetch<FECSearchResponse<FECCommittee>>(
    "/committees/",
    {
      page: String(page),
      per_page: String(perPage),
    },
    SEARCH_TTL_MS
  );
}

export async function searchCandidates(q: string, page = 1): Promise<FECSearchResponse<FECCandidate>> {
  return fecFetch<FECSearchResponse<FECCandidate>>("/candidates/search/", {
    q,
    page: String(page),
    per_page: "20",
    sort: "-election_years",
  }, SEARCH_TTL_MS);
}

export async function searchCommittees(q: string, page = 1): Promise<FECSearchResponse<FECCommittee>> {
  return fecFetch<FECSearchResponse<FECCommittee>>("/committees/", {
    q,
    page: String(page),
    per_page: "20",
    sort: "-last_file_date",
  }, SEARCH_TTL_MS);
}

export async function getCandidateDetail(candidateId: string): Promise<FECCandidate | null> {
  const data = await fecFetch<FECSearchResponse<FECCandidate>>(
    `/candidate/${candidateId}/`,
    {},
    DETAIL_TTL_MS
  );
  return data.results[0] ?? null;
}

export async function getCandidateTotals(candidateId: string): Promise<FECTotals[]> {
  const data = await fecFetch<FECSearchResponse<FECTotals>>(`/candidate/${candidateId}/totals/`, {
    per_page: "10",
    sort: "-cycle",
  }, DETAIL_TTL_MS);
  return data.results;
}

export async function getCommitteeDetail(committeeId: string): Promise<FECCommittee | null> {
  const data = await fecFetch<FECSearchResponse<FECCommittee>>(
    `/committee/${committeeId}/`,
    {},
    DETAIL_TTL_MS
  );
  return data.results[0] ?? null;
}

export async function getCommitteeTotals(committeeId: string): Promise<FECTotals[]> {
  const data = await fecFetch<FECSearchResponse<FECTotals>>(`/committee/${committeeId}/totals/`, {
    per_page: "10",
    sort: "-cycle",
  }, DETAIL_TTL_MS);
  return data.results;
}
