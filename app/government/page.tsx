"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

interface Award { internal_id: number; generated_internal_id: string; Award_ID?: string; Recipient_Name?: string; Awarding_Agency?: string; Award_Amount?: number; Description?: string; Start_Date?: string; End_Date?: string; Award_Type?: string; }

export default function GovernmentPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Award[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null); setSearched(true);
    try {
      const res = await fetch(`/api/government/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
      setTotal(data.page_metadata?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Government Spending Tracker</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search federal contracts and awards. See who gets taxpayer money and how much.
          Data from USASpending.gov.
        </p>
        <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contracts (e.g. Lockheed, vaccine, construction)..." className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500" />
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
        </form>
      </section>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">{error}</div>}

      {searched && !loading && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">{total > 0 ? `${total.toLocaleString()} awards found` : "No results found"}</p>
          <ul className="space-y-2">
            {results.map((a) => (
              <li key={a.generated_internal_id}>
                <Link href={`/government/award/${encodeURIComponent(a.generated_internal_id)}`} className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">{a.Recipient_Name ?? "Unknown recipient"}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{a.Description ? (a.Description.length > 120 ? a.Description.slice(0, 120) + "…" : a.Description) : "No description"}</p>
                    </div>
                    <span className="shrink-0 font-semibold text-gray-900 dark:text-white">{formatMoney(a.Award_Amount)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {a.Awarding_Agency && <span>{a.Awarding_Agency}</span>}
                    {a.Award_Type && <span>· {a.Award_Type}</span>}
                    {a.Start_Date && <span>· {a.Start_Date}</span>}
                    {a.Award_ID && <span>· ID: {a.Award_ID}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
