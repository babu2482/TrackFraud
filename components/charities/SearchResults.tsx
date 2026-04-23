"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatSubsection, formatScore } from "@/lib/format";

interface SearchResult {
  ein: string;
  name: string;
  city?: string;
  state?: string;
  ntee_code?: string;
  subseccd?: number;
  score?: number;
}

interface SearchResultsProps {
  results: SearchResult[];
  totalResults: number;
  query: string;
  queryUsed: string | null;
  queryStrategy: "exact" | "fallback";
  loading: boolean;
  searched: boolean;
}

export function SearchResults({
  results,
  totalResults,
  query,
  queryUsed,
  queryStrategy,
  loading,
  searched,
}: SearchResultsProps) {
  if (!searched || loading) return null;

  const showFallbackNotice =
    queryStrategy === "fallback" &&
    queryUsed &&
    queryUsed.toLowerCase() !== query.trim().toLowerCase();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Results
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {totalResults > 0
            ? `Showing ${results.length} of ${totalResults.toLocaleString()} results (sorted by relevance)`
            : "No matching organizations"}
        </p>
      </div>

      {showFallbackNotice && (
        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 text-sm">
          No exact matches for <strong>{query.trim()}</strong>. Showing closest
          matches for <strong>{queryUsed}</strong>.
        </div>
      )}

      {results.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No organizations found. Try a different search.
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((org, index) => {
            const subsection = formatSubsection(org.subseccd);
            const score = formatScore(org.score);
            return (
              <li key={`${org.ein}-${index}`}>
                <Link
                  href={`/charities/${org.ein}`}
                  className="block p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge>#{index + 1}</Badge>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {org.name}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {[org.city, org.state].filter(Boolean).join(", ")}
                      {[org.city, org.state].filter(Boolean).length > 0
                        ? " · "
                        : ""}
                      EIN {org.ein}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {subsection && <Badge>{subsection}</Badge>}
                      {org.ntee_code && <Badge>NTEE {org.ntee_code}</Badge>}
                      {score && <Badge>Relevance {score}</Badge>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
