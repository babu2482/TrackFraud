import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/health
 *
 * Returns system health status for the admin dashboard.
 * Checks database connectivity, Meilisearch availability, and overall system health.
 */

interface HealthResponse {
  health: {
    database: "healthy" | "degraded" | "down";
    meilisearch: "healthy" | "degraded" | "down";
    api: "healthy" | "degraded" | "down";
    lastChecked: string;
  };
  details: {
    databaseLatencyMs: number;
    meilisearchAvailable: boolean;
    meilisearchIndexCount: number;
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const health: {
    database: "healthy" | "degraded" | "down";
    meilisearch: "healthy" | "degraded" | "down";
    api: "healthy" | "degraded" | "down";
    lastChecked: string;
  } = {
    database: "healthy",
    meilisearch: "healthy",
    api: "healthy",
    lastChecked: new Date().toISOString(),
  };

  const details: {
    databaseLatencyMs: number;
    meilisearchAvailable: boolean;
    meilisearchIndexCount: number;
  } = {
    databaseLatencyMs: 0,
    meilisearchAvailable: false,
    meilisearchIndexCount: 0,
  };

  try {
    // Check database connectivity
    const dbCheckStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Date.now() - dbCheckStart;
      details.databaseLatencyMs = dbLatency;

      if (dbLatency > 1000) {
        health.database = "degraded";
      }
    } catch (error) {
      health.database = "down";
      console.error("Database health check failed:", error);
    }

    // Check Meilisearch connectivity
    const meilisearchUrl = process.env.MEILISEARCH_URL || "http://localhost:7700";
    const meilisearchApiKey = process.env.MEILISEARCH_API_KEY || "trackfraud-dev-master-key";
    const meilisearchHeaders = {
      Authorization: `Bearer ${meilisearchApiKey}`,
    };

    try {
      // Use the /health endpoint for proper health check
      const healthResponse = await fetch(`${meilisearchUrl}/health`, {
        method: "GET",
        headers: meilisearchHeaders,
        signal: AbortSignal.timeout(5000),
      });

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        details.meilisearchAvailable = true;

        // Check if we can list indexes
        try {
          const indexesResponse = await fetch(
            `${meilisearchUrl}/indexes`,
            {
              headers: meilisearchHeaders,
              signal: AbortSignal.timeout(5000),
            }
          );

          if (indexesResponse.ok) {
            const indexesData = await indexesResponse.json();
            details.meilisearchIndexCount = indexesData.results?.length || 0;
          }
        } catch (indexError) {
          // Ignore index count errors
          console.warn("Could not fetch Meilisearch index count:", indexError);
        }
      } else {
        health.meilisearch = "degraded";
        console.warn(
          `Meilisearch health check returned status ${healthResponse.status}`
        );
      }
    } catch (error) {
      health.meilisearch = "down";
      // Only log as error if not just a timeout/connection issue
      if (error instanceof Error && error.name !== "AbortError") {
        console.warn("Meilisearch health check failed:", error.message);
      }
    }

    // API is healthy if we got this far
    health.api = health.database !== "down" && health.meilisearch !== "down"
      ? "healthy"
      : "degraded";

    return NextResponse.json({ health, details });
  } catch (error) {
    console.error("Health check failed:", error);
    health.api = "down";
    health.database = "degraded";
    health.meilisearch = "degraded";

    return NextResponse.json(
      {
        health,
        details,
        error: "Health check failed",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 503 }
    );
  }
}
