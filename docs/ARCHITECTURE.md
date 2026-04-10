# TrackFraud Architecture Documentation

## System Overview

TrackFraud is a unified platform for tracking financial fraud across multiple categories and monitoring government transparency. This document outlines the architectural decisions, system design, and technical implementation details.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TrackFraud Platform                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                    Presentation Layer                         │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │     │
│  │  │   Next.js   │  │   React     │  │    Tailwind CSS      │  │     │
│  │  │   App Router│  │    18       │  │                      │  │     │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘  │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                              │                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                      API Layer                                │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │     │
│  │  │   API       │  │   Search    │  │   Authentication     │  │     │
│  │  │   Routes    │  │   API       │  │   & Authorization    │  │     │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘  │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                              │                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                    Business Logic Layer                       │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │     │
│  │  │   Fraud     │  │   Entity    │  │   Data Ingestion     │  │     │
│  │  │   Scoring   │  │   Resolver  │  │   Pipeline           │  │     │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘  │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                              │                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                      Data Layer                               │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │     │
│  │  │   Prisma    │  │ PostgreSQL  │  │    Meilisearch       │  │     │
│  │  │   ORM       │  │             │  │                      │  │     │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘  │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack Decisions

### Why Next.js 14 with App Router?

**Decision**: Single unified frontend and API layer using Next.js 14 App Router

**Rationale**:
- **Developer Experience**: TypeScript-first, excellent DX with hot reloading
- **Performance**: Server-side rendering by default, automatic code splitting
- **API Routes**: Built-in API endpoints eliminate need for separate backend service
- **Scalability**: Can deploy to Vercel or self-host with ease
- **Ecosystem**: Largest React ecosystem, abundant libraries and components

**Trade-offs Accepted**:
- Cold starts on serverless deployment (mitigated by keeping functions lightweight)
- Memory limits on serverless platforms (handled by streaming for large datasets)

### Why PostgreSQL over SQLite?

