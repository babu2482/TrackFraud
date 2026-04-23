"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Source {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  baseUrl: string | null;
  ingestionMode: string;
  refreshCadence: string | null;
  freshnessSlaHours: number | null;
  lastAttemptedSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastError: string | null;
  recordCount: number;
  hoursSinceSync: number | null;
  isFresh: boolean;
  hasActiveJob: boolean;
  activeJobProgress: number | null;
  activeJobId: string | null;
  supportsIncremental: boolean;
}

interface Summary {
  totalSources: number;
  freshSources: number;
  staleSources: number;
  neverSynced: number;
  activeJobs: number;
  totalRecords: number;
  sourcesWithError: number;
}

interface SystemHealth {
  database: "healthy" | "degraded" | "down";
  meilisearch: "healthy" | "degraded" | "down";
  api: "healthy" | "degraded" | "down";
  lastChecked: string;
}

interface IngestionRun {
  id: string;
  sourceSystemId: string;
  status: string;
  rowsRead: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsFailed: number;
  startedAt: Date | string;
  completedAt: Date | string | null;
  errorSummary: string | null;
  SourceSystem?: {
    name: string;
  };
}

type FilterStatus = "all" | "running" | "completed" | "never-synced" | "stale" | "error";
type SortBy = "name" | "records" | "last-sync" | "freshness";

