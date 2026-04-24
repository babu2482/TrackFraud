import { describe, it, expect } from 'vitest';
import {
  searchSchema,
  paginationSchema,
  charitySearchParamsSchema,
  corporateSearchParamsSchema,
} from '../../lib/validators';

describe('Validators', () => {
  describe('searchSchema', () => {
    it('accepts valid search query', () => {
      const result = searchSchema.safeParse({ q: 'test charity' });
      expect(result.success).toBe(true);
    });

    it('rejects empty query', () => {
      const result = searchSchema.safeParse({ q: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing query', () => {
      const result = searchSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('accepts valid page and limit', () => {
      const result = paginationSchema.safeParse({ page: '2', limit: '20' });
      expect(result.success).toBe(true);
    });

    it('defaults page to 1', () => {
      const result = paginationSchema.safeParse({});
      if (result.success) {
        expect(result.data.page).toBe(1);
      }
    });

    it('rejects negative page', () => {
      const result = paginationSchema.safeParse({ page: '-1' });
      expect(result.success).toBe(false);
    });
  });

  describe('charitySearchParamsSchema', () => {
    it('accepts valid charity search params', () => {
      const result = charitySearchParamsSchema.safeParse({
        q: 'foundation',
        state: 'CA',
        page: '1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional ein filter', () => {
      const result = charitySearchParamsSchema.safeParse({
        ein: '12-3456789',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('corporateSearchParamsSchema', () => {
    it('accepts valid corporate search params', () => {
      const result = corporateSearchParamsSchema.safeParse({
        q: 'technology',
        state: 'DE',
        page: '1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional cik filter', () => {
      const result = corporateSearchParamsSchema.safeParse({
        cik: '0001234567',
      });
      expect(result.success).toBe(true);
    });
  });
});
