import type { RiskSignal } from "./types";
import { makeSignal, warnOrHigh } from "./fraud-signals";
import { HEALTHCARE_THRESHOLDS as T } from "./policy";

interface Payment {
  total_amount_of_payment_usdollars?: string;
  applicable_manufacturer_or_applicable_gpo_making_payment_name?: string;
  nature_of_payment_or_transfer_of_value?: string;
  physician_specialty?: string;
}

export interface HealthcareMetrics {
  totalPayments: number;
  paymentCount: number;
  topCompany: string | null;
  topCompanyShare: number | null;
  topCompanyCount: number;
  highRiskPaymentShare: number;
  highRiskTypes: string[];
  specialty: string | null;
}

export function computeHealthcareMetrics(payments: Payment[]): HealthcareMetrics {
  if (payments.length === 0) {
    return {
      totalPayments: 0, paymentCount: 0, topCompany: null,
      topCompanyShare: null, topCompanyCount: 0,
      highRiskPaymentShare: 0, highRiskTypes: [], specialty: null,
    };
  }

  let totalPayments = 0;
  const byCompany = new Map<string, { total: number; count: number }>();
  let highRiskTotal = 0;
  const highRiskTypesSet = new Set<string>();
  let specialty: string | null = null;

  for (const p of payments) {
    const amount = parseFloat(p.total_amount_of_payment_usdollars ?? "0") || 0;
    totalPayments += amount;

    const company = p.applicable_manufacturer_or_applicable_gpo_making_payment_name ?? "Unknown";
    const entry = byCompany.get(company) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += 1;
    byCompany.set(company, entry);

    const nature = (p.nature_of_payment_or_transfer_of_value ?? "").toLowerCase();
    const isHighRisk = T.highRiskPaymentTypes.some((t) => nature.includes(t));
    if (isHighRisk) {
      highRiskTotal += amount;
      highRiskTypesSet.add(p.nature_of_payment_or_transfer_of_value ?? "");
    }

    if (!specialty && p.physician_specialty) {
      specialty = p.physician_specialty;
    }
  }

  let topCompany: string | null = null;
  let topCompanyTotal = 0;
  let topCompanyCount = 0;
  for (const [company, data] of byCompany) {
    if (data.total > topCompanyTotal) {
      topCompany = company;
      topCompanyTotal = data.total;
      topCompanyCount = data.count;
    }
  }

  const topCompanyShare = totalPayments > 0 ? topCompanyTotal / totalPayments : null;
  const highRiskPaymentShare = totalPayments > 0 ? highRiskTotal / totalPayments : 0;

  return {
    totalPayments,
    paymentCount: payments.length,
    topCompany,
    topCompanyShare,
    topCompanyCount,
    highRiskPaymentShare,
    highRiskTypes: Array.from(highRiskTypesSet),
    specialty,
  };
}

export function buildHealthcareSignals(payments: Payment[]): RiskSignal[] {
  const m = computeHealthcareMetrics(payments);
  const signals: RiskSignal[] = [];

  if (m.paymentCount === 0) return signals;

  if (m.topCompanyShare != null) {
    const sev = warnOrHigh(m.topCompanyShare, T.concentrationWarn, T.concentrationHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "healthcare_concentration",
        label: "Payment Concentration — Single Company",
        detail: `${(m.topCompanyShare * 100).toFixed(0)}% of this doctor's industry payments come from ${m.topCompany} ($${(m.totalPayments * m.topCompanyShare).toFixed(0)} of $${m.totalPayments.toFixed(0)} total). When most of a doctor's industry money comes from one company, it may indicate a financial dependency or kickback relationship that could influence prescribing decisions.`,
        value: m.topCompanyShare,
        threshold: T.concentrationWarn,
      }));
    }
  }

  if (m.topCompanyCount > 0) {
    const sev = warnOrHigh(m.topCompanyCount, T.volumeCountWarn, T.volumeCountHigh);
    if (sev) {
      signals.push(makeSignal(sev, {
        key: "healthcare_volume",
        label: "High Payment Volume from Single Company",
        detail: `${m.topCompanyCount} separate payments from ${m.topCompany} in the dataset. A large number of individual payments suggests an ongoing financial relationship, not a one-time interaction.`,
        value: m.topCompanyCount,
        threshold: T.volumeCountWarn,
      }));
    }
  }

  if (m.highRiskPaymentShare > 0.3) {
    const sev = m.highRiskPaymentShare > 0.6 ? "high" : "medium";
    signals.push(makeSignal(sev as "high" | "medium", {
      key: "healthcare_high_risk_types",
      label: "High-Risk Payment Categories",
      detail: `${(m.highRiskPaymentShare * 100).toFixed(0)}% of payments are in categories commonly associated with kickbacks: ${m.highRiskTypes.join(", ")}. Consulting fees, compensation for services, and ownership interests are the payment types most frequently involved in healthcare fraud cases.`,
      value: m.highRiskPaymentShare,
      threshold: 0.3,
    }));
  }

  return signals;
}
