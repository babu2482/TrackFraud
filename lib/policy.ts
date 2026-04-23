/**
 * Central scoring and threshold policy for all fraud categories.
 * Keep all tunable constants here so product calibration is explicit.
 */

// ── Charities ──────────────────────────────────────────────────────
export const CHARITY_THRESHOLDS = {
  programExpenseRatioWarn: 0.7,
  programExpenseRatioHigh: 0.55,
  fundraisingCostWarn: 0.25,
  fundraisingCostHigh: 0.5,
  officerCompensationWarn: 0.1,
  officerCompensationHigh: 0.18,
} as const;

/** @deprecated Use CHARITY_THRESHOLDS instead. Kept for backward compat. */
export const RISK_THRESHOLDS = CHARITY_THRESHOLDS;

export const RANKING_WEIGHTS = {
  revenueLogWeight: 20,
  programRatioWeight: 60,
  fundraisingEfficiencyWeight: 24,
  recencyYearWeight: 3,
  compensationPenaltyWeight: 45,
  compensationPenaltyStart: 0.1,
} as const;

// ── Political ──────────────────────────────────────────────────────
export const POLITICAL_THRESHOLDS = {
  // Operating expenses as share of total disbursements. Scam PACs
  // spend 80%+ on overhead (salaries, consultants, rent) with almost
  // nothing going to actual political activity.
  operatingExpenseRatioWarn: 0.6,
  operatingExpenseRatioHigh: 0.8,

  // Committees that spend far more than they raise are burning cash.
  disbursementToReceiptsWarn: 1.5,
  disbursementToReceiptsHigh: 3.0,

  // Debt as a share of receipts — over-leveraged committees.
  debtToReceiptsWarn: 0.5,
  debtToReceiptsHigh: 1.0,

  // Committee with receipts but near-zero political disbursements.
  dormancyReceiptFloor: 50_000,
  dormancyDisbursementCeiling: 5_000,
} as const;

// ── Corporate ──────────────────────────────────────────────────────
export const CORPORATE_THRESHOLDS = {
  // Number of late-filing (NT) forms that trigger warnings.
  lateFilingCountWarn: 1,
  lateFilingCountHigh: 2,

  // Restatement (amended filing) counts.
  restatementCountWarn: 1,
  restatementCountHigh: 3,

  // Auditor changes in the past 3 years.
  auditorChangeCountWarn: 1,
  auditorChangeCountHigh: 2,

  // Filing gap in months before flagging silence.
  filingGapMonthsWarn: 6,
  filingGapMonthsHigh: 12,
} as const;

// ── Government ─────────────────────────────────────────────────────
export const GOVERNMENT_THRESHOLDS = {
  // Cost overrun = total_obligation / base_and_all_options_value.
  costOverrunWarn: 1.5,
  costOverrunHigh: 3.0,

  // Dollar floor for non-competed flags (small sole-source purchases
  // are normal; large ones are suspicious).
  nonCompetedDollarFloor: 500_000,

  // Number of offers — "competed" with only 1 bid is suspicious.
  singleBidThreshold: 1,
} as const;

// ── Healthcare ─────────────────────────────────────────────────────
export const HEALTHCARE_THRESHOLDS = {
  // Doctor total payments vs specialty median multiplier.
  outlierMultiplierWarn: 3,
  outlierMultiplierHigh: 5,

  // Share of payments from a single company.
  concentrationWarn: 0.5,
  concentrationHigh: 0.7,

  // Number of separate payments from one company in one year.
  volumeCountWarn: 15,
  volumeCountHigh: 30,

  // High-risk payment types (substrings to match).
  highRiskPaymentTypes: [
    "consulting",
    "compensation for services",
    "ownership or investment interest",
    "royalty or license",
    "honoraria",
  ],
} as const;

// ── Consumer ───────────────────────────────────────────────────────
export const CONSUMER_THRESHOLDS = {
  // Relief rate = complaints resolved with any relief / total.
  reliefRateWarn: 0.15,
  reliefRateHigh: 0.05,

  // Consumer dispute rate.
  disputeRateWarn: 0.3,
  disputeRateHigh: 0.5,

  // Company untimeliness rate.
  untimelyRateWarn: 0.1,
  untimelyRateHigh: 0.25,

  // Product concentration — single product dominating complaints.
  productConcentrationWarn: 0.7,
  productConcentrationHigh: 0.85,

  // Minimum complaint count before signals are meaningful.
  minimumComplaintCount: 5,
} as const;
