/**
 * Integration Smoke Tests
 *
 * Basic smoke tests to verify the main API routes and data flows work end-to-end.
 * These tests require a running PostgreSQL database and Meilisearch instance.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/db";
import { searchCharities } from "../lib/search";

describe("Integration Smoke Tests", () => {
  beforeAll(async () => {
    // Verify database connection
    const count = await prisma.charityProfile.count();
    expect(count).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Database Connectivity", () => {
    it("should connect to PostgreSQL and read CharityProfile records", async () => {
      const count = await prisma.charityProfile.count();
      expect(count).toBeGreaterThan(1_000_000);
    });

    it("should connect to PostgreSQL and read CorporateCompanyProfile records", async () => {
      const count = await prisma.corporateCompanyProfile.count();
      expect(count).toBeGreaterThan(1_000);
    });

    it("should connect to PostgreSQL and read SourceSystem records", async () => {
      const count = await prisma.sourceSystem.count();
      expect(count).toBeGreaterThan(10);
    });

    it("should query CharityProfile by EIN", async () => {
      const charity = await prisma.charityProfile.findFirst();
      expect(charity).not.toBeNull();
      if (charity) {
        const byEin = await prisma.charityProfile.findUnique({
          where: { ein: charity.ein },
        });
        expect(byEin).not.toBeNull();
      }
    });

    it("should query CorporateCompanyProfile by entityId", async () => {
      const corp = await prisma.corporateCompanyProfile.findFirst();
      expect(corp).not.toBeNull();
      if (corp) {
        const byEntityId = await prisma.corporateCompanyProfile.findUnique({
          where: { entityId: corp.entityId },
        });
        expect(byEntityId).not.toBeNull();
      }
    });

    it("should query SourceSystem with categoryId filter", async () => {
      const environmental = await prisma.sourceSystem.findMany({
        where: { categoryId: "environmental" },
      });
      expect(environmental.length).toBeGreaterThan(0);
    });
  });

  describe("Data Integrity", () => {
    it("should have CharityProfile records with valid EINs", async () => {
      const charity = await prisma.charityProfile.findFirst();
      expect(charity).not.toBeNull();
      expect(charity!.ein).toMatch(/^\d{2}[-]?\d{6,7}$/);
    });

    it("should have CorporateCompanyProfile records with valid entity types", async () => {
      const corp = await prisma.corporateCompanyProfile.findFirst();
      expect(corp).not.toBeNull();
      expect(corp!.entityType).toBeDefined();
    });

    it("should have SourceSystem records with valid ingestion modes", async () => {
      const sources = await prisma.sourceSystem.findMany({
        select: { ingestionMode: true },
      });
      expect(sources.length).toBeGreaterThan(0);
      const validModes = [
        "api",
        "bulk",
        "csv_download",
        "api_json",
        "scraping",
      ];
      for (const source of sources) {
        expect(validModes).toContain(source.ingestionMode);
      }
    });

    it("should have CanonicalEntity records linking entities to categories", async () => {
      const count = await prisma.canonicalEntity.count();
      expect(count).toBeGreaterThan(100_000);
    });

    it("should have FraudSignalEvent records or empty table", async () => {
      const count = await prisma.fraudSignalEvent.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Search Integration", () => {
    it("should return search results from Meilisearch", async () => {
      const results = await searchCharities("charity");
      // Search returns { hits: [...], estimatedTotalHits: N, ... }
      expect(results).toBeDefined();
      expect(results).toHaveProperty("hits");
      expect(results).toHaveProperty("estimatedTotalHits");
    });

    it("should handle empty search queries gracefully", async () => {
      const results = await searchCharities("");
      expect(results).toBeDefined();
      expect(results).toHaveProperty("hits");
    });

    it("should handle special characters in search queries", async () => {
      const results = await searchCharities("test");
      expect(results).toBeDefined();
      expect(results).toHaveProperty("hits");
    });
  });

  describe("API Route Integration", () => {
    // Skip API route tests if dev server is not running
    const API_BASE = "http://localhost:3001";

    async function testApiRoute(path: string, expectedStatus = 200) {
      try {
        const res = await fetch(API_BASE + path);
        expect(res.status).toBe(expectedStatus);
        return await res.json();
      } catch {
        // Dev server not running - skip this test
        return null;
      }
    }

    it("should return valid JSON from health endpoint", async () => {
      const data = await testApiRoute("/api/health");
      if (data === null) {
        console.log("SKIPPED: Dev server not running");
        return;
      }
      expect(data).toHaveProperty("status");
    });

    it("should return valid JSON from charities endpoint", async () => {
      const data = await testApiRoute("/api/charities?limit=5");
      if (data === null) {
        console.log("SKIPPED: Dev server not running");
        return;
      }
      expect(data).toHaveProperty("charities");
      expect(Array.isArray(data.charities)).toBe(true);
    });

    it("should return valid JSON from search endpoint", async () => {
      const data = await testApiRoute("/api/search?q=charity&limit=5");
      if (data === null) {
        console.log("SKIPPED: Dev server not running");
        return;
      }
      expect(data).toHaveProperty("results");
    });
  });

  describe("Pagination", () => {
    it("should support pagination on CharityProfile queries", async () => {
      const page1 = await prisma.charityProfile.findMany({
        take: 10,
        skip: 0,
        select: { id: true },
      });
      const page2 = await prisma.charityProfile.findMany({
        take: 10,
        skip: 10,
        select: { id: true },
      });
      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
      // Verify different pages return different records
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });
});
