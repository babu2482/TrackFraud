/**
 * Derive transparency and red-flag metrics from a ProPublica filing object.
 * ProPublica returns form-type-dependent keys; we try common IRS SOI names.
 */

import type { ProPublicaFiling } from "./types";

function getNumber(filing: ProPublicaFiling, keys: string[]): number | null {
  for (const key of keys) {
    const v = filing[key];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}

/** Total functional expenses. */
export function getTotalExpenses(filing: ProPublicaFiling): number | null {
  return getNumber(filing, ["totfuncexpns", "totfuncexpns"]);
}

/** Program service expenses. */
export function getProgramExpenses(filing: ProPublicaFiling): number | null {
  return getNumber(filing, [
    "totprgmsrvcexpns",
    "prgmsrvcexpns",
    "totprgmexpns",
  ]);
}

/** Management and general expenses. */
export function getManagementExpenses(filing: ProPublicaFiling): number | null {
  return getNumber(filing, [
    "totmgmtgenexpns",
    "mgmtandgenexpns",
    "managementsndgnrl",
  ]);
}

/** Fundraising expenses. */
export function getFundraisingExpenses(filing: ProPublicaFiling): number | null {
  return getNumber(filing, [
    "totfundraisingexpns",
    "fundraisingexpns",
    "totfundraising",
  ]);
}

/** Contributions (gifts, grants). */
export function getContributions(filing: ProPublicaFiling): number | null {
  return getNumber(filing, [
    "totcntrbtns",
    "cntrbtns",
    "cntrbts",
    "totcontributions",
  ]);
}

export function getTotalRevenue(filing: ProPublicaFiling): number | null {
  return getNumber(filing, ["totrevenue", "totrevnue", "totrcptperbks"]);
}

export function getProgramServiceRevenue(filing: ProPublicaFiling): number | null {
  return getNumber(filing, ["totprgmrevnue", "prgmrevnue", "prgmservicerev"]);
}

/**
 * Build expense breakdown from filing. If we only have total expenses,
 * we still return it and use program/management/fundraising when present.
 */
export function getExpenseBreakdown(filing: ProPublicaFiling): {
  total: number;
  program: number;
  management: number;
  fundraising: number;
} {
  const total = getTotalExpenses(filing) ?? 0;
  const program = getProgramExpenses(filing) ?? 0;
  const management = getManagementExpenses(filing) ?? 0;
  const fundraising = getFundraisingExpenses(filing) ?? 0;

  // If we have components that don't sum to total, normalize to total for "per $100"
  const sum = program + management + fundraising;
  let p = program,
    m = management,
    f = fundraising;
  if (total > 0 && sum > 0 && Math.abs(sum - total) > 1) {
    const scale = total / sum;
    p = program * scale;
    m = management * scale;
    f = fundraising * scale;
  }

  return { total, program: p, management: m, fundraising: f };
}

export function getRevenueBreakdown(filing: ProPublicaFiling): {
  total: number;
  contributions?: number;
  programService?: number;
  other?: number;
} {
  const total = getTotalRevenue(filing) ?? 0;
  const contributions = getContributions(filing) ?? undefined;
  const programService = getProgramServiceRevenue(filing) ?? undefined;
  const other =
    total > 0 && (contributions != null || programService != null)
      ? total - (contributions ?? 0) - (programService ?? 0)
      : undefined;

  return { total, contributions, programService, other };
}

/** Program expense ratio (0–1). Null if no total expenses. */
export function getProgramExpenseRatio(filing: ProPublicaFiling): number | null {
  const total = getTotalExpenses(filing);
  const program = getProgramExpenses(filing);
  if (total == null || total <= 0 || program == null) return null;
  return program / total;
}

/** Overhead = (management + fundraising) / total expenses (0–1). */
export function getOverheadRatio(filing: ProPublicaFiling): number | null {
  const total = getTotalExpenses(filing);
  const mgmt = getManagementExpenses(filing) ?? 0;
  const fund = getFundraisingExpenses(filing) ?? 0;
  if (total == null || total <= 0) return null;
  return (mgmt + fund) / total;
}

/** Cost to raise $1 (fundraising / contributions). */
export function getFundraisingEfficiency(filing: ProPublicaFiling): number | null {
  const contributions = getContributions(filing);
  const fundraising = getFundraisingExpenses(filing);
  if (contributions == null || contributions <= 0 || fundraising == null)
    return null;
  return fundraising / contributions;
}

/** Per $100: [program, management, fundraising]. */
export function getPer100(
  filing: ProPublicaFiling
): [number, number, number] | null {
  const { total, program, management, fundraising } =
    getExpenseBreakdown(filing);
  if (total <= 0) return null;
  // If the IRS extract doesn't include a functional-expense breakdown,
  // all components will be zero even though total expenses are positive.
  // In that case, we should NOT pretend the org spent $0 on everything;
  // instead, skip the per-$100 view.
  if (program === 0 && management === 0 && fundraising === 0) {
    return null;
  }
  return [
    (program / total) * 100,
    (management / total) * 100,
    (fundraising / total) * 100,
  ];
}
