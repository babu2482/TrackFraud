"use client";

import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { value: "charity", label: "Charities" },
  { value: "corporate", label: "Corporate" },
  { value: "government", label: "Government" },
  { value: "healthcare", label: "Healthcare" },
  { value: "political", label: "Political" },
  { value: "consumer", label: "Consumer" },
];

const RISK_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const US_STATES = [
  { value: "AL", label: "AL" }, { value: "AK", label: "AK" }, { value: "AZ", label: "AZ" },
  { value: "AR", label: "AR" }, { value: "CA", label: "CA" }, { value: "CO", label: "CO" },
  { value: "CT", label: "CT" }, { value: "DE", label: "DE" }, { value: "FL", label: "FL" },
  { value: "GA", label: "GA" }, { value: "HI", label: "HI" }, { value: "ID", label: "ID" },
  { value: "IL", label: "IL" }, { value: "IN", label: "IN" }, { value: "IA", label: "IA" },
  { value: "KS", label: "KS" }, { value: "KY", label: "KY" }, { value: "LA", label: "LA" },
  { value: "ME", label: "ME" }, { value: "MD", label: "MD" }, { value: "MA", label: "MA" },
  { value: "MI", label: "MI" }, { value: "MN", label: "MN" }, { value: "MS", label: "MS" },
  { value: "MO", label: "MO" }, { value: "MT", label: "MT" }, { value: "NE", label: "NE" },
  { value: "NV", label: "NV" }, { value: "NH", label: "NH" }, { value: "NJ", label: "NJ" },
  { value: "NM", label: "NM" }, { value: "NY", label: "NY" }, { value: "NC", label: "NC" },
  { value: "ND", label: "ND" }, { value: "OH", label: "OH" }, { value: "OK", label: "OK" },
  { value: "OR", label: "OR" }, { value: "PA", label: "PA" }, { value: "RI", label: "RI" },
  { value: "SC", label: "SC" }, { value: "SD", label: "SD" }, { value: "TN", label: "TN" },
  { value: "TX", label: "TX" }, { value: "UT", label: "UT" }, { value: "VT", label: "VT" },
  { value: "VA", label: "VA" }, { value: "WA", label: "WA" }, { value: "WV", label: "WV" },
  { value: "WI", label: "WI" }, { value: "WY", label: "WY" }, { value: "DC", label: "DC" },
];

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (value: T | "") => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
        aria-label={ariaLabel}
      >
        <option value="">{placeholder || "All"}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") || "";
  const risk = searchParams.get("risk") || "";
  const state = searchParams.get("state") || "";
  const dateFrom = searchParams.get("from") || "";
  const dateTo = searchParams.get("to") || "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Reset to page 1 when filters change
    params.delete("page");
    router.push(`/search?${params.toString()}`);
  };

  const clearAll = () => {
    router.push("/search");
  };

  const hasActiveFilters = category || risk || state || dateFrom || dateTo;

  return (
    <div className="space-y-3 p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SelectField
          label="Category"
          value={category as "" | (typeof CATEGORIES[number]["value"])}
          options={CATEGORIES}
          onChange={(v) => updateParam("category", v)}
          placeholder="All categories"
          ariaLabel="Filter by category"
        />

        <SelectField
          label="Risk Level"
          value={risk as "" | (typeof RISK_LEVELS[number]["value"])}
          options={RISK_LEVELS}
          onChange={(v) => updateParam("risk", v)}
          placeholder="All levels"
          ariaLabel="Filter by risk level"
        />

        <SelectField
          label="State"
          value={state as "" | (typeof US_STATES[number]["value"])}
          options={US_STATES}
          onChange={(v) => updateParam("state", v)}
          placeholder="All states"
          ariaLabel="Filter by state"
        />

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Date Range
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParam("from", e.target.value)}
              className="flex-1 px-2 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
              aria-label="From date"
            />
            <span className="flex items-center text-xs text-gray-400">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateParam("to", e.target.value)}
              className="flex-1 px-2 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
              aria-label="To date"
            />
          </div>
        </div>
      </div>
    </div>
  );
}