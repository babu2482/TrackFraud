import type {
  ExternalCorroborationMatch,
  FraudDomainId,
  FraudMeter,
  FraudMeterLevel,
  RiskSignal,
} from "./types";

type FraudDomainMeta = {
  domainLabel: string;
  title: string;
  definition: string;
  signalLabel: string;
  noEvidenceSummary: string;
};

const FRAUD_DOMAIN_META: Record<FraudDomainId, FraudDomainMeta> = {
  charities: {
    domainLabel: "Charities & Nonprofits",
    title: "Charity Fraud Meter",
    definition:
      "For charities, fraud means donor money or tax-exempt resources may be diverted away from the stated mission, hidden behind weak disclosures, or linked to official adverse actions.",
    signalLabel: "filing-based fraud indicators",
    noEvidenceSummary:
      "No current charity-fraud indicators were triggered by the available filings or external evidence sources.",
  },
  political: {
    domainLabel: "Political & Campaign Finance",
    title: "Political Fraud Meter",
    definition:
      "For political entities, fraud means campaign money may be raised for political purposes but consumed by overhead, debt, or inactivity in ways that do not match the stated mission.",
    signalLabel: "campaign-finance fraud indicators",
    noEvidenceSummary:
      "No current political-fraud indicators were triggered by the available campaign-finance data.",
  },
  corporate: {
    domainLabel: "Corporate & Securities",
    title: "Corporate Fraud Meter",
    definition:
      "For public companies, fraud means accounting, disclosure, or reporting behavior may be inconsistent, delayed, or manipulated in ways associated with securities fraud.",
    signalLabel: "securities-fraud indicators",
    noEvidenceSummary:
      "No current corporate-fraud indicators were triggered by the available securities filings.",
  },
  government: {
    domainLabel: "Government Spending",
    title: "Government Fraud Meter",
    definition:
      "For public contracting, fraud means taxpayer money may be exposed to favoritism, non-competitive procurement, or runaway contract expansion beyond the original deal.",
    signalLabel: "procurement-fraud indicators",
    noEvidenceSummary:
      "No current government-spending fraud indicators were triggered by the available award data.",
  },
  healthcare: {
    domainLabel: "Healthcare",
    title: "Healthcare Fraud Meter",
    definition:
      "For healthcare payments, fraud means financial relationships may look concentrated or structured in ways commonly associated with kickbacks or conflicted medical decision-making.",
    signalLabel: "healthcare-fraud indicators",
    noEvidenceSummary:
      "No current healthcare-fraud indicators were triggered by the available payment records.",
  },
  consumer: {
    domainLabel: "Consumer",
    title: "Consumer Fraud Meter",
    definition:
      "For consumer protection, fraud means a company may be causing systematic harm while failing to resolve complaints, respond on time, or correct a concentrated product problem.",
    signalLabel: "consumer-fraud indicators",
    noEvidenceSummary:
      "No current consumer-fraud indicators were triggered by the available complaint data.",
  },
};

const LEVEL_META: Array<{
  min: number;
  level: FraudMeterLevel;
  label: string;
}> = [
  { min: 80, level: "severe", label: "Severe" },
  { min: 55, level: "high", label: "High" },
  { min: 30, level: "elevated", label: "Elevated" },
  { min: 15, level: "guarded", label: "Guarded" },
  { min: 0, level: "low", label: "Low" },
];

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function corroborationWeight(match: ExternalCorroborationMatch): number {
  if (match.severity === "high") return 20;
  if (match.severity === "medium") return 14;
  return 6;
}

function corroborationFloor(
  matches: ExternalCorroborationMatch[],
  currentScore: number
): number {
  let floor = currentScore;

  if (matches.some((m) => m.category === "watchdog")) {
    floor = Math.max(floor, 35);
  }
  if (matches.some((m) => m.category === "revocation")) {
    floor = Math.max(floor, 74);
  }
  if (matches.some((m) => m.category === "state_enforcement")) {
    floor = Math.max(floor, 80);
  }
  if (matches.some((m) => m.category === "sanction")) {
    floor = Math.max(floor, 90);
  }

  const highCount = matches.filter((m) => m.severity === "high").length;
  if (highCount >= 2) {
    floor = Math.max(floor, 86);
  } else if (highCount === 1) {
    floor = Math.max(floor, 72);
  }

  return floor;
}

