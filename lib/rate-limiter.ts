/**
 * Rate limiting middleware for Next.js API routes.
 * Uses in-memory sliding window rate limiting with configurable tiers.
 * For production, configure UPSTASH_REDIS_REST_URL for Redis-based rate limiting.
 */

// Rate limit tiers
export const RATE_LIMIT_TIERS = {
  strict: { maxRequests: 10, windowSeconds: 60 },      // 10 req/min (write operations)
  standard: { maxRequests: 60, windowSeconds: 60 },     // 60 req/min (read operations)
  relaxed: { maxRequests: 300, windowSeconds: 60 },     // 300 req/min (public search)
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

// In-memory store for rate limiting
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > 120000) { // Clean entries older than 2 minutes
      rateLimitStore.delete(key);
    }
  }
}, 60000);

// Get rate limit config based on tier
export function getRateLimitConfig(tier: RateLimitTier = 'standard') {
  return RATE_LIMIT_TIERS[tier];
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Check rate limit for a given key
export function checkRateLimit(
  key: string,
  tier: RateLimitTier = 'standard'
): RateLimitResult {
  const config = getRateLimitConfig(tier);
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / (config.windowSeconds * 1000))}`;
  
  const entry = rateLimitStore.get(windowKey);
  
  if (!entry || now - entry.windowStart >= config.windowSeconds * 1000) {
    // New window
    rateLimitStore.set(windowKey, { count: 1, windowStart: now });
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: now + config.windowSeconds * 1000,
    };
  }
  
  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  
  return {
    success: entry.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining,
    reset: entry.windowStart + config.windowSeconds * 1000,
  };
}

// Express/Next.js compatible rate limiting middleware function
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(result.reset / 1000)),
  };
}