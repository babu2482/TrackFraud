/**
 * TrackFraud Search Service
 *
 * Meilisearch integration for fast, full-text search across all data sources.
 * Provides indexing, searching, and faceted filtering for all entity types.
 */

// Meilisearch v0.57.x uses named export 'Meilisearch' (capital S)
import { Meilisearch } from "meilisearch";

type SearchResponse<T = any> = any;

// ============================================================================
// Meilisearch Client Configuration
// ============================================================================

const MEILISEARCH_CONFIG = {
  host: process.env.MEILISEARCH_URL || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "trackfraud-dev-master-key",
};

export const searchClient = new Meilisearch({
  host: MEILISEARCH_CONFIG.host,
  apiKey: MEILISEARCH_CONFIG.apiKey,
});

// ============================================================================
// Type Definitions
// ============================================================================

interface SearchableEntity {
  entityId: string;
  entityType:
    | "charity"
    | "corporation"
    | "government_contractor"
    | "healthcare_provider"
    | "consumer_entity";
  name: string;
  ein?: string;
  cik?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  riskScore?: number;
  categoryScores?: {
    regulatory?: number;
    network?: number;
    compliance?: number;
    financial?: number;
  };
  regulatoryActions?: Array<{
    source: string;
    type: string;
    severity: "low" | "medium" | "high" | "critical";
    date: string;
  }>;
  nteeCode?: string;
  industry?: string;
  tags?: string[];
  riskLevel?: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
}

interface SearchResult<T = SearchableEntity> {
  hits: T[];
  offset: number;
  limit: number;
  estimatedTotalHits: number;
  processingTimeMs: number;
  query: string;
  facets?: Record<string, Record<string, number>>;
}

export interface SearchFilters {
  entityType?: (
    | "charity"
    | "corporation"
    | "government_contractor"
    | "healthcare_provider"
    | "consumer_entity"
  )[];
  state?: string[];
  riskScoreRange?: [number, number];
  regulatoryActionSources?: string[];
  nteeCodes?: string[];
  industries?: string[];
  hasRegulatoryActions?: boolean;
  riskLevel?: "low" | "medium" | "high" | "critical";
}

export interface SearchOptions {
  offset?: number;
  limit?: number;
  filters?: SearchFilters;
  facets?: string[];
  sortBy?: Array<{ field: string; order: "asc" | "desc" }>;
  highlightAttributes?: string[];
  cropLength?: number;
  attributesToRetrieve?: string[];
}

// ============================================================================
// Index Management
// ============================================================================

export const INDEX_NAMES = {
  ALL_ENTITIES: "all_entities",
  CHARITIES: "charities",
  CORPORATIONS: "corporations",
  HEALTHCARE_PROVIDERS: "healthcare_providers",
  GOVERNMENT_CONTRACTORS: "government_contractors",
  CONSUMER_ENTITIES: "consumer_entities",
} as const;

export type IndexName = (typeof INDEX_NAMES)[keyof typeof INDEX_NAMES];

/**
 * Initialize all Meilisearch indexes with optimal settings
 */
export async function initializeSearchIndexes(): Promise<void> {
  const indexes = [
    {
      name: INDEX_NAMES.ALL_ENTITIES,
      settings: getEntityIndexSettings(),
    },
    {
      name: INDEX_NAMES.CHARITIES,
      settings: getCharityIndexSettings(),
    },
    {
      name: INDEX_NAMES.CORPORATIONS,
      settings: getCorporateIndexSettings(),
    },
    {
      name: INDEX_NAMES.HEALTHCARE_PROVIDERS,
      settings: getEntityIndexSettings(),
    },
    {
      name: INDEX_NAMES.GOVERNMENT_CONTRACTORS,
      settings: getEntityIndexSettings(),
    },
    {
      name: INDEX_NAMES.CONSUMER_ENTITIES,
      settings: getEntityIndexSettings(),
    },
  ];

  for (const index of indexes) {
    await ensureIndexExists(index.name);
    await searchClient.index(index.name).updateSettings(index.settings);
    console.log(`✓ Initialized index: ${index.name}`);
  }
}

/**
 * Ensure an index exists, create if not
 */
export async function ensureIndexExists(indexName: string): Promise<void> {
  const index = searchClient.index(indexName);
  try {
    await index.fetchInfo();
  } catch (error) {
    // Index doesn't exist, create it
    await searchClient.createIndex(indexName);
    console.log(`  → Created index: ${indexName}`);
  }
}

/**
 * Delete an index (use with caution)
 */
export async function deleteIndex(indexName: string): Promise<void> {
  await searchClient.index(indexName).delete();
  console.log(`✓ Deleted index: ${indexName}`);
}

// ============================================================================
// Index Settings
// ============================================================================

