import { NextRequest } from "next/server";
import { searchComplaints } from "@/lib/cfpb";
import {
  hasLocalConsumerMirror,
  searchStoredConsumerComplaints,
} from "@/lib/consumer-read";
import { buildFraudMeter } from "@/lib/fraud-meter";
import { buildConsumerSignals, computeConsumerMetrics } from "@/lib/consumer-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  if (!q) return Response.json({ error: "Query parameter q is required" }, { status: 400 });

  try {
    if (await hasLocalConsumerMirror()) {
      const stored = await searchStoredConsumerComplaints({ q, page });
      const fraudMeter = buildFraudMeter({
        domain: "consumer",
        riskSignals: stored.riskSignals,
      });
      return Response.json({
        ...stored,
        fraudMeter,
      });
    }

    const data = await searchComplaints(q, page);
    const complaints = data.hits.hits.map((h) => h._source);
    const total = data.hits.total.value;
    const metrics = computeConsumerMetrics(complaints);
    const riskSignals = buildConsumerSignals(complaints);
    const riskScore = compositeScore(riskSignals);
    const fraudMeter = buildFraudMeter({
      domain: "consumer",
      riskSignals,
    });
    return Response.json(
      withMirrorMetadata(
        {
          complaints,
          total,
          metrics,
          riskSignals,
          riskScore,
          fraudMeter,
          page,
        },
        {
          dataSource: "live",
          mirrorCoverage: "not-started",
        }
      )
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
