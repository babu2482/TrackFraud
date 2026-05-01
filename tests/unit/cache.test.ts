/**
 * Unit tests for lib/cache.ts
 * Tests cache hit/miss, TTL expiration, and data integrity.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCachedOrg,
  setCachedOrg,
  getCachedPeer,
  setCachedPeer,
  getCachedHottest,
  setCachedHottest,
} from "../../lib/cache";

describe("Org Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for non-existent key", async () => {
    expect(await getCachedOrg("123456789")).toBeNull();
  });

  it("stores and retrieves data", async () => {
    const data = { name: "Test Org", ein: "123456789" };
    await setCachedOrg("123456789", data);
    expect(await getCachedOrg("123456789")).toEqual(data);
  });

  it("expires after 24 hours", async () => {
    const data = { name: "Test Org" };
    await setCachedOrg("123456789", data);
    expect(await getCachedOrg("123456789")).toEqual(data);

    // Advance 24 hours + 1 second
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
    expect(await getCachedOrg("123456789")).toBeNull();
  });

  it("does not expire before 24 hours", async () => {
    const data = { name: "Test Org" };
    await setCachedOrg("123456789", data);

    // Advance 23 hours
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    expect(await getCachedOrg("123456789")).toEqual(data);
  });

  it("overwrites existing cache entry", async () => {
    await setCachedOrg("123456789", { name: "Old" });
    await setCachedOrg("123456789", { name: "New" });
    expect(await getCachedOrg("123456789")).toEqual({ name: "New" });
  });

  it("handles different keys independently", async () => {
    await setCachedOrg("111", { name: "A" });
    await setCachedOrg("222", { name: "B" });
    expect(await getCachedOrg("111")).toEqual({ name: "A" });
    expect(await getCachedOrg("222")).toEqual({ name: "B" });
  });
});

describe("Peer Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for non-existent key", async () => {
    expect(await getCachedPeer("NTEE001")).toBeNull();
  });

  it("stores and retrieves peer data", async () => {
    await setCachedPeer("NTEE001", 50000, 10);
    const result = await getCachedPeer("NTEE001");
    expect(result).toEqual({ median: 50000, sampleSize: 10 });
  });

  it("handles null median", async () => {
    await setCachedPeer("NTEE001", null, 0);
    const result = await getCachedPeer("NTEE001");
    expect(result).toEqual({ median: null, sampleSize: 0 });
  });

  it("expires after 24 hours", async () => {
    await setCachedPeer("NTEE001", 50000, 10);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
    expect(await getCachedPeer("NTEE001")).toBeNull();
  });
});

describe("Hottest Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for non-existent key", async () => {
    expect(await getCachedHottest("default")).toBeNull();
  });

  it("stores and retrieves hottest data", async () => {
    const data = [{ ein: "123", name: "Org" }];
    await setCachedHottest("default", data);
    expect(await getCachedHottest("default")).toEqual(data);
  });

  it("expires after 15 minutes", async () => {
    await setCachedHottest("default", { items: [] });
    expect(await getCachedHottest("default")).toEqual({ items: [] });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
    expect(await getCachedHottest("default")).toBeNull();
  });

  it("does not expire before 15 minutes", async () => {
    await setCachedHottest("default", { items: [] });
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(await getCachedHottest("default")).toEqual({ items: [] });
  });
});