function getEntityIndexSettings() {
  return {
    // Searchable attributes (priority order)
    searchableAttributes: [
      "name",
      "ein",
      "cik",
      "address",
      "city",
      "state",
      "nteeCode",
      "industry",
      "tags",
    ],

    // Filterable attributes (for faceted search)
    filterableAttributes: [
      "entityType",
      "state",
      "city",
      "riskScore",
      "riskLevel",
      "entityType",
      "nteeCode",
      "industry",
      "regulatoryActionSources",
      "hasRegulatoryActions",
      "createdAt",
      "updatedAt",
    ],

    // Sortable attributes
    sortableAttributes: ["name", "riskScore", "createdAt", "updatedAt"],

    // Displayed attributes (by default)
    displayedAttributes: [
      "entityId",
      "entityType",
      "name",
      "ein",
      "cik",
      "city",
      "state",
      "riskScore",
      "riskLevel",
      "regulatoryActions",
    ],

    // Faceting configuration
    faceting: {
      maxValuesPerFacet: 100,
    },

    // Pagination
    pagination: {
      maxTotalHits: 100000,
    },

    // Typo tolerance
    typoTolerance: {
      enabled: true,
      disableOnAttributes: ["ein", "cik"],
      minWordSizeForTypos: {
        oneTypo: 5,
        twoTypos: 9,
      },
    },

    // Distinct attribute (if applicable)
    distinctAttribute: "entityId",
  };
}

function getCharityIndexSettings() {
  return {
    ...getEntityIndexSettings(),
    searchableAttributes: [
      "name",
      "ein",
      "nteeCode",
      "address",
      "city",
      "state",
      "tags",
    ],
    filterableAttributes: [
      "entityType",
      "state",
      "city",
      "riskScore",
      "riskLevel",
      "nteeCode",
      "regulatoryActionSources",
      "hasRegulatoryActions",
      "organizationType",
      "filingStatus",
      "assetRange",
      "revenueRange",
    ],
  };
}

function getCorporateIndexSettings() {
  return {
    ...getEntityIndexSettings(),
    searchableAttributes: [
      "name",
      "cik",
      "ticker",
      "address",
      "city",
      "state",
      "industry",
      "tags",
    ],
    filterableAttributes: [
      "entityType",
      "state",
      "city",
      "riskScore",
      "riskLevel",
      "industry",
      "exchange",
      "marketCapRange",
      "regulatoryActionSources",
      "hasRegulatoryActions",
    ],
  };
}

// ============================================================================
// Indexing Utilities
// ============================================================================

/**
 * Add a single entity to search index
 */
export async function indexEntity(
  entity: SearchableEntity,
  indexName: IndexName = INDEX_NAMES.ALL_ENTITIES,
): Promise<void> {
  const index = searchClient.index(indexName);
  await index.addDocuments([mapEntityForIndex(entity)]);
}

/**
 * Add multiple entities to search index (batch)
 */
export async function indexEntities(
  entities: SearchableEntity[],
  indexName: IndexName = INDEX_NAMES.ALL_ENTITIES,
  batchSize: number = 1000,
): Promise<void> {
  const index = searchClient.index(indexName);

  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    const documents = batch.map(mapEntityForIndex);
    await index.addDocuments(documents);
    console.log(
      `  Indexed ${Math.min(i + batchSize, entities.length)}/${entities.length} entities`,
    );
  }
}

/**
 * Update an entity in search index
 */
export async function updateEntity(
  entity: SearchableEntity,
  indexName: IndexName = INDEX_NAMES.ALL_ENTITIES,
): Promise<void> {
  const index = searchClient.index(indexName);
  await index.updateDocuments([mapEntityForIndex(entity)]);
}

/**
 * Delete an entity from search index
 */
export async function deleteEntity(
  entityId: string,
  indexName: IndexName = INDEX_NAMES.ALL_ENTITIES,
): Promise<void> {
  const index = searchClient.index(indexName);
  await index.deleteDocument(entityId);
}

/**
 * Delete multiple entities from search index
 */
export async function deleteEntities(
  entityIds: string[],
  indexName: IndexName = INDEX_NAMES.ALL_ENTITIES,
): Promise<void> {
  const index = searchClient.index(indexName);
  await index.deleteDocuments(entityIds);
}

/**
 * Clear all documents from an index
 */
export async function clearIndex(indexName: string): Promise<void> {
  const index = searchClient.index(indexName);
  await index.deleteAllDocuments();
  console.log(`✓ Cleared all documents from index: ${indexName}`);
}

/**
 * Map entity to Meilisearch document format
 */
