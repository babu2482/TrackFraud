"use client";

import { useState } from "react";
import Link from "next/link";

type SearchType = "candidates" | "committees";

interface Candidate { candidate_id: string; name: string; party_full?: string; office_full?: string; state?: string; district?: string; election_years?: number[]; }
interface Committee { committee_id: string; name: string; committee_type_full?: string; party_full?: string; state?: string; treasurer_name?: string; }

export default function PoliticalPage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("candidates");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/political/search?q=${encodeURIComponent(q)}&type=${searchType}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      if (searchType === "candidates") {
        setCandidates(data.results ?? []);
        setCommittees([]);
      } else {
        setCommittees(data.results ?? []);
        setCandidates([]);
      }
      setTotal(data.pagination?.count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Political & Campaign Finance Tracker
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search candidates and political committees. See who&apos;s raising and spending
          what. Data from the Federal Election Commission.
        </p>
        <form onSubmit={handleSearch} className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name (e.g. Biden, Trump, ActBlue)..."
              className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
            />
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium disabled:opacity-50">
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          <div className="flex gap-3">
            {(["candidates", "committees"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                <input type="radio" name="type" value={t} checked={searchType === t} onChange={() => setSearchType(t)} className="accent-red-600" />
                {t === "candidates" ? "Candidates" : "Committees / PACs"}
              </label>
            ))}
          </div>
        </form>
      </section>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">{error}</div>}

      {searched && !loading && !error && (
        <section className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {total > 0 ? `${total.toLocaleString()} results` : "No results found"}
          </p>

          {candidates.length > 0 && (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.candidate_id}>
                  <Link href={`/political/candidate/${c.candidate_id}`} className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                      {c.party_full && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{c.party_full}</span>}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {[c.office_full, c.state, c.district ? `District ${c.district}` : null].filter(Boolean).join(" · ")}
                      {c.election_years?.length ? ` · Elections: ${c.election_years.slice(0, 4).join(", ")}` : ""}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ID: {c.candidate_id}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {committees.length > 0 && (
            <ul className="space-y-2">
              {committees.map((c) => (
                <li key={c.committee_id}>
                  <Link href={`/political/committee/${c.committee_id}`} className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                      {c.committee_type_full && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{c.committee_type_full}</span>}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {[c.party_full, c.state].filter(Boolean).join(" · ")}
                      {c.treasurer_name ? ` · Treasurer: ${c.treasurer_name}` : ""}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ID: {c.committee_id}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
