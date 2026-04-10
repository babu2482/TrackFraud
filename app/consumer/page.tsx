"use client";

import { useState } from "react";
import Link from "next/link";
import { FraudSummary } from "@/components/ui/FraudSummary";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface Complaint { complaint_id: number; date_received: string; product: string; sub_product?: string; issue: string; sub_issue?: string; company: string; state?: string; company_response?: string; timely?: string; consumer_disputed?: string; complaint_what_happened?: string; }
interface Metrics { totalComplaints: number; reliefRate: number | null; disputeRate: number | null; untimelyRate: number | null; topProduct: string | null; topProductShare: number | null; withRelief: number; withoutRelief: number; disputed: number; untimely: number; }
interface RiskSignal { key: string; label: string; severity: "medium" | "high"; detail: string; value?: number | null; threshold?: number; }
interface SearchResponse {
  complaints?: Complaint[];
  total?: number;
  metrics?: Metrics | null;
  riskSignals?: RiskSignal[];
  riskScore?: number;
  fraudMeter?: FraudMeterModel;
  error?: string;
}

export default function ConsumerPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [fraudMeter, setFraudMeter] = useState<FraudMeterModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null); setSearched(true);
    try {
      const res = await fetch(`/api/consumer/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.complaints ?? []);
      setTotal(data.total ?? 0);
      setMetrics(data.metrics ?? null);
      setRiskSignals(data.riskSignals ?? []);
      setRiskScore(data.riskScore ?? 0);
      setFraudMeter(data.fraudMeter ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setMetrics(null);
      setRiskSignals([]);
      setRiskScore(0);
      setFraudMeter(null);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Consumer Complaints Tracker</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search consumer complaints filed with the CFPB. See which companies get the most complaints, how they respond, and whether consumers agree with the resolution.
        </p>
        <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by company (e.g. Wells Fargo, Equifax)..." className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500" />
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
        </form>
      </section>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">{error}</div>}

      {searched && !loading && (
        <section className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{total > 0 ? `${total.toLocaleString()} total complaints` : "No complaints found"}</p>

          <FraudSummary
            signals={riskSignals}
            score={riskScore}
            entityId={query}
            fraudMeter={fraudMeter ?? undefined}
          />

          {metrics && metrics.totalComplaints > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Relief Rate</p>
                <p className="font-semibold text-gray-900 dark:text-white">{metrics.reliefRate != null ? `${(metrics.reliefRate * 100).toFixed(1)}%` : "—"}</p>
                <p className="text-[11px] text-gray-400">{metrics.withRelief} with relief / {metrics.withRelief + metrics.withoutRelief} resolved</p>
              </div>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Dispute Rate</p>
                <p className="font-semibold text-gray-900 dark:text-white">{metrics.disputeRate != null ? `${(metrics.disputeRate * 100).toFixed(1)}%` : "—"}</p>
                <p className="text-[11px] text-gray-400">{metrics.disputed} consumers disputed</p>
              </div>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Untimely Rate</p>
                <p className="font-semibold text-gray-900 dark:text-white">{metrics.untimelyRate != null ? `${(metrics.untimelyRate * 100).toFixed(1)}%` : "—"}</p>
                <p className="text-[11px] text-gray-400">{metrics.untimely} late responses</p>
              </div>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">Top Product</p>
                <p className="font-semibold text-gray-900 dark:text-white text-xs">{metrics.topProduct ?? "—"}</p>
                {metrics.topProductShare != null && <p className="text-[11px] text-gray-400">{(metrics.topProductShare * 100).toFixed(0)}% of complaints</p>}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map((c) => {
                const responseColor = c.company_response?.includes("relief") ? "text-green-700 dark:text-green-400" : c.company_response?.includes("Closed") ? "text-gray-600 dark:text-gray-400" : "text-amber-700 dark:text-amber-400";
                return (
                  <li key={c.complaint_id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{c.company}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{c.product}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{c.issue}{c.sub_issue ? ` — ${c.sub_issue}` : ""}</p>
                        {c.complaint_what_happened && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{c.complaint_what_happened}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{c.date_received}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs">
                      {c.company_response && <span className={responseColor}>Response: {c.company_response}</span>}
                      {c.timely === "No" && <span className="text-red-600 dark:text-red-400 font-medium">Untimely</span>}
                      {c.consumer_disputed === "Yes" && <span className="text-amber-600 dark:text-amber-400 font-medium">Disputed</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
