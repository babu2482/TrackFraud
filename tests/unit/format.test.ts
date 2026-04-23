/**
 * Unit tests for lib/format.ts
 * Tests all formatting utility functions.
 */
import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatPct,
  formatTimestamp,
  formatSubsection,
  formatScore,
  formatRiskValue,
  formatRiskThreshold,
  formatCorroborationCategory,
  formatFieldValue,
} from '../../lib/format';

describe('formatMoney', () => {
  it('formats billions', () => {
    expect(formatMoney(1_500_000_000)).toBe('$1.5B');
  });

  it('formats millions', () => {
    expect(formatMoney(2_500_000)).toBe('$2.5M');
  });

  it('formats thousands', () => {
    expect(formatMoney(1_500)).toBe('$1.5K');
  });

  it('formats small numbers', () => {
    expect(formatMoney(42)).toBe('$42');
  });

  it('handles zero', () => {
    expect(formatMoney(0)).toBe('$0');
  });

  it('returns dash for null/undefined', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(NaN)).toBe('—');
  });
});

describe('formatPct', () => {
  it('formats percentage', () => {
    expect(formatPct(0.75)).toBe('75.0%');
  });

  it('handles zero', () => {
    expect(formatPct(0)).toBe('0.0%');
  });

  it('handles 100%', () => {
    expect(formatPct(1.0)).toBe('100.0%');
  });

  it('returns dash for null/undefined', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
    expect(formatPct(NaN)).toBe('—');
  });
});

describe('formatTimestamp', () => {
  it('returns null for empty input', () => {
    expect(formatTimestamp(undefined)).toBeNull();
    expect(formatTimestamp('')).toBeNull();
  });

  it('returns null for invalid date', () => {
    expect(formatTimestamp('not-a-date')).toBeNull();
  });

  it('formats valid ISO date', () => {
    const result = formatTimestamp('2024-01-15T10:30:00Z');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

describe('formatSubsection', () => {
  it('returns null for undefined', () => {
    expect(formatSubsection(undefined)).toBeNull();
  });

  it('formats special code 29', () => {
    expect(formatSubsection(29)).toBe('4947(a)(1)');
  });

  it('formats standard codes', () => {
    expect(formatSubsection(3)).toBe('501(c)(3)');
    expect(formatSubsection(4)).toBe('501(c)(4)');
    expect(formatSubsection(501)).toBe('501(c)(501)');
  });
});

describe('formatScore', () => {
  it('formats score to 1 decimal', () => {
    expect(formatScore(85.5)).toBe('85.5');
    expect(formatScore(70)).toBe('70.0');
  });

  it('returns null for invalid input', () => {
    expect(formatScore(undefined)).toBeNull();
    expect(formatScore(NaN)).toBeNull();
  });
});

describe('formatRiskValue', () => {
  it('returns "Not reported" for missing value', () => {
    expect(formatRiskValue({ key: 'test', value: null })).toBe('Not reported');
    expect(formatRiskValue({ key: 'test', value: undefined })).toBe('Not reported');
    expect(formatRiskValue({ key: 'test', value: NaN })).toBe('Not reported');
  });

  it('formats fundraising_efficiency_high_cost specially', () => {
    const result = formatRiskValue({ key: 'fundraising_efficiency_high_cost', value: 1.25 });
    expect(result).toBe('$1.25 to raise $1');
  });

  it('formats other signals as percentage', () => {
    const result = formatRiskValue({ key: 'program_ratio_low', value: 0.75 });
    expect(result).toBe('75.0%');
  });
});

describe('formatRiskThreshold', () => {
  it('returns "Not configured" for missing threshold', () => {
    expect(formatRiskThreshold({ key: 'test', threshold: undefined })).toBe('Not configured');
    expect(formatRiskThreshold({ key: 'test', threshold: NaN })).toBe('Not configured');
  });

  it('formats fundraising_efficiency_high_cost specially', () => {
    const result = formatRiskThreshold({ key: 'fundraising_efficiency_high_cost', threshold: 1.5 });
    expect(result).toBe('> $1.50 to raise $1');
  });

  it('formats program_ratio_low with less-than', () => {
    const result = formatRiskThreshold({ key: 'program_ratio_low', threshold: 0.65 });
    expect(result).toBe('< 65.0%');
  });

  it('formats other signals with greater-than', () => {
    const result = formatRiskThreshold({ key: 'other_signal', threshold: 0.8 });
    expect(result).toBe('> 80.0%');
  });
});

describe('formatCorroborationCategory', () => {
  it('formats revocation', () => {
    expect(formatCorroborationCategory('revocation')).toBe('Revocation');
  });

  it('formats sanction', () => {
    expect(formatCorroborationCategory('sanction')).toBe('Sanction');
  });

  it('formats state_enforcement', () => {
    expect(formatCorroborationCategory('state_enforcement')).toBe('State enforcement');
  });

  it('formats watchdog', () => {
    expect(formatCorroborationCategory('watchdog')).toBe('Watchdog');
  });
});

describe('formatFieldValue', () => {
  it('returns string values as-is', () => {
    expect(formatFieldValue('hello', 'any')).toBe('hello');
  });

  it('formats percentage fields', () => {
    expect(formatFieldValue(0.75, 'pct_compnsatncurrofcr')).toBe('75.00%');
    expect(formatFieldValue(0.5, 'pct_something')).toBe('50.00%');
  });

  it('formats special fields as plain numbers', () => {
    expect(formatFieldValue(3, 'formtype')).toBe('3');
    expect(formatFieldValue(123, 'subseccd')).toBe('123');
  });

  it('formats money fields', () => {
    expect(formatFieldValue(500000, 'totalrevenue')).toBe('$500.0K');
  });

  it('returns dash for NaN', () => {
    expect(formatFieldValue(NaN, 'any')).toBe('—');
  });
});