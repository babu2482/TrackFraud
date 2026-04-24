# 0002: Unified Entity Model (CanonicalEntity Pattern)

## Status
Accepted

## Context

TrackFraud aggregates data from multiple categories of fraud tracking: charities, corporations, politicians, government agencies, healthcare providers, and consumer entities. Each category has its own data model with different attributes and relationships.

**Key challenges identified:**
1. **Cross-category lookups**: A politician might also be a charity board member - need to find all connections
2. **Unified search**: Users search by name or ID without knowing the entity type
3. **Duplicate detection**: Same organization appearing under multiple categories (e.g., "Red Cross" as charity and government contractor)
4. **Source system abstraction**: Each data source has different identifiers (EIN, CIK, FEC ID, etc.)

## Decision

We adopted a **CanonicalEntity pattern** with the following structure:

### 1. Core Entity Model

```prisma
model CanonicalEntity {
  id              String    @id @default(cuid())
  name            String
  slug            String    @unique
  category        String    // "charity", "corporate", "political", etc.
  description     String?
  status          String    @default("active") // active, inactive, merged

  // Identifiers from various sources
  identifiers     EntityIdentifier[]

  // Aliases for deduplication
  aliases         EntityAlias[]

  // Source system reference
  sourceSystemId  String
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])

  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([name])
  @@index([slug])
  @@index([category, status])
}
```

### 2. Identifier Pattern

Each entity can have multiple identifiers from different sources:

```prisma
model EntityIdentifier {
  id            String   @id @default(cuid())
  entityId      String
  entityType    String   // "CanonicalEntity"
  identifierType String  // "EIN", "CIK", "FEC_ID", "TAX_ID", etc.
  value         String

  entity        CanonicalEntity @relation(fields: [entityId], references: [id])

  @@unique([identifierType, value])
  @@index([value])
}
```

### 3. Alias Pattern for Deduplication

When merging duplicate entities, create aliases that redirect to the canonical ID:

```prisma
model EntityAlias {
  id            String   @id @default(cuid())
  entityId      String
  entityType    String   // "CanonicalEntity"
  aliasType     String   // "name_variant", "former_name", "dba"
  value         String

  entity        CanonicalEntity @relation(fields: [entityId], references: [id])

  @@index([value])
}
```

### 4. Source System Abstraction

Track which data source each entity came from:

```prisma
model SourceSystem {
  id                            String
  name                          String
  slug                          String @unique
  description                   String?
  ingestionMode                 String // "api", "bulk_download"
  baseUrl                       String?
  refreshCadence                String?
  freshnessSlaHours             Int?

  lastAttemptedSyncAt           DateTime?
  lastSuccessfulSyncAt          DateTime?
  lastError                     String?

  // All entity types reference this
  charityBusinessMasterRecords  CharityBusinessMasterRecord[]
  corporateCompanyProfiles      CorporateCompanyProfile[]
  fecCandidateSummaries         FEC_Candidate_Summary_Record[]
  // ... etc
}
```

## Alternatives Considered

### Alternative A: Category-Specific Tables Only

Keep separate tables for each entity type with no unified model.

**Why not:**
- Cannot perform cross-category searches
- Duplicate entities across categories (e.g., same org as charity and government contractor)
- Search must query multiple tables separately
- No way to track relationships between related entities

### Alternative B: JSONB Flexible Schema

Use a single `entities` table with JSONB for all attributes.

**Why not:**
- Loss of type safety in Prisma queries
- Cannot enforce data integrity constraints
- Difficult to write efficient indexes on nested fields
- Harder to migrate if schema changes

### Alternative C: Graph Database

Use Neo4j or similar for entity relationships.

**Why not:**
- Over-engineering for current scale
- Adds operational complexity (new infrastructure)
- PostgreSQL with proper indexing sufficient for now
- Can add graph layer later if needed

## Consequences

### Positive

1. **Unified Search**: Single search index across all entity types via Meilisearch sync
2. **Deduplication**: Detect and merge duplicate entities with alias redirects
3. **Type Safety**: Prisma generates types for each entity type while maintaining unified model
4. **Audit Trail**: Each entity tracks its source system for data quality assessment

### Negative

1. **Schema Complexity**: More tables and relationships to maintain
2. **Query Complexity**: Joins needed across multiple tables for complete entity view
3. **Migration Overhead**: Existing entities need migration to new model (already done)

### Future Work

1. Implement entity resolution algorithm to automatically suggest merges
2. Add relationship edges between related entities (e.g., politician → donor corporation)
3. Create entity versioning for historical tracking

## Related Decisions

- [0001: Data Ingestion Architecture](./0001-data-ingestion-architecture.md) - How data flows into CanonicalEntity
- TBD: Search indexing strategy for unified search
- TBD: Entity resolution algorithm design

## References

- [Prisma Schema](../prisma/schema.prisma) - Full entity model definition
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) - System architecture overview
