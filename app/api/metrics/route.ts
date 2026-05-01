import { NextResponse } from "next/server";
import { getMetricsSnapshot } from "@/lib/performance";

/**
 * GET /api/metrics
 *
 * Returns performance metrics snapshot.
 * Includes API latency, database latency, and per-route breakdown.
 *
 * Cache-Control: no-store (metrics change rapidly)
 */
export async function GET() {
  try {
    const snapshot = getMetricsSnapshot();

    return NextResponse.json({
      status: "ok",
      collected_at: new Date().toISOString(),
      ...snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to collect metrics",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Disable caching for metrics endpoint
export const dynamic = "force-dynamic";
export const revalidate = 0;
