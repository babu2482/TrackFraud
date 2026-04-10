"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { FraudSummary } from "@/components/ui/FraudSummary";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

type SearchType = "doctor" | "company";

interface Payment { record_id?: string; physician_first_name?: string; physician_last_name?: string; recipient_state?: string; physician_specialty?: string; applicable_manufacturer_or_applicable_gpo_making_payment_name?: string; total_amount_of_payment_usdollars?: string; nature_of_payment_or_transfer_of_value?: string; }
interface Metrics { totalPayments: number; paymentCount: number; topCompany: string | null; topCompanyShare: number | null; topCompanyCount: number; highRiskPaymentShare: number; highRiskTypes: string[]; specialty: string | null; }
interface RiskSignal { key: string; label: string; severity: "medium" | "high"; detail: string; value?: number | null; threshold?: number; }
interface SearchResponse {
  results?: Payment[];
  metrics?: Metrics | null;
  riskSignals?: RiskSignal[];
  riskScore?: number;
  fraudMeter?: FraudMeterModel;
  error?: string;
}

export default function HealthcarePage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("doctor");
  const [results, setResults] = useState<Payment[]>([]);
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
      const res = await fetch(`/api/healthcare/search?q=${encodeURIComponent(q)}&type=${searchType}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Healthcare Payments Tracker</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search pharmaceutical and medical device payments to doctors (the &quot;Sunshine Act&quot; data).
          See which companies are paying which doctors, and how much. Data from CMS Open Payments.
        </p>
        <form onSubmit={handleSearch} className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchType === "doctor" ? "Doctor name (e.g. John Smith)..." : "Company name (e.g. Pfizer)..."} className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500" />
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
          </div>
          <div className="flex gap-3">
            {(["doctor", "company"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input type="radio" name="type" value={t} checked={searchType === t} onChange={() => setSearchType(t)} className="accent-red-600" />
                {t === "doctor" ? "Search by Doctor" : "Search by Company"}
              </label>
            ))}
          </div>
        </form>
      </section>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">{error}</div>}

      {searched && !loading && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">{results.length} payments found</p>
            {metrics && metrics.totalPayments > 0 && <p className="text-sm font-semibold text-gray-900 dark:text-white">Total: {formatMoney(metrics.totalPayments)}</p>}
          </div>

          <FraudSummary
            signals={riskSignals}
            score={riskScore}
            entityId={query}
            fraudMeter={fraudMeter ?? undefined}
          />

          {metrics && metrics.topCompany && (
            <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                Top payer: <strong>{metrics.topCompany}</strong>
                {metrics.topCompanyShare != null && <> ({(metrics.topCompanyShare * 100).toFixed(0)}% of total, {metrics.topCompanyCount} payments)</>}
              </p>
              {metrics.specialty && <p className="text-gray-500 dark:text-gray-400 mt-1">Specialty: {metrics.specialty}</p>}
            </div>
          )}

          {results.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Doctor</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Company</th>
                    <th className="text-right py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Amount</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Nature</th>
                    <th className="text-left py-2 font-medium text-gray-700 dark:text-gray-300">Specialty</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.record_id ?? i} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2 pr-3 text-gray-900 dark:text-white whitespace-nowrap">{r.physician_first_name} {r.physician_last_name}</td>
                      <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 text-xs">{r.applicable_manufacturer_or_applicable_gpo_making_payment_name ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono text-gray-900 dark:text-gray-100">{formatMoney(parseFloat(r.total_amount_of_payment_usdollars ?? "0"))}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-400">{r.nature_of_payment_or_transfer_of_value ?? "—"}</td>
                      <td className="py-2 text-xs text-gray-600 dark:text-gray-400">{r.physician_specialty ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
