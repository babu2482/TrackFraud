"use client";

import { useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { EmptyState } from "./EmptyState";
import { Pagination } from "./Pagination";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  field?: keyof T;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  totalItems?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  rowKey: (item: T) => string;
  rowHref?: (item: T) => string;
}

type SortState = {
  key: string;
  direction: "asc" | "desc";
} | null;

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  loading = false,
  emptyTitle = "No results found",
  emptyDescription = "Try adjusting your search filters",
  totalItems,
  page = 1,
  pageSize = 20,
  onPageChange,
  rowKey,
  rowHref,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" };
        return null;
      }
      return { key, direction: "asc" };
    });
  };

  const handlePageChange = (newPage: number) => {
    onPageChange?.(newPage);
  };

  // Loading state
  if (loading) {
    return <LoadingSpinner size="lg" label="Loading data..." />;
  }

  // Empty state
  if (data.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const renderCell = (col: Column<T>, item: T) => {
    if (col.render) return col.render(item);
    if (col.field) return <span className="text-sm text-gray-900 dark:text-white">{String(item[col.field] ?? "")}</span>;
    return <span className="text-sm text-gray-500 dark:text-gray-400">—</span>;
  };

  const renderSortIcon = (key: string) => {
    if (sort?.key !== key) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 opacity-30">
          <path d="M7 15l5-5 5 5H7z" />
        </svg>
      );
    }
    return sort.direction === "asc" ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-red-600 dark:text-red-400">
        <path d="M7 15l5-5 5 5H7z" />
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-red-600 dark:text-red-400">
        <path d="M7 9l5 5 5-5H7z" />
      </svg>
    );
  };

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {col.label}
                      {renderSortIcon(col.key)}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.map((item) => {
              const key = rowKey(item);
              const href = rowHref?.(item);

              const rowContent = (
                <>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      {renderCell(col, item)}
                    </td>
                  ))}
                </>
              );

              if (href) {
                return (
                  <tr
                    key={key}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <td colSpan={columns.length} className="px-0 py-0">
                      <a
                        href={href}
                        className="block hover:opacity-80 transition-opacity"
                      >
                        {rowContent}
                      </a>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={key}
                  className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                >
                  {rowContent}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalItems && onPageChange && (
        <Pagination
          page={page}
          totalPages={Math.ceil(totalItems / pageSize)}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}