**Decision**: PostgreSQL as primary database (migrated from CharityProject's SQLite)

**Rationale**:
- **Scale**: Expected 10M+ records across all categories
- **Concurrency**: Better handling of simultaneous ingestion and queries
- **Features**: Full-text search, JSONB, advanced indexing
- **Production Ready**: Battle-tested at scale by major companies

**Trade-offs Accepted**:
- More complex setup than SQLite (mitigated by Docker Compose)
- Higher resource requirements (acceptable for production workloads)

### Why Prisma ORM?

**Decision**: Type-safe database access with Prisma

**Rationale**:
- **Type Safety**: Auto-generated TypeScript types from schema
- **Developer Productivity**: Intuitive query API, excellent error messages
- **Migration System**: Built-in version control for database schema
- **Multi-database Support**: Can switch databases if needed

**Trade-offs Accepted**:
- Runtime overhead vs. raw SQL (acceptable for development speed)
- Learning curve for complex queries (mitigated by documentation)

### Why Meilisearch?

**Decision**: Dedicated search engine for full-text and fuzzy matching

**Rationale**:
- **Speed**: Sub-millisecond search on millions of records
- **Features**: Typo tolerance, faceted search, filtering
- **Simplicity**: Easier to deploy and maintain than Elasticsearch
- **Open Source**: No licensing costs, active community

**Trade-offs Accepted**:
- Additional infrastructure component (justified by search requirements)
- Data synchronization complexity (handled via change data capture)

## Core Architecture Patterns

### 1. Canonical Entity Pattern

All entities (charities, politicians, corporations) are represented through a unified `CanonicalEntity` model:

```
┌─────────────────────────────────────────────────────────────┐
│                    CanonicalEntity                          │
├─────────────────────────────────────────────────────────────┤
│  id: String (unique identifier)                            │
│  displayName: String                                        │
│  normalizedName: String (for matching)                      │
│  entityType: String ('charity', 'politician', etc.)         │
│  categoryId: String (fraud category)                        │
│  aliases[]: EntityAlias                                     │
│  identifiers[]: EntityIdentifier                            │
│  fraudSignals[]: FraudSignalEvent                           │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ CharityProfile│  │ Political     │  │ Corporate     │
│               │  │ Candidate     │  │ Company       │
│ - EIN         │  │ Profile       │  │ Profile       │
│ - NTEE Code   │  │ - CandidateID │  │ - CIK         │
│ - Foundation  │  │ - Office      │  │ - Tickers     │
└───────────────┘  └───────────────┘  └───────────────┘
```

**Benefits**:
- Cross-category entity resolution (same person as politician and charity board member)
- Unified search across all entity types
- Consistent fraud scoring methodology

### 2. Source System Abstraction

All data sources are modeled through `SourceSystem`:

```typescript
interface SourceSystem {
  id: string;
  categoryId: string;           // Which fraud category
  name: string;                 // Human-readable name
  slug: string;                 // URL-friendly identifier
  ingestionMode: 'api' | 'bulk' | 'scrape';
  refreshCadence: string;       // ISO 8601 duration (P7D = weekly)
  freshnessSlaHours: number;    // Maximum acceptable staleness
  lastSuccessfulSyncAt: Date;
  supportsIncremental: boolean;
}
```

**Benefits**:
- Consistent ingestion pipeline for all data sources
- Easy to add new sources without code changes
- Built-in monitoring of data freshness

### 3. Fraud Signal Event Pattern

All fraud indicators are captured as `FraudSignalEvent`:

```typescript
interface FraudSignalEvent {
  entityId: string;
  signalKey: string;            // Unique identifier for signal type
  signalLabel: string;          // Human-readable description
  severity: 'low' | 'medium' | 'high' | 'critical';
  measuredValue?: number;       // Actual value observed
  thresholdValue?: number;      // Threshold that triggered signal
  scoreImpact: number;          // Impact on fraud score (-10 to +10)
  methodologyVersion: string;   // Version of scoring algorithm
  status: 'active' | 'resolved';
}
```

**Benefits**:
- Audit trail for all fraud determinations
- Versioned scoring methodology (can change algorithms)
- Granular control over signal lifecycle

## Data Model Architecture

### Entity Relationship Diagram (Simplified)

```
FraudCategory (16+ categories)
    │
    ├─ SourceSystem (30+ data sources)
    │   └─ IngestionRun (sync history)
    │       └─ RawArtifact (downloaded files)
    │
    ├─ CanonicalEntity (unified entity model)
    │   ├─ EntityAlias (name variations)
    │   ├─ EntityIdentifier (EIN, CIK, etc.)
    │   ├─ FraudSignalEvent (risk indicators)
    │   └─ FraudSnapshot (score history)
    │
    ├─ Category-Specific Models:
    │   ├─ CharityProfile + CharityFiling
    │   ├─ PoliticalCandidateProfile + PoliticalCycleSummary
    │   ├─ CorporateCompanyProfile + CorporateFilingRecord
    │   └─ ... (12 more categories)
    │
    └─ Political Transparency Models:
        ├─ President + PresidentialAction
        ├─ CabinetMember
        ├─ Bill + BillVote + BillSponsor
        └─ PoliticianClaim + FactCheck
```

### Database Indexing Strategy

Critical indexes for performance:

```sql
-- Entity resolution (fastest lookup)
CREATE INDEX idx_entity_identifier ON entity_identifiers(identifier_type, identifier_value);

-- Fraud scoring (real-time calculation)
CREATE INDEX idx_fraud_signals_active ON fraud_signal_events(entity_id, status, observed_at);

-- Search optimization
CREATE INDEX idx_entity_normalized ON canonical_entities(category_id, normalized_name);

-- Time-series queries (trends over time)
CREATE INDEX idx_filing_year ON charity_filings(filing_year);
CREATE INDEX idx_payment_date ON healthcare_payment_records(date_of_payment);

-- Cross-category joins
CREATE INDEX idx_entity_category ON canonical_entities(category_id, entity_type);
```

## API Design

### RESTful Endpoints Structure

```
/api/v1/
├── /entities                    # Entity search and resolution
│   ├── GET    /search          # Unified search across all categories
│   ├── GET    /:id             # Get entity by ID
│   └── POST   /resolve          # Resolve entity from identifier (EIN, CIK, etc.)
│
├── /charities                   # Charity-specific endpoints
│   ├── GET    /:ein/filings    # Get all filings for charity
│   ├── GET    /:ein/score      # Get fraud score and signals
│   └── GET    /peer-compare    # Compare against similar charities
│
├── /political                   # Political transparency endpoints
│   ├── GET    /presidents      # List all presidents
│   ├── GET    /bills           # Search bills by congress, status, etc.
│   ├── GET    /politicians/:id # Get politician profile
│   └── POST   /claims/verify   # Verify claim against fact-checks
│
├── /corporate                   # Corporate fraud endpoints
│   ├── GET    /:cik/filings    # SEC filings for company
│   └── GET    /:cik/anomalies  # Detected accounting anomalies
│
├── /search                      # Meilisearch integration
│   ├── POST   /index           # Index entity for search
│   └── DELETE /index/:id       # Remove from search index
│
└── /admin                       # Administrative endpoints (protected)
    ├── POST   /ingest/:source   # Trigger data ingestion
    └── GET    /health           # System health check
```

### Request/Response Patterns

**Standard Response Format**:
```typescript
interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    totalResults?: number;
    hasMore?: boolean;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

**Pagination Strategy**:
- Cursor-based pagination for large datasets (better performance)
- Offset-based for simple queries (< 1000 records)

## Data Ingestion Pipeline Architecture

### Pipeline Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Source    │───▶│  Download   │───▶│   Parse &   │───▶│   Validate  │
│   System    │    │   Raw Data  │    │   Transform │    │   & Enrich  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                              │                    │
                                              ▼                    ▼
                                     ┌─────────────┐    ┌─────────────┐
                                     │   Resolve   │───▶│  Insert/    │
                                     │   Entities  │    │  Update DB  │
                                     └─────────────┘    └─────────────┘
                                                              │
                                                              ▼
                                                     ┌─────────────┐
                                                     │   Update    │
                                                     │   Search    │
                                                     │   Index     │
                                                     └─────────────┘
```

### Ingestion Script Template

All ingestion scripts follow this pattern:

```typescript
// scripts/ingest-[source-name].ts

import { PrismaClient } from '@prisma/client';
import { SourceSystem, IngestionStatus } from '../lib/types';

const prisma = new PrismaClient();

interface IngestionConfig {
  sourceSystemSlug: string;
  batchSize: number;
  supportsIncremental: boolean;
}

async function runIngestion(config: IngestionConfig): Promise<void> {
  // 1. Get or create source system
  const sourceSystem = await prisma.sourceSystem.upsert({
    where: { slug: config.sourceSystemSlug },
    update: {},
    create: { /* ... */ },
  });

  // 2. Create ingestion run record
  const ingestionRun = await prisma.ingestionRun.create({
    data: {
      sourceSystemId: sourceSystem.id,
      runType: 'incremental', // or 'full'
    },
  });

  try {
    // 3. Download raw data
    const rawData = await downloadData(sourceSystem);

    // 4. Process in batches
    for (const batch of chunk(rawData, config.batchSize)) {
      const processed = await transformBatch(batch);
      await upsertEntities(processed, ingestionRun.id);
    }

    // 5. Mark run as successful
    await prisma.ingestionRun.update({
      where: { id: ingestionRun.id },
      data: { status: 'completed' },
    });
  } catch (error) {
    // 6. Handle failures gracefully
    await prisma.ingestionRun.update({
      where: { id: ingestionRun.id },
      data: { 
        status: 'failed',
        errorSummary: error.message,
      },
    });
    throw error;
  }
}

runIngestion({
  sourceSystemSlug: 'irs-eo-bmf',
  batchSize: 1000,
  supportsIncremental: true,
});
```

### Incremental Sync Strategy

For sources that support it:

1. **Cursor-based**: Track last processed record ID/timestamp
2. **Change Data Capture**: Use database CDC features when available
3. **ETag/Last-Modified**: HTTP headers for API-based sources

## Search Architecture

### Meilisearch Index Structure

```typescript
// Primary index: entities
{
  "primaryKey": "id",
  "searchableAttributes": [
    "displayName",
    "aliases",
    "entityType",
    "category"
  ],
  "filterableAttributes": [
    "categoryId",
    "entityType",
    "stateCode",
    "countryCode"
  ],
  "sortableAttributes": [
    "createdAt",
    "fraudScore"
  ]
}

// Secondary index: fraud_signals (for advanced filtering)
{
  "primaryKey": "id",
  "filterableAttributes": [
    "entityId",
    "severity",
    "status"
  ]
}
```

### Search Query Flow

1. User submits search query
2. Normalize and tokenize input
3. Parallel queries:
   - Meilisearch for fuzzy matching
   - PostgreSQL for exact identifier matches (EIN, CIK)
4. Merge and deduplicate results
5. Rank by relevance score
6. Return with metadata

## Security Architecture

### Data Protection

1. **Environment Variables**: All secrets in `.env`, never committed
2. **Database Credentials**: Rotated regularly, different per environment
3. **API Keys**: Encrypted at rest, limited scope per source

### Access Control (Future)

```typescript
// Role-based access control model
enum UserRole {
  ANONYMOUS = 'anonymous',      // Read-only, rate-limited
  SUBSCRIBER = 'subscriber',    // Enhanced search, alerts
  RESEARCHER = 'researcher',    // Bulk export, API access
  ADMIN = 'admin'               // Full access
}

// Resource-level permissions
interface Permission {
  resource: string;             // 'entity', 'filing', 'signal'
  action: 'read' | 'write' | 'delete';
  conditions?: Record<string, unknown>; // e.g., { categoryId: 'charities' }
}
```

### Rate Limiting

- Anonymous: 100 requests/minute
- Subscriber: 1,000 requests/minute
- Researcher: 10,000 requests/minute

## Performance & Scalability

### Caching Strategy

```typescript
// Multi-tier caching
const cache = {
  // L1: In-memory (Redis) for hot data
  redis: {
    entityProfile: '1h',        // Entity profiles
      fraudScore: '30m',         // Fraud scores (recalculated daily)
    searchResults: '15m'        // Search results
  },
  
  // L2: Database query cache (PostgreSQL)
  database: {
    statementTimeout: '30s',
    connectionPoolSize: 20
  }
};
```

### Database Scaling Plan

**Current (0-1M records)**: Single PostgreSQL instance
**Growth (1-10M records)**: Read replicas for search queries
**Scale (10M+ records)**: 
- Horizontal partitioning by `categoryId`
- Archive old records to cold storage
- Materialized views for aggregations

### API Performance Targets

| Endpoint | P50 Latency | P99 Latency | Max Load |
|----------|-------------|-------------|----------|
| Search   | < 100ms     | < 500ms     | 1,000 req/s |
| Entity Profile | < 200ms | < 1s      | 500 req/s |
| Fraud Score | < 300ms   | < 2s      | 100 req/s |
| Ingestion API | < 500ms | < 3s      | 10 req/s |

## Monitoring & Observability

### Health Checks

```typescript
// /api/health endpoint returns:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": { "status": "up", "latencyMs": 5 },
    "search": { "status": "up", "latencyMs": 2 },
    "ingestion": { "status": "up", "lastRun": "2024-01-15T09:00:00Z" }
  },
  "metrics": {
    "totalEntities": 1234567,
    "lastIngestionSuccess": "2024-01-15T09:30:00Z",
    "searchIndexSize": "2.3GB"
  }
}
```

### Logging Strategy

- **Application logs**: Structured JSON to file (rotated daily)
- **Error tracking**: Sentry or similar service
- **Metrics**: Prometheus + Grafana (future)

## Deployment Architecture

### Development Environment

```bash
docker-compose up -d postgres meilisearch
npm run db:setup
npm run dev
```

### Production Environment (Recommended)

```
┌─────────────────────────────────────────────────────┐
│                    Load Balancer                     │
│                  (nginx / CloudFlare)                │
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────┐              ┌───────────────┐
│  Next.js      │              │  Next.js      │
│  Instance 1   │              │  Instance 2   │
└───────┬───────┘              └───────┬───────┘
        │                              │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │      PostgreSQL Cluster      │
        │   (Primary + 2 Read Replicas)│
        └──────────────┬───────────────┘
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
┌───────────────┐              ┌───────────────┐
│   Meilisearch │              │    Redis      │
│   Cluster     │              │   (Caching)   │
└───────────────┘              └───────────────┘
```

## Future Architecture Considerations

### Phase 1: Current (MVP)
- ✅ Unified Next.js application
- ✅ PostgreSQL + Prisma ORM
- ✅ Meilisearch for search
- ✅ Basic ingestion pipelines

### Phase 2: Scale (6-12 months)
- [ ] Redis caching layer
- [ ] Read replicas for PostgreSQL
- [ ] Background job queue (Bull/Redis)
- [ ] API rate limiting middleware

### Phase 3: Enterprise (12+ months)
- [ ] Microservices for heavy computations
- [ ] GraphQL API layer
- [ ] Real-time websockets for alerts
- [ ] ML-based fraud detection

## Key Architectural Decisions (ADRs)

### ADR-001: Unified Entity Model
**Date**: 2024-01-15  
**Status**: Accepted

**Decision**: Use single `CanonicalEntity` model for all entity types

**Consequences**:
- ✅ Simplified cross-category queries
- ✅ Consistent API design
- ⚠️ Schema complexity increases with each category

### ADR-002: Next.js Full-Stack
**Date**: 2024-01-15  
**Status**: Accepted

**Decision**: Use Next.js for both frontend and backend API

**Consequences**:
- ✅ Single codebase, faster development
- ✅ Type safety across full stack
- ⚠️ Serverless cold starts (mitigated by Vercel Pro)

### ADR-003: PostgreSQL over NoSQL
**Date**: 2024-01-15  
**Status**: Accepted

**Decision**: Relational database for all structured data

**Consequences**:
- ✅ Strong consistency guarantees
- ✅ Complex joins for cross-category analysis
- ⚠️ Schema migrations required for changes

## Glossary

| Term | Definition |
|------|------------|
| Canonical Entity | Unified representation of a real-world entity across categories |
| Fraud Signal | Individual indicator that contributes to fraud score |
| Source System | External data source (IRS, FEC, SEC, etc.) |
| Ingestion Run | Single execution of data sync from a source system |
| Entity Resolution | Process of matching records to canonical entities |

## References

- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Meilisearch Guide](https://www.meilisearch.com/docs)
- [PostgreSQL Performance](https://www.postgresql.org/docs/performance-tips.html)

---

*Last Updated: 2024-01-15*  
*Maintained by TrackFraud Development Team*
