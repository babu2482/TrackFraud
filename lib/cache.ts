/**
 * Cache Layer — Redis-backed with in-memory fallback.
 *
 * Uses Redis for distributed caching across instances.
 * Falls back to in-memory Maps when Redis is unavailable.
 *
 * All cache keys are namespaced with `tf:` prefix.
 */

import { Redis } from "ioredis";

// ─── Configuration ────────────────────────────────────────────────────

const DEFAULT_TTL = 3600; // 1 hour in seconds
const ORG_TTL = 86400; // 24 hours
const PEER_TTL = 86400; // 24 hours
const HOTTEST_TTL = 900; // 15 minutes

// ─── Redis Client (singleton) ─────────────────────────────────────────

let redisInstance: Redis | null = null;
let redisAvailable = false;

function getRedis(): Redis | null {
  if (redisInstance) {
    return redisAvailable ? redisInstance : null;
  }

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    redisInstance = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      showFriendlyErrorStack: false,
      retryStrategy: (times) => {
        if (times > 3) {
          redisAvailable = false;
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisInstance.on("connect", () => {
      redisAvailable = true;
    });

    redisInstance.on("error", () => {
      redisAvailable = false;
    });

    redisInstance.connect().catch(() => {
      redisAvailable = false;
    });

    return redisAvailable ? redisInstance : null;
  } catch {
    redisAvailable = false;
    return null;
  }
}

// ─── In-Memory Fallback ───────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expires: number;
}

const memoryStore = new Map<string, CacheEntry>();

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (now > entry.expires) {
      memoryStore.delete(key);
    }
  }
}, 60000);

function memoryGet(key: string): unknown | null {
  const entry = memoryStore.get(key);
  if (!entry || Date.now() > entry.expires) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data;
}

function memorySet(key: string, data: unknown, ttlSeconds: number): void {
  memoryStore.set(key, {
    data,
    expires: Date.now() + ttlSeconds * 1000,
  });
}

// ─── Generic Cache API ────────────────────────────────────────────────

function key(prefix: string, id: string): string {
  return `tf:${prefix}:${id}`;
}

/** Get a cached value. Returns null if not found or expired. */
export async function getCache(
  prefix: string,
  id: string,
): Promise<unknown | null> {
  // Try Redis first
  const redis = getRedis();
  if (redis) {
    try {
      const val = await redis.get(key(prefix, id));
      if (val) return JSON.parse(val);
    } catch {
      // Fall through to memory
    }
  }

  // Fallback to in-memory
  return memoryGet(key(prefix, id));
}

/** Set a cached value with TTL in seconds. */
export async function setCache(
  prefix: string,
  id: string,
  data: unknown,
  ttl: number = DEFAULT_TTL,
): Promise<void> {
  const cacheKey = key(prefix, id);
  const serialized = JSON.stringify(data);

  // Try Redis first
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(cacheKey, serialized, "EX", ttl);
      return;
    } catch {
      // Fall through to memory
    }
  }

  // Fallback to in-memory
  memorySet(cacheKey, data, ttl);
}

/** Invalidate cached values by prefix pattern. */
export async function invalidateCache(pattern: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(key(pattern, "*"));
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Ignore
    }
  }

  // Clean in-memory
  for (const cacheKey of memoryStore.keys()) {
    if (cacheKey.includes(pattern)) {
      memoryStore.delete(cacheKey);
    }
  }
}

// ─── Org Cache (24h TTL) ──────────────────────────────────────────────

/** Get cached org data by EIN. */
export async function getCachedOrg(ein: string): Promise<unknown | null> {
  return getCache("org", ein);
}

/** Cache org data by EIN. */
export async function setCachedOrg(ein: string, data: unknown): Promise<void> {
  return setCache("org", ein, data, ORG_TTL);
}

// ─── Peer Cache (24h TTL) ─────────────────────────────────────────────

interface PeerData {
  median: number | null;
  sampleSize: number;
}

/** Get cached peer comparison data by NTEE code. */
export async function getCachedPeer(nteeId: string): Promise<PeerData | null> {
  const raw = await getCache("peer", nteeId);
  return raw as PeerData | null;
}

/** Cache peer comparison data by NTEE code. */
export async function setCachedPeer(
  nteeId: string,
  median: number | null,
  sampleSize: number,
): Promise<void> {
  return setCache("peer", nteeId, { median, sampleSize }, PEER_TTL);
}

// ─── Hottest Cache (15min TTL) ────────────────────────────────────────

/** Get cached hottest/most-active data. */
export async function getCachedHottest(
  keyName: string,
): Promise<unknown | null> {
  return getCache("hot", keyName);
}

/** Cache hottest/most-active data. */
export async function setCachedHottest(
  keyName: string,
  data: unknown,
): Promise<void> {
  return setCache("hot", keyName, data, HOTTEST_TTL);
}