export default function AdminDashboard() {
  const [sources, setSources] = useState<Source[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Ingestion history state
  const [ingestionHistory, setIngestionHistory] = useState<IngestionRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);

      const [sourcesRes, healthRes] = await Promise.all([
        fetch("/api/admin/sources", { cache: "no-store" }),
        fetch("/api/admin/health", { cache: "no-store" }),
      ]);

      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        if (data.sources) {
          setSources(data.sources);
          setSummary(data.summary);
        }
      } else {
        setError("Failed to fetch sources data");
      }

      if (healthRes.ok) {
        const data = await healthRes.json();
        setSystemHealth(data.health);
      }

      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIngestionHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await fetch("/api/admin/ingestion-history?days=7&page=1&limit=20", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.runs) {
          setIngestionHistory(data.runs);
        }
      }
    } catch (err) {
      console.error("Failed to fetch ingestion history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchIngestionHistory();
    // Poll every 30 seconds (reduced from 15 to reduce load)
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData, fetchIngestionHistory]);

  async function triggerIngestion(slug: string) {
    if (runningJob) {
      alert("Another job is already running. Please wait.");
      return;
    }

    setRunningJob(slug);
    try {
      const res = await fetch("/api/admin/trigger-ingestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Ingestion started for ${slug}! Job ID: ${data.jobId}`);
      } else {
        const errorData = await res.json();
        alert(`Failed: ${errorData.error}`);
      }
    } catch (err) {
      console.error("Failed to trigger ingestion:", err);
      alert("Failed to trigger ingestion. Check console for details.");
    } finally {
      setRunningJob(null);
      fetchDashboardData();
    }
  }

  function formatRecordCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  }

  function formatDateTime(date: Date | string | null | undefined): string {
    if (!date) return "Never";
    if (typeof date === "string") return new Date(date).toLocaleString();
    return date.toLocaleString();
  }

  function getStatusIcon(source: Source): React.JSX.Element {
    if (source.hasActiveJob) {
      return (
        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs">Running</span>
        </span>
      );
    }
    if (source.recordCount === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-xs">No data</span>
        </span>
      );
    }
    if (source.lastError) {
      return (
        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs">Error</span>
        </span>
      );
    }
    if (source.isFresh) {
      return (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs">Fresh</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-xs">Stale</span>
      </span>
    );
  }

  function getFilteredAndSortedSources(): Source[] {
    let filtered = [...sources];

    if (filterStatus === "running") {
      filtered = filtered.filter((s) => s.hasActiveJob);
    } else if (filterStatus === "never-synced") {
      filtered = filtered.filter((s) => s.recordCount === 0);
    } else if (filterStatus === "stale") {
      filtered = filtered.filter(
        (s) => !s.isFresh && s.recordCount > 0 && !s.hasActiveJob
      );
    } else if (filterStatus === "error") {
      filtered = filtered.filter((s) => s.lastError !== null);
    } else if (filterStatus === "completed") {
      filtered = filtered.filter(
        (s) => s.recordCount > 0 && !s.hasActiveJob && !s.lastError
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.slug.toLowerCase().includes(query) ||
          s.categoryName.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(
        (s) => s.categoryName.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "records":
          return b.recordCount - a.recordCount;
        case "last-sync":
          return (
            (b.lastSuccessfulSyncAt?.getTime() || 0) -
            (a.lastSuccessfulSyncAt?.getTime() || 0)
          );
        case "freshness":
          return (a.hoursSinceSync ?? 9999) - (b.hoursSinceSync ?? 9999);
        default:
          return 0;
      }
    });

    return filtered;
  }

  const categories = Array.from(new Set(sources.map((s) => s.categoryName))).sort();
  const filteredSources = getFilteredAndSortedSources();
  const freshSources = sources.filter((s) => s.isFresh);
  const staleSources = sources.filter(
    (s) => !s.isFresh && s.recordCount > 0 && !s.hasActiveJob
  );
  const errorSources = sources.filter((s) => s.lastError !== null);
  const neverSyncedSources = sources.filter((s) => s.recordCount === 0);

  if (loading && sources.length === 0) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              {"←"} Back to Home
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Admin Dashboard
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Data ingestion, monitoring, and system health
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </p>
          <button
            onClick={() => {
              fetchDashboardData();
              fetchIngestionHistory();
            }}
            disabled={loading}
            className="mt-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh Now"}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* System Health Overview */}
      {systemHealth && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { name: "Database", status: systemHealth.database },
            { name: "Meilisearch", status: systemHealth.meilisearch },
            { name: "API", status: systemHealth.api },
            {
              name: "Overall",
              status:
                systemHealth.database === "healthy" &&
                systemHealth.meilisearch === "healthy" &&
                systemHealth.api === "healthy"
                  ? "healthy"
                  : "degraded",
            },
          ].map((component) => (
            <div
              key={component.name}
              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {component.name}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    component.status === "healthy"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                      : component.status === "degraded"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                  }`}
                >
                  {component.status}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Sources</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {summary.totalSources}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Records</p>
            <p className="text-xl font-bold text-purple-900 dark:text-purple-200">
              {formatRecordCount(summary.totalRecords)}
            </p>
          </div>
          <button
            onClick={() => setFilterStatus("completed")}
            className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-left hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            <p className="text-xs text-green-700 dark:text-green-400">Fresh</p>
            <p className="text-xl font-bold text-green-900 dark:text-green-200">
              {freshSources.length}
            </p>
          </button>
          <button
            onClick={() => setFilterStatus("stale")}
            className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-left hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          >
            <p className="text-xs text-yellow-700 dark:text-yellow-400">Stale</p>
            <p className="text-xl font-bold text-yellow-900 dark:text-yellow-200">
              {staleSources.length}
            </p>
          </button>
          <button
            onClick={() => setFilterStatus("never-synced")}
            className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-left hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">No Data</p>
            <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
              {neverSyncedSources.length}
            </p>
          </button>
          {errorSources.length > 0 && (
            <button
              onClick={() => setFilterStatus("error")}
              className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-left hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <p className="text-xs text-red-700 dark:text-red-400">Errors</p>
              <p className="text-xl font-bold text-red-900 dark:text-red-200">
                {errorSources.length}
              </p>
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:flex-none"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="never-synced">No Data</option>
            <option value="stale">Stale</option>
            <option value="error">With Errors</option>
          </select>
          {categories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="name">Sort: Name</option>
            <option value="records">Sort: Records</option>
            <option value="last-sync">Sort: Last Sync</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {filteredSources.length} of {sources.length} sources
        </p>
      </div>

      {/* Data Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSources.map((source) => (
          <div
            key={source.id}
            className={`p-4 rounded-lg border transition-all ${
              expandedSource === source.id
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <button
                className="font-semibold text-gray-900 dark:text-white text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                onClick={() =>
                  setExpandedSource(
                    expandedSource === source.id ? null : source.id
                  )
                }
              >
                {source.name}
              </button>
              {getStatusIcon(source)}
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{formatRecordCount(source.recordCount)} records</span>
              <span>
                {source.hoursSinceSync !== null
                  ? `${source.hoursSinceSync}h ago`
                  : "Never"}
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerIngestion(source.slug);
              }}
              disabled={source.hasActiveJob || runningJob !== null}
              className="mt-3 w-full px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {source.hasActiveJob ? "Running..." : "Start Ingestion"}
            </button>

            {expandedSource === source.id && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Slug:</span>{" "}
                  <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs">
                    {source.slug}
                  </code>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Category:</span>{" "}
                  <span className="text-gray-900 dark:text-white">
                    {source.categoryName}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Mode:</span>{" "}
                  <span className="text-gray-900 dark:text-white">
                    {source.ingestionMode}
                  </span>
                </div>
                {source.refreshCadence && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Cadence:
                    </span>{" "}
                    <span className="text-gray-900 dark:text-white">
                      {source.refreshCadence}
                    </span>
                  </div>
                )}
                {source.baseUrl && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Source:
                    </span>{" "}
                    <a
                      href={source.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                    >
                      Visit
                    </a>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Last Sync:
                  </span>{" "}
                  <span className="text-gray-900 dark:text-white">
                    {formatDateTime(source.lastSuccessfulSyncAt)}
                  </span>
                </div>
                {source.lastError && (
                  <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <span className="text-red-700 dark:text-red-400 font-medium text-xs">
                      Error:
                    </span>
                    <p className="text-red-600 dark:text-red-300 text-xs mt-1 break-words">
                      {source.lastError}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* No results message */}
      {filteredSources.length === 0 && sources.length > 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No sources match your filters.
          </p>
          <button
            onClick={() => {
              setFilterStatus("all");
              setSearchQuery("");
              setSelectedCategory("all");
            }}
            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Recent Ingestion History */}
      {ingestionHistory.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Ingestion Activity
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300 text-xs">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300 text-xs">
                    Source
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300 text-xs">
                    Status
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300 text-xs">
                    Inserted
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300 text-xs">
                    Updated
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300 text-xs">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {ingestionHistory.slice(0, 10).map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white text-xs">
                      {run.SourceSystem?.name || run.sourceSystemId}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          run.status === "completed"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                            : run.status === "running"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 text-xs">
                      {formatRecordCount(run.rowsInserted || 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400 text-xs">
                      {formatRecordCount(run.rowsUpdated || 0)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs truncate max-w-[150px]">
                      {run.errorSummary || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}