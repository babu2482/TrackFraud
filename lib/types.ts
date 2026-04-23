/**
 * Types for ProPublica API and our normalized charity/filing data.
 * ProPublica returns form-type-dependent fields; we map common IRS SOI names.
 */

export interface ProPublicaOrganization {
  ein: number;
  strein?: string;
  name: string;
  sub_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  subseccd?: number;
  subsection_code?: number;
  foundation_code?: number;
  ntee_code?: string;
  guidestar_url?: string;
  nccs_url?: string;
  updated?: string;
  [key: string]: unknown;
}

/** One year's filing; financial fields vary by form type (990, 990-EZ, 990-PF). */
export interface ProPublicaFiling {
  ein: number;
  tax_prd: number;
  tax_prd_yr: number;
  formtype: number; // 0=990, 1=990-EZ, 2=990-PF
  pdf_url?: string | null;
  updated?: string;
  totrevenue?: number;
  totfuncexpns?: number;
  totassetsend?: number;
  totliabend?: number;
  pct_compnsatncurrofcr?: number;
  /** Program service expenses (Form 990 Part IX) */
  totprgmrevnue?: number;
  [key: string]: unknown;
}

/** IRS SOI / ProPublica common field names for functional expenses (form-type-dependent). */
export const EXPENSE_KEYS = {
  program: ["totprgmsrvcexpns", "prgmsrvcexpns", "totprgmexpns"],
  management: ["totmgmtgenexpns", "mgmtandgenexpns", "managementsndgnrl"],
  fundraising: ["totfundraisingexpns", "fundraisingexpns", "totfundraising"],
} as const;

export interface CharitySearchResult {
  ein: string;
  name: string;
  city?: string;
  state?: string;
  ntee_code?: string;
  subseccd?: number;
  score?: number;
}

export interface LegalClassification {
  subsectionCode?: number;
  subsectionLabel?: string;
  formType?: number;
  formTypeLabel?: string;
  isPrivateFoundation?: boolean;
}

export interface RiskSignal {
  key: string;
  label: string;
  severity: "medium" | "high";
  detail: string;
  value?: number | null;
  threshold?: number;
}

export type FraudDomainId =
  | "charities"
  | "political"
  | "corporate"
  | "government"
  | "healthcare"
  | "consumer";

export type FraudMeterLevel =
  | "low"
  | "guarded"
  | "elevated"
  | "high"
  | "severe";

export interface ExternalCorroborationMatch {
  sourceId: string;
  sourceName: string;
  category: "revocation" | "sanction" | "state_enforcement" | "watchdog";
  severity: "info" | "medium" | "high";
  matchedOn: "ein" | "name";
  matchValue: string;
  description: string;
  observedAt?: string;
  url?: string;
}

export interface FraudMeter {
  domain: FraudDomainId;
  domainLabel: string;
  title: string;
  definition: string;
  score: number;
  level: FraudMeterLevel;
  label: string;
  summary: string;
  evidenceBasis: string;
  signalCount: number;
  highSignalCount: number;
  mediumSignalCount: number;
  corroborationCount: number;
  isFlagged: boolean;
}

export type MirrorDataSource = "local" | "live" | "merged";

export interface MirrorMetadata {
  dataSource: MirrorDataSource;
  sourceFreshnessAt: string | null;
  mirrorCoverage: string;
}

export interface HottestCharityResult extends CharitySearchResult {
  rank: number;
  latestFilingYear?: number;
  latestRevenue?: number;
  latestExpenses?: number;
  programExpenseRatio?: number | null;
  fundraisingEfficiency?: number | null;
  compensationPct?: number | null;
  legalClassification?: LegalClassification;
  riskSignals?: RiskSignal[];
  externalCorroboration?: ExternalCorroborationMatch[];
  fraudMeter?: FraudMeter;
  rankingScore?: number;
}

export interface RevenueBreakdown {
  total: number;
  contributions?: number;
  programService?: number;
  other?: number;
}

export interface ExpenseBreakdown {
  total: number;
  program: number;
  management: number;
  fundraising: number;
}

export interface CharityMetrics {
  filingYear: number;
  taxPeriod: number; // YYYYMM
  revenue: RevenueBreakdown;
  expenses: ExpenseBreakdown;
  /** Program expenses / total expenses (0–1). */
  programExpenseRatio: number | null;
  /** (Management + fundraising) / total expenses (0–1). */
  overheadRatio: number | null;
  /** Per $100: [program, management, fundraising]. */
  per100: [number, number, number] | null;
  /** Fundraising expenses / contributions (cost to raise $1). */
  fundraisingEfficiency: number | null;
  /** Compensation of officers/directors as share of expenses (0–1). */
  compensationPct: number | null;
  assets?: number;
  liabilities?: number;
  pdfUrl?: string | null;
  guidestarUrl?: string | null;
}

export interface CharityDetail {
  ein: string;
  name: string;
  subName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  nteeCode?: string;
  nteeCategory?: string;
  guidestarUrl?: string;
  /** Latest filing with full metrics; null if no financial data. */
  latest: CharityMetrics | null;
  /** Other filing years (for trend / multi-year). */
  otherYears: { year: number; taxPeriod: number }[];
  /** Peer comparison: median program expense ratio in same NTEE group (if available). */
  peerMedianProgramRatio?: number | null;
  /** Every field from the latest filing (key, label, value) for full transparency. */
  allFilingFields?: { key: string; label: string; value: string | number }[];
  legalClassification?: LegalClassification;
  riskSignals?: RiskSignal[];
  externalCorroboration?: ExternalCorroborationMatch[];
  fraudMeter?: FraudMeter;
}

export interface PeerComparison {
  nteeCategory: string;
  medianProgramRatio: number | null;
  sampleSize: number;
}
