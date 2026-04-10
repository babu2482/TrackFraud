# 0003: Next.js Full-Stack Architecture Choice

## Status
Accepted

## Context

TrackFraud needed an architecture decision for the application stack. Options included:

1. **Separate Frontend + Backend**: React/Vue SPA with dedicated Node/Python API backend
2. **Next.js Full-Stack**: Single codebase with App Router serving both frontend and API routes
3. **Microservices**: Multiple specialized services (ingestion, search, API, frontend)

**Key requirements:**
1. Rapid development iteration for data ingestion and UI features
2. Type safety across entire stack (database → API → frontend)
3. Easy deployment and operational simplicity
4. Support for both server-rendered pages and API endpoints
5. Developer experience for contributors with varying backend/frontend skills

## Decision

We chose **Next.js 14 with App Router** as our full-stack framework.

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              TrackFraud Next.js App                 │
├─────────────────────────────────────────────────────┤
│  app/                                                 │
│    ├── page.tsx           # Landing page (SSR)       │
│    ├── charities/         # Charity pages (SSR)      │
│    ├── api/               # API routes (serverless)  │
│    │   └── search/route.ts                            │
│    └── layout.tsx       # Root layout                │
├─────────────────────────────────────────────────────┤
│  lib/                                                 │
│    ├── db.ts            # Prisma client              │
│    ├── api.ts           # Shared API utilities       │
│    └── search.ts        # Meilisearch client         │
├─────────────────────────────────────────────────────┤
│  scripts/                                             │
│    └── ingest-*.ts      # Data ingestion scripts     │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions Within Next.js Choice

1. **App Router over Pages Router**: Leverage React Server Components for data fetching
2. **Server-Side Rendering (SSR)**: All entity pages rendered on server for SEO and performance
3. **API Routes as Serverless Functions**: `/api/*` endpoints deployed alongside frontend
4. **Prisma Client in API Routes**: Direct database access from serverless functions

### Technology Stack Justification

| Layer | Technology | Why Chosen |
|-------|------------|------------|
| Framework | Next.js 14 App Router | Full-stack, SSR, API routes, TypeScript built-in |
| ORM | Prisma | Type-safe queries, migrations, auto-generated types |
| Database | PostgreSQL 16 | Relational data, ACID compliance, JSONB support |
| Search | Meilisearch | Fast full-text search, typo tolerance, easy setup |

## Alternatives Considered

### Alternative A: Separate Frontend + Backend

**Frontend:** Next.js SPA with TanStack Query
**Backend:** Express/Fastify API service in Node.js or Python FastAPI

**Why not:**
- Duplicate type definitions (need tRPC or OpenAPI generation for sync)
- More deployment complexity (2+ services to manage)
- Higher operational overhead (separate scaling, monitoring)
- Slower iteration (changes require coordinating multiple repos/services)

### Alternative B: Python Backend Only

**Frontend:** Next.js SPA
**Backend:** FastAPI with SQLAlchemy

**Why not:**
- Already invested in TypeScript ecosystem
- Prisma provides better DX for relational queries than SQLAlchemy
- Next.js API routes sufficient for current scale (~30 endpoints)
- Can add Python services later for ML/AI workloads

### Alternative C: Microservices Architecture

Separate services for ingestion, search, API gateway, and frontend.

**Why not:**
- Severe over-engineering for current scale (single team, <50 endpoints)
- Network latency between services
- Distributed tracing complexity
- Deployment orchestration overhead (Kubernetes required for true benefit)

## Consequences

### Positive

1. **Developer Velocity**: Single codebase, one deployment target, instant type sync
2. **Type Safety**: Prisma generates TypeScript types from schema → API → frontend all typed
3. **SEO**: SSR pages indexed properly by search engines
4. **Cost Efficiency**: Serverless API routes scale to zero when not in use
5. **Simple Deployment:** Deploy single Vercel/Netlify app or self-hosted Docker container

### Negative

1. **Cold Starts:** Serverless functions have latency on first invocation after idle
2. **Function Size Limits:** Large ingestion scripts need to run as CLI tools, not API routes
3. **Long-Running Tasks:** Cannot run multi-minute operations in serverless (use background jobs instead)
4. **Vendor Lock-in:** Next.js deployment patterns optimized for Vercel

### Mitigations Implemented

1. **Ingestion Scripts Run Standalone:** Data ingestion uses `scripts/*.ts` executed via CLI or cron, not API routes
2. **Background Jobs with Celery:** Long-running tasks offloaded to Python Celery workers (when needed)
3. **Hybrid Approach:** Next.js for frontend/API, separate Python backend only where needed

## Related Decisions

- [0001: Data Ingestion Architecture](./0001-data-ingestion-architecture.md) - Why ingestion runs as scripts, not API routes
- [0002: Unified Entity Model](./0002-unified-entity-model.md) - Database schema supporting full-stack architecture

## References

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Prisma ORM Documentation](https://www.prisma.io/docs)
- [README.md](../README.md) - Project setup and deployment
