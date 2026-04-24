# TrackFraud - Architecture Decision Records

> **Created:** 2026-04-23
> **Last Updated:** 2026-04-23
> **Status:** ACTIVE
> **Goal:** Document architectural decisions and their rationale

---

## Table of Contents

1. [ADR-001: Single Backend Architecture](#adr-001-single-backend-architecture)
2. [ADR-002: Prisma Schema Cleanup Strategy](#adr-002-prisma-schema-cleanup-strategy)
3. [API Boundary Definition](#api-boundary-definition)
4. [Technology Stack](#technology-stack)
5. [System Architecture](#system-architecture)

---

## ADR-001: Single Backend Architecture

**Status:** Implemented
**Date:** 2026-04-23

### Context

TrackFraud was evaluated for backend architecture with two options:
- **Next.js API routes** (TypeScript + Prisma) - `/api/charities/*`, `/api/corporate/*`, etc.
- **Python FastAPI** (Python + SQLAlchemy) - Legacy endpoints

### Decision

**Implemented: Next.js Only**

All API routes live in Next.js with Prisma as the single ORM. The Python FastAPI backend and Celery workers have been removed.

### Rationale

1. **Platform is primarily a data display/search UI** - Next.js excels at this
2. **Single codebase** - One language (TypeScript), one ORM (Prisma)
3. **Simpler deployment** - One Docker service instead of three (removed backend, celery-worker, celery-flower)
4. **Simpler debugging** - No cross-language transaction or schema drift concerns

### Consequences

**Positive:**
- 50% reduction in backend complexity
- Single source of truth for data models
- Easier onboarding for new developers
- Faster iteration cycles
- Smaller Docker images (no Python, no AI/ML dependencies)

### Implementation

- ✅ Python backend directory removed
- ✅ Celery workers removed from docker-compose.yml
- ✅ FastAPI endpoints migrated to Next.js API routes where needed
- ✅ Legacy Celery references removed from package.json scripts

---

## ADR-002: Prisma Schema Cleanup Strategy

**Status:** Completed
**Date:** 2026-04-23

### Context

The Prisma schema was audited for 81 models with two parallel sets for the same data domains.

### Decision

**Phase-based cleanup approach - ALL PHASES COMPLETE:**

1. ✅ **Phase 1:** Audit all 81 models for usage
2. ✅ **Phase 2:** Mark each model as USED or UNUSED
3. ✅ **Phase 3:** Delete unused legacy models (28 removed)
4. ✅ **Phase 4:** Migrate code using legacy models to canonical models
5. ✅ **Phase 5:** Run `prisma migrate dev` to apply changes

### Result

- **Before:** 81 models, ~1700 lines
- **After:** 53 models, clean schema with no duplicates
- **Legacy tables dropped:** 28 PostgreSQL tables (all empty, no data loss)
- **Legacy enums dropped:** 6 enums (actiontype, promisestatus, evidencier, etc.)

### Reference

See `docs/PRISMA_MODEL_AUDIT.md` for the complete usage matrix.

---

## API Boundary Definition

### Next.js API Routes (Primary Backend)

| Prefix | Purpose | Technology |
|--------|---------|------------|
| `/api/charities/*` | Charity fraud data | TypeScript + Prisma |
| `/api/corporate/*` | Corporate fraud data | TypeScript + Prisma |
| `/api/government/*` | Government spending data | TypeScript + Prisma |
| `/api/political/*` | Political transparency data | TypeScript + Prisma |
| `/api/healthcare/*` | Healthcare fraud data | TypeScript + Prisma |
| `/api/consumer/*` | Consumer protection data | TypeScript + Prisma |
| `/api/search` | Full-text search | Meilisearch |
| `/api/fraud-scores` | Fraud scoring | TypeScript + Prisma |
| `/api/health` | Health check | Next.js |

### Legacy FastAPI Endpoints

**Status: REMOVED** - All Python backend code and FastAPI endpoints have been eliminated. No migration needed.

---

## Technology Stack

### Frontend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Framework | Next.js | 15.5.15 | SSR, SSG, App Router |
| UI Library | React | 19.1.0 | Component library |
| Styling | Tailwind CSS | 3.4.1 | Utility-first CSS |
| Type Safety | TypeScript | 5.9.3 | Static typing |
| Maps | react-simple-maps | 3.0.0 | FraudMap visualization |

### Backend

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| API | Next.js API Routes | 15.5.15 | Serverless functions |
| ORM | Prisma | 6.14.0 | Database access, type safety |
| Database | PostgreSQL | 16 | Primary data store |
| Validation | Zod | 4.3.6 | Input validation |
| Rate Limiting | In-memory | - | API rate limiting |

### Data & Search

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Search | Meilisearch | v1.10 | Full-text search |
| Cache | Redis | 7 | Caching layer |
| Ingestion | TypeScript scripts | - | 30+ data source scripts |

### DevOps & Infrastructure

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Containers | Docker Compose | - | Service orchestration |
| CI/CD | GitHub Actions | - | Automated testing |
| Error Tracking | Sentry | 10.50.0 | Production error tracking |
| Testing (Unit) | Vitest | 4.1.4 | Unit and integration tests |
| Testing (E2E) | Playwright | 1.59.1 | End-to-end tests |
| Linting | ESLint | 9.x | Code quality (flat config) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TrackFraud Platform                      │
├─────────────────────────────────────────────────────────────┤
│  Next.js 15 Frontend (App Router) + API Routes              │
│  - Unified search across all categories                     │
│  - Entity profiles with cross-category data                 │
│  - Fraud scoring and risk indicators                        │
│  - SSR/SSG for SEO                                          │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL 16 Database (Prisma ORM)                        │
│  - Normalized schema for all entity types (53 models)       │
│  - CanonicalEntity model for cross-referencing              │
│  - FraudSignalEvent tracking                                │
│  - ~2.4M records across all categories                      │
├─────────────────────────────────────────────────────────────┤
│  Meilisearch v1.10                                          │
│  - Full-text search across all entities                     │
│  - Fast fuzzy matching for names, EINs, IDs                 │
│  - 6 indexes populated                                      │
├─────────────────────────────────────────────────────────────┤
│  Redis 7                                                    │
│  - Caching layer                                            │
│  - Background task queue                                    │
├─────────────────────────────────────────────────────────────┤
│  Data Ingestion Pipeline                                    │
│  - 50+ public data sources                                  │
│  - Incremental and full sync support                        │
│  - Automated scheduling via PM2/Cron                        │
├─────────────────────────────────────────────────────────────┤
│  Sentry 10.50.0                                             │
│  - Production error tracking                                │
│  - Performance monitoring                                   │
└─────────────────────────────────────────────────────────────┘
```

### Docker Services

| Service | Image | Port Mapping | Health Check |
|---------|-------|-------------|--------------|
| PostgreSQL | postgres:16-alpine | 5432:5432 | pg_isready |
| Redis | redis:7-alpine | 6380:6379 | redis-cli ping |
| Meilisearch | getmeili/meilisearch:v1.10 | 7700:7700 | curl /health |

### Data Flow

```
User Request → Next.js API Route → Prisma → PostgreSQL
                                    ↓
                              Meilisearch (search)
                                    ↓
                              Redis (cache)
                                    ↓
                              Sentry (error tracking)
```

---

## Fraud Scoring Architecture

See `docs/FRAUD_SCORING_ARCHITECTURE.md` for complete documentation.

### Summary

- **Single implementation:** TypeScript (`lib/risk-scoring.ts`)
- **Signal-based:** Each category has specific fraud signals
- **Risk levels:** Low, Medium, High, Critical
- **Stored in:** `FraudSnapshot` table

---

## Security Considerations

### API Key Management

- All API keys stored in `.env` (never committed to git)
- `.env` is in `.gitignore`
- `.env.example` provides template without real keys
- Exposed Congress API key was revoked and replaced

### Input Validation

- All API routes use Zod schemas for input validation
- Rate limiting on public endpoints
- Sentry error tracking for production monitoring

---

*This document is the single source of truth for TrackFraud architectural decisions.*