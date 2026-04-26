"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/ErrorState";
import { CenteredLoading } from "@/components/ui/LoadingSkeleton";
import { CATEGORIES, getActiveCategories } from "@/lib/categories";

interface SearchResult {
  entityId: string;
  entityType:
    | "charity"
    | "corporation"
    | "politician"
    | "government_contractor"
    | "healthcare_provider"
    | "consumer_entity";
  name: string;
  ein?: string;
  cik?: string;
  city?: string;
  state?: string;
  riskScore?: number;
  riskLevel?: string;
  regulatoryActionsCount?: number;
  nteeCode?: string;
  industry?: string;
  matchHighlights?: any[];
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  offset: number;
  limit: number;
  processingTimeMs: number;
  query: string;
  facets?: any;
  hasMore: boolean;
}

const RISK_LEVELS = [
  { value: "all", label: "All Risk Levels" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATES = [
  { value: "", label: "All States" },
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

// Separate component that uses useSearchParams
function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL params
  const initialQuery = searchParams.get("q") || "";
  const initialType = searchParams.get("type") || "all";

  const [query, setQuery] = useState(initialQuery);
  const [entityType, setEntityType] = useState(initialType);
  const [riskLevel, setRiskLevel] = useState("all");
  const [state, setState] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [processingTime, setProcessingTime] = useState(0);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const LIMIT = 25;

  // Update URL when filters change
  useEffect(() => {
    if (searchPerformed) {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (entityType !== "all") params.set("type", entityType);
      if (state) params.set("state", state);
      if (riskLevel !== "all") params.set("risk", riskLevel);

      const newUrl = params.toString() ? `?${params.toString()}` : "";
      router.push(`/search${newUrl}`, { scroll: false });
    }
  }, [query, entityType, state, riskLevel, searchPerformed, router]);

  async function performSearch(searchQuery: string) {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotal(0);
      setSearchPerformed(false);
      return;
    }

    setLoading(true);
    setError(null);
    setPage(1); // Reset to first page on new search

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: String(LIMIT),
        offset: "0",
      });

      if (entityType !== "all") {
        params.set("type", entityType);
      }

      if (state) {
        params.set("state", state);
      }

      const response = await fetch(`/api/search?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503) {
          setError("Search service is currently unavailable. Please try again later.");
        } else {
          setError(errorData.message || `Search failed: ${response.statusText}`);
        }
        setResults([]);
        setTotal(0);
        setSearchPerformed(true);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as SearchResponse;

      setResults(data.results || []);
      setTotal(data.total || 0);
      setProcessingTime(data.processingTimeMs || 0);
      setSearchPerformed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setTotal(0);
      setSearchPerformed(true);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    performSearch(query);
  }

  // Debounced search for better UX
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length > 0) {
        performSearch(query);
      } else {
        setResults([]);
        setTotal(0);
        setSearchPerformed(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, entityType, state]);

  function getRiskColor(level?: string) {
    switch (level?.toLowerCase()) {
      case "critical":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  }

  function getCategoryIcon(type?: string) {
    const category = CATEGORIES.find((c) => c.searchType === type);
    return category?.icon ?? "📋";
  }

  function getEntityLink(entityType?: string, entityId?: string) {
    if (!entityType || !entityId) return "#";

    switch (entityType.toLowerCase()) {
      case "charity":
        return `/charities/${entityId}`;
      case "corporation":
        return `/corporate/company/${entityId}`;
      case "politician":
        return `/political/candidate/${entityId}`;
      case "government_contractor":
        return `/government/${entityId}`;
      case "healthcare_provider":
        return `/healthcare/${entityId}`;
      case "consumer_entity":
        return `/consumer/${entityId}`;
      default:
        return `/#${entityId}`;
    }
  }

  function filterByRiskLevel(results: SearchResult[]): SearchResult[] {
    if (riskLevel === "all") return results;

    return results.filter(
      (result) => result.riskLevel?.toLowerCase() === riskLevel,
    );
  }

  const filteredResults = filterByRiskLevel(results);

  // Clear all filters
  function clearFilters() {
    setEntityType("all");
    setRiskLevel("all");
    setState("");
  }

  // Check if any filters are active
  const hasActiveFilters = entityType !== "all" || riskLevel !== "all" || state !== "";

  return (
    <div className="space-y-8">
      {/* Header */}
      <section>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Unified Fraud Search
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search across all categories: charities, corporations, politicians,
          healthcare providers, and consumer companies. See fraud scores and
          risk indicators in real-time.
        </p>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, EIN, CIK, or keywords..."
              className="flex-1 min-w-[300px]"
              aria-label="Search all entities"
            />
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="px-6"
            >
              {loading ? "Searching…" : "Search"}
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-center">
            {/* Entity Type Filter */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="all">All Categories</option>
                {getActiveCategories().map((cat) => (
                  <option key={cat.slug} value={cat.searchType || cat.slug}>
                    {cat.navLabel || cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Risk Level Filter */}
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Risk Level
              </label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                {RISK_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            {/* State Filter */}
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                {STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={clearFilters}
                  className="text-sm"
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
        </form>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {entityType !== "all" && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                Category: {getActiveCategories().find((c) => c.searchType === entityType)?.navLabel || entityType}
                <button
                  onClick={() => setEntityType("all")}
                  className="ml-1 hover:text-blue-900 dark:hover:text-blue-100"
                >
                  ×
                </button>
              </span>
            )}
            {riskLevel !== "all" && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                Risk: {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
                <button
                  onClick={() => setRiskLevel("all")}
                  className="ml-1 hover:text-amber-900 dark:hover:text-amber-100"
                >
                  ×
                </button>
              </span>
            )}
            {state && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200">
                State: {state}
                <button
                  onClick={() => setState("")}
                  className="ml-1 hover:text-green-900 dark:hover:text-green-100"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        {(results.length > 0 || total > 0) && (
          <div className="mt-4 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>
              Total results: <strong>{total.toLocaleString()}</strong>
            </span>
            {processingTime > 0 && (
              <>
                <span>•</span>
                <span>
                  Processed in: <strong>{processingTime}ms</strong>
                </span>
              </>
            )}
          </div>
        )}
      </section>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {loading && results.length === 0 ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i} variant="bordered" className="p-4 animate-pulse">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </Card>
          ))}
        </div>
      ) : filteredResults.length > 0 ? (
        <>
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Search Results ({filteredResults.length})
            </h2>

            <div className="space-y-3">
              {filteredResults.map((result, index) => (
                <a
                  key={`${result.entityType}-${result.entityId}-${index}`}
                  href={getEntityLink(result.entityType, result.entityId)}
                  className="block p-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow hover:border-gray-300 dark:hover:border-gray-600"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Header with icon and name */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">
                          {getCategoryIcon(result.entityType)}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                          {result.name}
                        </h3>
                      </div>

                      {/* Entity details */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {result.ein && (
                          <span>
                            EIN: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{result.ein}</code>
                          </span>
                        )}
                        {result.cik && (
                          <span>
                            CIK: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{result.cik}</code>
                          </span>
                        )}
                        {(result.city || result.state) && (
                          <span>
                            {result.city}
                            {result.city && result.state ? ", " : ""}
                            {result.state}
                          </span>
                        )}
                        {result.nteeCode && (
                          <span>NTEE: {result.nteeCode}</span>
                        )}
                        {result.industry && (
                          <span>Industry: {result.industry}</span>
                        )}
                      </div>

                      {/* Risk indicators */}
                      {(result.riskScore !== undefined ||
                        result.regulatoryActionsCount) && (
                        <div className="flex flex-wrap gap-2">
                          {result.riskLevel && (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(result.riskLevel)}`}>
                              {result.riskLevel === "critical" ? "🚨 " : ""}
                              Risk: {result.riskLevel.charAt(0).toUpperCase() + result.riskLevel.slice(1)}
                              {result.riskScore !== undefined && (
                                <span className="ml-1 opacity-75">
                                  ({result.riskScore})
                                </span>
                              )}
                            </span>
                          )}
                          {result.regulatoryActionsCount &&
                            result.regulatoryActionsCount > 0 && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                                ⚠️ {result.regulatoryActionsCount} regulatory actions
                              </span>
                            )}
                        </div>
                      )}

                      {/* Match highlights */}
                      {result.matchHighlights &&
                        result.matchHighlights.length > 0 && (
                          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                            <em>
                              Matched: {result.matchHighlights.join(", ")}
                            </em>
                          </p>
                        )}
                    </div>

                    {/* Entity type badge */}
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 flex-shrink-0">
                      {result.entityType?.replace("_", " ").toUpperCase()}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </>
      ) : query && !loading ? (
        <EmptyState
          title="No results found"
          description={
            results.length === 0 && filteredResults.length === 0
              ? "No results found for your search."
              : "No results match the selected filters."
          }
          actionLabel={riskLevel !== "all" ? "Clear risk level filter" : undefined}
          onAction={riskLevel !== "all" ? () => setRiskLevel("all") : undefined}
          illustrations="search"
        />
      ) : null}

      {/* Empty state */}
      {!query && !loading && !error && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Search Across All Categories
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Enter a search term to find charities, corporations, politicians,
            healthcare providers, and consumer companies. See fraud scores and
            risk indicators in real-time.
          </p>

          {/* Category cards */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {getActiveCategories().slice(0, 6).map((cat) => (
              <button
                key={cat.slug}
                onClick={() => {
                  setEntityType(cat.searchType || cat.slug);
                  performSearch("");
                }}
                className="card card-hover group p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors truncate">
                      {cat.navLabel || cat.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {cat.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="text-center py-12">
        <CenteredLoading label="Loading search..." />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}