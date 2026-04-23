"use client";

import { useEffect, useState } from "react";

interface IngestionJob {
  id: string;
  name: string;
  status: "running" | "completed" | "failed" | "pending" | "scheduled";
  lastRun: string;
  lastError?: string;
  recordsProcessed: number;
  progress?: number;
  slug: string;
}

interface SourceSystemStatus {
  id: string;
  name: string;
  slug: string;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  ingestionMode: "api" | "bulk" | "manual";
}

export function IngestionStatus() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [sourceSystems, setSourceSystems] = useState<SourceSystemStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [jobsRes, sourcesRes] = await Promise.all([
          fetch("/api/admin/jobs").then((r) => r.json()),
          fetch("/api/admin/stats").then((r) => r.json()),
        ]);

        if (jobsRes.jobs) setJobs(jobsRes.jobs);
        if (sourcesRes.stats?.sourceSystems) {
          // Source systems data would come from a separate endpoint
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-sm text-gray-500 dark:text-gray-400">
        Loading ingestion status...
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === "running");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <div className="space-y-3">
      {activeJobs.length > 0 && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Active Ingestion Jobs
          </div>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
            {activeJobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between">
                <span>{job.name}</span>
                {job.progress !== undefined && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    {job.progress}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failedJobs.length > 0 && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-sm font-medium text-red-900 dark:text-red-200 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            Failed Jobs
          </div>
          <ul className="space-y-1 text-sm text-red-800 dark:text-red-300">
            {failedJobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between">
                <span>{job.name}</span>
                <span className="text-xs text-red-600 dark:text-red-400">
                  {job.lastError}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeJobs.length === 0 && failedJobs.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          All ingestion jobs completed
        </div>
      )}

      {jobs.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

export function IngestionStatusBanner() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchJobs() {
      try {
        const res = await fetch("/api/admin/jobs", { signal: AbortSignal.timeout(5000) });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data.jobs) setJobs(data.jobs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch");
          console.error("IngestionStatusBanner: Failed to fetch jobs:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchJobs();
    const interval = setInterval(fetchJobs, 60000); // Poll every 60s instead of 30s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Hide banner if there was an error loading, or still loading, or no active jobs
  const activeJobs = jobs.filter((j) => j.status === "running");
  if (loading || error || activeJobs.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm py-2 px-4 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="font-medium">Ingesting data:</span>
          {activeJobs.slice(0, 3).map((job, i) => (
            <span key={job.id} className="flex items-center gap-1">
              {job.name}
              {job.progress !== undefined && (
                <span className="text-blue-200 text-xs">({job.progress}%)</span>
              )}
              {i < Math.min(activeJobs.length, 3) - 1 && <span className="mx-1">|</span>}
            </span>
          ))}
        </div>
        <a
          href="/admin"
          className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors"
        >
          View Status
        </a>
      </div>
    </div>
  );
}
