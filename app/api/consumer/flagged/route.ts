import { searchComplaints } from "@/lib/cfpb";
import { buildConsumerSignals, computeConsumerMetrics } from "@/lib/consumer-analysis";
import {
  getStoredFlaggedConsumerCompanies,
  hasLocalConsumerMirror,
  CONSUMER_PROBE_COMPANIES,
} from "@/lib/consumer-read";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: unknown; expires: number } | null = null;

export async function GET() {
  if (cache && Date.now() < cache.expires) {
    return Response.json(cache.data);
  }

  try {
    if (await hasLocalConsumerMirror()) {
      const payload = await getStoredFlaggedConsumerCompanies();
      cache = { data: payload, expires: Date.now() + CACHE_TTL };
      return Response.json(payload);
    }

    const results = await Promise.all(
      CONSUMER_PROBE_COMPANIES.map(async (company) => {
        try {
          const data = await searchComplaints(company, 1, 25);
          const complaints = data.hits.hits.map((h) => h._source);
          const total = data.hits.total.value;
          const metrics = computeConsumerMetrics(complaints);
          const riskSignals = buildConsumerSignals(complaints);
          const riskScore = compositeScore(riskSignals);
          return { company, total, metrics, riskSignals, riskScore };
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
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
