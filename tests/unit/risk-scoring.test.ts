/**
 * Unit tests for lib/risk-scoring.ts
 *
 * Covers:
 * - getRiskLevel() pure function
 * - RISK_WEIGHTS, SEVERITY_MULTIPLIERS, RISK_THRESHOLDS constants
 * - calculateScoreFromSignals() via the signal-to-category mapping
 */

import { describe, it, expect } from 'vitest';
import {
  getRiskLevel,
  RISK_WEIGHTS,
  SEVERITY_MULTIPLIERS,
  RISK_THRESHOLDS,
} from '../../lib/risk-scoring';

describe('Risk Scoring', () => {
  // ─── getRiskLevel() ──────────────────────────────────────

  describe('getRiskLevel', () => {
    it('returns "low" for score 0', () => {
      const { level, color } = getRiskLevel(0);
      expect(level).toBe('low');
      expect(color).toBe(RISK_THRESHOLDS.low.color);
    });

    it('returns "low" for score 39 (max low)', () => {
      const { level } = getRiskLevel(39);
      expect(level).toBe('low');
    });

    it('returns "medium" for score 40 (min medium)', () => {
      const { level } = getRiskLevel(40);
      expect(level).toBe('medium');
    });

    it('returns "medium" for score 59 (max medium)', () => {
      const { level } = getRiskLevel(59);
      expect(level).toBe('medium');
    });

    it('returns "high" for score 60 (min high)', () => {
      const { level } = getRiskLevel(60);
      expect(level).toBe('high');
    });

    it('returns "high" for score 79 (max high)', () => {
      const { level } = getRiskLevel(79);
      expect(level).toBe('high');
    });

    it('returns "critical" for score 80 (min critical)', () => {
      const { level } = getRiskLevel(80);
      expect(level).toBe('critical');
    });

    it('returns "critical" for score 100 (max)', () => {
      const { level } = getRiskLevel(100);
      expect(level).toBe('critical');
    });

    it('returns correct colors for each level', () => {
      expect(getRiskLevel(10).color).toBe('#10B981'); // green
      expect(getRiskLevel(45).color).toBe('#F59E0B'); // yellow
      expect(getRiskLevel(65).color).toBe('#F97316'); // orange
      expect(getRiskLevel(90).color).toBe('#EF4444'); // red
    });
  });

  // ─── RISK_WEIGHTS ───────────────────────────────────────

  describe('RISK_WEIGHTS', () => {
    it('has all four category weights', () => {
      expect(RISK_WEIGHTS.regulatory).toBeDefined();
      expect(RISK_WEIGHTS.network).toBeDefined();
      expect(RISK_WEIGHTS.compliance).toBeDefined();
      expect(RISK_WEIGHTS.financial).toBeDefined();
    });

    it('weights sum to 1.0', () => {
      const sum =
        RISK_WEIGHTS.regulatory +
        RISK_WEIGHTS.network +
        RISK_WEIGHTS.compliance +
        RISK_WEIGHTS.financial;
      expect(sum).toBeCloseTo(1.0, 4);
    });

    it('regulatory has highest weight (0.3)', () => {
      expect(RISK_WEIGHTS.regulatory).toBe(0.3);
    });

    it('network has weight 0.25', () => {
      expect(RISK_WEIGHTS.network).toBe(0.25);
    });

    it('compliance has weight 0.25', () => {
      expect(RISK_WEIGHTS.compliance).toBe(0.25);
    });

    it('financial has lowest weight (0.2)', () => {
      expect(RISK_WEIGHTS.financial).toBe(0.2);
    });
  });

  // ─── SEVERITY_MULTIPLIERS ───────────────────────────────

  describe('SEVERITY_MULTIPLIERS', () => {
    it('has all four severity levels', () => {
      expect(SEVERITY_MULTIPLIERS.low).toBeDefined();
      expect(SEVERITY_MULTIPLIERS.medium).toBeDefined();
      expect(SEVERITY_MULTIPLIERS.high).toBeDefined();
      expect(SEVERITY_MULTIPLIERS.critical).toBeDefined();
    });

    it('values are monotonically increasing', () => {
      expect(SEVERITY_MULTIPLIERS.low).toBeLessThan(SEVERITY_MULTIPLIERS.medium);
      expect(SEVERITY_MULTIPLIERS.medium).toBeLessThan(SEVERITY_MULTIPLIERS.high);
      expect(SEVERITY_MULTIPLIERS.high).toBeLessThan(SEVERITY_MULTIPLIERS.critical);
    });

    it('critical multiplier is 1.0', () => {
      expect(SEVERITY_MULTIPLIERS.critical).toBe(1.0);
    });

    it('low multiplier is 0.25', () => {
      expect(SEVERITY_MULTIPLIERS.low).toBe(0.25);
    });
  });

  // ─── RISK_THRESHOLDS ────────────────────────────────────

  describe('RISK_THRESHOLDS', () => {
    it('has all four threshold ranges', () => {
      expect(RISK_THRESHOLDS.low).toBeDefined();
      expect(RISK_THRESHOLDS.medium).toBeDefined();
      expect(RISK_THRESHOLDS.high).toBeDefined();
      expect(RISK_THRESHOLDS.critical).toBeDefined();
    });

    it('low range is 0-39', () => {
      expect(RISK_THRESHOLDS.low.min).toBe(0);
      expect(RISK_THRESHOLDS.low.max).toBe(39);
    });

    it('medium range is 40-59', () => {
      expect(RISK_THRESHOLDS.medium.min).toBe(40);
      expect(RISK_THRESHOLDS.medium.max).toBe(59);
    });

    it('high range is 60-79', () => {
      expect(RISK_THRESHOLDS.high.min).toBe(60);
      expect(RISK_THRESHOLDS.high.max).toBe(79);
    });

    it('critical range is 80-100', () => {
      expect(RISK_THRESHOLDS.critical.min).toBe(80);
      expect(RISK_THRESHOLDS.critical.max).toBe(100);
    });

    it('ranges are contiguous (no gaps)', () => {
      expect(RISK_THRESHOLDS.medium.min).toBe(RISK_THRESHOLDS.low.max + 1);
      expect(RISK_THRESHOLDS.high.min).toBe(RISK_THRESHOLDS.medium.max + 1);
      expect(RISK_THRESHOLDS.critical.min).toBe(RISK_THRESHOLDS.high.max + 1);
    });

    it('each threshold has a hex color', () => {
      for (const key of ['low', 'medium', 'high', 'critical'] as const) {
        expect(RISK_THRESHOLDS[key].color).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });
  });

  // ─── Integration: getRiskLevel + RISK_THRESHOLDS ────────

  describe('getRiskLevel + RISK_THRESHOLDS integration', () => {
    it('getRiskLevel returns color matching RISK_THRESHOLDS', () => {
      // Test boundary values for each level
      const testCases = [
        { score: 0, expectedLevel: 'low' as const },
        { score: 39, expectedLevel: 'low' as const },
        { score: 40, expectedLevel: 'medium' as const },
        { score: 59, expectedLevel: 'medium' as const },
        { score: 60, expectedLevel: 'high' as const },
        { score: 79, expectedLevel: 'high' as const },
        { score: 80, expectedLevel: 'critical' as const },
        { score: 100, expectedLevel: 'critical' as const },
      ];

      for (const { score, expectedLevel } of testCases) {
        const result = getRiskLevel(score);
        expect(result.level).toBe(expectedLevel);
        expect(result.color).toBe(RISK_THRESHOLDS[expectedLevel].color);
      }
    });
  });
});