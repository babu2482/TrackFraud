import { searchAwards } from "@/lib/usaspending";
import { buildGovernmentSignals } from "@/lib/government-analysis";
import {
  getLocalGovernmentMirrorStatus,
  getStoredFlaggedGovernmentAwards,
  hasLocalGovernmentMirror,
} from "@/lib/government-read";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: unknown; expires: number } | null = null;

export async function GET() {
  if (cache && Date.now() < cache.expires) {
    return Response.json(cache.data);
  }

  try {
    if (await hasLocalGovernmentMirror()) {
      const payload = await getStoredFlaggedGovernmentAwards();
      cache = { data: payload, expires: Date.now() + CACHE_TTL };
      return Response.json(payload);
    }

    const data = await searchAwards("contract", 1);
    const awards = data.results.slice(0, 20);

    const results = awards.map((a) => {
      const riskSignals = buildGovernmentSignals({
        total_obligation: a.Award_Amount,
        contract_data: {
          extent_competed_description: a.Award_Type,
        },
      });
      const riskScore = compositeScore(riskSignals);
      return {
        id: a.generated_internal_id,
        awardId: a.Award_ID,
        recipient: a.Recipient_Name,
        agency: a.Awarding_Agency,
        amount: a.Award_Amount,
        description: a.Description,
        riskSignals,
        riskScore,
      };
    });

    const flagged = results
      .filter((r) => r.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore);
    const mirrorStatus = await getLocalGovernmentMirrorStatus();

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
