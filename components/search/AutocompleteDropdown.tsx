"use client";

/**
 * AutocompleteDropdown
 *
 * Rich dropdown that appears below the search input as the user types.
 * Shows entity name, type badge, location, and risk score.
 * Supports keyboard navigation (arrow keys, enter, escape).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  IconSearch,
  IconMapPin,
  IconAlertTriangle,
} from "@/components/ui/Icons";

interface AutocompleteResult {
  entityId: string;
  entityType: string;
  name: string;
  ein?: string;
  cik?: string;
  city?: string;
  state?: string;
  riskScore?: number;
  riskLevel?: string;
}

interface AutocompleteDropdownProps {
  query: string;
  onSelect: (result: AutocompleteResult) => void;
  onClose: () => void;
}

function getRiskLevel(score?: number): { label: string; color: string } {
  if (score === undefined) return { label: "Unknown", color: "text-gray-500" };
  if (score >= 80) return { label: "Critical", color: "text-red-400" };
  if (score >= 60) return { label: "High", color: "text-orange-400" };
  if (score >= 40) return { label: "Medium", color: "text-yellow-400" };
  return { label: "Low", color: "text-green-400" };
}

function getEntityTypeConfig(type: string) {
  const configs: Record<
    string,
    { label: string; color: string; href: (id: string) => string }
  > = {
    charity: {
      label: "Charity",
      color: "bg-red-500/20 text-red-400",
      href: (id: string) => `/charities/${id}`,
    },
    corporation: {
      label: "Corporation",
      color: "bg-blue-500/20 text-blue-400",
      href: (id: string) => `/corporate/company/${id}`,
    },
    government_contractor: {
      label: "Government",
      color: "bg-indigo-500/20 text-indigo-400",
      href: (id: string) => `/government/award/${id}`,
    },
    healthcare_provider: {
      label: "Healthcare",
      color: "bg-emerald-500/20 text-emerald-400",
      href: (id: string) => `/healthcare/${id}`,
    },
    politician: {
      label: "Political",
      color: "bg-purple-500/20 text-purple-400",
      href: (id: string) => `/political/candidate/${id}`,
    },
    consumer_entity: {
      label: "Consumer",
      color: "bg-teal-500/20 text-teal-400",
      href: (id: string) => `/consumer/${id}`,
    },
  };

  return (
    configs[type] || {
      label: type.charAt(0).toUpperCase() + type.slice(1),
      color: "bg-gray-500/20 text-gray-400",
      href: (id: string) => `/search?q=${id}`,
    }
  );
}

export function AutocompleteDropdown({
  query,
  onSelect,
  onClose,
}: AutocompleteDropdownProps) {
  const router = useRouter();
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=8`,
          {
            signal: AbortSignal.timeout(2000),
          },
        );

        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch {
        // Network error or timeout — silently fail
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (
        e.key === "Enter" &&
        activeIndex >= 0 &&
        results[activeIndex]
      ) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [activeIndex, results, onClose],
  );

  const handleSelect = useCallback(
    (result: AutocompleteResult) => {
      onSelect(result);
      const config = getEntityTypeConfig(result.entityType);
      const id = result.ein || result.cik || result.entityId;
      router.push(config.href(id));
      onClose();
    },
    [onSelect, router, onClose],
  );

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.children[activeIndex] as HTMLElement;
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const hasContent = results.length > 0 || loading;

  if (!hasContent) return null;

  return (
    <div
      ref={inputRef}
      className="absolute top-full left-0 right-0 mt-2 z-[var(--z-dropdown)]"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dropdownRef}
        className="overflow-y-auto max-h-96 rounded-xl border border-gray-800 bg-gray-950/95 backdrop-blur-xl shadow-2xl shadow-black/50"
        role="listbox"
      >
        {loading && (
          <div className="px-4 py-3 text-xs text-gray-500 border-b border-gray-800/50">
            Searching...
          </div>
        )}

        {results.map((result, index) => {
          const config = getEntityTypeConfig(result.entityType);
          const risk = getRiskLevel(result.riskScore);
          const location = [result.city, result.state]
            .filter(Boolean)
            .join(", ");
          const isActive = index === activeIndex;

          return (
            <button
              key={result.entityId}
              role="option"
              aria-selected={isActive}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-gray-800/30 transition-colors ${
                isActive ? "bg-red-500/10" : "hover:bg-gray-900/50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(result);
              }}
            >
              {/* Icon */}
              <div className="mt-0.5 text-gray-500 flex-shrink-0">
                <IconSearch className="w-4 h-4" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium truncate">
                    {result.name}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${config.color}`}
                  >
                    {config.label}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1">
                  {location && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <IconMapPin className="w-3 h-3" />
                      {location}
                    </span>
                  )}
                  {result.riskScore !== undefined && (
                    <span
                      className={`flex items-center gap-1 text-xs font-medium ${risk.color}`}
                    >
                      <IconAlertTriangle className="w-3 h-3" />
                      {risk.label} ({result.riskScore})
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {results.length > 0 && (
          <button
            className="w-full text-left px-4 py-2.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              router.push(`/search?q=${encodeURIComponent(query)}`);
              onClose();
            }}
          >
            View all results for &ldquo;{query}&rdquo;
          </button>
        )}
      </div>
    </div>
  );
}
