import {
  getCommitteeTotals,
  isFECRequestError,
  searchCommittees,
} from "@/lib/fec";
import {
  getStoredFlaggedPoliticalEntities,
  hasLocalPoliticalMirror,
} from "@/lib/political-read";
import { buildPoliticalSignals } from "@/lib/political-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: unknown; expires: number } | null = null;

export async function GET() {
  if (cache && Date.now() < cache.expires) {
    return Response.json(cache.data);
  }

  try {
    if (await hasLocalPoliticalMirror()) {
      const payload = await getStoredFlaggedPoliticalEntities();
      cache = { data: payload, expires: Date.now() + CACHE_TTL };
      return Response.json(payload);
    }

    const searchData = await searchCommittees("", 1);
    const committees = searchData.results.slice(0, 15);

    const results = await Promise.all(
      committees.map(async (c) => {
        try {
          const totals = await getCommitteeTotals(c.committee_id);
          const latest = totals[0];
          if (!latest) return null;
          const riskSignals = buildPoliticalSignals(latest);
          const riskScore = compositeScore(riskSignals);
          return {
            id: c.committee_id,
            name: c.name,
            type: c.committee_type_full,
            party: c.party_full,
            state: c.state,
            cycle: latest.cycle,
            receipts: latest.receipts,
            disbursements: latest.disbursements,
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

    const payload = withMirrorMetadata(
      { results: flagged, generatedAt: new Date().toISOString() },
      { dataSource: "live", mirrorCoverage: "not-started" }
    );
    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    return Response.json(payload);
  } catch (err) {
    const status = isFECRequestError(err) ? err.status : 500;
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status }
    );
  }
}
