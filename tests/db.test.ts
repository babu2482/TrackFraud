import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getAllCategories } from "@/lib/categories";

describe("Database Connection", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should connect to database and have categories configured", async () => {
    // Categories are now defined in lib/categories.ts, not in the DB
    const categories = getAllCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it("should have source systems configured", async () => {
    const sources = await prisma.sourceSystem.findMany();
    expect(sources.length).toBeGreaterThan(0);
  });

  it("should verify CanonicalEntity model structure", async () => {
    // Just check the table exists and is queryable
    const count = await prisma.canonicalEntity.count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThan(0);
  });
});
