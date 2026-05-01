import { NextRequest } from "next/server";
import { getOrganization, searchOrganizations } from "@/lib/api";
import { getStoredHottestCharities } from "@/lib/charity-read";
import {
  getCachedHottest,
  getCachedOrg,
  setCachedHottest,
  setCachedOrg,
} from "@/lib/cache";
import {
  getFundraisingEfficiency,
  getProgramExpenseRatio,
  getTotalExpenses,
  getTotalRevenue,
} from "@/lib/metrics";
import { getExternalCorroboration } from "@/lib/external-corroboration";
import {
  buildFraudMeter,
  computeCharityFraudBaseScore,
} from "@/lib/fraud-meter";
import { buildLegalClassification, buildRiskSignals } from "@/lib/signals";
import type {
  HottestCharityResult,
  ProPublicaFiling,
  ProPublicaOrganization,
} from "@/lib/types";

interface ProPublicaSearchResponse {
  organizations?: ProPublicaOrganization[];
  total_results?: number;
  num_pages?: number;
}

interface ProPublicaOrgResponse {
  organization?: ProPublicaOrganization;
  filings_with_data?: ProPublicaFiling[];
}

const ALLOWED_LIMITS = new Set([10, 50, 100]);
const PAGE_SIZE = 25;

function parseLimit(raw: string | null): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return ALLOWED_LIMITS.has(parsed) ? parsed : 10;
}

function parseCode(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < 2 || parsed > 29) return undefined;
  return parsed;
}

async function mapWithConcurrency<T, R>(
  input: T[],
  limit: number,
  mapper: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(input.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, input.length) },
    async () => {
      while (cursor < input.length) {
        const idx = cursor++;
        out[idx] = await mapper(input[idx], idx);
      }
    },
  );

  await Promise.all(workers);
  return out;
}

function toCandidate(org: ProPublicaOrganization): {
  ein: string;
  org: ProPublicaOrganization;
} {
  return {
    ein: String(org.ein).padStart(9, "0"),
    org,
  };
}

