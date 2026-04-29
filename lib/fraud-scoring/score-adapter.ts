/**
 * Score Adapter — Bridge between batch detection and the fraud meter.
 *
 * Converts DetectedSignal[] (from signal-detectors.ts / scorer.ts) into
 * the RiskSignal[] + ExternalCorroborationMatch[] format expected by
 * buildFraudMeter() in fraud-meter.ts.
 *
 * Also provides helpers to map between the two level systems:
 *   scorer.ts levels:   critical | high | medium | low
 *   fraud-meter levels: severe   | high | elevated | guarded | low
 */

import type { DetectedSignal } from "./signal-detectors";
import type {
  RiskSignal,
  ExternalCorroborationMatch,
  FraudDomainId,
  FraudMeterLevel,
} from "../types";
import { buildFraudMeter } from "../fraud-meter";

// ---------------------------------------------------------------------------
// Severity mapping (scorer -> fraud-meter)
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<string, "high" | "medium"> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "medium", // fraud-meter doesn't have "low" severity, so map to medium
};

/**
 * Map a scorer severity string to a fraud-meter severity.
 */
export function mapSeverity(severity: string): "high" | "medium" {
  return SEVERITY_MAP[severity] ?? "medium";
}

// ---------------------------------------------------------------------------
// Level mapping (fraud-meter -> database)
// ---------------------------------------------------------------------------

const LEVEL_DB_MAP: Record<FraudMeterLevel, string> = {
  severe: "critical",
  high: "high",
  elevated: "medium",
  guarded: "low",
  low: "low",
};

/**
 * Map a fraud-meter level to the string stored in FraudSnapshot.level.
 */
export function mapLevelToDb(level: FraudMeterLevel): string {
  return LEVEL_DB_MAP[level];
}

// ---------------------------------------------------------------------------
// Signal conversion
// ---------------------------------------------------------------------------

/**
 * Convert a DetectedSignal (batch/detection format) to a RiskSignal
 * (fraud-meter format).
 */
export function detectedSignalToRisk(
  signal: DetectedSignal,
): RiskSignal {
  return {
    key: signal.signalKey,
    label: signal.signalLabel,
    severity: mapSeverity(signal.severity),
    detail: signal.detail,
    value: signal.measuredValue ?? null,
    threshold: signal.thresholdValue,
  };
}

/**
 * Convert an array of DetectedSignals to RiskSignals.
 */
export function detectedSignalsToRisk(
  signals: DetectedSignal[],
): RiskSignal[] {
  return signals.map(detectedSignalToRisk);
}

// ---------------------------------------------------------------------------
// Domain resolution
// ---------------------------------------------------------------------------

/**
 * Infer the fraud domain from a category slug.
 */
export function categoryToDomain(
  categoryId: string,
): FraudDomainId {
  const map: Record<string, FraudDomainId> = {
    charities: "charities",
    charity: "charities",
    political: "political",
    corporate: "corporate",
    government: "government",
    healthcare: "healthcare",
    consumer: "consumer",
  };
  return map[categoryId] ?? "charities";
}

// ---------------------------------------------------------------------------
// Unified scoring
// ---------------------------------------------------------------------------

/**
 * Unified scoring function that takes DetectedSignals and returns a
 * FraudSnapshot-compatible result using the fraud-meter engine.
 */
export function unifiedScore({
  signals,
  categoryId,
}: {
  signals: DetectedSignal[];
  categoryId: string;
}) {
  const domain = categoryToDomain(categoryId);
  const riskSignals = detectedSignalsToRisk(signals);

  const meter = buildFraudMeter({
    domain,
    riskSignals,
  });

  return {
    /** 0-100 integer stored in FraudSnapshot.score */
    score: meter.score,
    /** Level string stored in FraudSnapshot.level (e.g. "critical", "high") */
    level: mapLevelToDb(meter.level),
    /** Human-readable band label */
    bandLabel: meter.label,
    /** Number of active signals */
    activeSignalCount: meter.signalCount,
    /** Corroboration count (always 0 when only internal signals are used) */
    corroborationCount: meter.corroborationCount,
    /** One-line explanation */
    explanation: meter.summary,
    /** Full fraud meter for API responses */
    meter,
  };
}

export interface UnifiedScoreResult {
  score: number;
  level: string;
  bandLabel: string;
  activeSignalCount: number;
  corroborationCount: number;
  explanation: string;
  meter: ReturnType<typeof buildFraudMeter>;
}

// ---------------------------------------------------------------------------
// Backwards-compatibility: convert old scorer results to new format
// ---------------------------------------------------------------------------

/**
 * Old scorer result shape (from calculateFraudScore in scorer.ts).
 */
export interface LegacyFraudScore {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  bandLabel: string;
  baseScore: number;
  corroborationCount: number;
  activeSignalCount: number;
  explanation: string;
}

/**
 * Map a legacy scorer level to the new database-friendly level.
 */
export function mapLegacyLevel(level: string): string {
  return LEVEL_DB_MAP[level as FraudMeterLevel] ?? level;
}
