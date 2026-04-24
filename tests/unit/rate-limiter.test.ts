import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkRateLimit,
  rateLimitHeaders,
  getRateLimitKey,
  getRateLimitConfig,
  RATE_LIMIT_TIERS,
  getRedisClient,
} from '../../lib/rate-limiter';

describe('Rate Limiter', () => {
  describe('getRateLimitConfig', () => {
    it('returns correct config for strict tier', () => {
      const config = getRateLimitConfig('strict');
      expect(config).toEqual({ maxRequests: 10, windowSeconds: 60 });
    });

    it('returns correct config for standard tier', () => {
      const config = getRateLimitConfig('standard');
      expect(config).toEqual({ maxRequests: 60, windowSeconds: 60 });
    });

    it('returns correct config for relaxed tier', () => {
      const config = getRateLimitConfig('relaxed');
      expect(config).toEqual({ maxRequests: 120, windowSeconds: 60 });
    });

    it('defaults to standard tier', () => {
      const config = getRateLimitConfig();
      expect(config).toEqual({ maxRequests: 60, windowSeconds: 60 });
    });
  });

  describe('RATE_LIMIT_TIERS', () => {
    it('has all three tiers defined', () => {
      expect(RATE_LIMIT_TIERS.strict).toBeDefined();
      expect(RATE_LIMIT_TIERS.standard).toBeDefined();
      expect(RATE_LIMIT_TIERS.relaxed).toBeDefined();
    });

    it('strict has lowest limit', () => {
      expect(RATE_LIMIT_TIERS.strict.maxRequests).toBeLessThan(RATE_LIMIT_TIERS.standard.maxRequests);
    });

    it('relaxed has highest limit', () => {
      expect(RATE_LIMIT_TIERS.relaxed.maxRequests).toBeGreaterThan(RATE_LIMIT_TIERS.standard.maxRequests);
    });
  });

  describe('rateLimitHeaders', () => {
    it('returns correct headers format', () => {
      const result = { success: true, limit: 60, remaining: 59, reset: 1700000060 };
      const headers = rateLimitHeaders(result);

      expect(headers).toEqual({
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '59',
        'X-RateLimit-Reset': '1700000060',
      });
    });

    it('handles zero remaining', () => {
      const result = { success: false, limit: 60, remaining: 0, reset: 1700000060 };
      const headers = rateLimitHeaders(result);

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
  });

  describe('getRateLimitKey', () => {
    it('returns API key based key when API key provided', () => {
      const key = getRateLimitKey('my-api-key-123', '192.168.1.1');
      expect(key).toBe('key:my-api-key-123');
    });

    it('returns IP based key when no API key', () => {
      const key = getRateLimitKey(null, '192.168.1.1');
      expect(key).toBe('ip:192.168.1.1');
    });

    it('returns IP based key when empty API key', () => {
      const key = getRateLimitKey('', '10.0.0.1');
      expect(key).toBe('ip:10.0.0.1');
    });
  });

  describe('checkRateLimit (in-memory fallback)', () => {
    beforeEach(() => {
      // Mock Redis as unavailable
      vi.mock('ioredis', () => ({
        Redis: vi.fn(() => ({
          connect: vi.fn(() => Promise.reject(new Error('Connection refused'))),
          on: vi.fn(),
        })),
      }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('allows requests under the limit', async () => {
      const result = await checkRateLimit('test-user-1', 'relaxed');
      expect(result.success).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('returns correct limit values', async () => {
      const result = await checkRateLimit('test-user-2', 'strict');
      expect(result.limit).toBe(10);
      expect(result.success).toBe(true);
    });

    it('has reset timestamp in future', async () => {
      const result = await checkRateLimit('test-user-3', 'standard');
      const now = Math.floor(Date.now() / 1000);
      expect(result.reset).toBeGreaterThan(now);
    });
  });
});
