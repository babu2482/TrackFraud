import { NextRequest } from "next/server";
import { getAwardDetail } from "@/lib/usaspending";
import { buildFraudMeter } from "@/lib/fraud-meter";
import { buildGovernmentSignals } from "@/lib/government-analysis";
import {
  getLocalGovernmentMirrorStatus,
  getStoredGovernmentAwardDetail,
  hasLocalGovernmentMirror,
} from "@/lib/government-read";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (await hasLocalGovernmentMirror()) {
      const stored = await getStoredGovernmentAwardDetail(id);
      if (stored) {
        const fraudMeter = buildFraudMeter({
          domain: "government",
          riskSignals: stored.riskSignals,
        });
        return Response.json({
          ...stored,
          fraudMeter,
        });
      }
    }

    const award = await getAwardDetail(id);
    const riskSignals = buildGovernmentSignals(award);
    const riskScore = compositeScore(riskSignals);
    const fraudMeter = buildFraudMeter({
      domain: "government",
      riskSignals,
    });
    const mirrorStatus = await getLocalGovernmentMirrorStatus();
    return Response.json(
      withMirrorMetadata(
        { ...award, riskSignals, riskScore, fraudMeter },
        { dataSource: "live", mirrorCoverage: mirrorStatus.coverage }
      )
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load award" }, { status: 500 });
  }
}
