import { getCompanySubmissions, extractRecentFilings, searchCompanies } from "@/lib/sec";
import { buildCorporateSignals } from "@/lib/corporate-analysis";
import {
  getLocalCorporateMirrorStatus,
  getStoredFlaggedCorporateCompanies,
  hasLocalCorporateMirror,
} from "@/lib/corporate-read";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: unknown; expires: number } | null = null;

export async function GET() {
  if (cache && Date.now() < cache.expires) {
    return Response.json(cache.data);
  }

  try {
    if (await hasLocalCorporateMirror()) {
      const payload = await getStoredFlaggedCorporateCompanies();
      cache = { data: payload, expires: Date.now() + CACHE_TTL };
      return Response.json(payload);
    }

    const companies = await searchCompanies("NT 10-K");
    const subset = companies.slice(0, 12);

    const results = await Promise.all(
      subset.map(async (c) => {
        if (!c.cik) return null;
        try {
          const subs = await getCompanySubmissions(c.cik);
          const filings = extractRecentFilings(subs, 30);
          const riskSignals = buildCorporateSignals(filings);
          const riskScore = compositeScore(riskSignals);
          return {
            cik: subs.cik,
            name: subs.name,
            tickers: subs.tickers,
            riskSignals,
            riskScore,
          };
        } catch {
          return null;
        }
      })
    );

    const flagged = results
      .filter((r): r is NonNullable<typeof r> => r != null && r.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore);
    const mirrorStatus = await getLocalCorporateMirrorStatus();

    const payload = withMirrorMetadata(
      { results: flagged, generatedAt: new Date().toISOString() },
      { dataSource: "live", mirrorCoverage: mirrorStatus.coverage }
    );
    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