function mapEntityForIndex(entity: SearchableEntity): Record<string, unknown> {
  const riskLevel =
    entity.riskScore !== undefined ? getRiskLevel(entity.riskScore) : "unknown";
  const regulatoryActionSources =
    entity.regulatoryActions?.map((a) => a.source) || [];

  return {
    uid: entity.entityId,
    entityId: entity.entityId,
    entityType: entity.entityType,
    name: entity.name,
    ein: entity.ein,
    cik: entity.cik,
    address: entity.address,
    city: entity.city,
    state: entity.state,
    zip: entity.zip,
    riskScore: entity.riskScore,
    riskLevel,
    categoryScores: entity.categoryScores,
    regulatoryActions: entity.regulatoryActions,
    regulatoryActionSources,
    hasRegulatoryActions:
      entity.regulatoryActions && entity.regulatoryActions.length > 0,
    nteeCode: entity.nteeCode,
    industry: entity.industry,
    tags: entity.tags,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Get risk level from score
 */
function getRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ============================================================================
// Search Utilities
// ============================================================================

/**
 * Search across all entities
 */
export async function searchAll(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult<SearchableEntity>> {
  return searchIndex(INDEX_NAMES.ALL_ENTITIES, query, options);
}

/**
 * Search charities only
 * Uses all_entities index with entityType filter for consistent results
 */
export async function searchCharities(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult<SearchableEntity>> {
  const filters = options.filters || {};
  filters.entityType = ["charity"];

  // Use all_entities index - dedicated indexes may not be populated
  return searchIndex(INDEX_NAMES.ALL_ENTITIES, query, { ...options, filters });
}

/**
 * Search corporations only
 * Uses all_entities index with entityType filter for consistent results
 */
export async function searchCorporations(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult<SearchableEntity>> {
  const filters = options.filters || {};
  filters.entityType = ["corporation"];

  // Use all_entities index - dedicated indexes may not be populated
  return searchIndex(INDEX_NAMES.ALL_ENTITIES, query, { ...options, filters });
}

/**
 * Generic search function
 */
export async function searchIndex(
  indexName: IndexName,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult<SearchableEntity>> {
  const index = searchClient.index(indexName);

  const searchParams: Record<string, unknown> = {
    q: query,
    offset: options.offset || 0,
    limit: options.limit || 20,
    facets: options.facets || [],
    attributesToRetrieve: options.attributesToRetrieve,
    attributesToHighlight: options.highlightAttributes || ["name"],
    attributesToCrop: options.highlightAttributes || ["name"],
    cropLength: options.cropLength || 50,
  };

  // Build filters
  const filters = buildFilters(options.filters);
  if (filters) {
    searchParams.filter = filters;
  }

  // Build sort
  const sortBy = options.sortBy;
  if (sortBy && sortBy.length > 0) {
    searchParams.sort = sortBy.map((s) => `${s.field}:${s.order}`).join(",");
  }

  const result: SearchResponse<SearchableEntity> = await index.search(
    query,
    searchParams as never,
  );

  return {
    hits: result.hits as SearchableEntity[],
    offset: result.offset,
    limit: result.limit,
    estimatedTotalHits: result.estimatedTotalHits,
    processingTimeMs: result.processingTimeMs,
    query: result.query,
    facets: result.facetDistribution,
  };
}

/**
 * Build Meilisearch filter string from filters object
 */
function buildFilters(filters: SearchFilters | undefined): string | null {
  if (!filters) return null;

  const parts: string[] = [];

  // Entity type filter
  if (filters.entityType && filters.entityType.length > 0) {
    const types = filters.entityType.map((t) => `"${t}"`).join(",");
    parts.push(`entityType IN [${types}]`);
  }

  // State filter
  if (filters.state && filters.state.length > 0) {
    const states = filters.state.map((s) => `"${s}"`).join(",");
    parts.push(`state IN [${states}]`);
  }

  // Risk score range
  if (filters.riskScoreRange) {
    const [min, max] = filters.riskScoreRange;
    parts.push(`riskScore >= ${min} && riskScore <= ${max}`);
  }

  // Risk level filter
  if (filters.riskLevel) {
    parts.push(`riskLevel = "${filters.riskLevel}"`);
  }

  // NTEE codes
  if (filters.nteeCodes && filters.nteeCodes.length > 0) {
    const codes = filters.nteeCodes.map((c) => `"${c}"`).join(",");
    parts.push(`nteeCode IN [${codes}]`);
  }

  // Industries
  if (filters.industries && filters.industries.length > 0) {
    const industries = filters.industries.map((i) => `"${i}"`).join(",");
    parts.push(`industry IN [${industries}]`);
  }

  // Has regulatory actions
  if (filters.hasRegulatoryActions !== undefined) {
    parts.push(`hasRegulatoryActions = ${filters.hasRegulatoryActions}`);
  }

  // Regulatory action sources
  if (
    filters.regulatoryActionSources &&
    filters.regulatoryActionSources.length > 0
  ) {
    const sources = filters.regulatoryActionSources
      .map((s) => `"${s}"`)
      .join(",");
    parts.push(`regulatoryActionSources IN [${sources}]`);
  }

  return parts.length > 0 ? parts.join(" && ") : null;
}

/**
 * Get autocomplete suggestions
 */
export async function getAutocompleteSuggestions(
  query: string,
  options: { limit?: number; entityType?: string[] } = {},
): Promise<string[]> {
  const index = searchClient.index(INDEX_NAMES.ALL_ENTITIES);

  const params: Record<string, unknown> = {
    limit: options.limit || 10,
    attributesToRetrieve: ["name"],
  };

  if (options.entityType && options.entityType.length > 0) {
    const types = options.entityType.map((t) => `"${t}"`).join(",");
    params.filter = `entityType IN [${types}]`;
  }

  const result = await index.search(query, params as never);
  return (result.hits as Array<{ name: string }>).map((hit) => hit.name);
}

/**
 * Get facet distribution for a query
 */
export async function getFacetDistribution(
  query: string,
  facets: string[],
  filters?: SearchFilters,
): Promise<Record<string, Record<string, number>>> {
  const index = searchClient.index(INDEX_NAMES.ALL_ENTITIES);

  const params: Record<string, unknown> = {
    q: query,
    facets,
    limit: 0, // We only want facets, not hits
  };

  if (filters) {
    const filterString = buildFilters(filters);
    if (filterString) {
      params.filter = filterString;
    }
  }

  const result = await index.search(query, params as never);
  return result.facetDistribution || {};
}

// ============================================================================
// Index Health & Maintenance
// ============================================================================

/**
 * Check if Meilisearch is healthy
 */
export async function checkHealth(): Promise<{
  healthy: boolean;
  message: string;
}> {
  try {
    const health = await searchClient.health();
    return { healthy: health.status === "available", message: health.status };
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get index statistics
 */
export async function getIndexStats(
  indexName: string,
): Promise<Record<string, unknown>> {
  const index = searchClient.index(indexName);
  return index.getStats();
}

/**
 * Get all index statistics
 */
export async function getAllIndexStats(): Promise<
  Record<string, Record<string, unknown>>
> {
  const stats: Record<string, Record<string, unknown>> = {};

  for (const indexName of Object.values(INDEX_NAMES)) {
    try {
      stats[indexName] = await getIndexStats(indexName);
    } catch (error) {
      stats[indexName] = {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  return stats;
}

/**
 * Optimize index - Meilisearch handles this automatically
 */
export async function optimizeIndex(indexName: string): Promise<void> {
  console.log(`✓ Index optimization is automatic in Meilisearch: ${indexName}`);
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Reindex all entities from database
 */
export async function reindexAll(): Promise<void> {
  console.log("Starting full reindex...");

  // This would typically fetch all entities from the database
  // and reindex them. For now, we'll just clear and let ingestion
  // repopulate via hooks.

  console.log("  → Clearing all indexes...");
  for (const indexName of Object.values(INDEX_NAMES)) {
    await clearIndex(indexName);
  }

  console.log(
    "✓ All indexes cleared. New entities will be indexed on ingestion.",
  );
}

/**
 * Get total document count across all indexes
 */
export async function getTotalDocumentCount(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const indexName of Object.values(INDEX_NAMES)) {
    try {
      const stats = await getIndexStats(indexName);
      counts[indexName] = Number(stats["numberOfDocuments"] || 0);
    } catch {
      counts[indexName] = 0;
    }
  }

  return counts;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize search service on startup
 */
export async function initializeSearch(): Promise<void> {
  try {
    console.log("Initializing Meilisearch...");

    const health = await checkHealth();
    if (!health.healthy) {
      console.warn(`⚠ Meilisearch not healthy: ${health.message}`);
      console.warn(
        "  → Search will be disabled until Meilisearch is available",
      );
      return;
    }

    await initializeSearchIndexes();
    console.log("✓ Meilisearch initialized successfully");

    const counts = await getTotalDocumentCount();
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    console.log(`  → Total indexed entities: ${total}`);
  } catch (error) {
    console.error("✗ Failed to initialize Meilisearch:", error);
  }
}

// ============================================================================
// Export default
// ============================================================================

export default {
  client: searchClient,
  initializeSearch,
  initializeSearchIndexes,
  ensureIndexExists,
  deleteIndex,
  clearIndex,
  indexEntity,
  indexEntities,
  updateEntity,
  deleteEntity,
  deleteEntities,
  searchAll,
  searchCharities,
  searchCorporations,
  searchIndex,
  getAutocompleteSuggestions,
  getFacetDistribution,
  checkHealth,
  getIndexStats,
  getAllIndexStats,
  optimizeIndex,
  reindexAll,
  getTotalDocumentCount,
  INDEX_NAMES,
};
