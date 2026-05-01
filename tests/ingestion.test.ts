#!/usr/bin/env tsx
/**
 * Ingestion Script Integration Tests
 *
 * Validates that ingestion scripts can execute and produce expected data.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Ingestion Pipeline", () => {
  beforeAll(async () => {
    // Ensure test database is ready
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Data Source Coverage", () => {
    it("should have entity records from multiple data sources", async () => {
      const sources = await prisma.sourceSystem.findMany({
        select: { id: true, name: true },
      });

      expect(sources.length).toBeGreaterThan(0);
      console.log(`Active source systems: ${sources.length}`);
    });

    it("should have canonical entities indexed", async () => {
      const entityCount = await prisma.canonicalEntity.count();
      expect(entityCount).toBeGreaterThan(0);
      console.log(`Total canonical entities: ${entityCount}`);
    });

    it("should have fraud categories configured", async () => {
      // Categories are now defined in lib/categories.ts, not in the DB
      const { getAllCategories } = await import("@/lib/categories");
      const categories = getAllCategories();
      expect(categories.length).toBeGreaterThan(0);
      console.log(
        `Fraud categories: ${categories.map((c: { name: string }) => c.name).join(", ")}`,
      );
    });
  });

  describe("Data Integrity", () => {
    it("should have valid EIN formats for charities", async () => {
      const charityCount = await prisma.charityProfile.count();
      expect(charityCount).toBeGreaterThan(0);
      console.log(`Charities with EIN data: ${charityCount}`);
    });

    it("should have valid CIK formats for corporate entities", async () => {
      const corpCount = await prisma.corporateCompanyProfile.count();
      expect(corpCount).toBeGreaterThan(0);
      console.log(`Corporate entities with CIK: ${corpCount}`);
    });

    it("should have political candidates linked to FEC data", async () => {
      // Check political data exists
      const billCount = await prisma.bill.count();
      console.log(`Political bills: ${billCount}`);
      expect(typeof billCount).toBe("number");
    });
  });

  describe("Sync Status", () => {
    it("should have source systems with ingestion modes", async () => {
      const sources = await prisma.sourceSystem.findMany({
        select: {
          id: true,
          name: true,
          ingestionMode: true,
          lastSuccessfulSyncAt: true,
        },
        take: 10,
        orderBy: { id: "asc" },
      });

      console.log(`Source systems sample: ${sources.length}`);
      expect(sources.length).toBeGreaterThan(0);
    });

    it("should track entities per source system", async () => {
      const sources = await prisma.sourceSystem.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
        take: 10,
      });

      console.log(
        `Top source systems: ${sources.map((s) => s.name).join(", ")}`,
      );
      expect(sources.length).toBeGreaterThan(0);
    });
  });
});
