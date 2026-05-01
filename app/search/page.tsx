"use client";

import Link from "next/link";
import { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/ErrorState";
import { CenteredLoading } from "@/components/ui/LoadingSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { CategoryIcon, IconAlertTriangle } from "@/components/ui/Icons";
import type { CategoryIconName } from "@/components/ui/Icons";
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
  const [processingTime, setProcessingTime] = useState(0);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

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

  async function performSearch(searchQuery: string, targetPage: number = page) {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotal(0);
      setSearchPerformed(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const offset = (targetPage - 1) * LIMIT;
      const params = new URLSearchParams({
        q: searchQuery,
        limit: String(LIMIT),
        offset: String(offset),
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
          setError("Search service is currently unavailable.");
        } else {
          setError(
            errorData.message || `Search failed: ${response.statusText}`,
          );
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

  // Debounced search — reset to page 1 when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length > 0) {
        setPage(1); // Reset to page 1 on filter change
        performSearch(query, 1);
      } else {
        setResults([]);
        setTotal(0);
        setSearchPerformed(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, entityType, state]);

  // Search on page change only (not on filter change)
  useEffect(() => {
    if (searchPerformed && query.trim().length > 0 && page > 1) {
      performSearch(query, page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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

  function getCategoryIconName(type?: string): CategoryIconName {
    const category = CATEGORIES.find((c) => c.searchType === type);
    return (category?.iconName as CategoryIconName) ?? "shield";
  }

  // Validate that an EIN looks like an actual EIN (9 digits, optionally with dashes)
  function isValidEin(ein: string | undefined): boolean {
    if (!ein) return false;
    // EIN format: 99-1234567 or 991234567
    return /^\d{2}-?\d{7}$/.test(ein);
  }

  // Validate that a CIK looks like an actual CIK (digits only)
  function isValidCik(cik: string | undefined): boolean {
    if (!cik) return false;
    return /^\d+$/.test(cik);
  }

  function getEntityLink(result: SearchResult) {
    const entityType = result.entityType?.toLowerCase();
    if (!entityType) return `/search?q=${encodeURIComponent(result.name)}`;

    const searchFallback = `/search?q=${encodeURIComponent(result.name)}&type=${entityType}`;

    switch (entityType) {
      case "charity":
        // Prefer EIN for clean URLs, but entityId (UUID) also works
        // The charity API resolves UUIDs to EINs automatically
        if (isValidEin(result.ein)) {
          return `/charities/${result.ein}`;
        }
        if (result.entityId) {
          return `/charities/${result.entityId}`;
        }
        return searchFallback;
      case "corporation":
        // Use CIK for corporate links (required by detail page API)
        if (isValidCik(result.cik)) {
          return `/corporate/company/${result.cik}`;
        }
        if (result.entityId) {
          return `/corporate/company/${result.entityId}`;
        }
        return searchFallback;
      case "politician":
        return result.entityId
          ? `/political/candidate/${result.entityId}`
          : searchFallback;
      case "government_contractor":
        return result.entityId
          ? `/government/${result.entityId}`
          : searchFallback;
      case "healthcare_provider":
        return result.entityId
          ? `/healthcare/${result.entityId}`
          : searchFallback;
      case "consumer_entity":
        return result.entityId
          ? `/consumer/${result.entityId}`
          : searchFallback;
      default:
        return searchFallback;
    }
  }

  // Handle search result clicks to ensure proper navigation
  const handleResultClick = useCallback(
    (result: SearchResult) => (e: React.MouseEvent) => {
      const link = getEntityLink(result);
      // If the link would be a search fallback, let the default behavior handle it
      if (!link.startsWith("/search")) {
        // For direct entity links, use programmatic navigation to ensure correct routing
        e.preventDefault();
        router.push(link);
      }
    },
    [router],
  );

  function filterByRiskLevel(results: SearchResult[]): SearchResult[] {
    if (riskLevel === "all") return results;
    return results.filter(
      (result) => result.riskLevel?.toLowerCase() === riskLevel,
    );
  }

  const filteredResults = filterByRiskLevel(results);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function clearFilters() {
    setEntityType("all");
    setRiskLevel("all");
    setState("");
    setPage(1);
  }

  const hasActiveFilters =
    entityType !== "all" || riskLevel !== "all" || state !== "";

  return (
    <div className="space-y-6">
      {/* ===== Search Form ===== */}
      <section>
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search input row */}
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
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                showFilters || hasActiveFilters
                  ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {hasActiveFilters && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] text-white">
                  {
                    [
                      entityType !== "all",
                      riskLevel !== "all",
                      state !== "",
                    ].filter(Boolean).length
                  }
                </span>
              )}
            </button>
          </div>

          {/* Collapsible filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-4 items-start pt-2 animate-fade-in">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Category
                </label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="all">All Categories</option>
                  {getActiveCategories().map((cat) => (
                    <option key={cat.slug} value={cat.searchType || cat.slug}>
                      {cat.navLabel || cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Risk Level
                </label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  {RISK_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  State
                </label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  {STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

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
          )}

          {/* Active filter chips (when filters hidden but active) */}
          {!showFilters && hasActiveFilters && (
            <div className="flex flex-wrap gap-2 pt-1">
              {entityType !== "all" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                  {getActiveCategories().find(
                    (c) => c.searchType === entityType,
                  )?.navLabel || entityType}
                  <button
                    type="button"
                    onClick={() => setEntityType("all")}
                    className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-100"
                  >
                    ×
                  </button>
                </span>
              )}
              {riskLevel !== "all" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} risk
                  <button
                    type="button"
                    onClick={() => setRiskLevel("all")}
                    className="ml-0.5 hover:text-amber-900 dark:hover:text-amber-100"
                  >
                    ×
                  </button>
                </span>
              )}
              {state && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200">
                  {state}
                  <button
                    type="button"
                    onClick={() => setState("")}
                    className="ml-0.5 hover:text-green-900 dark:hover:text-green-100"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}
        </form>

        {/* Stats + Pagination info */}
        {(results.length > 0 || total > 0) && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>
                <strong className="text-gray-900 dark:text-white">
                  {total.toLocaleString()}
                </strong>{" "}
                results
              </span>
              {processingTime > 0 && (
                <>
                  <span>·</span>
                  <span>{processingTime}ms</span>
                </>
              )}
            </div>
            {totalPages > 1 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== Error Display ===== */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ===== Results ===== */}
      {loading && results.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} variant="bordered" className="p-4 animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </Card>
          ))}
        </div>
      ) : filteredResults.length > 0 ? (
        <section className="space-y-3">
          {filteredResults.map((result, index) => {
            const linkUrl = getEntityLink(result);
            return (
              <Link
                key={`${result.entityType}-${result.entityId}-${index}`}
                href={linkUrl}
                onClick={handleResultClick(result)}
                className="block p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:shadow-md transition-all hover:border-gray-300 dark:hover:border-gray-600"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="text-red-500">
                        <CategoryIcon
                          name={getCategoryIconName(result.entityType)}
                          className="w-5 h-5"
                        />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                        {result.name}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {result.ein && (
                        <span>
                          EIN:{" "}
                          <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                            {result.ein}
                          </code>
                        </span>
                      )}
                      {result.cik && (
                        <span>
                          CIK:{" "}
                          <code className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                            {result.cik}
                          </code>
                        </span>
                      )}
                      {(result.city || result.state) && (
                        <span>
                          {result.city}
                          {result.city && result.state ? ", " : ""}
                          {result.state}
                        </span>
                      )}
                      {result.industry && <span>{result.industry}</span>}
                    </div>

                    {/* Risk indicators */}
                    {(result.riskScore !== undefined ||
                      result.regulatoryActionsCount) && (
                      <div className="flex flex-wrap gap-2">
                        {result.riskLevel && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(result.riskLevel)}`}
                          >
                            {result.riskLevel === "critical" ? (
                              <IconAlertTriangle className="w-3 h-3 inline mr-0.5" />
                            ) : null}
                            {result.riskLevel.charAt(0).toUpperCase() +
                              result.riskLevel.slice(1)}
                            {result.riskScore !== undefined && (
                              <span className="ml-1 opacity-75">
                                ({result.riskScore})
                              </span>
                            )}
                          </span>
                        )}
                        {result.regulatoryActionsCount &&
                          result.regulatoryActionsCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                              <IconAlertTriangle className="w-3 h-3" />
                              {result.regulatoryActionsCount} actions
                            </span>
                          )}
                      </div>
                    )}
                  </div>

                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 flex-shrink-0">
                    {result.entityType?.replace("_", " ").toUpperCase()}
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : query && !loading ? (
        <EmptyState
          title="No results found"
          description={
            results.length === 0 && filteredResults.length === 0
              ? "Try adjusting your search or filters."
              : "No results match the selected filters. Try clearing your filters."
          }
          actionLabel={riskLevel !== "all" ? "Clear risk filter" : undefined}
          onAction={riskLevel !== "all" ? () => setRiskLevel("all") : undefined}
          illustrations="search"
        />
      ) : (
        /* ===== Initial empty state ===== */
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-60">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Search the database
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Enter a name, EIN, CIK, or keyword above to search across all
            categories.
          </p>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredResults.length > 0 && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={LIMIT}
          onPageChange={(newPage) => {
            setPage(newPage);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-12">
          <CenteredLoading label="Loading search..." />
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
