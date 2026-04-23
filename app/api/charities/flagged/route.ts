import { prisma } from "@/lib/db";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

const CACHE_TTL = 15 * 60 * 1000;
let cache: { data: unknown; expires: number } | null = null;

export async function GET() {
  if (cache && Date.now() < cache.expires) {
    return Response.json(cache.data);
  }

  try {
    // Fetch charities with potential fraud signals
    const charities = await prisma.charityProfile.findMany({
      take: 20,
      select: {
        ein: true,
        subName: true,
        city: true,
        state: true,
        nteeCode: true,
        riskScore: true,
      },
    });

    const results = charities.map((c) => ({
      ein: c.ein,
      name: c.subName || "Unknown",
      city: c.city,
      state: c.state,
      nteeCode: c.nteeCode,
      riskScore: c.riskScore ?? 0,
      riskSignals: [],
    }));

    const flagged = results
      .filter((r) => r.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20);

    const payload = {
      results: flagged,
      generatedAt: new Date().toISOString(),
    };

    cache = { data: payload, expires: Date.now() + CACHE_TTL };
    return Response.json(payload);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}