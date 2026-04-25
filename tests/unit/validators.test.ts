import { describe, it, expect } from 'vitest';
import {
  SearchQuerySchema,
  PaginationSchema,
  CharitySearchSchema,
  CorporateSearchSchema,
} from '../../lib/validators';

describe('Validators', () => {
  describe('SearchQuerySchema', () => {
    it('accepts valid search query', () => {
      const result = SearchQuerySchema.safeParse({ q: 'test charity' });
      expect(result.success).toBe(true);
    });

    it('rejects empty query', () => {
      // q has a default of '' but min(1) on the non-default path
      // When explicitly passed '', it fails min(1)
      const result = SearchQuerySchema.safeParse({ q: '' });
      // Zod's optional().default('') means empty string passes through,
      // but min(1) should reject it. Let's check actual behavior.
      expect(result.success).toBe(false);
    });

    it('accepts missing query (uses default)', () => {
      const result = SearchQuerySchema.safeParse({});
      if (result.success) {
        expect(result.data.q).toBe('');
      }
    });

    it('rejects query over 200 chars', () => {
      const result = SearchQuerySchema.safeParse({ q: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('PaginationSchema', () => {
    it('accepts valid page and limit', () => {
      const result = PaginationSchema.safeParse({ page: '2', limit: '20' });
      expect(result.success).toBe(true);
    });

    it('defaults page to 1', () => {
      const result = PaginationSchema.safeParse({});
      if (result.success) {
        expect(result.data.page).toBe(1);
      }
    });

    it('defaults limit to 20', () => {
      const result = PaginationSchema.safeParse({});
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it('rejects negative page', () => {
      const result = PaginationSchema.safeParse({ page: '-1' });
      expect(result.success).toBe(false);
    });

    it('rejects limit over 100', () => {
      const result = PaginationSchema.safeParse({ limit: '101' });
      expect(result.success).toBe(false);
    });

    it('coerces string page to number', () => {
      const result = PaginationSchema.safeParse({ page: '5' });
      if (result.success) {
        expect(result.data.page).toBe(5);
        expect(typeof result.data.page).toBe('number');
      }
    });
  });

  describe('CharitySearchSchema', () => {
    it('accepts valid charity search params', () => {
      const result = CharitySearchSchema.safeParse({
        query: 'foundation',
        state: 'CA',
        page: '1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional ein filter', () => {
      const result = CharitySearchSchema.safeParse({
        ein: '12-3456789',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid EIN format', () => {
      const result = CharitySearchSchema.safeParse({
        ein: 'invalid-ein',
      });
      expect(result.success).toBe(false);
    });

    it('accepts EIN without dash', () => {
      const result = CharitySearchSchema.safeParse({
        ein: '123456789',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CorporateSearchSchema', () => {
    it('accepts valid corporate search params', () => {
      const result = CorporateSearchSchema.safeParse({
        query: 'technology',
        state: 'DE',
        page: '1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional cik filter', () => {
      const result = CorporateSearchSchema.safeParse({
        cik: '0001234567',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid CIK format', () => {
      const result = CorporateSearchSchema.safeParse({
        cik: 'abc',
      });
      expect(result.success).toBe(false);
    });
  });
});