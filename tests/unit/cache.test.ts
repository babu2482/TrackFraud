/**
 * Unit tests for lib/cache.ts
 * Tests cache hit/miss, TTL expiration, and data integrity.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCachedOrg,
  setCachedOrg,
  getCachedPeer,
  setCachedPeer,
  getCachedHottest,
  setCachedHottest,
} from '../../lib/cache';

describe('Org Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for non-existent key', () => {
    expect(getCachedOrg('123456789')).toBeNull();
  });

  it('stores and retrieves data', () => {
    const data = { name: 'Test Org', ein: '123456789' };
    setCachedOrg('123456789', data);
    expect(getCachedOrg('123456789')).toEqual(data);
  });

  it('expires after 24 hours', () => {
    const data = { name: 'Test Org' };
    setCachedOrg('123456789', data);
    expect(getCachedOrg('123456789')).toEqual(data);

    // Advance 24 hours + 1 second
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
    expect(getCachedOrg('123456789')).toBeNull();
  });

  it('does not expire before 24 hours', () => {
    const data = { name: 'Test Org' };
    setCachedOrg('123456789', data);

    // Advance 23 hours
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    expect(getCachedOrg('123456789')).toEqual(data);
  });

  it('overwrites existing cache entry', () => {
    setCachedOrg('123456789', { name: 'Old' });
    setCachedOrg('123456789', { name: 'New' });
    expect(getCachedOrg('123456789')).toEqual({ name: 'New' });
  });

  it('handles different keys independently', () => {
    setCachedOrg('111', { name: 'A' });
    setCachedOrg('222', { name: 'B' });
    expect(getCachedOrg('111')).toEqual({ name: 'A' });
    expect(getCachedOrg('222')).toEqual({ name: 'B' });
  });
});

describe('Peer Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for non-existent key', () => {
    expect(getCachedPeer('NTEE001')).toBeNull();
  });

  it('stores and retrieves peer data', () => {
    setCachedPeer('NTEE001', 50000, 10);
    const result = getCachedPeer('NTEE001');
    expect(result).toEqual({ median: 50000, sampleSize: 10 });
  });

  it('handles null median', () => {
    setCachedPeer('NTEE001', null, 0);
    const result = getCachedPeer('NTEE001');
    expect(result).toEqual({ median: null, sampleSize: 0 });
  });

  it('expires after 24 hours', () => {
    setCachedPeer('NTEE001', 50000, 10);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
    expect(getCachedPeer('NTEE001')).toBeNull();
  });
});

describe('Hottest Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for non-existent key', () => {
    expect(getCachedHottest('default')).toBeNull();
  });

  it('stores and retrieves hottest data', () => {
    const data = [{ ein: '123', name: 'Org' }];
    setCachedHottest('default', data);
    expect(getCachedHottest('default')).toEqual(data);
  });

  it('expires after 15 minutes', () => {
    setCachedHottest('default', { items: [] });
    expect(getCachedHottest('default')).toEqual({ items: [] });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
    expect(getCachedHottest('default')).toBeNull();
  });

  it('does not expire before 15 minutes', () => {
    setCachedHottest('default', { items: [] });
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(getCachedHottest('default')).toEqual({ items: [] });
  });
});