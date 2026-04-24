# 0004: PostgreSQL Over NoSQL for Primary Data Store

## Status
Accepted

## Context

TrackFraud needed to choose a primary database system. The platform tracks structured data from multiple domains:

- **Charities**: IRS filings, EINs, program expenses, officer compensation
- **Corporations**: SEC filings, CIKs, financial statements, enforcement actions
- **Politicians**: Voting records, campaign finance, bill sponsorships
- **Government Contracts**: Award IDs, amounts, agencies, recipients

**Key requirements:**
1. ACID compliance for financial data integrity
2. Complex queries across related entities (e.g., "find all charities with >30% overhead that received government contracts")
3. Relational data with foreign key constraints
4. Full-text search capability (can be added via search engine)
5. Mature tooling and operational support

## Decision

We chose **PostgreSQL 16** as our primary database over NoSQL alternatives.

### Why PostgreSQL?

| Requirement | PostgreSQL Solution |
|-------------|---------------------|
| ACID compliance | Full transactional support with isolation levels |
| Complex queries | SQL with JOINs, CTEs, window functions |
| Data integrity | Foreign keys, unique constraints, check constraints |
| Flexible schemas | JSONB columns for semi-structured data when needed |
| Full-text search | Built-in tsvector/tsquery (supplemented by Meilisearch) |
| Ecosystem | Prisma ORM, pgAdmin, numerous monitoring tools |

### Database Schema Design Principles

1. **Normalized Core Tables**: Separate tables for each entity type with foreign keys to `CanonicalEntity`
2. **Source System Tracking**: Each record references its source system for data quality assessment
3. **Audit Fields**: All tables include `createdAt`, `updatedAt` timestamps
4. **Soft Deletes**: Use status field rather than physical deletion where appropriate

### Search Strategy: PostgreSQL + Meilisearch Hybrid

```
┌─────────────────┐      ┌──────────────────┐
│  PostgreSQL     │      │   Meilisearch    │
│  (Source of     │─────▶│   (Search Index) │
│   Truth)        │      │                  │
├─────────────────┤      ├──────────────────┤
│ - All data      │      │ - Full-text      │
│ - Relationships │      │ - Typo tolerance │
│ - ACID          │      │ - Faceted search │
│ - Complex queries│     │ - Fast ranking   │
└─────────────────┘      └──────────────────┘
```

**Sync Strategy:**
- All writes go to PostgreSQL first
- Meilisearch updated via triggers or application-level sync
- Search API queries Meilisearch, not PostgreSQL directly

## Alternatives Considered

### Alternative A: MongoDB (Document Store)

**Why considered:** Flexible schema, easy horizontal scaling, JSON-native

**Why not chosen:**
- No foreign key constraints - data integrity must be enforced in application code
- JOINs require expensive aggregation pipelines or manual handling
- Transactions available but not default behavior
- Less mature ORM support compared to Prisma/PostgreSQL

### Alternative B: Elasticsearch (Search-First Database)

**Why considered:** Built for full-text search, horizontal scaling

**Why not chosen:**
- Not designed as primary database for transactional data
- No ACID guarantees across documents
- Schema design difficult without clear query patterns upfront
- Overkill to run solely for search when PostgreSQL + Meilisearch suffices

### Alternative C: CockroachDB (Distributed SQL)

**Why considered:** PostgreSQL-compatible with horizontal scaling

**Why not chosen:**
- Operational complexity (3+ node cluster required)
- Higher cost than single PostgreSQL instance for current scale
- Can migrate to distributed DB later if needed
- PostgreSQL sufficient for <100M records with proper indexing

### Alternative D: SQLite (Embedded Database)

**Why considered:** Zero configuration, single file, simple deployment

**Why not chosen:**
- No concurrent write support suitable for multi-user application
- Limited scalability beyond small datasets
- Cannot run on same machine as Meilisearch in Docker Compose without port conflicts
- Not appropriate for production deployment with multiple app instances

## Consequences

### Positive

1. **Data Integrity**: Foreign key constraints prevent orphaned records automatically
2. **Complex Queries**: SQL JOINs enable powerful cross-domain analysis queries
3. **Type Safety**: Prisma generates types from schema, compile-time query validation
4. **Mature Ecosystem**: Years of production use, extensive documentation, community support
5. **Flexible Enough**: JSONB columns allow semi-structured data when needed

### Negative

1. **Horizontal Scaling:** PostgreSQL scales vertically more easily than horizontally (can add read replicas later)
2. **Write Contention:** Single primary node can become bottleneck under heavy write load (mitigated by indexing and query optimization)
3. **Storage Overhead:** Normalized schema requires JOINs which can be slower than denormalized NoSQL for specific queries

### Mitigations Implemented

1. **Meilisearch for Search:** Offload full-text search to dedicated engine
2. **Proper Indexing:** Composite indexes on common query patterns
3. **Read Replicas:** Architecture supports adding read replicas if needed
4. **Partitioning:** Large tables (e.g., `fraud_signal_events`) can be partitioned by date

## Related Decisions

- [0002: Unified Entity Model](./0002-unified-entity-model.md) - Database schema design using PostgreSQL
- [0003: Next.js Full-Stack Architecture](./0003-nextjs-fullstack-architecture.md) - Prisma ORM choice for PostgreSQL

## References

- [Prisma Schema](../prisma/schema.prisma) - Full database definition
- [Docker Compose](../docker-compose.yml) - PostgreSQL service configuration
- [DATABASE_MAINTENANCE_RUNBOOK](../docs/runbooks/database-maintenance.md) - Operational procedures
