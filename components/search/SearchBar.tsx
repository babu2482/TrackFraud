"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchBarProps {
  initialValue?: string;
  placeholder?: string;
}

export function SearchBar({ initialValue = "", placeholder = "Search by name, EIN, CIK, or keywords..." }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);

  const debouncedSearch = useCallback(
    (value: string) => {
      if (value.trim()) {
        router.push(`/search?q=${encodeURIComponent(value.trim())}`);
      } else {
        router.push("/search");
      }
    },
    [router]
  );

  const [debouncedValue, setDebouncedValue] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedValue !== debouncedValue) {
        // no-op — the timeout handler below does the work
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [debouncedValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce the actual navigation
    clearTimeout((window as any).__searchTimeout);
    (window as any).__searchTimeout = setTimeout(() => {
      debouncedSearch(value);
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout((window as any).__searchTimeout);
    debouncedSearch(query);
  };

  const handleClear = () => {
    setQuery("");
    router.push("/search");
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative">
        {/* Search Icon */}
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        {/* Input */}
        <input
          type="search"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow text-sm"
          aria-label="Search entities"
        />

        {/* Clear Button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}