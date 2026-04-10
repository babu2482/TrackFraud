"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { SearchResults } from "@/components/charities/SearchResults";
import { HottestList } from "@/components/charities/HottestList";

interface SearchResult {
  ein: string;
  name: string;
  city?: string;
  state?: string;
  ntee_code?: string;
  subseccd?: number;
  score?: number;
}

interface SearchResponse {
  results?: SearchResult[];
  totalResults?: number;
  numPages?: number;
  curPage?: number;
  queryUsed?: string | null;
  queryStrategy?: "exact" | "fallback";
}

const SUBSECTION_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "All legal classifications" },
  { value: 3, label: "501(c)(3) Public charities and private foundations" },
  { value: 4, label: "501(c)(4) Social welfare organizations" },
  { value: 6, label: "501(c)(6) Business leagues and chambers" },
  { value: 7, label: "501(c)(7) Social clubs" },
  { value: 19, label: "501(c)(19) Veterans organizations" },
  { value: 29, label: "4947(a)(1) Non-exempt charitable trusts" },
];

export default function CharitiesPage() {
  const [query, setQuery] = useState("");
  const [subsectionCode, setSubsectionCode] = useState<number | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [queryUsed, setQueryUsed] = useState<string | null>(null);
  const [queryStrategy, setQueryStrategy] = useState<"exact" | "fallback">("exact");
  const selectedSubsectionLabel =
    SUBSECTION_OPTIONS.find((opt) => opt.value === subsectionCode)?.label ??
    "All legal classifications";

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const params = new URLSearchParams({
        q,
        page: "0",
      });
      if (subsectionCode != null) {
        params.set("c_code", String(subsectionCode));
      }
      const response = await fetch(`/api/charities/search?${params.toString()}`);
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Search failed");

      const apiResults = Array.isArray(data.results) ? data.results : [];
      setResults(apiResults);
      setTotalResults(typeof data.totalResults === "number" ? data.totalResults : 0);
      setQueryUsed(data.queryUsed ?? q);
      setQueryStrategy(data.queryStrategy === "fallback" ? "fallback" : "exact");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setTotalResults(0);
      setQueryUsed(null);
      setQueryStrategy("exact");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Charity Fraud Tracker
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Search millions of nonprofits. See how much they take in versus how much
          they spend on the cause, plus a charity-specific fraud meter built from
          IRS Form 990 data and external evidence.
        </p>

        <form onSubmit={handleSearch} className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by charity name or city..."
              className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
              aria-label="Search charities"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium disabled:opacity-50"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          <label className="block text-sm text-gray-600 dark:text-gray-400">
            Legal classification filter
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Currently showing
              </span>
              <Badge>{selectedSubsectionLabel}</Badge>
            </div>
            <select
              value={subsectionCode == null ? "all" : String(subsectionCode)}
              onChange={(e) =>
                setSubsectionCode(
                  e.target.value === "all"
                    ? null
                    : parseInt(e.target.value, 10)
                )
              }
              className="mt-1 w-full md:w-[520px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {SUBSECTION_OPTIONS.map((opt) => (
                <option
                  key={opt.value == null ? "all" : opt.value}
                  value={opt.value == null ? "all" : opt.value}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </form>
      </section>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <SearchResults
        results={results}
        totalResults={totalResults}
        query={query}
        queryUsed={queryUsed}
        queryStrategy={queryStrategy}
        loading={loading}
        searched={searched}
      />

      <HottestList subsectionCode={subsectionCode} />
    </div>
  );
}
