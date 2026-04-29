/**
 * Background Search Indexing Service
 *
 * Automatically indexes all entities from the database into Meilisearch.
 * Supports both full reindex and incremental updates via change tracking.
 *
 * Usage:
 * - Full reindex: await indexAllEntities()
 * - Incremental sync: await indexNewEntities(sinceDate)
 * - Background worker: runIndexingWorker()
 */

import { Meilisearch } from "meilisearch";
import { PrismaClient, CanonicalEntity, FraudSnapshot } from "@prisma/client";
import { getIndexStats, INDEX_NAMES } from "../search";

const prisma = new PrismaClient();

interface MeilisearchConfig {
  host: string;
  apiKey: string;
}

const config: MeilisearchConfig = {
  host: process.env.MEILISEARCH_URL || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "trackfraud-master-key",
};

const client = new Meilisearch(config);

interface IndexingStats {
  totalProcessed: number;
  successfullyIndexed: number;
  failed: number;
  skipped: number;
  errors: Array<{ entityId: string; error: string }>;
}

/**
 * Transform a CanonicalEntity and its relations into a Meilisearch document
 */
async function transformEntityForIndex(
  entity: CanonicalEntity,
  fraudSnapshot?: FraudSnapshot,
): Promise<Record<string, any>> {
  // Fetch related data for rich indexing
  const [aliases, identifiers, signals] = await Promise.all([
    prisma.entityAlias.findMany({
      where: { entityId: entity.id },
      select: { alias: true, aliasType: true },
    }),
    prisma.entityIdentifier.findMany({
      where: { entityId: entity.id },
      select: { identifierType: true, identifierValue: true },
    }),
    prisma.fraudSignalEvent.findMany({
      where: {
        entityId: entity.id,
        status: "active",
      },
      select: { signalKey: true, severity: true, scoreImpact: true },
    }),
  ]);

  // Get specific profile data based on category
  let entityTypeSpecificData = {};

  try {
    if (entity.categoryId.includes("charity")) {
      const charityProfile = await prisma.charityProfile.findUnique({
        where: { entityId: entity.id },
      });
      entityTypeSpecificData = {
        ein: charityProfile?.ein,
        nteeCode: charityProfile?.nteeCode,
        foundationCode: charityProfile?.foundationCode,
      };
    } else if (entity.categoryId.includes("corporate")) {
      const corporateProfile = await prisma.corporateCompanyProfile.findUnique({
        where: { entityId: entity.id },
      });
      entityTypeSpecificData = {
        cik: corporateProfile?.cik,
        tickers: corporateProfile?.tickers || [],
        sic: corporateProfile?.sic,
      };
    } else if (entity.categoryId.includes("healthcare")) {
      const healthcareProfile =
        await prisma.healthcareRecipientProfile.findUnique({
          where: { entityId: entity.id },
        });
      entityTypeSpecificData = {
        physicianName:
          `${healthcareProfile?.firstName || ""} ${healthcareProfile?.lastName || ""}`.trim(),
        specialty: healthcareProfile?.specialty,
        recipientType: healthcareProfile?.recipientType,
      };
    } else if (entity.categoryId.includes("political")) {
      const politicianProfile = entity.politicalCandidateProfileId
        ? await prisma.politicalCandidateProfile.findUnique({
            where: { id: entity.politicalCandidateProfileId },
          })
        : null;
      entityTypeSpecificData = {
        fullName: politicianProfile?.fullName,
        office: politicianProfile?.office,
        party: politicianProfile?.party,
        state: politicianProfile?.state,
      };
    }
  } catch (error) {
    console.warn(
      `Failed to fetch specific profile for entity ${entity.id}:`,
      error,
    );
  }

  // Calculate risk level from fraud snapshot
  let riskLevel = "low";
  if (fraudSnapshot) {
    const score = fraudSnapshot.score;
    if (score >= 80) riskLevel = "critical";
    else if (score >= 60) riskLevel = "high";
    else if (score >= 40) riskLevel = "medium";
  }

  // Build searchable name field with aliases
  const allNames = [
    entity.displayName,
    entity.normalizedName,
    ...aliases.map((a) => a.alias),
  ].filter(Boolean);

  return {
    uid: entity.id,
    entityId: entity.id,
    entityType: entity.entityType,
    categoryId: entity.categoryId,

    // Searchable fields
    name: entity.displayName,
    allNames: allNames.join(" | "),
    normalizedName: entity.normalizedName,
    aliases: aliases.map((a) => `${a.alias} (${a.aliasType})`).join(", "),

    // Identifiers
    identifiers: identifiers
      .map((i) => `${i.identifierType}: ${i.identifierValue}`)
      .join("; "),
    ...entityTypeSpecificData,

    // Location
    address: entity.homepageUrl || null,
    city: null, // Would need to extract from related profiles
    state: entity.stateCode,
    countryCode: entity.countryCode,
    jurisdiction: entity.primaryJurisdiction,

    // Risk & Fraud Signals
    riskScore: fraudSnapshot?.score ?? 0,
    riskLevel,
    activeSignalCount: signals.length,
    signalSeverities: signals
      .map((s) => s.severity)
      .filter(Boolean) as string[],
    signalKeys: signals.map((s) => s.signalKey).filter(Boolean) as string[],

    // Metadata
    status: entity.status,
    summary: entity.summary || "",
    homepageUrl: entity.homepageUrl,

    // Timestamps
    firstSeenAt: entity.firstSeenAt.toISOString(),
    lastSeenAt: entity.lastSeenAt.toISOString(),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),

    // For filtering and faceting
    _geo: null, // Could add geocoding later if needed
  };
}

