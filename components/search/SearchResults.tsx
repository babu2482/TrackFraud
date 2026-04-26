"use client";

import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Pagination } from "../ui/Pagination";
import { EntityCard } from "../entities/EntityCard";

interface SearchResultItem {
  id: string;
  name: string;
  category: string;
  href: string;
  description?: string;
  riskScore?: number;
  location?: string;
  identifiers?: string[];
}

interface SearchResultsProps {
  results: SearchResultItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  query?: string;
  onPageChange: (page: number) => void;
}

export function SearchResults({
  results,
  loading,
  total,
  page,
  pageSize,
  query,
  onPageChange,
}: SearchResultsProps) {
  // Loading state
  if (loading) {
    return <LoadingSpinner size="lg" label="Searching..." />;
  }

  // Empty state
  if (results.length === 0) {
    return (
      <EmptyState
        title="No results found"
        description={
          query
            ? `No entities match "${query}". Try different keywords or adjust your filters.`
            : "Enter a search term or adjust your filters to find entities."
        }
        actionLabel="Clear all filters"
        actionHref="/search"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Results count */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Found{" "}
        <span className="font-semibold text-gray-900 dark:text-white">{total}</span>{" "}
        {total === 1 ? "result" : "results"}
        {query && (
          <>
            {" "}for{" "}
            <span className="font-semibold text-gray-900 dark:text-white">"{query}"</span>
          </>
        )}
      </p>

      {/* Results list */}
      <div className="grid gap-3">
        {results.map((item) => (
          <EntityCard key={item.id} entity={item} />
        ))}
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={Math.ceil(total / pageSize)}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </div>
  );
}