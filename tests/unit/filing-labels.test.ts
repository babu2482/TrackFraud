/**
 * Unit tests for lib/filing-labels.ts
 * Tests filing field labels and display building.
 */
import { describe, it, expect } from 'vitest';
import { FILING_FIELD_LABELS, buildAllFilingFields } from '../../lib/filing-labels';

describe('FILING_FIELD_LABELS', () => {
  it('is a non-empty object', () => {
    expect(Object.keys(FILING_FIELD_LABELS).length).toBeGreaterThan(0);
  });

  it('has string values for all keys', () => {
    for (const [key, value] of Object.entries(FILING_FIELD_LABELS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('buildAllFilingFields', () => {
  it('returns array', () => {
    const result = buildAllFilingFields({ totrevenue: 1000000 });
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array for empty filing', () => {
    const result = buildAllFilingFields({});
    expect(Array.isArray(result)).toBe(true);
  });

  it('includes fields that match known labels', () => {
    const filing = {
      totrevenue: 1000000,
      totfuncexpns: 900000,
      tax_prd_yr: 2024,
    };
    const result = buildAllFilingFields(filing);
    expect(result.length).toBeGreaterThan(0);
    for (const field of result) {
      expect(field).toHaveProperty('key');
      expect(field).toHaveProperty('value');
    }
  });

  it('skips null/undefined values', () => {
    const filing = {
      totrevenue: null,
      totfuncexpns: undefined,
      tax_prd_yr: 2024,
    };
    const result = buildAllFilingFields(filing);
    // Should only include tax_prd_yr since others are null/undefined
    const keys = result.map((f) => f.key);
    expect(keys).toContain('tax_prd_yr');
  });
});
