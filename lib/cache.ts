/** Simple in-memory cache for org responses to reduce ProPublica rate limit pressure. */
const orgCache = new Map<
  string,
  { data: unknown; expires: number }
>();
const TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedOrg(ein: string): unknown | null {
  const entry = orgCache.get(ein);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data;
}

export function setCachedOrg(ein: string, data: unknown): void {
  orgCache.set(ein, { data, expires: Date.now() + TTL_MS });
}

const peerCache = new Map<
  string,
  { median: number | null; sampleSize: number; expires: number }
>();
const PEER_TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedPeer(nteeId: string): { median: number | null; sampleSize: number } | null {
  const entry = peerCache.get(nteeId);
  if (!entry || Date.now() > entry.expires) return null;
  return { median: entry.median, sampleSize: entry.sampleSize };
}

export function setCachedPeer(
  nteeId: string,
  median: number | null,
  sampleSize: number
): void {
  peerCache.set(nteeId, {
    median,
    sampleSize,
    expires: Date.now() + PEER_TTL_MS,
  });
}

const hottestCache = new Map<
  string,
  { data: unknown; expires: number }
>();
const HOTTEST_TTL_MS = 15 * 60 * 1000;

export function getCachedHottest(key: string): unknown | null {
  const entry = hottestCache.get(key);
  if (!entry || Date.now() > entry.expires) return null;
  return entry.data;
}

export function setCachedHottest(key: string, data: unknown): void {
  hottestCache.set(key, {
    data,
    expires: Date.now() + HOTTEST_TTL_MS,
  });
}
