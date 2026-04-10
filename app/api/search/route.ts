/**
 * Search API Endpoint
 *
 * Provides fast, full-text search across all entities using Meilisearch.
 * Supports filtering, faceting, sorting, and autocomplete.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchAll,
  searchCharities,
  searchCorporations,
  getAutocompleteSuggestions,
  getFacetDistribution,
  checkHealth,
  INDEX_NAMES,
} from "@/lib/search";
import { prisma } from "@/lib/db";

/**
 * Compute risk level from risk score
 */
function getRiskLevel(score: number | undefined): string {
  if (score === undefined) return "unknown";
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

// In-memory rate limit tracking (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const store = rateLimitStore.get(ip);

  if (!store || now > store.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT.windowMs });
    return true;
  }

  if (store.count >= RATE_LIMIT.maxRequests) {
    return false;
  }

  store.count++;
  return true;
}

/**
 * GET /api/search
 *
 * Query parameters:
 * - q: Search query (required)
 * - type: Entity type filter (charity, corporation, etc.)
 * - state: State filter
 * - limit: Results per page (default: 20)
 * - offset: Pagination offset (default: 0)
 * - sortBy: Sort field (riskScore, name, createdAt)
 * - sortOrder: asc or desc
 * - facet: Comma-separated list of facets to include
 */
export async function GET(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "localhost";

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again in a minute.",
          retryAfter: 60,
        },
        { status: 429 },
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const entityType = searchParams.get("type");
    const state = searchParams.get("state")?.split(",");
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sortBy = searchParams.get("sortBy") || "relevance";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const facets = searchParams.get("facet")?.split(",").filter(Boolean);
    const autocomplete = searchParams.get("autocomplete") === "true";

    // Validate parameters
    if (limit > 100) {
      return NextResponse.json(
        { error: "Limit cannot exceed 100 results" },
        { status: 400 },
      );
    }

    if (offset < 0 || limit < 1) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    // Handle autocomplete requests
    if (autocomplete || !query || query.length === 0) {
      const suggestions = await getAutocompleteSuggestions(query, {
        limit: Math.min(limit, 10),
        entityType: entityType ? [entityType] : undefined,
      });

      return NextResponse.json({
        suggestions,
        isAutocomplete: true,
      });
    }

    // Build search options
    const searchOptions = {
      offset,
      limit,
      filters: {
        entityType: entityType
          ? [entityType as "charity" | "corporation"]
          : undefined,
        state: state && state.length > 0 ? state : undefined,
      },
      facets: facets && facets.length > 0 ? facets : undefined,
      sortBy:
        sortBy !== "relevance"
          ? [{ field: sortBy, order: sortOrder as "asc" | "desc" }]
          : undefined,
      attributesToRetrieve: [
        "entityId",
        "entityType",
        "name",
        "ein",
        "cik",
        "city",
        "state",
        "riskScore",
        "riskLevel",
        "regulatoryActions",
        "nteeCode",
        "industry",
      ],
    };

    // Execute search based on entity type
    let results;
    if (entityType === "charity") {
      results = await searchCharities(query, searchOptions);
    } else if (entityType === "corporation") {
      results = await searchCorporations(query, searchOptions);
    } else {
      results = await searchAll(query, searchOptions);
    }

    // Format results for API response
    const formattedResults = results.hits.map((hit) => ({
      entityId: hit.entityId,
      entityType: hit.entityType,
      name: hit.name,
      ein: hit.ein,
      cik: hit.cik,
      city: hit.city,
      state: hit.state,
      riskScore: hit.riskScore,
      riskLevel: getRiskLevel(hit.riskScore),
      regulatoryActionsCount: hit.regulatoryActions?.length || 0,
      nteeCode: hit.nteeCode,
      industry: hit.industry,
      matchHighlights: (hit as any).__serializedInfo?.matchedFields,
    }));

    return NextResponse.json({
      results: formattedResults,
      total: results.estimatedTotalHits,
      offset: results.offset,
      limit: results.limit,
      processingTimeMs: results.processingTimeMs,
      query: results.query,
      facets: results.facets,
      hasMore: results.offset + results.limit < results.estimatedTotalHits,
    });
  } catch (error) {
    console.error("Search API error:", error);

    return NextResponse.json(
      {
        error: "Search service unavailable",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 503 },
    );
  }
}

/**
 * POST /api/search
 *
 * Supports advanced search with complex filters via request body.
 *
 * Request body:
 * {
 *   query: string,
 *   filters: {
 *     entityType: string[],
 *     state: string[],
 *     riskScoreRange: [number, number],
 *     hasRegulatoryActions: boolean,
 *     riskLevel: 'low' | 'medium' | 'high' | 'critical'
 *   },
 *   sortBy: string,
 *   sortOrder: 'asc' | 'desc',
 *   limit: number,
 *   offset: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "localhost";

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please try again in a minute.",
          retryAfter: 60,
        },
        { status: 429 },
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      query = "",
      filters = {},
      sortBy = "relevance",
      sortOrder = "desc",
      limit = 20,
      offset = 0,
    } = body;

    // Validate parameters
    if (limit > 100) {
      return NextResponse.json(
        { error: "Limit cannot exceed 100 results" },
        { status: 400 },
      );
    }

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 },
      );
    }

    // Build search options
    const searchOptions = {
      offset,
      limit,
      filters: {
        entityType: filters.entityType,
        state: filters.state,
        riskScoreRange: filters.riskScoreRange,
        riskLevel: filters.riskLevel,
        hasRegulatoryActions: filters.hasRegulatoryActions,
        nteeCodes: filters.nteeCodes,
        industries: filters.industries,
        regulatoryActionSources: filters.regulatoryActionSources,
      },
      sortBy:
        sortBy !== "relevance"
          ? [{ field: sortBy, order: sortOrder }]
          : undefined,
      facets: filters.facets,
    };

    // Execute search
    const results = await searchAll(query, searchOptions);

    // Format results
    const formattedResults = results.hits.map((hit) => ({
      entityId: hit.entityId,
      entityType: hit.entityType,
      name: hit.name,
      ein: hit.ein,
      cik: hit.cik,
      city: hit.city,
      state: hit.state,
      riskScore: hit.riskScore,
      riskLevel: getRiskLevel(hit.riskScore),
      regulatoryActionsCount: hit.regulatoryActions?.length || 0,
      nteeCode: hit.nteeCode,
      industry: hit.industry,
      categoryScores: hit.categoryScores,
    }));

    return NextResponse.json({
      results: formattedResults,
      total: results.estimatedTotalHits,
      offset: results.offset,
      limit: results.limit,
      processingTimeMs: results.processingTimeMs,
      query: results.query,
      facets: results.facets,
      hasMore: results.offset + results.limit < results.estimatedTotalHits,
    });
  } catch (error) {
    console.error("Advanced search API error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Search service unavailable",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 503 },
    );
  }
}

// Note: Health check should be a separate endpoint at /api/search/health/route.ts
// This is not exported here as it's not a valid Next.js Route handler
