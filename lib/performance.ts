/**
 * Performance Monitoring — API and Database latency tracking.
 *
 * Provides:
 * - Request latency tracking with percentiles (p50, p95, p99)
 * - Database query latency tracking
 * - In-memory metrics store (exported via /api/metrics)
 * - Simple, zero-dependency approach (no Prometheus client needed)
 *
 * In production, pipe these metrics to Prometheus, Datadog, or similar.
 */

import { logger } from "./logger";

// ─── Types ─────────────────────────────────────────────────────────────

export interface LatencyEntry {
  route: string;
  method: string;
  status: number;
  latencyMs: number;
  timestamp: number;
}

export interface DbLatencyEntry {
  query: string;
  latencyMs: number;
  timestamp: number;
}

export interface ApiMetricsSnapshot {
  uptimeSeconds: number;
  totalRequests: number;
  activeRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errors5xx: number;
  routes: Record<string, {
    count: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errors: number;
  }>;
  dbQueries: {
    total: number;
    avgLatencyMs: number;
    slowQueries: number; // > 100ms
    slowestQueryMs: number;
  };
}

// ─── Configuration ─────────────────────────────────────────────────────

const MAX_ENTRIES = 10000; // Ring buffer size
const DB_SLOW_THRESHOLD_MS = 100; // Queries > 100ms are "slow"
const METRICS_RETENTION_MS = 5 * 60 * 1000; // Keep 5 minutes of data

// ─── State ─────────────────────────────────────────────────────────────

const startTime = Date.now();
let activeRequests = 0;

const apiLatencyBuffer: LatencyEntry[] = [];
const dbLatencyBuffer: DbLatencyEntry[] = [];

// ─── Cleanup (run every minute) ────────────────────────────────────────

setInterval(() => {
  const cutoff = Date.now() - METRICS_RETENTION_MS;

  while (apiLatencyBuffer.length > 0 && apiLatencyBuffer[0].timestamp < cutoff) {
    apiLatencyBuffer.shift();
  }

  while (dbLatencyBuffer.length > 0 && dbLatencyBuffer[0].timestamp < cutoff) {
    dbLatencyBuffer.shift();
  }
}, 60000);

// ─── Percentile Helper ─────────────────────────────────────────────────

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

// ─── API Latency Tracking ──────────────────────────────────────────────

/**
 * Create a latency tracker for an API request.
 * Call this at the start of a request, then call .finish(status) when done.
 */
export function trackApiLatency(
  route: string,
  method: string
): { finish: (status: number) => void } {
  const start = Date.now();
  activeRequests++;

  return {
    finish: (status: number) => {
      const latencyMs = Date.now() - start;
      activeRequests--;

      const entry: LatencyEntry = {
        route,
        method,
        status,
        latencyMs,
        timestamp: Date.now(),
      };

      // Add to ring buffer
      apiLatencyBuffer.push(entry);
      if (apiLatencyBuffer.length > MAX_ENTRIES) {
        apiLatencyBuffer.shift();
      }

      // Log slow requests (> 1s)
      if (latencyMs > 1000) {
        logger.warn(
          `Slow API request: ${method} ${route} took ${latencyMs}ms`,
          { route, method, latencyMs, status },
          "performance"
        );
      }

      // Log errors
      if (status >= 500) {
        logger.error(
          `API error: ${method} ${route} returned ${status}`,
          { route, method, status, latencyMs },
          "performance"
        );
      }
    },
  };
}

/**
 * Middleware-friendly wrapper: returns a function to call on response.
 */
export function createApiMiddleware() {
  return async function apiMetricsMiddleware(
    request: Request,
    handler: (req: Request) => Promise<Response>,
  ): Promise<Response> {
    const url = new URL(request.url);
    // Normalize route: strip dynamic segments
    const route = url.pathname.replace(/\[.*?\]/g, ":id");
    const method = request.method;

    const tracker = trackApiLatency(route, method);

    try {
      const response = await handler(request);
      tracker.finish(response.status);
      return response;
    } catch {
      tracker.finish(500);
      throw new Error("Internal server error");
    }
  };
}

// ─── Database Latency Tracking ─────────────────────────────────────────

/**
 * Track a database query's latency.
 * Call this after a query completes.
 */
