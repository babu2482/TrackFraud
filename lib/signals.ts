import type { LegalClassification, RiskSignal } from "./types";
import { RISK_THRESHOLDS } from "./policy";

export const SUBSECTION_LABELS: Record<number, string> = {
  2: "501(c)(2) Title-Holding Corporation",
  3: "501(c)(3) Public Charity or Private Foundation",
  4: "501(c)(4) Social Welfare Organization",
  5: "501(c)(5) Labor or Agricultural Organization",
  6: "501(c)(6) Business League or Chamber",
  7: "501(c)(7) Social Club",
  8: "501(c)(8) Fraternal Beneficiary Society",
  9: "501(c)(9) Voluntary Employees Beneficiary Association",
  10: "501(c)(10) Domestic Fraternal Society",
  11: "501(c)(11) Teachers' Retirement Fund",
  12: "501(c)(12) Mutual Utility",
  13: "501(c)(13) Cemetery Company",
  14: "501(c)(14) Credit Union",
  15: "501(c)(15) Mutual Insurance Company",
  16: "501(c)(16) Cooperative for Crop Financing",
  17: "501(c)(17) Supplemental Unemployment Benefit Trust",
  18: "501(c)(18) Employee Pension Trust",
  19: "501(c)(19) Veterans Organization",
  20: "501(c)(20) Group Legal Services Plan",
  21: "501(c)(21) Black Lung Benefit Trust",
  22: "501(c)(22) Withdrawal Liability Payment Fund",
  23: "501(c)(23) Veterans Post",
  24: "501(c)(24) Section 4049 Trust",
  25: "501(c)(25) Title-Holding Corporation with Multiple Parents",
  26: "501(c)(26) State High-Risk Health Coverage Organization",
  27: "501(c)(27) State Workers Compensation Reinsurance",
  28: "501(c)(28) National Railroad Retirement Investment Trust",
  29: "4947(a)(1) Non-Exempt Charitable Trust",
};

export const FORM_TYPE_LABELS: Record<number, string> = {
  0: "Form 990",
  1: "Form 990-EZ",
  2: "Form 990-PF",
};

export function getSubsectionLabel(code: number | undefined): string | undefined {
  if (code == null) return undefined;
  return SUBSECTION_LABELS[code];
}

export function getFormTypeLabel(formType: number | undefined): string | undefined {
  if (formType == null) return undefined;
  return FORM_TYPE_LABELS[formType];
}

export function buildLegalClassification(params: {
  subsectionCode?: number;
  formType?: number;
}): LegalClassification {
  const subsectionCode = params.subsectionCode;
  const formType = params.formType;
  const formTypeLabel = getFormTypeLabel(formType);
  // Form 990-PF is the private foundation return.
  const isPrivateFoundation = formType === 2;

  return {
    subsectionCode,
    subsectionLabel: getSubsectionLabel(subsectionCode),
    formType,
    formTypeLabel,
    isPrivateFoundation,
  };
}

export function buildRiskSignals(params: {
  programExpenseRatio: number | null;
  fundraisingEfficiency: number | null;
  compensationPct: number | null;
}): RiskSignal[] {
  const out: RiskSignal[] = [];

  const programRatio = params.programExpenseRatio;
  if (programRatio != null && programRatio < RISK_THRESHOLDS.programExpenseRatioWarn) {
    out.push({
      key: "program_ratio_low",
      label: "Low Program Spending Ratio",
      severity:
        programRatio < RISK_THRESHOLDS.programExpenseRatioHigh
          ? "high"
          : "medium",
      detail:
        "Program spending is below the configured benchmark for spending on mission activities.",
      value: programRatio,
      threshold: RISK_THRESHOLDS.programExpenseRatioWarn,
    });
  }

  const fundraisingCostPerDollar = params.fundraisingEfficiency;
  if (
    fundraisingCostPerDollar != null &&
    fundraisingCostPerDollar > RISK_THRESHOLDS.fundraisingCostWarn
  ) {
    out.push({
      key: "fundraising_efficiency_high_cost",
      label: "High Fundraising Cost",
      severity:
        fundraisingCostPerDollar > RISK_THRESHOLDS.fundraisingCostHigh
          ? "high"
          : "medium",
      detail:
        "Fundraising cost per dollar raised is elevated relative to the configured policy threshold.",
      value: fundraisingCostPerDollar,
      threshold: RISK_THRESHOLDS.fundraisingCostWarn,
    });
  }

  const compensationPct = params.compensationPct;
  if (
    compensationPct != null &&
    compensationPct > RISK_THRESHOLDS.officerCompensationWarn
  ) {
    out.push({
      key: "officer_compensation_high",
      label: "High Officer Compensation Share",
      severity:
        compensationPct > RISK_THRESHOLDS.officerCompensationHigh
          ? "high"
          : "medium",
      detail:
        "Officer and director compensation is a large share of total expenses.",
      value: compensationPct,
      threshold: RISK_THRESHOLDS.officerCompensationWarn,
    });
  }

  return out;
}
