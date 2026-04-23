"use client";

import { useEffect, useState } from "react";

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

export function IngestionTimeline() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await fetch("/api/admin/jobs");
        const data = await res.json();
        if (data.jobs) {
          // Fetch more detailed runs from a new endpoint or use existing
          const detailedRes = await fetch("/api/admin/ingestion-history");
          if (detailedRes.ok) {
            const detailedData = await detailedRes.json();
            if (detailedData.runs) {
              setRuns(detailedData.runs);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch ingestion history:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRuns();
    const interval = setInterval(fetchRuns, 30000);
    return () => clearInterval(interval);
  }, []);

  function getStatusColor(status: string): string {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "running":
        return "bg-blue-500 animate-pulse";
      case "failed":
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  }

  function formatDuration(startedAt: Date | string, completedAt: Date | string | null): string {
    if (!completedAt) return "Running...";
    const start = typeof startedAt === 'string' ? new Date(startedAt) : startedAt;
    const end = typeof completedAt === 'string' ? new Date(completedAt) : completedAt;
    const diffMs = end.getTime() - start.getTime();
    const seconds = Math.round(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }

  function formatRecordCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  }

  if (loading) {
    return (
      <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Recent Ingestion Activity
        </h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Recent Ingestion Activity
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          No recent ingestion activity found.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Recent Ingestion Activity
      </h2>
      <div className="space-y-3">
        {runs.slice(0, 10).map((run) => (
          <div
            key={run.id}
            className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50"
          >
            <div className={`w-3 h-3 rounded-full ${getStatusColor(run.status)}`} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">
                {run.SourceSystem?.name || run.sourceSystemId}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {typeof run.startedAt === 'string' ? new Date(run.startedAt).toLocaleString() : run.startedAt.toLocaleString()} •{" "}
                {formatDuration(run.startedAt, run.completedAt)}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                +{formatRecordCount(run.rowsInserted || 0)} inserted
              </p>
              {run.rowsUpdated > 0 && (
                <p className="text-gray-500 dark:text-gray-400">
                  {formatRecordCount(run.rowsUpdated)} updated
                </p>
              )}
              {run.rowsFailed > 0 && (
                <p className="text-red-600 dark:text-red-400">
                  {formatRecordCount(run.rowsFailed)} failed
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}