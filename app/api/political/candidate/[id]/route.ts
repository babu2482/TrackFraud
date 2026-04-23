import { NextRequest } from "next/server";
import {
  getCandidateDetail,
  getCandidateTotals,
  isFECRequestError,
} from "@/lib/fec";
import { buildFraudMeter } from "@/lib/fraud-meter";
import { buildPoliticalSignals } from "@/lib/political-analysis";
import { getStoredPoliticalCandidateDetail, hasLocalPoliticalMirror } from "@/lib/political-read";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (await hasLocalPoliticalMirror()) {
      const stored = await getStoredPoliticalCandidateDetail(id);
      if (!stored) {
        return Response.json({ error: "Candidate not found" }, { status: 404 });
      }
      const fraudMeter = buildFraudMeter({
        domain: "political",
        riskSignals: stored.riskSignals,
      });
      return Response.json({
        ...stored,
        fraudMeter,
      });
    }

    const [candidate, totals] = await Promise.all([
      getCandidateDetail(id),
      getCandidateTotals(id),
    ]);
    if (!candidate) {
      return Response.json({ error: "Candidate not found" }, { status: 404 });
    }
    const latestTotals = totals[0];
    const riskSignals = latestTotals ? buildPoliticalSignals(latestTotals) : [];
    const riskScore = compositeScore(riskSignals);
    const fraudMeter = buildFraudMeter({
      domain: "political",
      riskSignals,
    });
    return Response.json(
      withMirrorMetadata(
        { candidate, totals, riskSignals, riskScore, fraudMeter },
        { dataSource: "live", mirrorCoverage: "not-started" }
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load candidate";
    const status = isFECRequestError(err) ? err.status : 500;
    return Response.json({ error: message }, { status });
  }
}