export function trackDbLatency(query: string, latencyMs: number): void {
  const entry: DbLatencyEntry = {
    query: query.slice(0, 200), // Truncate long queries
    latencyMs,
    timestamp: Date.now(),
  };

  dbLatencyBuffer.push(entry);
  if (dbLatencyBuffer.length > MAX_ENTRIES) {
    dbLatencyBuffer.shift();
  }

  // Log slow queries
  if (latencyMs > DB_SLOW_THRESHOLD_MS) {
    logger.warn(
      `Slow database query (${latencyMs}ms): ${query.slice(0, 100)}...`,
      { query: query.slice(0, 100), latencyMs },
      "performance"
    );
  }
}

/**
 * Wrap a Prisma query with latency tracking.
 */
export async function withDbTracking<T>(
  queryName: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const latencyMs = Date.now() - start;
    trackDbLatency(queryName, latencyMs);
    return result;
  } catch (error) {
    const latencyMs = Date.now() - start;
    trackDbLatency(queryName, latencyMs);
    throw error;
  }
}

// ─── Metrics Snapshot ──────────────────────────────────────────────────

/**
 * Generate a metrics snapshot for the /api/metrics endpoint.
 */
export function getMetricsSnapshot(): ApiMetricsSnapshot {
  const now = Date.now();

  // API metrics
  const apiLatencies = apiLatencyBuffer.map((e) => e.latencyMs).sort((a, b) => a - b);
  const apiAvg = apiLatencies.length
    ? apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length
    : 0;

  // Per-route metrics
  const routes: Record<string, { count: number; avgLatencyMs: number; p95LatencyMs: number; errors: number }> = {};

  for (const entry of apiLatencyBuffer) {
    const key = `${entry.method} ${entry.route}`;
    if (!routes[key]) {
      routes[key] = { count: 0, avgLatencyMs: 0, p95LatencyMs: 0, errors: 0 };
    }
    routes[key].count++;
    routes[key].avgLatencyMs += entry.latencyMs;
    if (entry.status >= 500) routes[key].errors++;
  }

  // Finalize per-route averages
  for (const key of Object.keys(routes)) {
    const r = routes[key];
    r.avgLatencyMs = r.count > 0 ? r.avgLatencyMs / r.count : 0;

    // Calculate p95 for this route
    const routeLatencies = apiLatencyBuffer
      .filter((e) => `${e.method} ${e.route}` === key)
      .map((e) => e.latencyMs)
      .sort((a, b) => a - b);
    r.p95LatencyMs = percentile(routeLatencies, 95);
  }

  // Database metrics
  const dbLatencies = dbLatencyBuffer.map((e) => e.latencyMs);
  const dbAvg = dbLatencies.length
    ? dbLatencies.reduce((a, b) => a + b, 0) / dbLatencies.length
    : 0;
  const slowQueries = dbLatencies.filter((l) => l > DB_SLOW_THRESHOLD_MS).length;
  const slowestQuery = dbLatencies.length ? Math.max(...dbLatencies) : 0;

  // 5xx errors
  const errors5xx = apiLatencyBuffer.filter((e) => e.status >= 500).length;

  return {
    uptimeSeconds: Math.floor((now - startTime) / 1000),
    totalRequests: apiLatencyBuffer.length,
    activeRequests,
    avgLatencyMs: Math.round(apiAvg * 100) / 100,
    p50LatencyMs: percentile(apiLatencies, 50),
    p95LatencyMs: percentile(apiLatencies, 95),
    p99LatencyMs: percentile(apiLatencies, 99),
    errors5xx,
    routes,
    dbQueries: {
      total: dbLatencyBuffer.length,
      avgLatencyMs: Math.round(dbAvg * 100) / 100,
      slowQueries,
      slowestQueryMs: slowestQuery,
    },
  };
}

// ─── Health Summary ────────────────────────────────────────────────────

/**
 * Get a simple health summary for the /api/health endpoint.
 */
export function getHealthSummary(): {
  performance: {
    status: "healthy" | "degraded" | "unhealthy";
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorRate: number;
  };
} {
  const snapshot = getMetricsSnapshot();
  const errorRate = snapshot.totalRequests > 0
    ? snapshot.errors5xx / snapshot.totalRequests
    : 0;

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";

  if (errorRate > 0.1 || snapshot.p95LatencyMs > 5000) {
    status = "unhealthy";
  } else if (errorRate > 0.05 || snapshot.p95LatencyMs > 2000) {
    status = "degraded";
  }

  return {
    performance: {
      status,
      avgLatencyMs: snapshot.avgLatencyMs,
      p95LatencyMs: snapshot.p95LatencyMs,
      errorRate: Math.round(errorRate * 10000) / 10000,
    },
  };
}
