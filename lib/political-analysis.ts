import type { RiskSignal } from "./types";
import { makeSignal, warnOrHigh } from "./fraud-signals";
import { POLITICAL_THRESHOLDS as T } from "./policy";

interface PoliticalTotals {
  cycle: number;
  receipts?: number;
  disbursements?: number;
  operating_expenditures?: number;
  contributions?: number;
  cash_on_hand_end_period?: number;
  debts_owed_by_committee?: number;
  individual_contributions?: number;
  other_political_committee_contributions?: number;
}

export interface PoliticalMetrics {
  operatingExpenseRatio: number | null;
  disbursementToReceiptsRatio: number | null;
  debtToReceiptsRatio: number | null;
  isDormant: boolean;
  cashRetention: number | null;
}

export function computePoliticalMetrics(totals: PoliticalTotals): PoliticalMetrics {
  const receipts = totals.receipts ?? 0;
  const disbursements = totals.disbursements ?? 0;
  const opex = totals.operating_expenditures ?? 0;
  const debt = totals.debts_owed_by_committee ?? 0;

  const operatingExpenseRatio =
    disbursements > 0 ? opex / disbursements : null;

  const disbursementToReceiptsRatio =
    receipts > 0 ? disbursements / receipts : null;

  const debtToReceiptsRatio =
    receipts > 0 ? debt / receipts : null;

  const isDormant =
    receipts >= T.dormancyReceiptFloor &&
    disbursements <= T.dormancyDisbursementCeiling;

  const cashRetention =
    receipts > 0 ? (totals.cash_on_hand_end_period ?? 0) / receipts : null;

  return {
    operatingExpenseRatio,
    disbursementToReceiptsRatio,
    debtToReceiptsRatio,
    isDormant,
    cashRetention,
  };
}

export function buildPoliticalSignals(totals: PoliticalTotals): RiskSignal[] {
  const m = computePoliticalMetrics(totals);
  const signals: RiskSignal[] = [];

  if (m.operatingExpenseRatio != null) {
    const sev = warnOrHigh(m.operatingExpenseRatio, T.operatingExpenseRatioWarn, T.operatingExpenseRatioHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "political_high_operating_expense",
        label: "High Operating Expense Ratio",
        detail: `${(m.operatingExpenseRatio * 100).toFixed(1)}% of disbursements go to operating expenses rather than political activity. Committees that spend most of their money on overhead and salaries — not on candidates or causes — may exist primarily to enrich their operators.`,
        value: m.operatingExpenseRatio,
        threshold: T.operatingExpenseRatioWarn,
      }));
    }
  }

  if (m.disbursementToReceiptsRatio != null) {
    const sev = warnOrHigh(m.disbursementToReceiptsRatio, T.disbursementToReceiptsWarn, T.disbursementToReceiptsHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "political_burn_rate",
        label: "Spending Far Exceeds Fundraising",
        detail: `Disbursements are ${m.disbursementToReceiptsRatio.toFixed(1)}x receipts. This committee is spending far more than it raises — it may be burning through reserves or extracting value.`,
        value: m.disbursementToReceiptsRatio,
        threshold: T.disbursementToReceiptsWarn,
      }));
    }
  }

  if (m.debtToReceiptsRatio != null) {
    const sev = warnOrHigh(m.debtToReceiptsRatio, T.debtToReceiptsWarn, T.debtToReceiptsHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "political_high_debt",
        label: "High Debt Relative to Fundraising",
        detail: `Debt is ${(m.debtToReceiptsRatio * 100).toFixed(0)}% of receipts. Committees carrying excessive debt relative to their fundraising may be insolvent or using debt to mask poor financial management.`,
        value: m.debtToReceiptsRatio,
        threshold: T.debtToReceiptsWarn,
      }));
    }
  }

  if (m.isDormant) {
    signals.push(makeSignal("high", {
      key: "political_dormant",
      label: "Dormant Committee — Collecting but Not Spending",
      detail: `This committee raised $${((totals.receipts ?? 0) / 1000).toFixed(0)}K+ but disbursed almost nothing for political purposes. Dormant committees that continue to collect money without spending it on their stated mission may be warehousing funds for personal use.`,
      value: totals.disbursements ?? 0,
      threshold: T.dormancyDisbursementCeiling,
    }));
  }

  return signals;
}
