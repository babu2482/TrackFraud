import type { ExternalCorroborationMatch, RiskSignal } from "./types";

/** Minimal org shape for matchers (matches hottest API payload). */
export interface FraudMapOrg {
  riskSignals?: RiskSignal[];
  externalCorroboration?: ExternalCorroborationMatch[];
}

export interface FraudMapCategory {
  id: string;
  label: string;
  /** Saturated fill for pins / badges (hex). */
  accentHex: string;
  matches: (org: FraudMapOrg) => boolean;
}

function signalKey(org: FraudMapOrg, key: string): boolean {
  return org.riskSignals?.some((s) => s.key === key) ?? false;
}

function externalCategory(
  org: FraudMapOrg,
  cat: ExternalCorroborationMatch["category"]
): boolean {
  return org.externalCorroboration?.some((m) => m.category === cat) ?? false;
}

export const FRAUD_MAP_CATEGORIES: FraudMapCategory[] = [
  {
    id: "program_ratio_low",
    label: "Low program spending",
    accentHex: "#2563eb",
    matches: (org) => signalKey(org, "program_ratio_low"),
  },
  {
    id: "fundraising_efficiency_high_cost",
    label: "High fundraising cost",
    accentHex: "#d97706",
    matches: (org) => signalKey(org, "fundraising_efficiency_high_cost"),
  },
  {
    id: "officer_compensation_high",
    label: "High officer pay share",
    accentHex: "#7c3aed",
    matches: (org) => signalKey(org, "officer_compensation_high"),
  },
  {
    id: "external_revocation",
    label: "IRS / revocation signals",
    accentHex: "#b91c1c",
    matches: (org) => externalCategory(org, "revocation"),
  },
  {
    id: "external_sanction",
    label: "Sanctions match",
    accentHex: "#be123c",
    matches: (org) => externalCategory(org, "sanction"),
  },
  {
    id: "external_state_enforcement",
    label: "State enforcement",
    accentHex: "#0d9488",
    matches: (org) => externalCategory(org, "state_enforcement"),
  },
  {
    id: "external_watchdog",
    label: "Watchdog flags",
    accentHex: "#4f46e5",
    matches: (org) => externalCategory(org, "watchdog"),
  },
];

const CATEGORY_BY_ID = new Map(
  FRAUD_MAP_CATEGORIES.map((c) => [c.id, c])
);

export function getFraudMapCategory(id: string): FraudMapCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}

export function getCategoriesForOrg(org: FraudMapOrg): FraudMapCategory[] {
  return FRAUD_MAP_CATEGORIES.filter((c) => c.matches(org));
}

function severityScore(
  sev: "high" | "medium" | "info" | string | undefined
): number {
  if (sev === "high") return 3;
  if (sev === "medium") return 2;
  if (sev === "info") return 1;
  return 0;
}

/** Strongest single category for pin color (external and risk both considered). */
export function getPrimaryCategoryForOrg(org: FraudMapOrg): FraudMapCategory | null {
  const matched = getCategoriesForOrg(org);
  if (matched.length === 0) return null;

  let best: { cat: FraudMapCategory; score: number; idx: number } | null = null;

  for (const cat of matched) {
    const idx = FRAUD_MAP_CATEGORIES.findIndex((c) => c.id === cat.id);
    let score = 0;

    if (cat.id.startsWith("external_")) {
      const raw = cat.id.replace("external_", "") as ExternalCorroborationMatch["category"];
      const matches = org.externalCorroboration?.filter((m) => m.category === raw) ?? [];
      for (const m of matches) {
        score = Math.max(score, severityScore(m.severity));
      }
    } else {
      const sigs = org.riskSignals?.filter((s) => s.key === cat.id) ?? [];
      for (const s of sigs) {
        score = Math.max(score, s.severity === "high" ? 3 : 2);
      }
    }

    if (
      !best ||
      score > best.score ||
      (score === best.score && idx < best.idx)
    ) {
      best = { cat, score, idx };
    }
  }

  return best?.cat ?? matched[0] ?? null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Choropleth: neutral → accent by intensity t in [0,1]. */
export function categoryChoroplethFill(
  accentHex: string,
  t: number,
  isDark: boolean
): string {
  const neutral = isDark ? hexToRgb("#1f2937") : hexToRgb("#f3f4f6");
  const accent = hexToRgb(accentHex);
  const u = Math.min(Math.max(t, 0), 1);
  const r = Math.round(neutral.r + (accent.r - neutral.r) * u);
  const g = Math.round(neutral.g + (accent.g - neutral.g) * u);
  const b = Math.round(neutral.b + (accent.b - neutral.b) * u);
  return `rgb(${r},${g},${b})`;
}

export function categoryChoroplethHover(
  accentHex: string,
  isDark: boolean
): string {
  const base = hexToRgb(accentHex);
  if (isDark) {
    const r = Math.min(255, Math.round(base.r * 1.15 + 30));
    const g = Math.min(255, Math.round(base.g * 1.15 + 20));
    const b = Math.min(255, Math.round(base.b * 1.15 + 20));
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(base.r + (255 - base.r) * 0.45);
  const g = Math.round(base.g + (255 - base.g) * 0.45);
  const b = Math.round(base.b + (255 - base.b) * 0.45);
  return `rgb(${r},${g},${b})`;
}
