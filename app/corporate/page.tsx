"use client";

import { useState } from "react";
import Link from "next/link";

interface CompanyMatch { cik: string; entity_name: string; ticker?: string; exchange?: string; }

export default function CorporatePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(null); setSearched(true);
    try {
      const res = await fetch(`/api/corporate/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Corporate & Securities Tracker</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search public companies by name or ticker. View SEC filings, financial data, and
          corporate disclosures. Data from SEC EDGAR.
        </p>
        <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by company name or ticker (e.g. Apple, TSLA)..." className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500" />
          <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
        </form>
      </section>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">{error}</div>}

      {searched && !loading && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">{results.length > 0 ? `${results.length} results` : "No results found"}</p>
          <ul className="space-y-2">
            {results.map((c, i) => (
              <li key={`${c.cik}-${i}`}>
                <Link href={`/corporate/company/${c.cik}`} className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{c.entity_name}</span>
                    {c.ticker && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-mono">{c.ticker}</span>}
                    {c.exchange && <span className="text-xs text-gray-500 dark:text-gray-400">{c.exchange}</span>}
                  </div>
                  {c.cik && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">CIK: {c.cik}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
