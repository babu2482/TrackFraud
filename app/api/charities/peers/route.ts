/**
 * Peer comparison: median program expense ratio for a given NTEE major group (1-10).
 * Cached 24h. Samples up to 10 orgs from search and uses their latest filing.
 */

import { NextRequest } from "next/server";
import { searchOrganizations, getOrganization } from "@/lib/api";
import { getCachedPeer, setCachedPeer, getCachedOrg, setCachedOrg } from "@/lib/cache";
import { getProgramExpenseRatio } from "@/lib/metrics";
import type { ProPublicaOrganization, ProPublicaFiling } from "@/lib/types";

interface ProPublicaSearchResponse {
  organizations?: ProPublicaOrganization[];
}

interface ProPublicaOrgResponse {
  organization?: ProPublicaOrganization;
  filings_with_data?: ProPublicaFiling[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nteeId = searchParams.get("ntee");
  const nteeNum = nteeId ? parseInt(nteeId, 10) : NaN;
  if (!nteeId || nteeNum < 1 || nteeNum > 10) {
    return Response.json(
      { error: "Query param ntee required (1-10)" },
      { status: 400 }
    );
  }

  const cached = getCachedPeer(nteeId);
  if (cached) {
    return Response.json({
      medianProgramRatio: cached.median,
      sampleSize: cached.sampleSize,
    });
  }

  try {
    const searchData = (await searchOrganizations({
      ntee: nteeNum,
      page: 0,
    })) as ProPublicaSearchResponse;

    const orgs = searchData.organizations ?? [];
    const sample = orgs.slice(0, 10);
    const ratios: number[] = [];

    for (const org of sample) {
      const ein = String(org.ein).padStart(9, "0");
      let data: ProPublicaOrgResponse | null = getCachedOrg(ein) as ProPublicaOrgResponse | null;
      if (!data) {
        try {
          data = (await getOrganization(ein)) as ProPublicaOrgResponse;
          setCachedOrg(ein, data);
        } catch {
          continue;
        }
      }

      const filings = data.filings_with_data ?? [];
      const latest = filings.sort((a, b) => (b.tax_prd ?? 0) - (a.tax_prd ?? 0))[0];
      if (latest) {
        const ratio = getProgramExpenseRatio(latest);
        if (ratio != null && !Number.isNaN(ratio)) ratios.push(ratio);
      }
    }

    let median: number | null = null;
    if (ratios.length > 0) {
      ratios.sort((a, b) => a - b);
      const mid = Math.floor(ratios.length / 2);
      median =
        ratios.length % 2 === 1
          ? ratios[mid]
          : (ratios[mid - 1] + ratios[mid]) / 2;
    }

    setCachedPeer(nteeId, median, ratios.length);

    return Response.json({
      medianProgramRatio: median,
      sampleSize: ratios.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Peer comparison failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
