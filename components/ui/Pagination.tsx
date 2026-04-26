"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  // Don't render if there's only one page
  if (totalPages <= 1) return null;

  // Build page numbers to display (max 7 pages visible)
  const pages: (number | string)[] = [];
  const maxVisible = 7;

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    // Show ellipsis after first page if needed
    if (page > 3) {
      pages.push("...");
    }

    // Show pages around current page
    const rangeStart = Math.max(2, page - 1);
    const rangeEnd = Math.min(totalPages - 1, page + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    // Show ellipsis before last page if needed
    if (page < totalPages - 2) {
      pages.push("...");
    }

    // Always show last page
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 dark:border-gray-800 pt-4 mt-4">
      {/* Showing X of Y */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Showing{" "}
        <span className="font-medium text-gray-900 dark:text-white">
          {startItem}–{endItem}
        </span>{" "}
        of{" "}
        <span className="font-medium text-gray-900 dark:text-white">
          {totalItems}
        </span>
      </p>

      {/* Page Controls */}
      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          Previous
        </button>

        {/* Page Numbers */}
        {pages.map((p, i) => {
          if (p === "...") {
            return (
              <span
                key={`ellipsis-${i}`}
                className="px-2 py-1.5 text-sm text-gray-400 dark:text-gray-500"
              >
                …
              </span>
            );
          }

          const pageNum = p as number;
          const isActive = pageNum === page;

          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-9 h-9 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-red-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
              aria-label={`Page ${pageNum}`}
              aria-current={isActive ? "page" : undefined}
            >
              {pageNum}
            </button>
          );
        })}

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}