function compareNullableNumberDesc(
  a?: number | null,
  b?: number | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function compareNullableNumberAsc(
  a?: number | null,
  b?: number | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function buildRankingScore(params: {
  revenue: number;
  fraudMeterScore: number;
  highSignalCount: number;
  filingYear?: number;
}): number {
  const revenue = params.revenue > 0 ? params.revenue : 0;
  const currentYear = new Date().getFullYear();
  const recency =
    params.filingYear != null
      ? Math.max(0, 5 - (currentYear - params.filingYear))
      : 0;

  const revenuePoints = Math.log10(revenue + 1) * 10;
  const recencyPoints = recency * 4;
  const signalPoints = params.highSignalCount * 30;

  return (
    params.fraudMeterScore * 100 + signalPoints + revenuePoints + recencyPoints
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const rawCode = searchParams.get("c_code");
  const cCode = parseCode(rawCode);
  if (rawCode != null && cCode == null) {
    return Response.json(
      { error: "Invalid c_code; use 2-29" },
      { status: 400 },
    );
  }
  const cacheKey = `hottest:${limit}:c_code:${cCode ?? "all"}:v6`;

  const cached = await getCachedHottest(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

  const stored = await getStoredHottestCharities({ limit, cCode });
  if (stored.totalResults >= limit) {
    const payload = {
      limit,
      cCode,
      rankingBasis:
        "Fraud meter first, then impact and recency: filing-based fraud indicators, external corroboration, organization scale, and filing freshness.",
      totalResults: stored.totalResults,
      numPages: 1,
      generatedAt: new Date().toISOString(),
      dataSource: "stored",
      results: stored.results,
    };
    await setCachedHottest(cacheKey, payload);
    return Response.json(payload);
  }

  try {
    const targetCandidateCount = Math.min(Math.max(limit * 8, limit + 25), 250);
    const pagesToFetch = Math.ceil(targetCandidateCount / PAGE_SIZE);
    const pageIndices = Array.from({ length: pagesToFetch }, (_, i) => i);

    const searchResponses = (await Promise.all(
      pageIndices.map(
        (page) =>
          searchOrganizations({
            page,
            c_code: cCode,
          }) as Promise<ProPublicaSearchResponse>,
      ),
    )) as ProPublicaSearchResponse[];

    const seenEins = new Set<string>();
    const candidates: { ein: string; org: ProPublicaOrganization }[] = [];

    for (const response of searchResponses) {
      for (const org of response.organizations ?? []) {
        const candidate = toCandidate(org);
        if (seenEins.has(candidate.ein)) continue;
        seenEins.add(candidate.ein);
        candidates.push(candidate);
        if (candidates.length >= targetCandidateCount) break;
      }
      if (candidates.length >= targetCandidateCount) break;
    }

    const enriched = await mapWithConcurrency(
      candidates,
      10,
      async (candidate): Promise<HottestCharityResult | null> => {
        let orgData = (await getCachedOrg(
          candidate.ein,
        )) as ProPublicaOrgResponse | null;
        if (!orgData) {
          try {
            orgData = (await getOrganization(
              candidate.ein,
            )) as ProPublicaOrgResponse;
            await setCachedOrg(candidate.ein, orgData);
          } catch {
            return null;
          }
        }

        const filings = orgData.filings_with_data ?? [];
        if (filings.length === 0) return null;
        const latest = [...filings].sort(
          (a, b) => (b.tax_prd ?? 0) - (a.tax_prd ?? 0),
        )[0];
        if (!latest) return null;

        const latestRevenue = getTotalRevenue(latest) ?? 0;
        const latestExpenses = getTotalExpenses(latest) ?? 0;
        const programExpenseRatio = getProgramExpenseRatio(latest);
        const fundraisingEfficiency = getFundraisingEfficiency(latest);
        const compensationPct =
          typeof latest.pct_compnsatncurrofcr === "number"
            ? latest.pct_compnsatncurrofcr
            : null;
        const legalClassification = buildLegalClassification({
          subsectionCode:
            typeof candidate.org.subseccd === "number"
              ? candidate.org.subseccd
              : typeof candidate.org.subsection_code === "number"
                ? candidate.org.subsection_code
                : undefined,
          formType:
            typeof latest.formtype === "number" ? latest.formtype : undefined,
        });
        const riskSignals = buildRiskSignals({
          programExpenseRatio,
          fundraisingEfficiency,
          compensationPct,
        });
        const charityBaseScore = computeCharityFraudBaseScore({
          programExpenseRatio,
          fundraisingEfficiency,
          compensationPct,
        });
        const internalFraudMeter = buildFraudMeter({
          domain: "charities",
          riskSignals,
          baseScore: charityBaseScore,
          baseSummary:
            charityBaseScore > 0
              ? "This organization shows continuous fraud pressure from how much reaches the mission, how expensive fundraising is, and how much spending goes to officer pay."
              : undefined,
        });

        return {
          rank: 0,
          ein: candidate.ein,
          name: candidate.org.name || "Unknown",
          city: candidate.org.city,
          state: candidate.org.state,
          ntee_code: candidate.org.ntee_code,
          subseccd:
            typeof candidate.org.subseccd === "number"
              ? candidate.org.subseccd
              : undefined,
          score:
            typeof candidate.org.score === "number"
              ? candidate.org.score
              : undefined,
          latestFilingYear:
            typeof latest.tax_prd_yr === "number"
              ? latest.tax_prd_yr
              : undefined,
          latestRevenue,
          latestExpenses,
          programExpenseRatio,
          fundraisingEfficiency,
          compensationPct,
          legalClassification,
          riskSignals,
          fraudMeter: internalFraudMeter,
          rankingScore: buildRankingScore({
            revenue: latestRevenue,
            fraudMeterScore: internalFraudMeter.score,
            highSignalCount: internalFraudMeter.highSignalCount,
            filingYear:
              typeof latest.tax_prd_yr === "number"
                ? latest.tax_prd_yr
                : undefined,
          }),
        };
      },
    );

    const topRanked = enriched
      .filter((item): item is HottestCharityResult => item != null)
      .sort((a, b) => {
        const scoreDiff = compareNullableNumberDesc(
          a.rankingScore,
          b.rankingScore,
        );
        if (scoreDiff !== 0) return scoreDiff;

        const revenueDiff = compareNullableNumberDesc(
          a.latestRevenue,
          b.latestRevenue,
        );
        if (revenueDiff !== 0) return revenueDiff;

        const ratioDiff = compareNullableNumberDesc(
          a.programExpenseRatio,
          b.programExpenseRatio,
        );
        if (ratioDiff !== 0) return ratioDiff;

        const fundraisingDiff = compareNullableNumberAsc(
          a.fundraisingEfficiency,
          b.fundraisingEfficiency,
        );
        if (fundraisingDiff !== 0) return fundraisingDiff;

        return compareNullableNumberAsc(a.compensationPct, b.compensationPct);
      })
      .slice(0, limit);

    const rankedWithCorroboration = await mapWithConcurrency(
      topRanked,
      8,
      async (item, idx): Promise<HottestCharityResult> => {
        const corroboration = await getExternalCorroboration({
          ein: item.ein,
          organizationName: item.name,
        }).catch(() => []);
        return {
          ...item,
          externalCorroboration: corroboration,
          fraudMeter: buildFraudMeter({
            domain: "charities",
            riskSignals: item.riskSignals,
            externalCorroboration: corroboration,
            baseScore: computeCharityFraudBaseScore({
              programExpenseRatio: item.programExpenseRatio ?? null,
              fundraisingEfficiency: item.fundraisingEfficiency ?? null,
              compensationPct: item.compensationPct ?? null,
            }),
            baseSummary:
              "This organization shows continuous fraud pressure from how much reaches the mission, how expensive fundraising is, and how much spending goes to officer pay.",
          }),
        };
      },
    );

    const ranked = [...rankedWithCorroboration]
      .sort((a, b) => {
        const meterDiff = compareNullableNumberDesc(
          a.fraudMeter?.score,
          b.fraudMeter?.score,
        );
        if (meterDiff !== 0) return meterDiff;
        const rankDiff = compareNullableNumberDesc(
          a.rankingScore,
          b.rankingScore,
        );
        if (rankDiff !== 0) return rankDiff;
        return compareNullableNumberDesc(a.latestRevenue, b.latestRevenue);
      })
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));

    const payload = {
      limit,
      cCode,
      rankingBasis:
        "Fraud meter first, then impact and recency: filing-based fraud indicators, external corroboration, organization scale, and filing freshness.",
      totalResults: searchResponses[0]?.total_results ?? 0,
      numPages: searchResponses[0]?.num_pages ?? 0,
      generatedAt: new Date().toISOString(),
      dataSource: "live",
      results: ranked,
    };

    await setCachedHottest(cacheKey, payload);
    return Response.json(payload);
  } catch (err) {
    if (stored.results.length > 0) {
      const payload = {
        limit,
        cCode,
        rankingBasis:
          "Fraud meter first, then impact and recency: filing-based fraud indicators, external corroboration, organization scale, and filing freshness.",
        totalResults: stored.totalResults,
        numPages: 1,
        generatedAt: new Date().toISOString(),
        dataSource: "stored_fallback",
        results: stored.results,
      };
      await setCachedHottest(cacheKey, payload);
      return Response.json(payload);
    }

    const message = err instanceof Error ? err.message : "Hottest list failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
