#!/usr/bin/env tsx
/**
 * Meilisearch Reindex Script
 * 
 * Reindexes all entities from the database into Meilisearch.
 * This script should be run after data ingestion or when search results are stale.
 * 
 * Usage:
 *   npx tsx scripts/reindex-search.ts              # Reindex all entities
 *   npx tsx scripts/reindex-search.ts --dry-run    # Show what would be indexed
 *   npx tsx scripts/reindex-search.ts --entities charities  # Reindex specific entity type
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  INDEX_NAMES,
  initializeSearchIndexes,
  indexEntities,
} from "../lib/search";

const prisma = new PrismaClient();

type EntityType = "charities" | "corporations" | "healthcare" | "government" | "political" | "consumer";

interface ReindexStats {
  entityType: string;
  total: number;
  indexed: number;
  failed: number;
  dryRun: boolean;
}

/**
 * Get command line arguments
 */
function getArgs(): { dryRun: boolean; entityType?: EntityType } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const entityTypeArg = args.find((a) => a.startsWith("--entities="));
  const entityType = entityTypeArg?.split("=")[1] as EntityType | undefined;
  
  return { dryRun, entityType };
}

/**
 * Get risk level from score
 */
function getRiskLevel(score: number | null | undefined): "low" | "medium" | "high" | "critical" {
  if (score === null || score === undefined) return "low";
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Index charities from database
 */
async function indexCharities(stats: ReindexStats): Promise<void> {
  const batchSize = 1000;
  let offset = 0;
  let totalIndexed = 0;
  let totalFailed = 0;

  while (true) {
    const charities = await prisma.charityProfile.findMany({
      skip: offset,
      take: batchSize,
      select: {
        ein: true,
        subName: true,
        city: true,
        state: true,
        nteeCode: true,
        address: true,
        zipcode: true,
        subsectionCode: true,
        foundationCode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (charities.length === 0) break;

    const entities = charities.map((charity) => ({
      entityId: `charity_${charity.ein}`,
      entityType: "charity" as const,
      name: charity.subName || "Unknown",
      ein: charity.ein,
      city: charity.city || undefined,
      state: charity.state || undefined,
      address: charity.address || undefined,
      zipcode: charity.zipcode || undefined,
      nteeCode: charity.nteeCode || undefined,
      riskScore: 0,
      riskLevel: "low" as const,
      organizationType: charity.subsectionCode || undefined,
      filingStatus: charity.foundationCode || undefined,
      createdAt: charity.createdAt.toISOString(),
      updatedAt: charity.updatedAt.toISOString(),
    }));

    if (!stats.dryRun) {
      try {
        await indexEntities(entities, INDEX_NAMES.CHARITIES, batchSize);
        totalIndexed += entities.length;
      } catch (error) {
        console.error(`Failed to index ${entities.length} charities:`, error);
        totalFailed += entities.length;
      }
    } else {
      totalIndexed += entities.length;
    }

    stats.indexed = totalIndexed;
    stats.failed = totalFailed;
    stats.total += charities.length;

    console.log(
      `  Indexed ${totalIndexed}/${stats.total} charities (${charities.length} in batch)`
    );

    offset += batchSize;

    if (charities.length < batchSize) break;
  }
}

/**
 * Index corporations from database
 */
async function indexCorporations(stats: ReindexStats): Promise<void> {
  const batchSize = 1000;
  let offset = 0;
  let totalIndexed = 0;
  let totalFailed = 0;

  while (true) {
    const corporations = await prisma.corporateCompanyProfile.findMany({
      skip: offset,
      take: batchSize,
      select: {
        cik: true,
        entityType: true,
        sic: true,
        sicDescription: true,
        stateOfIncorporation: true,
        tickers: true,
        exchanges: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (corporations.length === 0) break;

    const entities = corporations.map((corp) => ({
      entityId: `corp_${corp.cik}`,
      entityType: "corporation" as const,
      name: corp.sicDescription || `Company ${corp.cik}`,
      cik: corp.cik,
      state: corp.stateOfIncorporation || undefined,
      industry: corp.sicDescription || undefined,
      riskScore: 0,
      riskLevel: "low" as const,
      entityTypeRaw: corp.entityType || undefined,
      tickers: corp.tickers.join(", "),
      exchanges: corp.exchanges.join(", "),
      createdAt: corp.createdAt.toISOString(),
      updatedAt: corp.updatedAt.toISOString(),
    }));

    if (!stats.dryRun) {
      try {
        await indexEntities(entities, INDEX_NAMES.CORPORATIONS, batchSize);
        totalIndexed += entities.length;
      } catch (error) {
        console.error(`Failed to index ${entities.length} corporations:`, error);
        totalFailed += entities.length;
      }
    } else {
      totalIndexed += entities.length;
    }

    stats.indexed = totalIndexed;
    stats.failed = totalFailed;
    stats.total += corporations.length;

    console.log(
      `  Indexed ${totalIndexed}/${stats.total} corporations (${corporations.length} in batch)`
    );

    offset += batchSize;

    if (corporations.length < batchSize) break;
  }
}

/**
 * Main reindex function
 */
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Meilisearch Reindex Script");
  console.log("=".repeat(60));
  console.log();

  const args = getArgs();
  
  console.log(`Mode: ${args.dryRun ? "Dry Run" : "Full Reindex"}`);
  if (args.entityType) {
    console.log(`Entity type: ${args.entityType}`);
  }
  console.log();

  // Initialize indexes
  console.log("Initializing Meilisearch indexes...");
  await initializeSearchIndexes();
  console.log();

  const startTime = Date.now();
  const allStats: ReindexStats[] = [];

  // Reindex charities
  if (!args.entityType || args.entityType === "charities") {
    console.log("Reindexing charities...");
    const charityStats: ReindexStats = {
      entityType: "charities",
      total: 0,
      indexed: 0,
      failed: 0,
      dryRun: args.dryRun,
    };
    await indexCharities(charityStats);
    allStats.push(charityStats);
    console.log();
  }

  // Reindex corporations
  if (!args.entityType || args.entityType === "corporations") {
    console.log("Reindexing corporations...");
    const corpStats: ReindexStats = {
      entityType: "corporations",
      total: 0,
      indexed: 0,
      failed: 0,
      dryRun: args.dryRun,
    };
    await indexCorporations(corpStats);
    allStats.push(corpStats);
    console.log();
  }

  // Calculate totals
  const totalIndexed = allStats.reduce((sum, s) => sum + s.indexed, 0);
  const totalFailed = allStats.reduce((sum, s) => sum + s.failed, 0);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print summary
  console.log("=".repeat(60));
  console.log("Reindex Complete");
  console.log("=".repeat(60));
  console.log(`Duration: ${duration} seconds`);
  console.log(`Total indexed: ${totalIndexed}`);
  console.log(`Total failed: ${totalFailed}`);
  console.log();

  for (const stat of allStats) {
    console.log(`  ${stat.entityType}: ${stat.indexed} indexed, ${stat.failed} failed`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});