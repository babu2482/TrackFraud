export function formatMoney(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export function formatPct(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function formatTimestamp(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function formatSubsection(code?: number): string | null {
  if (code == null) return null;
  if (code === 29) return "4947(a)(1)";
  return `501(c)(${code})`;
}

export function formatScore(score?: number): string | null {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return score.toFixed(1);
}

export function formatRiskValue(signal: { key: string; value?: number | null }): string {
  const value = signal.value;
  if (value == null || Number.isNaN(value)) return "Not reported";
  if (signal.key === "fundraising_efficiency_high_cost") {
    return `$${value.toFixed(2)} to raise $1`;
  }
  return formatPct(value);
}

export function formatRiskThreshold(signal: { key: string; threshold?: number }): string {
  const threshold = signal.threshold;
  if (threshold == null || Number.isNaN(threshold)) return "Not configured";
  if (signal.key === "fundraising_efficiency_high_cost") {
    return `> $${threshold.toFixed(2)} to raise $1`;
  }
  if (signal.key === "program_ratio_low") {
    return `< ${formatPct(threshold)}`;
  }
  return `> ${formatPct(threshold)}`;
}

export function formatCorroborationCategory(
  category: "revocation" | "sanction" | "state_enforcement" | "watchdog"
): string {
  if (category === "revocation") return "Revocation";
  if (category === "sanction") return "Sanction";
  if (category === "state_enforcement") return "State enforcement";
  return "Watchdog";
}

export function formatFieldValue(val: string | number, key: string): string {
  if (typeof val === "string") return val;
  if (typeof val !== "number" || Number.isNaN(val)) return "—";
  if (key === "pct_compnsatncurrofcr" || key.startsWith("pct_")) return `${(val * 100).toFixed(2)}%`;
  if (["formtype", "subseccd", "tax_prd", "tax_prd_yr"].includes(key)) return String(val);
  return formatMoney(val);
}
