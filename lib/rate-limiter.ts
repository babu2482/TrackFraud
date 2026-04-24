/**
 * Redis-backed rate limiter with in-memory fallback.
 *
 * Uses Redis sorted sets for atomic, distributed rate limiting.
 * Falls back to in-memory Map if Redis is unavailable.
 */

import { Redis } from 'ioredis';

// ─── Configuration ────────────────────────────────────────────────────

export const RATE_LIMIT_TIERS = {
  strict: { maxRequests: 10, windowSeconds: 60 },      // 10 req/min (write operations)
  standard: { maxRequests: 60, windowSeconds: 60 },     // 60 req/min (read operations)
  relaxed: { maxRequests: 120, windowSeconds: 60 },     // 120 req/min (public search)
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

// ─── Types ────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp when window resets
}

// ─── Redis Client (singleton) ─────────────────────────────────────────

let redisClient: Redis | null = null;
let redisAvailable = false;

export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      showFriendlyErrorStack: false,
    });

    // Test connection
    redisClient.on('connect', () => {
      redisAvailable = true;
    });

    redisClient.on('error', () => {
      redisAvailable = false;
    });

    // Attempt immediate connection
    redisClient.connect().catch(() => {
      redisAvailable = false;
    });

    return redisClient;
  } catch {
    redisAvailable = false;
    return null;
  }
}

// ─── In-Memory Fallback ───────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (now - entry.windowStart > 120000) {
      memoryStore.delete(key);
    }
  }
}, 60000);

function checkMemoryRateLimit(key: string, maxRequests: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / (windowSeconds * 1000))}`;

  const entry = memoryStore.get(windowKey);

  if (!entry || now - entry.windowStart >= windowSeconds * 1000) {
    memoryStore.set(windowKey, { count: 1, windowStart: now });
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      reset: Math.floor((now + windowSeconds * 1000) / 1000),
    };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);

  return {
    success: entry.count <= maxRequests,
    limit: maxRequests,
    remaining,
    reset: Math.floor((entry.windowStart + windowSeconds * 1000) / 1000),
  };
}

// ─── Redis Rate Limiting ──────────────────────────────────────────────

/**
 * Sliding window rate limiting using Redis sorted sets.
 *
 * Algorithm:
 * 1. Remove entries outside the current window (ZREMRANGEBYSCORE)
 * 2. Count current entries (ZCARD)
 * 3. If under limit, add new entry (ZADD) and set expiry (EXPIRE)
 * 4. Return result with remaining count
 */
async function checkRedisRateLimit(
  redis: Redis,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const redisKey = `rl:${key}`;

  try {
    // Use pipeline for atomicity
    const pipeline = redis.pipeline();

    // Remove old entries
    pipeline.zremrangebyscore(redisKey, 0, windowStart);

    // Count current entries
    pipeline.zcard(redisKey);

    // Set expiry on the key
    pipeline.expire(redisKey, windowSeconds + 1);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= maxRequests) {
      // Over limit - get the oldest entry to calculate reset time
      const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const resetTime = oldest?.[1]
        ? Math.floor(((Number(oldest[1]) + windowSeconds * 1000) / 1000))
        : Math.floor((now + windowSeconds * 1000) / 1000);

      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: resetTime,
      };
    }

    // Add new entry (unique member using timestamp + random suffix)
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    await redis.zadd(redisKey, now, member);

    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - currentCount - 1,
      reset: Math.floor((now + windowSeconds * 1000) / 1000),
    };
  } catch {
    // Redis failed - fall back to memory
    return checkMemoryRateLimit(key, maxRequests, windowSeconds);
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export function getRateLimitConfig(tier: RateLimitTier = 'standard') {
  return RATE_LIMIT_TIERS[tier];
}

/**
 * Check rate limit for a given key and tier.
 * Uses Redis if available, falls back to in-memory.
 */
export async function checkRateLimit(
  key: string,
  tier: RateLimitTier = 'standard'
): Promise<RateLimitResult> {
  const config = getRateLimitConfig(tier);
  const { maxRequests, windowSeconds } = config;

  const redis = getRedisClient();
  if (redis && redisAvailable) {
    return checkRedisRateLimit(redis, key, maxRequests, windowSeconds);
  }

  // Fall back to in-memory
  return checkMemoryRateLimit(key, maxRequests, windowSeconds);
}

/**
 * Generate rate limit headers for HTTP responses.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  };
}

/**
 * Get the rate limit key from a request.
 * Prefers API key, falls back to IP address.
 */
export function getRateLimitKey(
  apiKey: string | null,
  ip: string
): string {
  return apiKey ? `key:${apiKey}` : `ip:${ip}`;
}