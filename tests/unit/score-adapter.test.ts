/**
 * Unit tests for lib/fraud-scoring/score-adapter.ts
 *
 * Tests severity mapping, level-to-db mapping, signal conversion,
 * domain resolution, and unified scoring.
 */
import { describe, it, expect } from "vitest";
import {
  mapSeverity,
  mapLevelToDb,
  detectedSignalToRisk,
  detectedSignalsToRisk,
  categoryToDomain,
  unifiedScore,
  mapLegacyLevel,
} from "../../lib/fraud-scoring/score-adapter";
import type { DetectedSignal } from "../../lib/fraud-scoring/signal-detectors";

// ---------------------------------------------------------------------------
// Helper: create a minimal DetectedSignal for testing
// ---------------------------------------------------------------------------

function makeSignal(overrides: Partial<DetectedSignal> = {}): DetectedSignal {
  return {
    entityId: "entity-1",
    sourceSystemId: "source-1",
    signalKey: "test_signal",
    signalLabel: "Test Signal",
    severity: "medium",
    detail: "Test detail string",
    measuredValue: 75,
    measuredText: "75%",
    thresholdValue: 50,
    scoreImpact: 10,
    sourceRecordId: "record-1",
    methodologyVersion: "v2",
    status: "active",
    observedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mapSeverity
// ---------------------------------------------------------------------------

describe("mapSeverity", () => {
  it('maps "critical" to "high"', () => {
    expect(mapSeverity("critical")).toBe("high");
  });

  it('maps "high" to "high"', () => {
    expect(mapSeverity("high")).toBe("high");
  });

  it('maps "medium" to "medium"', () => {
    expect(mapSeverity("medium")).toBe("medium");
  });

  it('maps "low" to "medium"', () => {
    expect(mapSeverity("low")).toBe("medium");
  });

  it('falls back to "medium" for unknown severity', () => {
    expect(mapSeverity("unknown")).toBe("medium");
    expect(mapSeverity("")).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// mapLevelToDb
// ---------------------------------------------------------------------------

describe("mapLevelToDb", () => {
  it('maps "severe" to "critical"', () => {
    expect(mapLevelToDb("severe")).toBe("critical");
  });

  it('maps "high" to "high"', () => {
    expect(mapLevelToDb("high")).toBe("high");
  });

  it('maps "elevated" to "medium"', () => {
    expect(mapLevelToDb("elevated")).toBe("medium");
  });

  it('maps "guarded" to "low"', () => {
    expect(mapLevelToDb("guarded")).toBe("low");
  });

  it('maps "low" to "low"', () => {
    expect(mapLevelToDb("low")).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// detectedSignalToRisk
// ---------------------------------------------------------------------------

describe("detectedSignalToRisk", () => {
  it("converts signalKey to key", () => {
    const signal = makeSignal({ signalKey: "excluded_provider_billing" });
    const risk = detectedSignalToRisk(signal);
    expect(risk.key).toBe("excluded_provider_billing");
  });

  it("converts signalLabel to label", () => {
    const signal = makeSignal({ signalLabel: "Excluded Provider with Active Payments" });
    const risk = detectedSignalToRisk(signal);
    expect(risk.label).toBe("Excluded Provider with Active Payments");
  });

  it("maps severity via mapSeverity", () => {
    const critical = makeSignal({ severity: "critical" });
    expect(detectedSignalToRisk(critical).severity).toBe("high");

    const low = makeSignal({ severity: "low" });
    expect(detectedSignalToRisk(low).severity).toBe("medium");

    const medium = makeSignal({ severity: "medium" });
    expect(detectedSignalToRisk(medium).severity).toBe("medium");
  });

  it("passes through detail", () => {
    const signal = makeSignal({ detail: "Custom detail text" });
    const risk = detectedSignalToRisk(signal);
    expect(risk.detail).toBe("Custom detail text");
  });

  it("maps measuredValue to value", () => {
    const signal = makeSignal({ measuredValue: 85 });
    const risk = detectedSignalToRisk(signal);
    expect(risk.value).toBe(85);
  });

  it("maps undefined measuredValue to null value", () => {
    const signal = makeSignal({ measuredValue: undefined });
    const risk = detectedSignalToRisk(signal);
    expect(risk.value).toBeNull();
  });

  it("maps thresholdValue to threshold", () => {
    const signal = makeSignal({ thresholdValue: 60 });
    const risk = detectedSignalToRisk(signal);
    expect(risk.threshold).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// detectedSignalsToRisk
// ---------------------------------------------------------------------------

describe("detectedSignalsToRisk", () => {
  it("converts an array of signals", () => {
    const signals = [
      makeSignal({ severity: "critical", signalKey: "sig_a" }),
      makeSignal({ severity: "high", signalKey: "sig_b" }),
      makeSignal({ severity: "low", signalKey: "sig_c" }),
    ];
    const risks = detectedSignalsToRisk(signals);

    expect(risks).toHaveLength(3);
    expect(risks[0].key).toBe("sig_a");
    expect(risks[0].severity).toBe("high");
    expect(risks[1].key).toBe("sig_b");
    expect(risks[1].severity).toBe("high");
    expect(risks[2].key).toBe("sig_c");
    expect(risks[2].severity).toBe("medium");
  });

  it("returns empty array for empty input", () => {
    expect(detectedSignalsToRisk([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// categoryToDomain
// ---------------------------------------------------------------------------

describe("categoryToDomain", () => {
  it('maps "charities" to "charities"', () => {
    expect(categoryToDomain("charities")).toBe("charities");
  });

  it('maps "charity" to "charities"', () => {
    expect(categoryToDomain("charity")).toBe("charities");
  });

  it('maps "political" to "political"', () => {
    expect(categoryToDomain("political")).toBe("political");
  });

  it('maps "corporate" to "corporate"', () => {
    expect(categoryToDomain("corporate")).toBe("corporate");
  });

  it('maps "government" to "government"', () => {
    expect(categoryToDomain("government")).toBe("government");
  });

  it('maps "healthcare" to "healthcare"', () => {
    expect(categoryToDomain("healthcare")).toBe("healthcare");
  });

  it('maps "consumer" to "consumer"', () => {
    expect(categoryToDomain("consumer")).toBe("consumer");
  });

  it('falls back to "charities" for unknown category', () => {
    expect(categoryToDomain("unknown")).toBe("charities");
    expect(categoryToDomain("")).toBe("charities");
  });
});

// ---------------------------------------------------------------------------
// unifiedScore
// ---------------------------------------------------------------------------

describe("unifiedScore", () => {
  it("returns score 0 and level 'low' with no signals", () => {
    const result = unifiedScore({
      signals: [],
      categoryId: "healthcare",
    });

    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
    expect(result.activeSignalCount).toBe(0);
    expect(result.corroborationCount).toBe(0);
  });

  it("includes meter with correct domain", () => {
    const result = unifiedScore({
      signals: [],
      categoryId: "healthcare",
    });

    expect(result.meter.domain).toBe("healthcare");
  });

  it("resolves domain from category via categoryToDomain", () => {
    const healthcareResult = unifiedScore({
      signals: [],
      categoryId: "healthcare",
    });
    expect(healthcareResult.meter.domain).toBe("healthcare");

    const charityResult = unifiedScore({
      signals: [],
      categoryId: "charity",
    });
    expect(charityResult.meter.domain).toBe("charities");

    const defaultResult = unifiedScore({
      signals: [],
      categoryId: "weird_category",
    });
    expect(defaultResult.meter.domain).toBe("charities");
  });

  it("adds high-severity signals when provided", () => {
    const signals = [makeSignal({ severity: "critical" })];
    const result = unifiedScore({
      signals,
      categoryId: "healthcare",
    });

    expect(result.activeSignalCount).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(26); // high severity = 26 pts + base
  });

  it("adds medium-severity signals when provided", () => {
    const signals = [makeSignal({ severity: "medium" })];
    const result = unifiedScore({
      signals,
      categoryId: "healthcare",
    });

    expect(result.activeSignalCount).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(12); // medium severity = 12 pts + base
  });

  it("maps meter level to db-friendly string", () => {
    const signals = [makeSignal({ severity: "critical" })];
    const result = unifiedScore({
      signals,
      categoryId: "healthcare",
    });

    // A single high signal produces score >= 30 => "high" level
    // mapLevelToDb("high") = "high"
    expect(result.level).toBe(result.meter.level === "high" ? "high" : result.meter.level === "severe" ? "critical" : result.meter.level === "elevated" ? "medium" : "low");
  });

  it("returns bandLabel from fraud meter", () => {
    const result = unifiedScore({
      signals: [],
      categoryId: "healthcare",
    });

    expect(result.bandLabel).toBe(result.meter.label);
  });

  it("returns explanation from fraud meter summary", () => {
    const result = unifiedScore({
      signals: [],
      categoryId: "healthcare",
    });

    expect(typeof result.explanation).toBe("string");
    expect(result.explanation).toBe(result.meter.summary);
  });

  it("scores multiple signals with synergy", () => {
    const signals = [
      makeSignal({ severity: "critical" }),
      makeSignal({ severity: "high" }),
    ];
    const result = unifiedScore({
      signals,
      categoryId: "healthcare",
    });

    expect(result.activeSignalCount).toBe(2);
    // Two high signals should produce synergy bonus
    const singleScore = unifiedScore({
      signals: [makeSignal({ severity: "critical" })],
      categoryId: "healthcare",
    }).score;
    expect(result.score).toBeGreaterThan(singleScore);
  });

  it("flags entity when score is high enough", () => {
    const signals = [makeSignal({ severity: "critical" })];
    const result = unifiedScore({
      signals,
      categoryId: "healthcare",
    });

    expect(result.meter.isFlagged).toBe(true);
  });

  it("does not flag entity with no signals", () => {
    const result = unifiedScore({
      signals: [],
      categoryId: "healthcare",
    });

    expect(result.meter.isFlagged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapLegacyLevel
// ---------------------------------------------------------------------------

describe("mapLegacyLevel", () => {
  it('maps "severe" to "critical"', () => {
    expect(mapLegacyLevel("severe")).toBe("critical");
  });

  it('passes through "high"', () => {
    expect(mapLegacyLevel("high")).toBe("high");
  });

  it('maps "elevated" to "medium"', () => {
    expect(mapLegacyLevel("elevated")).toBe("medium");
  });

  it('maps "guarded" to "low"', () => {
    expect(mapLegacyLevel("guarded")).toBe("low");
  });

  it('maps "low" to "low"', () => {
    expect(mapLegacyLevel("low")).toBe("low");
  });

  it("returns the input for unmapped values", () => {
    expect(mapLegacyLevel("unknown")).toBe("unknown");
  });
});
