import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHealthSummary, getMetricsSnapshot } from "@/lib/performance";
import { getQueueHealth } from "@/lib/job-queues";
import { getRedisClient } from "@/lib/rate-limiter";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const check = searchParams.get("check"); // Optional specific check
  const verbose = searchParams.get("verbose") === "true";

  const health: Record<string, any> = {
    status: "unknown",
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // Check database connectivity
    if (!check || check === "db" || !check) {
      const start = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        health.checks.db = {
          status: "healthy",
          latency_ms: Date.now() - start,
        };
      } catch (dbError) {
        health.checks.db = {
          status: "unhealthy",
          error: String(dbError),
          latency_ms: Date.now() - start,
        };
      }
    }

    // Check Redis connectivity
    if (!check || check === "redis") {
      const start = Date.now();
      try {
        const redis = getRedisClient();
        if (redis) {
          await redis.ping();
          health.checks.redis = {
            status: "healthy",
            latency_ms: Date.now() - start,
          };
        } else {
          health.checks.redis = {
            status: "unhealthy",
            error: "Redis client not available",
          };
        }
      } catch (redisError) {
        health.checks.redis = {
          status: "unhealthy",
          error: String(redisError),
          latency_ms: Date.now() - start,
        };
      }
    }

    // Check Meilisearch connectivity
    if (!check || check === "search") {
      const start = Date.now();
      try {
        const meilisearchUrl = process.env.MEILISEARCH_URL;
        if (meilisearchUrl) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(`${meilisearchUrl}/health`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            health.checks.search = {
              status: "healthy",
              latency_ms: Date.now() - start,
            };
          } else {
            health.checks.search = {
              status: "unhealthy",
              error: `HTTP ${response.status}`,
            };
          }
        } else {
          health.checks.search = {
            status: "skipped",
            reason: "MEILISEARCH_URL not configured",
          };
        }
      } catch (error) {
        health.checks.search = { status: "unhealthy", error: String(error) };
      }
    }

    // Check job queues (optional, may fail if workers aren't running)
    if (!check || check === "queues") {
      try {
        const queueHealth = await getQueueHealth();
        health.checks.queues = {
          status: "healthy",
          queues: queueHealth,
        };
      } catch (error) {
        health.checks.queues = {
          status: "degraded",
          error: "Queue workers may not be running",
          detail: String(error),
        };
      }
    }

    // Add performance summary
    const perfSummary = getHealthSummary();
    health.performance = perfSummary.performance;

    // Overall status
    const allHealthy = Object.values(health.checks).every(
      (c: any) => c.status === "healthy" || c.status === "skipped",
    );

    if (allHealthy) {
      health.status = "healthy";
    } else if (health.performance?.status === "unhealthy") {
      health.status = "unhealthy";
    } else {
      health.status = "degraded";
    }

    // Verbose mode: include full metrics snapshot
    if (verbose) {
      health.metrics = getMetricsSnapshot();
    }

    const statusCode = health.status === "healthy" ? 200 : 503;
    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    health.status = "unhealthy";
    health.error = String(error);
    return NextResponse.json(health, { status: 503 });
  }
}
