import { NextRequest } from "next/server";
import { searchOrganizations } from "@/lib/api";
import {
  buildCharitySearchFallbackQueries,
  sortCharityResultsByRelevance,
} from "@/lib/charity-search";
import { searchStoredCharities } from "@/lib/charity-read";
import type { CharitySearchResult } from "@/lib/types";
import type { ProPublicaOrganization } from "@/lib/types";

interface ProPublicaSearchResponse {
  organizations?: ProPublicaOrganization[];
  total_results?: number;
  num_pages?: number;
  cur_page?: number;
  search_query?: string | null;
}

const SEARCH_PAGE_SIZE = 25;

function toSearchResult(org: ProPublicaOrganization): CharitySearchResult {
  return {
    ein: String(org.ein).padStart(9, "0"),
    name: org.name || "Unknown",
    city: org.city,
    state: org.state,
    ntee_code: org.ntee_code,
    subseccd:
      typeof org.subseccd === "number" ? org.subseccd : undefined,
    score: typeof org.score === "number" ? org.score : undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const state = searchParams.get("state") ?? undefined;
  const ntee = searchParams.get("ntee"); // 1-10
  const cCode = searchParams.get("c_code");
  const nteeId = ntee ? parseInt(ntee, 10) : undefined;
  const cCodeId = cCode ? parseInt(cCode, 10) : undefined;
  if (nteeId != null && (nteeId < 1 || nteeId > 10)) {
    return Response.json(
      { error: "Invalid ntee; use 1-10" },
      { status: 400 }
    );
  }
  if (cCodeId != null && (cCodeId < 2 || cCodeId > 29)) {
    return Response.json(
      { error: "Invalid c_code; use 2-29" },
      { status: 400 }
    );
  }

  try {
    const localData = q
      ? await searchStoredCharities({
          q,
          page,
          state,
          ntee: nteeId,
          cCode: cCodeId,
        })
      : { results: [], totalResults: 0 };

    const fallbackCandidates = q ? buildCharitySearchFallbackQueries(q) : [];
    let queryUsed = q ?? null;
    let queryStrategy: "exact" | "fallback" = "exact";
    let upstreamError: Error | null = null;
    let data: ProPublicaSearchResponse | null = null;

    try {
      const exactData = (await searchOrganizations({
        q: q || undefined,
        page,
        state,
        ntee: nteeId,
        c_code: cCodeId,
      })) as ProPublicaSearchResponse;
      data = exactData;

      const exactOrganizations = exactData.organizations ?? [];
      if (q && exactOrganizations.length === 0) {
        for (const candidate of fallbackCandidates) {
          const candidateData = (await searchOrganizations({
            q: candidate,
            page,
            state,
            ntee: nteeId,
            c_code: cCodeId,
          })) as ProPublicaSearchResponse;
          const candidateOrganizations = candidateData.organizations ?? [];
          if (candidateOrganizations.length > 0) {
            data = candidateData;
            queryUsed = candidate;
            queryStrategy = "fallback";
            break;
          }
        }
      }
    } catch (err) {
      upstreamError = err instanceof Error ? err : new Error("Search failed");
    }

    if (!data) {
      if (localData.results.length > 0) {
        return Response.json({
          results: localData.results,
          totalResults: localData.totalResults,
          numPages: 1,
          curPage: page,
          queryUsed,
          queryStrategy,
          fallbackCandidates,
          dataSource: "stored_fallback",
        });
      }
      throw upstreamError ?? new Error("Search failed");
    }

    const organizations = data.organizations ?? [];
    const mappedResults: CharitySearchResult[] = organizations.map(toSearchResult);
    const mergedByEin = new Map<string, CharitySearchResult>();
    for (const result of [...localData.results, ...mappedResults]) {
      if (!mergedByEin.has(result.ein)) {
        mergedByEin.set(result.ein, result);
      }
    }

    const rankQuery = queryUsed ?? q ?? "";
    const results = sortCharityResultsByRelevance(
      Array.from(mergedByEin.values()),
      rankQuery
    );
    const pagedResults = results.slice(0, SEARCH_PAGE_SIZE);

    return Response.json({
      results: pagedResults,
      totalResults: Math.max(
        data.total_results ?? 0,
        localData.totalResults,
        results.length
      ),
      numPages: data.num_pages ?? 0,
      curPage: data.cur_page ?? 0,
      queryUsed,
      queryStrategy,
      fallbackCandidates,
      dataSource: localData.results.length > 0 ? "merged" : "live",
      upstreamError: upstreamError?.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
