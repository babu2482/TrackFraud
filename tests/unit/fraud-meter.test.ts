/**
 * Unit tests for lib/fraud-meter.ts
 * Tests fraud scoring, level calculations, and corroboration logic.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFraudMeter,
  computeCharityFraudBaseScore,
  fraudMeterTone,
  fraudMeterAccent,
} from '../../lib/fraud-meter';
import type { RiskSignal, ExternalCorroborationMatch } from '../../lib/types';

const sampleSignal = (severity: 'high' | 'medium' = 'high'): RiskSignal => ({
  key: 'test_signal',
  label: 'Test Signal',
  severity,
  detail: 'Test description',
  value: 0.8,
  threshold: 0.5,
});

const sampleCorroboration = (
  category: 'revocation' | 'sanction' | 'state_enforcement' | 'watchdog' = 'watchdog',
  severity: 'high' | 'medium' | 'info' = 'medium'
): ExternalCorroborationMatch => ({
  sourceId: 'test',
  sourceName: 'Test Source',
  category,
  severity,
  matchedOn: 'ein',
  matchValue: '123456789',
  description: 'Test Match',
  url: 'https://test.com',
});

describe('buildFraudMeter', () => {
  it('returns low score with no signals', () => {
    const meter = buildFraudMeter({ domain: 'charities' });
    expect(meter.score).toBe(0);
    expect(meter.level).toBe('low');
    expect(meter.isFlagged).toBe(false);
    expect(meter.signalCount).toBe(0);
  });

  it('includes domain metadata', () => {
    const meter = buildFraudMeter({ domain: 'charities' });
    expect(meter.domain).toBe('charities');
    expect(meter.domainLabel).toBe('Charities & Nonprofits');
    expect(meter.title).toBe('Charity Fraud Meter');
  });

  it('adds base score of 8 when signals present', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('medium')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(8);
  });

  it('adds 26 points per high-severity signal', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('high')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(26);
  });

  it('adds 12 points per medium-severity signal', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('medium')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(12);
  });

  it('adds synergy bonus for 2+ signals', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('high'), sampleSignal('medium')],
    });
    expect(meter.score).toBeGreaterThan(
      buildFraudMeter({ domain: 'charities', riskSignals: [sampleSignal('high')] }).score
    );
  });

  it('adds synergy bonus for 2+ high signals', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('high'), sampleSignal('high')],
    });
    expect(meter.highSignalCount).toBe(2);
    expect(meter.isFlagged).toBe(true);
  });

  it('adds corroboration weight for external matches', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('watchdog', 'high')],
    });
    expect(meter.corroborationCount).toBe(1);
    expect(meter.score).toBeGreaterThan(0);
  });

  it('high-severity corroboration adds 20 points', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('watchdog', 'high')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(20);
  });

  it('sets evidence basis to "Internal pattern evidence only" for signals only', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('high')],
    });
    expect(meter.evidenceBasis).toBe('Internal pattern evidence only');
  });

  it('sets evidence basis to "External corroboration present" for corrob only', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration()],
    });
    expect(meter.evidenceBasis).toBe('External corroboration present');
  });

  it('sets evidence basis to "Internal patterns plus external corroboration" for both', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('high')],
      externalCorroboration: [sampleCorroboration()],
    });
    expect(meter.evidenceBasis).toBe('Internal patterns plus external corroboration');
  });

  it('caps score at 100', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      baseScore: 55,
      riskSignals: [
        sampleSignal('high'),
        sampleSignal('high'),
        sampleSignal('high'),
        sampleSignal('high'),
      ],
      externalCorroboration: [
        sampleCorroboration('sanction', 'high'),
        sampleCorroboration('revocation', 'high'),
      ],
    });
    expect(meter.score).toBeLessThanOrEqual(100);
  });

  it('flags entity when score >= 30', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [sampleSignal('high')],
    });
    expect(meter.isFlagged).toBe(true);
  });
});

describe('corroboration floor logic', () => {
  it('watchdog corroboration sets floor to 35', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('watchdog')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(35);
  });

  it('revocation corroboration sets floor to 74', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('revocation')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(74);
  });

  it('state_enforcement corroboration sets floor to 80', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('state_enforcement')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(80);
  });

  it('sanction corroboration sets floor to 90', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('sanction')],
    });
    expect(meter.score).toBeGreaterThanOrEqual(90);
  });

  it('2+ high-severity corroboration sets floor to 86', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [
        sampleCorroboration('watchdog', 'high'),
        sampleCorroboration('revocation', 'high'),
      ],
    });
    expect(meter.score).toBeGreaterThanOrEqual(86);
  });
});

describe('meter level assignments', () => {
  it('score 0-14 is "low"', () => {
    const meter = buildFraudMeter({ domain: 'charities' });
    expect(meter.level).toBe('low');
    expect(meter.label).toBe('Low');
  });

  it('score 80+ is "severe"', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      externalCorroboration: [sampleCorroboration('sanction', 'high')],
      riskSignals: [sampleSignal('high'), sampleSignal('high')],
    });
    expect(meter.level).toBe('severe');
  });
});

describe('computeCharityFraudBaseScore', () => {
  it('returns 0 for healthy metrics', () => {
    const score = computeCharityFraudBaseScore({
      programExpenseRatio: 0.9,
      fundraisingEfficiency: 0.05,
      compensationPct: 0.01,
    });
    expect(score).toBe(0);
  });

  it('adds score for low program expense ratio', () => {
    const score = computeCharityFraudBaseScore({
      programExpenseRatio: 0.5,
      fundraisingEfficiency: null,
      compensationPct: null,
    });
    expect(score).toBeGreaterThan(0);
  });

  it('adds score for high fundraising costs', () => {
    const score = computeCharityFraudBaseScore({
      programExpenseRatio: null,
      fundraisingEfficiency: 0.3,
      compensationPct: null,
    });
    expect(score).toBeGreaterThan(0);
  });

  it('adds score for high compensation percentage', () => {
    const score = computeCharityFraudBaseScore({
      programExpenseRatio: null,
      fundraisingEfficiency: null,
      compensationPct: 0.1,
    });
    expect(score).toBeGreaterThan(0);
  });

  it('caps at 55', () => {
    const score = computeCharityFraudBaseScore({
      programExpenseRatio: 0,
      fundraisingEfficiency: 1.0,
      compensationPct: 1.0,
    });
    expect(score).toBeLessThanOrEqual(55);
  });

  it('handles all nulls', () => {
    const score = computeCharityFraudBaseScore({
      programExpenseRatio: null,
      fundraisingEfficiency: null,
      compensationPct: null,
    });
    expect(score).toBe(0);
  });
});

describe('fraudMeterTone', () => {
  it('returns "high" for severe level', () => {
    expect(fraudMeterTone('severe')).toBe('high');
  });

  it('returns "high" for high level', () => {
    expect(fraudMeterTone('high')).toBe('high');
  });

  it('returns "medium" for elevated level', () => {
    expect(fraudMeterTone('elevated')).toBe('medium');
  });

  it('returns "medium" for guarded level', () => {
    expect(fraudMeterTone('guarded')).toBe('medium');
  });

  it('returns "info" for low level', () => {
    expect(fraudMeterTone('low')).toBe('info');
  });
});

describe('fraudMeterAccent', () => {
  it('returns dark red for severe', () => {
    expect(fraudMeterAccent('severe')).toBe('#991b1b');
  });

  it('returns red for high', () => {
    expect(fraudMeterAccent('high')).toBe('#dc2626');
  });

  it('returns orange for elevated', () => {
    expect(fraudMeterAccent('elevated')).toBe('#ea580c');
  });

  it('returns amber for guarded', () => {
    expect(fraudMeterAccent('guarded')).toBe('#d97706');
  });

  it('returns blue for low', () => {
    expect(fraudMeterAccent('low')).toBe('#2563eb');
  });
});