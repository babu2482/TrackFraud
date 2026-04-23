/**
 * Unit tests for lib/us-states.ts
 * Tests US states utility data.
 */
import { describe, it, expect } from 'vitest';
import { US_STATES, abbrToName, fipsToAbbr, fipsToName, abbrToFips } from '../../lib/us-states';

describe('US_STATES', () => {
  it('exports states array', () => {
    expect(Array.isArray(US_STATES)).toBe(true);
    expect(US_STATES.length).toBeGreaterThan(0);
  });

  it('includes all 50 states plus DC', () => {
    expect(US_STATES.length).toBeGreaterThanOrEqual(51);
  });

  it('each state has abbr and name', () => {
    for (const state of US_STATES) {
      expect(state).toHaveProperty('abbr');
      expect(state).toHaveProperty('name');
      expect(typeof state.abbr).toBe('string');
      expect(typeof state.name).toBe('string');
    }
  });

  it('includes common states', () => {
    const abbrs = US_STATES.map((s) => s.abbr);
    expect(abbrs).toContain('CA');
    expect(abbrs).toContain('NY');
    expect(abbrs).toContain('TX');
    expect(abbrs).toContain('DC');
  });
});

describe('State lookup functions', () => {
  it('abbrToName returns state name', () => {
    expect(abbrToName('CA')).toBe('California');
    expect(abbrToName('NY')).toBe('New York');
  });

  it('abbrToName returns undefined for unknown', () => {
    expect(abbrToName('XX')).toBeUndefined();
  });

  it('fipsToAbbr returns abbreviation', () => {
    expect(fipsToAbbr('06')).toBe('CA');
    expect(fipsToAbbr('36')).toBe('NY');
  });

  it('fipsToAbbr returns undefined for unknown', () => {
    expect(fipsToAbbr('99')).toBeUndefined();
  });

  it('fipsToName returns state name', () => {
    expect(fipsToName('06')).toBe('California');
  });

  it('abbrToFips returns FIPS code', () => {
    expect(abbrToFips('CA')).toBe('06');
    expect(abbrToFips('NY')).toBe('36');
  });

  it('abbrToFips returns undefined for unknown', () => {
    expect(abbrToFips('XX')).toBeUndefined();
  });
});
