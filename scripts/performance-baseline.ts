/**
 * Performance baseline measurement for TrackFraud.
 *
 * Measures page load times and API response times for key endpoints.
 * Results are saved to docs/PERFORMANCE_BASELINE.md
 *
 * Usage: npx tsx scripts/performance-baseline.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Measurement {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number; // ms
  size: number; // bytes
  timestamp: string;
}

const ENDPOINTS = [
  // Pages
  { path: "/", method: "GET", name: "Homepage" },
  { path: "/search", method: "GET", name: "Search Page" },
  { path: "/charities", method: "GET", name: "Charities Category" },
  { path: "/corporate", method: "GET", name: "Corporate Category" },
  { path: "/government", method: "GET", name: "Government Category" },
  { path: "/healthcare", method: "GET", name: "Healthcare Category" },
  { path: "/political", method: "GET", name: "Political Category" },
  // API endpoints
  { path: "/api/charities?limit=10", method: "GET", name: "Charities API" },
  { path: "/api/corporate?limit=10", method: "GET", name: "Corporate API" },
  { path: "/api/government?limit=10", method: "GET", name: "Government API" },
  { path: "/api/health?check=1", method: "GET", name: "Health Check" },
  { path: "/api/search?q=charity&limit=10", method: "GET", name: "Search API" },
];

async function measureEndpoint(
  endpoint: (typeof ENDPOINTS)[0]
): Promise<Measurement> {
  const url = `${BASE_URL}${endpoint.path}`;
  const start = Date.now();

  let statusCode = 0;
  let size = 0;

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: { Accept: "application/json" },
    });

    statusCode = response.status;
    const data = await response.arrayBuffer();
    size = data.byteLength;
  } catch (error) {
    return {
      endpoint: endpoint.name,
      method: endpoint.method,
      statusCode: 0,
      responseTime: Date.now() - start,
      size: 0,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    endpoint: endpoint.name,
    method: endpoint.method,
    statusCode,
    responseTime: Date.now() - start,
    size,
    timestamp: new Date().toISOString(),
  };
}

async function measureDatabase(): Promise<{
  queryTime: number;
  recordCount: number;
}> {
  const start = Date.now();

  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const count = await prisma.charityProfile.count();
    const queryTime = Date.now() - start;

    await prisma.$disconnect();

    return { queryTime, recordCount: count };
  } catch {
    return { queryTime: Date.now() - start, recordCount: 0 };
  }
}

async function measureMeilisearch(): Promise<{
  searchTime: number;
  resultCount: number;
}> {
  const start = Date.now();

  try {
    const meilisearchModule = await import("meilisearch");
    // The meilisearch v0.57+ exports Meilisearch as a named export
    const Meilisearch = (meilisearchModule as any).Meilisearch;
    if (!Meilisearch) {
      return { searchTime: Date.now() - start, resultCount: 0 };
    }
    const client = new Meilisearch({
      host: process.env.MEILISEARCH_HOST || "http://127.0.0.1:7700",
      apiKey: process.env.MEILISEARCH_ADMIN_KEY || "",
    });

    const searchResult = await client
      .index("charities")
      .search("charity", { limit: 1 });

    const searchTime = Date.now() - start;

    return { searchTime, resultCount: (searchResult as any).estimatedTotalHits ?? 0 };
  } catch {
    return { searchTime: Date.now() - start, resultCount: 0 };
  }
}

async function main() {
  console.log("TrackFraud Performance Baseline");
  console.log("=".repeat(50));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log("");

  const measurements: Measurement[] = [];

  // Measure each endpoint
  for (const endpoint of ENDPOINTS) {
    // Run each endpoint 3 times and take average
    const times: number[] = [];
    let statusCode = 0;
    let size = 0;

    for (let i = 0; i < 3; i++) {
      const result = await measureEndpoint(endpoint);
      times.push(result.responseTime);
      statusCode = result.statusCode;
      size = result.size;
    }

    const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

    measurements.push({
      endpoint: endpoint.name,
      method: endpoint.method,
      statusCode,
      responseTime: avgTime,
      size,
      timestamp: new Date().toISOString(),
    });

    const status =
      statusCode === 0 ? "ERR" : statusCode < 300 ? "OK " : "WARN";
    console.log(
      `  ${status} ${endpoint.name.padEnd(30)} ${avgTime}ms ${size > 0 ? `(${(size / 1024).toFixed(1)}KB)` : ""}`
    );
  }

  // Measure database
  console.log("");
  console.log("Database Performance:");
  const dbResult = await measureDatabase();
  console.log(
    `  CharityProfile.count(): ${dbResult.queryTime}ms (${dbResult.recordCount.toLocaleString()} records)`
  );

  // Measure Meilisearch
  console.log("");
  console.log("Search Performance:");
  const searchResult = await measureMeilisearch();
  console.log(
    `  Meilisearch search: ${searchResult.searchTime}ms (${searchResult.resultCount.toLocaleString()} results)`
  );

  // Summary
  console.log("");
  console.log("Summary:");
  const okEndpoints = measurements.filter((m) => m.statusCode >= 200);
  const errorEndpoints = measurements.filter((m) => m.statusCode === 0);
  const avgResponseTime = Math.round(
    measurements.reduce((sum, m) => sum + m.responseTime, 0) /
      measurements.length
  );

  console.log(`  Endpoints responding: ${okEndpoints.length}/${measurements.length}`);
  console.log(`  Endpoints failing: ${errorEndpoints.length}`);
  console.log(`  Average response time: ${avgResponseTime}ms`);

  // Save to file
  const report = generateReport(measurements, dbResult, searchResult);
  const reportPath = join(__dirname, "../docs/PERFORMANCE_BASELINE.md");

  try {
    const { writeFileSync } = await import("fs");
    writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);
  } catch (e) {
    console.log(`\nCould not save report: ${e}`);
    console.log("Report content:");
    console.log(report);
  }
}

function generateReport(
  measurements: Measurement[],
  dbResult: { queryTime: number; recordCount: number },
  searchResult: { searchTime: number; resultCount: number }
): string {
  const okEndpoints = measurements.filter((m) => m.statusCode >= 200);
  const errorEndpoints = measurements.filter((m) => m.statusCode === 0);
  const avgResponseTime = Math.round(
    measurements.reduce((sum, m) => sum + m.responseTime, 0) /
      measurements.length
  );

  return `# Performance Baseline

> **Generated:** ${new Date().toISOString()}
> **Base URL:** ${BASE_URL}

## Summary

| Metric | Value |
|--------|-------|
| Endpoints responding | ${okEndpoints.length}/${measurements.length} |
| Endpoints failing | ${errorEndpoints.length} |
| Average response time | ${avgResponseTime}ms |
| Database query time | ${dbResult.queryTime}ms |
| Database record count | ${dbResult.recordCount.toLocaleString()} |
| Search query time | ${searchResult.searchTime}ms |
| Search result count | ${searchResult.resultCount.toLocaleString()} |

## Endpoint Results

| Endpoint | Status | Response Time | Size |
|----------|--------|---------------|------|
${measurements
  .map(
    (m) =>
      `| ${m.endpoint} | ${m.statusCode === 0 ? "ERR" : m.statusCode} | ${m.responseTime}ms | ${m.size > 0 ? (m.size / 1024).toFixed(1) + "KB" : "-"} |`
  )
  .join("\n")}

## Database

| Metric | Value |
|--------|-------|
| CharityProfile.count() | ${dbResult.queryTime}ms |
| Record count | ${dbResult.recordCount.toLocaleString()} |

## Search (Meilisearch)

| Metric | Value |
|--------|-------|
| Search query time | ${searchResult.searchTime}ms |
| Results | ${searchResult.resultCount.toLocaleString()} |
`;
}

main().catch((e) => {
  console.error("Performance baseline failed:", e);
  process.exit(1);
});