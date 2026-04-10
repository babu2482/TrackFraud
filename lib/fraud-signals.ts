/**
 * Universal fraud signal framework. Every category uses these types and
 * helpers to produce signals in a consistent shape.
 *
 * A signal is NOT an accusation — it means a data point falls outside
 * normal statistical ranges. The UI explains what the value is, what the
 * threshold is, and lets the user judge.
 */

import type { RiskSignal } from "./types";

export type { RiskSignal };

export type Severity = "medium" | "high";

interface SignalInput {
  key: string;
  label: string;
  detail: string;
  value?: number | null;
  threshold?: number;
}

export function makeSignal(severity: Severity, input: SignalInput): RiskSignal {
  return { severity, ...input };
}

export function warnOrHigh(
  value: number,
  warnThreshold: number,
  highThreshold: number,
  /** true when "greater than threshold" is bad (default), false when "less than" is bad */
  higherIsBad = true
): Severity | null {
  if (higherIsBad) {
    if (value >= highThreshold) return "high";
    if (value >= warnThreshold) return "medium";
  } else {
    if (value <= highThreshold) return "high";
    if (value <= warnThreshold) return "medium";
  }
  return null;
}

/**
 * Composite risk score from a set of signals. Each signal contributes
 * points based on severity (high=3, medium=1). This gives a single
 * number for ranking flagged entities.
 */
export function compositeScore(signals: RiskSignal[]): number {
  let score = 0;
  for (const s of signals) {
    score += s.severity === "high" ? 3 : 1;
  }
  return score;
}
