# TrackFraud - Architecture Decision Records

> **Created:** 2026-04-23
> **Status:** ACTIVE
> **Goal:** Document architectural decisions and their rationale

---

## Table of Contents

1. [ADR-001: Single Backend Architecture](#adr-001-single-backend-architecture)
2. [ADR-002: Prisma Schema Cleanup Strategy](#adr-002-prisma-schema-cleanup-strategy)
3. [ADR-003: Task Queue Selection](#adr-003-task-queue-selection)
4. [API Boundary Definition](#api-boundary-definition)

---

## ADR-001: Single Backend Architecture

**Status:** Accepted
**Date:** 2026-04-23

### Context

TrackFraud currently has two separate backend systems:
- **Next.js API routes** (TypeScript + Prisma) - `/api/charities/*`, `/api/corporate/*`, etc.
- **Python FastAPI** (Python + SQLAlchemy) - `/api/v1/presidents`, `/api/v1/politicians`, etc.

This creates:
- Two ORMs querying the same database
- Schema drift risk
- Deployment complexity
- Debugging difficulty
- No transaction consistency

### Decision

**Choose Option B: Next.js Only**

All API routes will live in Next.js with Prisma as the single ORM.

### Rationale

1. **Platform is primarily a data display/search UI** - Next.js excels at this
2. **Single codebase** - One language (TypeScript), one ORM (Prisma)
3. **Simpler deployment** - One Docker service instead of two
4. **AI/ML features are nice-to-have** - Can be added later as separate Python microservice
5. **Next.js Server Actions** can handle all data operations

### Consequences

**Positive:**
- 50% reduction in backend complexity
- Single source of truth for data models
- Easier onboarding for new developers
- Faster iteration cycles

**Negative:**
- Python AI/ML features need TypeScript alternatives or separate service
- Celery workers need replacement (BullMQ recommended)
- Some FastAPI endpoints need migration to Next.js

### Migration Plan

1. Inventory all FastAPI endpoints
2. Migrate critical endpoints to Next.js API routes
3. Replace Celery with BullMQ for background tasks
4. Remove Python backend code
5. Update frontend to call Next.js routes only

---

## ADR-002: Prisma Schema Cleanup Strategy

**Status:** In Progress
**Date:** 2026-04-23

### Context

The Prisma schema contains 81 models with two parallel sets for the same data domains:

| Canonical Models | Legacy Models |
|-----------------|---------------|
| `Bill` | `bills` |
| `BillSponsor` | `bill_sponsors` |
| `BillVote` | `votes`, `vote_results` |
| `PoliticianClaim` | `politician_claims_legacy` |
| `CabinetMember` | `cabinet_members_legacy` |
| `President` | `presidents_legacy` |

### Decision

**Phase-based cleanup approach:**

1. **Phase 1:** Audit all 81 models for usage
2. **Phase 2:** Mark each model as USED or UNUSED
3. **Phase 3:** Delete unused legacy models
4. **Phase 4:** Migrate code using legacy models to canonical models
5. **Phase 5:** Run `prisma migrate dev` to apply changes

### Rationale

- Prevents breaking changes
- Ensures data integrity during migration
- Allows incremental progress

### Consequences

- Requires careful testing after each phase
- May need data migration scripts
- Prisma client regeneration required

---

## ADR-003: Task Queue Selection

**Status:** Accepted (if eliminating Python backend)
**Date:** 2026-04-23

### Context

Current task queue uses Celery (Python) with Redis broker. If eliminating Python backend, need TypeScript-native alternative.

### Decision

**Choose BullMQ** if eliminating Python backend.

### Rationale

1. **TypeScript native** - No language boundary
2. **Redis-based** - Uses existing Redis infrastructure
3. **Active maintenance** - Regular updates, good community
4. **Bull Board** - Visual monitoring dashboard
5. **Compatible with Next.js** - Works well with Server Actions

### Consequences

- Celery workers can be removed from docker-compose
- Python dependencies reduced (no celery, flower)
- Task definitions move to TypeScript

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
| `/api/search` | Full-text search | Meilisearch |
| `/api/fraud-scores` | Fraud scoring | TypeScript + Prisma |
| `/api/health` | Health check | Next.js |

### FastAPI Endpoints (Legacy - To Be Migrated)

| Prefix | Purpose | Status |
|--------|---------|--------|
| `/api/v1/presidents` | President data | ⏸️ Deferred |
| `/api/v1/politicians` | Politician data | ⏸️ Deferred |
| `/api/v1/bills` | Legislative data | ⏸️ Deferred |
| `/api/v1/promises` | Political promises | ⏸️ Deferred |
| `/api/v1/votes` | Voting records | ⏸️ Deferred |
| `/api/v1/search` | Search endpoint | ⏸️ Deferred |
| `/api/v1/analytics` | Analytics data | ⏸️ Deferred |

### Migration Priority

1. **High:** `/api/v1/politicians` - Most used by frontend
2. **Medium:** `/api/v1/bills`, `/api/v1/votes` - Core political data
3. **Low:** `/api/v1/analytics` - Can be rebuilt in TypeScript

---

## Future Architecture (Post-Migration)

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 14 Frontend                    │
│  (App Router, Server Actions, SSR/SSG)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                         │
│  (All data operations via Prisma)                            │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
         ┌──────────┐  ┌──────────┐  ┌──────────┐
         │PostgreSQL│  │ Meilisearch│  │  Redis   │
         │  (Prisma) │  │ (Search) │  │(BullMQ)  │
         └──────────┘  └──────────┘  └──────────┘
```

---

*This document is the single source of truth for TrackFraud architectural decisions.*