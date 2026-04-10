import type { RiskSignal } from "./types";
import { makeSignal, warnOrHigh } from "./fraud-signals";
import { CORPORATE_THRESHOLDS as T } from "./policy";

interface Filing {
  form: string;
  filingDate: string;
  primaryDocDescription?: string;
}

export interface CorporateMetrics {
  lateFilingCount: number;
  restatementCount: number;
  auditorChangeCount: number;
  filingGapMonths: number | null;
  lateFilingForms: string[];
  restatementForms: string[];
}

const LATE_PATTERNS = /^NT\s*10-[KQ]/i;
const RESTATEMENT_PATTERNS = /^10-[KQ]\/A/i;
const AUDITOR_CHANGE_PATTERN = /4\.01|change.*accountant|change.*auditor/i;

export function computeCorporateMetrics(filings: Filing[]): CorporateMetrics {
  let lateFilingCount = 0;
  let restatementCount = 0;
  let auditorChangeCount = 0;
  const lateFilingForms: string[] = [];
  const restatementForms: string[] = [];

  for (const f of filings) {
    if (LATE_PATTERNS.test(f.form)) {
      lateFilingCount++;
      lateFilingForms.push(`${f.form} (${f.filingDate})`);
    }
    if (RESTATEMENT_PATTERNS.test(f.form)) {
      restatementCount++;
      restatementForms.push(`${f.form} (${f.filingDate})`);
    }
    if (
      f.form === "8-K" &&
      f.primaryDocDescription &&
      AUDITOR_CHANGE_PATTERN.test(f.primaryDocDescription)
    ) {
      auditorChangeCount++;
    }
  }

  let filingGapMonths: number | null = null;
  if (filings.length > 0) {
    const sorted = [...filings].sort(
      (a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime()
    );
    const latest = new Date(sorted[0].filingDate);
    const now = new Date();
    filingGapMonths = (now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24 * 30);
  }

  return {
    lateFilingCount,
    restatementCount,
    auditorChangeCount,
    filingGapMonths,
    lateFilingForms,
    restatementForms,
  };
}

export function buildCorporateSignals(filings: Filing[]): RiskSignal[] {
  const m = computeCorporateMetrics(filings);
  const signals: RiskSignal[] = [];

  if (m.lateFilingCount > 0) {
    const sev = warnOrHigh(m.lateFilingCount, T.lateFilingCountWarn, T.lateFilingCountHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "corporate_late_filing",
        label: "Late SEC Filing (NT Notification)",
        detail: `${m.lateFilingCount} Non-Timely filing notification(s): ${m.lateFilingForms.join("; ")}. An NT filing means the company told the SEC it cannot file its financials on time. This is one of the strongest statistical predictors of accounting problems or fraud. Enron, WorldCom, and Wirecard all had late filings before their collapses.`,
        value: m.lateFilingCount,
        threshold: T.lateFilingCountWarn,
      }));
    }
  }

  if (m.restatementCount > 0) {
    const sev = warnOrHigh(m.restatementCount, T.restatementCountWarn, T.restatementCountHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "corporate_restatement",
        label: "Financial Restatement (Amended Filing)",
        detail: `${m.restatementCount} amended filing(s): ${m.restatementForms.join("; ")}. A restatement means the company is admitting its original financial numbers were wrong. This can indicate accounting errors, aggressive practices, or fraud.`,
        value: m.restatementCount,
        threshold: T.restatementCountWarn,
      }));
    }
  }

  if (m.auditorChangeCount > 0) {
    const sev = warnOrHigh(m.auditorChangeCount, T.auditorChangeCountWarn, T.auditorChangeCountHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "corporate_auditor_change",
        label: "Auditor Change",
        detail: `${m.auditorChangeCount} auditor change(s) detected in recent filings. Companies that switch auditors may be "auditor shopping" after disagreements about accounting treatment. Multiple changes in a short period is a stronger red flag.`,
        value: m.auditorChangeCount,
        threshold: T.auditorChangeCountWarn,
      }));
    }
  }

  if (m.filingGapMonths != null) {
    const sev = warnOrHigh(m.filingGapMonths, T.filingGapMonthsWarn, T.filingGapMonthsHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "corporate_filing_gap",
        label: "Extended Filing Silence",
        detail: `No SEC filings in the past ${Math.round(m.filingGapMonths)} months. Public companies are required to file quarterly (10-Q) and annually (10-K). Prolonged silence from a previously active filer can indicate the company is in distress or under investigation.`,
        value: m.filingGapMonths,
        threshold: T.filingGapMonthsWarn,
      }));
    }
  }

  return signals;
}