/**
 * Index a single entity into Meilisearch
 */
async function indexSingleEntity(
  entity: CanonicalEntity,
  indexName: string = INDEX_NAMES.ALL_ENTITIES,
): Promise<{ success: boolean; error?: string }> {
  try {
    const fraudSnapshot = await prisma.fraudSnapshot.findFirst({
      where: {
        entityId: entity.id,
        isCurrent: true,
      },
      orderBy: { computedAt: "desc" },
    });

    const document = await transformEntityForIndex(
      entity,
      fraudSnapshot ?? undefined,
    );

    const index = client.index(indexName);
    await index.addDocuments([document]);

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to index entity ${entity.id}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Index all entities from the database (full reindex)
 */
async function indexAllEntities(
  batchSize: number = 100,
  indexName: string = INDEX_NAMES.ALL_ENTITIES,
): Promise<IndexingStats> {
  console.log(`Starting full reindex into ${indexName}...`);

  const stats: IndexingStats = {
    totalProcessed: 0,
    successfullyIndexed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Clear existing index first
  try {
    const index = client.index(indexName);
    await index.deleteAllDocuments();
    console.log(`Cleared existing documents from ${indexName}`);
  } catch (error) {
    console.warn(`Failed to clear index ${indexName}:`, error);
  }

  // Get total count for progress tracking
  const totalCount = await prisma.canonicalEntity.count();
  let processedCount = 0;

  // Process in batches
  while (processedCount < totalCount) {
    const entities = await prisma.canonicalEntity.findMany({
      take: batchSize,
      skip: processedCount,
      orderBy: { updatedAt: "desc" },
    });

    if (entities.length === 0) break;

    console.log(
      `Processing batch ${Math.floor(processedCount / batchSize) + 1} (${processedCount}-${Math.min(processedCount + batchSize, totalCount)} of ${totalCount})`,
    );

    // Process batch in parallel
    const results = await Promise.all(
      entities.map(async (entity) => {
        const result = await indexSingleEntity(entity, indexName);
        stats.totalProcessed++;

        if (result.success) {
          stats.successfullyIndexed++;
        } else {
          stats.failed++;
          stats.errors.push({
            entityId: entity.id,
            error: result.error || "Unknown",
          });
        }

        return result;
      }),
    );

    processedCount += entities.length;

    // Progress update every 10 batches
    if (Math.floor(processedCount / batchSize) % 10 === 0) {
      const percentage = ((processedCount / totalCount) * 100).toFixed(1);
      console.log(
        `Progress: ${percentage}% (${processedCount}/${totalCount}) - Indexed: ${stats.successfullyIndexed}, Failed: ${stats.failed}`,
      );
    }
  }

  // Wait for Meilisearch to process all documents
  await waitForIndexingToComplete(indexName);

  console.log("\n=== Reindex Complete ===");
  console.log(`Total Processed: ${stats.totalProcessed}`);
  console.log(`Successfully Indexed: ${stats.successfullyIndexed}`);
  console.log(`Failed: ${stats.failed}`);
  if (stats.errors.length > 0) {
    console.log(
      `Errors (${stats.errors.length}):`,
      stats.errors
        .slice(0, 10)
        .map((e) => `${e.entityId}: ${e.error}`)
        .join("\n"),
    );
  }

  return stats;
}

/**
 * Index entities updated since a specific date (incremental sync)
 */
async function indexNewEntities(
  sinceDate: Date,
  batchSize: number = 100,
  indexName: string = INDEX_NAMES.ALL_ENTITIES,
): Promise<IndexingStats> {
  console.log(
    `Starting incremental index for entities updated since ${sinceDate.toISOString()}...`,
  );

  const stats: IndexingStats = {
    totalProcessed: 0,
    successfullyIndexed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Get entities updated since the date
  const totalCount = await prisma.canonicalEntity.count({
    where: { updatedAt: { gt: sinceDate } },
  });

  if (totalCount === 0) {
    console.log("No new entities to index");
    return stats;
  }

  let processedCount = 0;

  while (processedCount < totalCount) {
    const entities = await prisma.canonicalEntity.findMany({
      take: batchSize,
      skip: processedCount,
      where: { updatedAt: { gt: sinceDate } },
      orderBy: { updatedAt: "desc" },
    });

    if (entities.length === 0) break;

    console.log(
      `Processing batch ${Math.floor(processedCount / batchSize) + 1} (${processedCount}-${Math.min(processedCount + batchSize, totalCount)} of ${totalCount})`,
    );

    const results = await Promise.all(
      entities.map(async (entity) => {
        const result = await indexSingleEntity(entity, indexName);
        stats.totalProcessed++;

        if (result.success) {
          stats.successfullyIndexed++;
        } else {
          stats.failed++;
          stats.errors.push({
            entityId: entity.id,
            error: result.error || "Unknown",
          });
        }

        return result;
      }),
    );

    processedCount += entities.length;
  }

  await waitForIndexingToComplete(indexName);

  console.log("\n=== Incremental Index Complete ===");
  console.log(`Total Processed: ${stats.totalProcessed}`);
  console.log(`Successfully Indexed: ${stats.successfullyIndexed}`);
  console.log(`Failed: ${stats.failed}`);

  return stats;
}

/**
 * Delete an entity from the index
 */
async function deleteEntityFromIndex(
  entityId: string,
  indexName: string = INDEX_NAMES.ALL_ENTITIES,
): Promise<boolean> {
  try {
    const index = client.index(indexName);
    await index.deleteDocument(entityId);
    return true;
  } catch (error) {
    console.error(`Failed to delete entity ${entityId} from index:`, error);
    return false;
  }
}

/**
 * Wait for Meilisearch to finish processing queued documents
 */
async function waitForIndexingToComplete(
  indexName: string,
  maxWaitMs: number = 60000,
  pollIntervalMs: number = 1000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const index = client.index(indexName);
      const stats = await index.getStats();

      // Index status check removed for Meilisearch compatibility
      if (stats.isIndexing) {
        console.log(`Index ${indexName} is still indexing, skipping update`);
        return;
      }

      console.log(
        `Waiting for index processing... (isIndexing: ${stats.isIndexing})`,
      );
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      console.warn("Error checking index status:", error);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(
    `Timeout waiting for indexing to complete after ${maxWaitMs}ms`,
  );
}

/**
 * Background worker that continuously syncs new/updated entities
 */
async function runIndexingWorker(
  syncIntervalMs: number = 300000, // 5 minutes
  batchSize: number = 100,
): Promise<void> {
  console.log("Starting search indexing background worker...");

  let lastSyncDate = new Date();

  try {
    while (true) {
      try {
        const stats = await indexNewEntities(lastSyncDate, batchSize);

        if (stats.successfullyIndexed > 0) {
          console.log(
            `Incremental sync completed: ${stats.successfullyIndexed} entities indexed`,
          );
        } else {
          console.log("No new entities to sync");
        }

        lastSyncDate = new Date();
      } catch (error) {
        console.error("Error during incremental sync:", error);
      }

      // Wait for next sync interval
      await new Promise((resolve) => setTimeout(resolve, syncIntervalMs));
    }
  } catch (error) {
    console.error("Indexing worker stopped:", error);
    throw error;
  }
}

/**
 * Initialize all search indexes with proper settings and populate from DB
 */
async function initializeAndPopulateIndexes(): Promise<void> {
  console.log("Initializing and populating all search indexes...");

  const indexNames = Object.values(INDEX_NAMES);

  for (const indexName of indexNames) {
    try {
      console.log(`\nProcessing index: ${indexName}`);

      // Ensure index exists with proper settings
      const index = client.index(indexName);
      await ensureIndexHasSettings(index);

      // Populate from database
      await indexAllEntities(100, indexName);
    } catch (error) {
      console.error(`Failed to process index ${indexName}:`, error);
    }
  }

  console.log("\n=== All indexes initialized and populated ===");
}

/**
 * Ensure an index has the correct settings configured
 */
async function ensureIndexHasSettings(index: any): Promise<void> {
  const settings = {
    searchableAttributes: [
      "allNames",
      "name",
      "normalizedName",
      "aliases",
      "identifiers",
      "summary",
      "signalKeys",
      "entityType",
      "categoryId",
    ],
    filterableAttributes: [
      "entityId",
      "entityType",
      "categoryId",
      "state",
      "countryCode",
      "riskLevel",
      "status",
      "activeSignalCount",
      "createdAt",
      "updatedAt",
    ],
    sortableAttributes: [
      "riskScore",
      "activeSignalCount",
      "createdAt",
      "updatedAt",
      "lastSeenAt",
    ],
    displayedAttributes: [
      "name",
      "entityType",
      "categoryId",
      "riskLevel",
      "riskScore",
      "state",
      "summary",
      "homepageUrl",
    ],
    faceting: {
      maxValuesPerFacet: 100,
    },
    pagination: {
      maxTotalHits: 10000,
    },
    typoTolerance: {
      enabled: true,
      disableOnAttributes: ["identifiers", "signalKeys"],
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8,
      },
    },
  };

  await index.updateSettings(settings);
  console.log(`Configured settings for index`);
}

// Export functions and types
export {
  client,
  config,
  transformEntityForIndex,
  indexSingleEntity,
  indexAllEntities,
  indexNewEntities,
  deleteEntityFromIndex,
  waitForIndexingToComplete,
  runIndexingWorker,
  initializeAndPopulateIndexes,
  ensureIndexHasSettings,
};

export type { IndexingStats };

// CLI entry point for manual execution
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  const command = process.argv[2];

  switch (command) {
    case "full":
      indexAllEntities().then((stats) => {
        console.log("\nFinal stats:", JSON.stringify(stats, null, 2));
        process.exit(stats.failed > 0 ? 1 : 0);
      });
      break;

    case "incremental":
      const since = process.argv[3]
        ? new Date(process.argv[3])
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      indexNewEntities(since).then((stats) => {
        console.log("\nFinal stats:", JSON.stringify(stats, null, 2));
        process.exit(stats.failed > 0 ? 1 : 0);
      });
      break;

    case "worker":
      runIndexingWorker().catch((error) => {
        console.error("Worker crashed:", error);
        process.exit(1);
      });
      break;

    case "init":
      initializeAndPopulateIndexes().then(() => {
        console.log("\nInitialization complete");
        process.exit(0);
      });
      break;

    default:
      console.log("Usage: tsx lib/search/indexer.ts <command>");
      console.log("Commands:");
      console.log("  full       - Full reindex of all entities");
      console.log(
        "  incremental [date] - Index entities updated since date (ISO format)",
      );
      console.log("  worker     - Run background sync worker");
      console.log("  init       - Initialize and populate all indexes");
      process.exit(1);
  }
}