function meterLevel(score: number): { level: FraudMeterLevel; label: string } {
  return (
    LEVEL_META.find((entry) => score >= entry.min) ?? LEVEL_META[LEVEL_META.length - 1]
  );
}

export function buildFraudMeter(params: {
  domain: FraudDomainId;
  riskSignals?: RiskSignal[];
  externalCorroboration?: ExternalCorroborationMatch[];
  baseScore?: number;
  baseSummary?: string;
}): FraudMeter {
  const riskSignals = params.riskSignals ?? [];
  const externalCorroboration = params.externalCorroboration ?? [];
  const meta = FRAUD_DOMAIN_META[params.domain];

  const highSignalCount = riskSignals.filter((s) => s.severity === "high").length;
  const mediumSignalCount = riskSignals.filter((s) => s.severity === "medium").length;
  const corroborationCount = externalCorroboration.length;

  let score = params.baseScore ?? 0;
  if (riskSignals.length > 0) score += 8;
  score += highSignalCount * 26;
  score += mediumSignalCount * 12;
  score += externalCorroboration.reduce(
    (sum, match) => sum + corroborationWeight(match),
    0
  );

  if (riskSignals.length >= 2) score += 6;
  if (highSignalCount >= 2) score += 8;
  if (corroborationCount > 0 && riskSignals.length > 0) score += 8;

  score = corroborationFloor(externalCorroboration, score);
  score = Math.min(score, 100);

  const { level, label } = meterLevel(score);
  const isFlagged = score >= 30;

  let evidenceBasis = "No current fraud-pattern evidence";
  if (riskSignals.length > 0 && corroborationCount > 0) {
    evidenceBasis = "Internal patterns plus external corroboration";
  } else if (corroborationCount > 0) {
    evidenceBasis = "External corroboration present";
  } else if (riskSignals.length > 0) {
    evidenceBasis = "Internal pattern evidence only";
  } else if ((params.baseScore ?? 0) > 0) {
    evidenceBasis = "Continuous metric pressure only";
  }

  let summary = meta.noEvidenceSummary;
  if (riskSignals.length > 0 || corroborationCount > 0) {
    const parts: string[] = [];
    if (highSignalCount > 0) {
      parts.push(`${highSignalCount} high-severity ${pluralize("indicator", highSignalCount)}`);
    }
    if (mediumSignalCount > 0) {
      parts.push(
        `${mediumSignalCount} watch-level ${pluralize("indicator", mediumSignalCount)}`
      );
    }
    if (corroborationCount > 0) {
      parts.push(
        `${corroborationCount} external ${pluralize("source", corroborationCount)}`
      );
    }

    summary = `This entity falls in the ${label.toLowerCase()} fraud band based on ${joinParts(parts)} across ${meta.signalLabel}.`;
  } else if ((params.baseScore ?? 0) > 0) {
    summary =
      params.baseSummary ??
      `This entity shows low-level fraud pressure from continuous ${meta.signalLabel}, even without a hard-threshold alert.`;
  }

  return {
    domain: params.domain,
    domainLabel: meta.domainLabel,
    title: meta.title,
    definition: meta.definition,
    score,
    level,
    label,
    summary,
    evidenceBasis,
    signalCount: riskSignals.length,
    highSignalCount,
    mediumSignalCount,
    corroborationCount,
    isFlagged,
  };
}

export function computeCharityFraudBaseScore(params: {
  programExpenseRatio: number | null;
  fundraisingEfficiency: number | null;
  compensationPct: number | null;
}): number {
  let score = 0;

  if (params.programExpenseRatio != null) {
    score += Math.max(0, (0.85 - params.programExpenseRatio) * 90);
  }
  if (params.fundraisingEfficiency != null) {
    score += Math.max(0, (params.fundraisingEfficiency - 0.1) * 70);
  }
  if (params.compensationPct != null) {
    score += Math.max(0, (params.compensationPct - 0.03) * 140);
  }

  return Math.min(Math.round(score), 55);
}

export function fraudMeterTone(
  level: FraudMeterLevel
): "high" | "medium" | "info" {
  if (level === "severe" || level === "high") return "high";
  if (level === "elevated" || level === "guarded") return "medium";
  return "info";
}

export function fraudMeterAccent(level: FraudMeterLevel): string {
  if (level === "severe") return "#991b1b";
  if (level === "high") return "#dc2626";
  if (level === "elevated") return "#ea580c";
  if (level === "guarded") return "#d97706";
  return "#2563eb";
}
