# TrackFraud — Production Readiness Plan

> **Date:** 2026-05-01
> **Status:** Planning
> **Priority:** Critical — Making the platform production-ready, scalable, cohesive

---

## Vision (Restated)

TrackFraud is a **mission-driven public accountability platform** that makes financial fraud visible. We aggregate data from 50+ government databases, regulatory filings, and community sources to give users a single place to follow the money across charities, corporations, government contracts, healthcare, political campaigns, and consumer protection.

**Our North Star:** Lower the barrier to financial accountability from "hire an investigative journalist" to "type a name and press search."

Every technical decision, every line of code, every pixel must serve that mission.

---

## Executive Summary

The platform has strong foundations: Next.js 15 + React 19, PostgreSQL 16, Meilisearch, Redis, Prisma ORM (53 models), 50+ ingestion scripts, fraud scoring engine, comprehensive API coverage, 353 passing unit tests, 27 passing E2E tests, CI/CD pipeline.

However, it currently feels like a "loose, disconnected mess" — inconsistent UI, broken components, duplicated data sources, missing pagination, in-memory caches that won't scale, category system that's half-DB/half-config, no auth on admin, etc.

This plan addresses **everything** needed to make TrackFraud production-ready for thousands to millions of users, while making it trivially easy to add new data categories, sources, and signals.

---

## Current State Assessment

### What Works Well ✅

| Area | Status | Notes |
|------|--------|-------|
| Next.js 15 + React 19 | ✅ Solid | Modern stack, App Router, Server Components |
| PostgreSQL + Prisma (53 models) | ✅ Solid | Well-designed schema, canonical entities |
| Meilisearch | ✅ Working | Full-text search across entities |
| Redis | ✅ Available | Rate limiting, but not used for caching |
| Fraud Scoring Engine | ✅ Extensible | Multi-signal, per-category detectors |
| API Coverage | ✅ Comprehensive | 40+ API routes across all categories |
| Testing | ✅ Good | 353 unit + 27 E2E tests passing |
| CI/CD | ✅ Working | GitHub Actions: lint, test, build, security |
| Security Fundamentals | ✅ Good | Zod validation, rate limiting, CSP headers, middleware |
| Dark Theme | ✅ Consistent | Design tokens, Tailwind config |
| Category Registry | ✅ Good pattern | `lib/categories.ts` is well-designed |

### What Needs Fixing 🔴 (Critical)

| Issue | Severity | Impact |
|-------|----------|--------|
| FraudMap webpack crash | 🔴 Critical | Homepage centerpiece is broken |
| AnimatedBackground disabled | 🔴 Critical | Layout component disabled |
| TypeScript error in FraudMapWrapper | 🔴 Critical | Type mismatch in dynamic import |
| In-memory caching (no Redis for data cache) | 🔴 Critical | Won't scale past a few concurrent users |
| Admin panel has no authentication | 🔴 Critical | Security risk |
| Search results missing pagination | 🔴 Critical | UX broken for large result sets |
| Duplicate category data (DB `FraudCategory` vs `lib/categories.ts`) | 🔴 High | Source of truth ambiguity |
| Charity detail page has legacy `dark:` classes | 🔴 High | Inconsistent UI |
| Many category pages are just redirects | 🔴 High | Wasted routes, confusing navigation |
| No database index strategy documented | 🔴 High | Query performance at scale |
| Fraud scoring runs synchronously | 🔴 High | Blocks API responses |
| ComingSoon component uses emoji | 🟡 Medium | Inconsistent with SVG icon system |
| About page uses `dark:` classes | 🟡 Medium | Inconsistent UI |
| No request ID propagation in API routes | 🟡 Medium | Hard to debug in production |
| No structured error response standard | 🟡 Medium | Inconsistent error handling |

### What Needs Building 🟡 (Important)

| Gap | Priority |
|-----|----------|
| CDN / Edge caching strategy | High |
| Database connection pooling optimization | High |
| Background job queue for scoring/ingestion | High |
| Proper monitoring (beyond Sentry) | High |
| API versioning strategy | Medium |
| GraphQL or unified entity API | Medium |
| Real-time fraud alerts / webhooks | Medium |
| User accounts (optional, for saved searches) | Low |

---

## Architecture Redesign Principles

### 1. Single Source of Truth per Concern

| Concern | Source of Truth |
|---------|----------------|
| Categories | `lib/categories.ts` only (delete DB `FraudCategory` dependency from UI) |
| Entity Identity | `CanonicalEntity` model (already correct) |
| Fraud Scores | `FraudSnapshot` model (already correct) |
| Rate Limiting | Redis-backed `lib/rate-limiter.ts` (already correct) |
| Search | Meilisearch (already correct) |
| Caching | Redis (MUST fix — currently in-memory) |
| Config/Env | `lib/env.ts` Zod validation (already correct) |
| Logging | `lib/logger.ts` (already correct, but must be adopted everywhere) |

### 2. Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (Next.js App Router)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Server Pages │  │ Client Comps │  │ API Routes   │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
├─────────────────────────────────────────────────────────────┤
│  Service Layer (lib/)                                       │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐   │
│  │ search.ts  │ │ db.ts    │ │ cache.ts │ │ rate-limit │   │
│  └────────────┘ └──────────┘ └──────────┘ └────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Domain Layer (lib/fraud-scoring/)                          │
│  ┌────────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ detection-     │ │ scorer.ts    │ │ signal-      │      │
│  │ engine.ts      │ │              │ │ definitions  │      │
│  └────────────────┘ └──────────────┘ └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure                                             │
│  PostgreSQL 16  │  Meilisearch v1.10  │  Redis 7           │
└─────────────────────────────────────────────────────────────┘
```

### 3. Extensibility Pattern

Adding a new data category should require:
1. Add entry to `lib/categories.ts`
2. Add Prisma model(s) to `schema.prisma`
3. Add ingestion script to `scripts/`
4. Add detector to `lib/fraud-scoring/`
5. Add to `scripts/reindex-search.ts`

**That's it.** No UI code changes needed. The dynamic category page at `app/[category]/page.tsx` handles rendering.

---

## Implementation Plan (7 Phases)

### Phase 1: Critical Fixes (Days 1-3)

**Goal:** Eliminate all blocking issues. App compiles, runs, and all pages work.

#### 1.1 Fix FraudMap Webpack Issue
- **Problem:** `react-simple-maps` + `d3-geo` + `topojson-client` cause webpack/module resolution errors in Next.js 15.
- **Fix:** 
  - Option A: Configure `next.config.mjs` with `transpilePackages` for the problematic deps.
  - Option B: Replace `react-simple-maps` with a lighter alternative (e.g., SVG-based US map or `@vis.gl/react-carto`).
  - Option C: Use Next.js `next/dynamic` with `ssr: false` and proper Webpack external config.
  - **Recommendation:** Option A first (fastest), fall back to B if it doesn't work.

```js
// next.config.mjs
const nextConfig = {
  // ...
  transpilePackages: ['react-simple-maps', 'd3-geo', 'topojson-client', 'd3-array', 'd3'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};
```

#### 1.2 Fix AnimatedBackground Webpack Issue
- **Problem:** Canvas-based animation causes webpack error.
- **Investigation needed:** Check if it's a React Server Components issue. Wrap in proper `"use client"` boundary.
- **Fix:** Ensure the component and its imports are all client-side. Use `next/dynamic` with `ssr: false` if needed.

#### 1.3 Fix TypeScript Error in FraudMapWrapper
- **Problem:** Dynamic import returns wrong type signature.
- **Fix:** Explicit type assertion in the loader function:

```tsx
const DynamicFraudMap = dynamic(
  () => import('@/components/FraudMap').then(mod => ({ default: mod.FraudMap })),
  { ssr: false, loading: () => <MapPlaceholder /> }
);
```

#### 1.4 Fix Search Pagination
- **Problem:** Search page has no pagination UI.
- **Fix:** Add `components/ui/Pagination.tsx` integration to `app/search/page.tsx`:
  - Show "Previous / Next" buttons
  - Show page numbers (1-5 + ellipsis + last)
  - Preserve URL params across pagination
  - Show "X of Y results" indicator

#### 1.5 Adopt Redis Caching Everywhere
- **Problem:** `lib/cache.ts` uses in-memory Maps. Won't survive restarts or scale horizontally.
- **Fix:** Rewrite `lib/cache.ts` to use Redis with in-memory fallback:

```typescript
// lib/cache.ts
import { getRedisClient } from './rate-limiter';

const DEFAULT_TTL = 3600; // 1 hour

export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    const val = await redis.get(`cache:${key}`);
    return val ? JSON.parse(val) : null;
  }
  // Fallback to in-memory
  return null;
}

export async function setCache<T>(key: string, value: T, ttl?: number): Promise<void> {
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    await redis.setex(`cache:${key}`, ttl || DEFAULT_TTL, JSON.stringify(value));
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys.length) await redis.del(...keys);
  }
}
```

#### 1.6 Add Admin Authentication
- **Problem:** `/admin` is publicly accessible.
- **Fix:** Add middleware-based auth:

```typescript
// middleware.ts (add to matcher)
// For admin routes, check for admin session/API key
if (pathname.startsWith('/admin')) {
  const adminKey = request.cookies.get('admin_session')?.value;
  if (adminKey !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }
}
```

**Acceptance Criteria:**
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] `npm run build` succeeds
- [ ] Homepage FraudMap renders (or graceful fallback)
- [ ] AnimatedBackground re-enabled on homepage
- [ ] Search results have working pagination
- [ ] `/admin` requires authentication
- [ ] All 353 unit tests still pass
- [ ] All 27 E2E tests still pass

---

### Phase 2: UI/UX Cohesion (Days 4-7)

**Goal:** Every page looks consistent, professional, and serves the mission.

#### 2.1 Consolidate Category Pages
- **Problem:** 6 category pages (`/charities`, `/corporate`, `/government`, `/healthcare`, `/political`, `/consumer`) are just client-side redirects. The `app/[category]/page.tsx` already renders proper category landing pages.
- **Fix:** 
  - Delete the redirect-only category pages (`app/charities/page.tsx`, `app/corporate/page.tsx`, etc.)
  - The dynamic `app/[category]/page.tsx` will handle all category routes
  - For categories that need custom behavior (charities has `[ein]` detail), keep those

```
# DELETE these redirect pages:
app/charities/page.tsx        → handled by app/[category]/page.tsx
app/corporate/page.tsx        → handled by app/[category]/page.tsx
app/government/page.tsx       → handled by app/[category]/page.tsx
app/healthcare/page.tsx       → handled by app/[category]/page.tsx
app/political/page.tsx        → handled by app/[category]/page.tsx
app/consumer/page.tsx         → handled by app/[category]/page.tsx
```

- **Enhance `app/[category]/page.tsx`:**
  - Use SVG icons from `components/ui/Icons.tsx` instead of emoji
  - Add proper stats cards
  - Add "top flagged" section per category
  - Add category-specific data visualizations

#### 2.2 Fix Legacy Dark Mode Classes
- **Problem:** Charity detail page, About page, Submit page, and other pages still have `dark:` Tailwind classes.
- **Fix:** Systematic cleanup:
  ```bash
  # Find all remaining dark: classes
  grep -r "dark:" app/ components/ --include="*.tsx" | grep -v "node_modules"
  ```
  - Remove all `dark:` prefixed classes
  - Replace `text-gray-900 dark:text-white` → `text-white`
  - Replace `text-gray-600 dark:text-gray-400` → `text-gray-400`
  - Replace `bg-white dark:bg-gray-900` → `bg-gray-900`
  - Replace `border-gray-200 dark:border-gray-700` → `border-gray-700`
  - etc.

#### 2.3 Replace Emoji with SVG Icons Everywhere
- **Problem:** ComingSoon component, category pages, and other components still use emoji.
- **Fix:**
  - Expand `components/ui/Icons.tsx` with additional icons (Construction/Coming Soon, ChevronRight, ArrowRight, etc.)
  - Update `ComingSoon` component to use SVG icons
  - Update `lib/categories.ts` — replace emoji `icon` field with `iconName` that maps to SVG components
  - Update all rendering code to use `<CategoryIcon name={cat.iconName} />`

#### 2.4 Standardize Loading States
- **Problem:** Pages show "Loading…" text or blank screens.
- **Fix:**
  - Use `components/ui/LoadingSkeleton.tsx` with proper skeleton layouts per page type
  - Add loading states to all API data fetching
  - Add optimistic UI updates where appropriate

#### 2.5 Standardize Error States
- **Problem:** Inconsistent error handling across pages.
- **Fix:**
  - Create shared error response interface:
  ```typescript
  // lib/types.ts
  export interface ApiError {
    error: string;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
  }
  ```
  - Create `components/ui/ErrorBoundary.tsx` (exists but needs enhancement)
  - Use `components/ui/ErrorState.tsx` for all error display
  - Add `notFound()` calls for 404 cases in server components
  - Add `error.tsx` files for Next.js error boundaries at route level

#### 2.6 Polish Homepage
- **Fixes:**
  - Ensure FraudMap renders as hero centerpiece
  - Stats ticker should include all 6 active category counts
  - Data sources marquee should be populated from `SourceSystem` DB model
  - CTA section should be prominent
  - Add "Recent Activity" section showing latest flagged entities

#### 2.7 Polish Search Page
- **Fixes:**
  - Add rich autocomplete dropdown (component exists but not wired in)
  - Add result count and processing time display
  - Add faceted search sidebar
  - Add "Save Search" functionality
  - Add export results (CSV) button

**Acceptance Criteria:**
- [ ] No emoji anywhere in the UI (only SVG icons)
- [ ] No `dark:` classes anywhere in the codebase
- [ ] All category pages render proper content (no redirects)
- [ ] Consistent loading/error states across all pages
- [ ] Search has autocomplete, facets, pagination
- [ ] Homepage has working FraudMap, stats, CTA
- [ ] E2E tests updated to match new UI

---

### Phase 3: Data Layer Optimization (Days 8-10)

**Goal:** Database performs well at scale. Queries are indexed. Data is consistent.

#### 3.1 Database Index Strategy
- **Problem:** No documented index strategy. Many queries may be slow at scale.
- **Fix:** Add indexes to `prisma/schema.prisma`:

```prisma
model CharityProfile {
  // ... existing fields
  
  @@index([ein], map: "idx_charity_ein")
  @@index([nteeCode], map: "idx_charity_ntee")
  @@index([state], map: "idx_charity_state")
  @@index([updatedAt], map: "idx_charity_updated")
  @@index([CanonicalEntityId], map: "idx_charity_entity")
}

model CorporateCompanyProfile {
  @@index([cik], map: "idx_corporate_cik")
  @@index([ticker], map: "idx_corporate_ticker")
  @@index([stateOfIncorporation], map: "idx_corporate_state")
  @@index([CanonicalEntityId], map: "idx_corporate_entity")
}

model CanonicalEntity {
  @@index([displayName], map: "idx_canonical_display_name")
  @@index([entityType], map: "idx_canonical_type")
}

model FraudSnapshot {
  @@index([entityId], map: "idx_fraudsnapshot_entity")
  @@index([score], map: "idx_fraudsnapshot_score")
  @@index([isCurrent], map: "idx_fraudsnapshot_current")
}

model GovernmentAwardRecord {
  @@index([recipientEntityId], map: "idx_govaward_recipient")
  @@index([awardId], map: "idx_govaward_id")
}

model ConsumerComplaintRecord {
  @@index([companyName], map: "idx_consumer_company")
  @@index([state], map: "idx_consumer_state")
}
```

#### 3.2 Database Connection Pooling
- **Current:** Prisma default pooling (typically 10 connections).
- **Fix for production:** 
  - Set `DATABASE_URL` with `?connection_limit=20` for single-instance
  - For multi-instance, use PgBouncer or Prisma's connection pooling proxy
  - Add connection health checks

#### 3.3 Resolve Category Data Duplication
- **Problem:** Categories stored both in `lib/categories.ts` AND in DB `FraudCategory` model.
- **Fix:** Choose `lib/categories.ts` as the source of truth for UI. Keep `FraudCategory` in DB only for:
  - Tips submissions (foreign key reference)
  - Subscribe notifications (foreign key reference)
  - Admin dashboard category stats
- Sync script: Run once to ensure DB matches config file:

```typescript
// scripts/sync-categories.ts
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/categories';

async function sync() {
  for (const cat of CATEGORIES) {
    await prisma.fraudCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, status: cat.status, iconName: cat.iconName },
      create: { slug: cat.slug, name: cat.name, status: cat.status, iconName: cat.iconName },
    });
  }
}
```

#### 3.4 Meilisearch Index Optimization
- **Problem:** Search indexes may not have optimal settings.
- **Fix:**
  - Tune `searchableAttributes` ordering for each index
  - Add stop words filtering
  - Configure synonym dictionaries (e.g., "nonprofit" = "charity" = "non-profit")
  - Add custom ranking rules

#### 3.5 Data Consistency Checks
- **Problem:** No validation that search indexes match database.
- **Fix:** Add `scripts/verify-search-consistency.ts`:
  - Compare document counts between Meilisearch and PostgreSQL
  - Spot-check random entities
  - Report discrepancies

**Acceptance Criteria:**
- [ ] All critical queries use indexes (verify with `EXPLAIN ANALYZE`)
- [ ] Connection pooling configured for production
- [ ] Category data is in sync between config and DB
- [ ] Search index consistency verified
- [ ] Database backup/restore tested

---

### Phase 4: Scalability & Performance (Days 11-14)

**Goal:** Platform handles thousands of concurrent users. API responses are fast.

#### 4.1 CDN / Edge Caching Strategy
- **Problem:** No CDN or edge caching. Every request hits the origin server.
- **Fix:**
  - **Static assets:** Already handled by Next.js (`/_next/static` with 1-year cache).
  - **Server-rendered pages:** Add `revalidate` tags to all server pages. Current homepage has `revalidate = 60`.
  - **API routes:** 
    - GET routes with stable data: Add `Cache-Control: public, s-maxage=300` headers
    - Dynamic data: Keep `no-store`
    - Search: `s-maxage=10` (10-second CDN cache for repeated queries)
  - **Vercel/Cloudflare deployment:** Configure edge network caching rules.

#### 4.2 API Response Caching
- **Problem:** Every API call hits the database.
- **Fix:** Use Redis caching layer (from Phase 1.5):
  - Charity detail: 30-minute TTL
  - Corporate detail: 1-hour TTL
  - Category stats: 5-minute TTL
  - Fraud scores: 1-hour TTL
  - Search results: 10-second TTL (varies by query)

#### 4.3 Background Job Processing
- **Problem:** Fraud scoring runs synchronously in API routes.
- **Fix:** Implement background job queue:
  - **Option A:** Use `bullmq` (Redis-based job queue) — recommended
  - **Option B:** Use `vercel/ai` batch processing
  - **Option C:** Separate worker process with `tsx scripts/worker.ts`

```typescript
// lib/jobs.ts
import { Queue, Worker } from 'bullmq';

const fraudQueue = new Queue('fraud-scoring', { connection: redisConnection });
const ingestionQueue = new Queue('ingestion', { connection: redisConnection });
const searchQueue = new Queue('search-reindex', { connection: redisConnection });

// API route: queue scoring job instead of running synchronously
export async function POST() {
  await fraudQueue.add('score-entity', { entityId, entityType }, {
    priority: 1,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
  return NextResponse.json({ status: 'queued', jobId });
}
```

#### 4.4 Database Read Replicas (Future)
- **Problem:** Single PostgreSQL instance handles both reads and writes.
- **Plan:** For millions of users, add read replicas:
  - Configure Prisma with `@@schemaAttribute` or use a connection router
  - Route read queries to replicas
  - Route write queries to primary
  - **Not needed for initial production launch** — can handle ~10K RPS on a single well-tuned PostgreSQL instance

#### 4.5 Horizontal Scaling Strategy
- **Problem:** Current architecture assumes single Next.js instance.
- **Fix:**
  - **Next.js:** Stateless by design. Scale horizontally behind load balancer.
  - **Redis:** Single instance handles rate limiting. Scale to Redis Cluster if needed.
  - **PostgreSQL:** Single instance with connection pooling (PgBouncer).
  - **Meilisearch:** Single instance. Scale to multi-node if needed.
  - **Docker Compose → Kubernetes** migration path documented.

#### 4.6 Performance Monitoring
- **Problem:** No performance baselines or monitoring.
- **Fix:**
  - Add response time tracking to API routes
  - Add database query time logging (Prisma already logs in dev)
  - Add Redis connection health monitoring
  - Add Meilisearch health monitoring
  - Configure Sentry performance monitoring (already set up)

```typescript
// lib/metrics.ts (expand existing)
export function trackApiLatency(route: string, duration: ms) {
  // Send to Sentry / custom metrics endpoint
}

export function trackDbLatency(query: string, duration: ms) {
  // Log slow queries
}
```

**Acceptance Criteria:**
- [ ] API response times < 200ms for cached routes
- [ ] API response times < 500ms for uncached routes
- [ ] Redis caching reduces database queries by > 70%
- [ ] Background jobs process scoring asynchronously
- [ ] Load tested with 100+ concurrent users
- [ ] CDN caching configured and verified

---

### Phase 5: Fraud Scoring & Pipeline Hardening (Days 15-18)

**Goal:** Scoring is accurate, fast, extensible, and runs reliably.

#### 5.1 Scoring Pipeline Architecture

```
Ingestion → Signal Detection → Scoring → Snapshot Storage → Search Index Update
     ↓              ↓                ↓              ↓                  ↓
  PostgreSQL   Detectors per    Weighted         FraudSnapshot     Meilisearch
  (raw data)   category         calculation      (DB)              (enriched)
```

#### 5.2 Refactor Scoring to Use Queue (from Phase 4.3)
- Trigger scoring after ingestion completes
- Trigger scoring on demand via API (returns job ID)
- Trigger batch scoring via cron/schedule
- Results stored in `FraudSnapshot` table

#### 5.3 Add Missing Detectors
- **Corporate detectors:** SEC enforcement actions, insider trading patterns, financial statement anomalies
- **Healthcare detectors:** CMS payment patterns, OIG exclusion matching, FDA warning letter correlation
- **Government detectors:** SAM exclusion matching, contract award patterns, multi-agency correlation
- **Cross-category correlation:** Same entity flagged across multiple categories

#### 5.4 Add Scoring API Endpoints
```
GET /api/fraud-scores?entityId=xxx        → Get current score
POST /api/fraud-scores/refresh            → Trigger re-scoring (queued)
GET /api/fraud-scores/history?entityId=xx → Score trend over time
GET /api/fraud-scores/signals?entityId=xx → Individual signals
```

#### 5.5 Ingestion Pipeline Improvements
- **Current:** Individual scripts triggered manually.
- **Fix:** Implement pipeline orchestrator:
  ```typescript
  // lib/pipeline/orchestrator.ts
  interface PipelineConfig {
    source: string;
    script: string;
    schedule: string;        // cron expression
    dependencies: string[];  // other sources to run first
    retries: number;
    timeout: number;
  }
  ```
- Add pipeline status dashboard to `/admin`
- Add failure notifications (Sentry alerts + email/webhook)
- Add idempotency to all ingestion scripts (safe to re-run)

#### 5.6 Add Cross-Category Entity Resolution
- **Problem:** Same entity may exist in multiple categories (e.g., a corporation that's also a government contractor).
- **Fix:** Enhance `CanonicalEntity` linking:
  - Fuzzy match on name + address + EIN
  - Link `CharityProfile`, `CorporateCompanyProfile`, `GovernmentAwardRecord` via `CanonicalEntity`
  - Show "Related Entities" section on entity detail pages

**Acceptance Criteria:**
- [ ] All 6 active categories have working detectors
- [ ] Scoring runs asynchronously via job queue
- [ ] Pipeline orchestrator manages ingestion schedule
- [ ] Cross-category entity resolution works
- [ ] Scoring API returns results in < 200ms (cached)

---

### Phase 6: Search & Discovery Enhancement (Days 19-21)

**Goal:** Users can find any entity quickly. Search is fast, accurate, and rich.

#### 6.1 Wire Autocomplete Dropdown
- **Problem:** `components/search/AutocompleteDropdown.tsx` exists but isn't wired into the hero search or navbar search.
- **Fix:** Create `components/search/SearchInput.tsx` that combines input + autocomplete:

```tsx
// components/search/SearchInput.tsx
"use client";
export function SearchInput({ route = "/search" }: { route?: string }) {
  return (
    <div className="relative">
      <input 
        type="search" 
        name="q"
        onInput={debounce(fetchSuggestions, 300)}
        // ... 
      />
      <AutocompleteDropdown suggestions={suggestions} onSelect={handleSelect} />
    </div>
  );
}
```

#### 6.2 Advanced Search Filters
- **Add to search page:**
  - Entity type multi-select
  - State multi-select
  - Risk level range slider
  - Date range picker
  - "Has regulatory actions" toggle
  - "NTEE Code" filter (for charities)
  - "Industry" filter (for corporations)

#### 6.3 Search Result Cards
- **Enhance:** Each result card shows:
  - Entity name (with highlight)
  - Entity type badge
  - Risk score meter
  - Location
  - Key identifiers (EIN, CIK, etc.)
  - Regulatory action count
  - Quick actions (view detail, submit tip)

#### 6.4 Save Search & Alerts
- **Feature:** Users can save searches and get notified of new matches.
- **Implementation:**
  - Store saved searches in `Subscriber` model
  - Daily digest email of new matches
  - Webhook option for developers

#### 6.5 Search Analytics
- Track: Most searched terms, zero-result queries, filter usage, click-through rates.
- Store in PostgreSQL `SearchAnalytics` model.
- Display in `/admin`.

**Acceptance Criteria:**
- [ ] Autocomplete works on homepage and navbar
- [ ] Advanced filters available and functional
- [ ] Search results show rich entity cards
- [ ] Search analytics tracked in admin dashboard
- [ ] Search response time < 100ms (Meilisearch)

---

### Phase 7: Production Deployment & Monitoring (Days 22-25)

**Goal:** Deploy to production. Monitor everything. Respond to incidents.

#### 7.1 Production Deployment
- **Platform:** Vercel (recommended) or self-hosted with Docker + Nginx + systemd.
- **Database:** Managed PostgreSQL (AWS RDS, Supabase, Neon).
- **Redis:** Managed Redis (Upstash, AWS ElastiCache).
- **Meilisearch:** Managed (Meilisearch Cloud) or self-hosted.

#### 7.2 Environment Configuration
```bash
# Production .env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/trackfraud?connection_limit=20
REDIS_URL=redis://host:6379
MEILISEARCH_URL=https://search.host
MEILISEARCH_API_KEY=production-key
NEXT_PUBLIC_APP_URL=https://trackfraud.com
SENTRY_DSN=https://sentry.io/xxx
ADMIN_SESSION_SECRET=long-random-string
JWT_SECRET=long-random-string
```

#### 7.3 Monitoring & Alerting
- **Sentry:** Error tracking + performance monitoring (already configured).
- **Uptime monitoring:** UptimeRobot or similar for `/api/health`.
- **Log aggregation:** Forward logs to Datadog, Grafana Loki, or similar.
- **Database monitoring:** PgStat track activities. Alert on slow queries.
- **Custom alerts:**
  - Ingestion failures
  - Search index inconsistencies
  - Rate limit threshold changes
  - Fraud score anomalies

#### 7.4 Runbook Updates
Update existing runbooks in `docs/runbooks/`:
- `database-maintenance.md` — Backup, vacuum, index rebuild
- `ingestion-troubleshooting.md` — Pipeline failures, retries
- `search-index-management.md` — Reindex, consistency checks
- `monitoring-alerts.md` — Alert response procedures
- `log-management.md` — Log rotation, retention
- **New:** `incident-response.md` — Incident classification and escalation
- **New:** `scaling-guide.md` — How to scale each component

#### 7.5 Security Audit
- [ ] All API routes validated with Zod
- [ ] Rate limiting on all API routes
- [ ] CORS configured correctly
- [ ] CSP headers configured
- [ ] No sensitive data in logs
- [ ] Dependencies audited (`npm audit`)
- [ ] Admin authentication enforced
- [ ] API keys in environment variables only
- [ ] HTTPS enforced in production
- [ ] Database credentials rotated

#### 7.6 Documentation
- [ ] `README.md` updated with production deployment guide
- [ ] `docs/ARCHITECTURE.md` updated with new architecture
- [ ] `docs/GETTING_STARTED.md` updated for production setup
- [ ] `docs/DATA_MODELS.md` updated
- [ ] `docs/FRAUD_SCORING.md` updated with new detectors
- [ ] API documentation (consider OpenAPI/Swagger)
- [ ] `docs/runbooks/` all updated
- [ ] CHANGELOG.md created

**Acceptance Criteria:**
- [ ] Platform deployed to production
- [ ] Health checks passing
- [ ] Monitoring and alerting configured
- [ ] Runbooks up to date
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Performance baseline established
- [ ] Load test passed (1000+ concurrent users)

---

## File Inventory

### Files to Create
| File | Purpose | Phase |
|------|---------|-------|
| `components/search/SearchInput.tsx` | Unified search input with autocomplete | 6 |
| `components/ui/Pagination.tsx` | Pagination component | 1 |
| `components/ui/Skeleton.tsx` | Loading skeletons | 2 |
| `components/ui/ErrorState.tsx` | Error state displays | 2 |
| `lib/jobs.ts` | Background job queue | 4 |
| `lib/pipeline/orchestrator.ts` | Ingestion pipeline orchestrator | 5 |
| `scripts/sync-categories.ts` | Sync category config with DB | 3 |
| `scripts/verify-search-consistency.ts` | Search/DB consistency check | 3 |
| `scripts/load-test.ts` | Load testing script | 4 |
| `app/error.tsx` | Root error boundary | 2 |
| `app/not-found.tsx` | Custom 404 page | 2 |
| `docs/runbooks/incident-response.md` | Incident response | 7 |
| `docs/runbooks/scaling-guide.md` | Scaling guide | 7 |
| `CHANGELOG.md` | Version tracking | 7 |

### Files to Modify
| File | Change | Phase |
|------|--------|-------|
| `next.config.mjs` | Add `transpilePackages` for FraudMap | 1 |
| `lib/cache.ts` | Rewrite with Redis | 1 |
| `middleware.ts` | Add admin auth | 1 |
| `app/search/page.tsx` | Add pagination, autocomplete, filters | 1, 6 |
| `app/[category]/page.tsx` | Enhance with SVG icons, stats | 2 |
| `app/charities/[ein]/page.tsx` | Remove `dark:` classes | 2 |
| `app/about/page.tsx` | Remove `dark:` classes | 2 |
| `app/submit/page.tsx` | Remove `dark:` classes | 2 |
| `components/ComingSoon.tsx` | Replace emoji with SVG | 2 |
| `components/FraudMap.tsx` | Fix webpack issues | 1 |
| `components/FraudMapWrapper.tsx` | Fix TypeScript types | 1 |
| `components/ui/Icons.tsx` | Add more icons | 2 |
| `lib/categories.ts` | Replace emoji with icon names | 2 |
| `prisma/schema.prisma` | Add indexes | 3 |
| `lib/risk-scoring.ts` | Async scoring via queue | 5 |
| `lib/fraud-scoring/` | Add missing detectors | 5 |
| `scripts/reindex-search.ts` | Add new categories | 5 |
| `app/api/search/route.ts` | Add Redis caching | 4 |
| `docker-compose.yml` | Production configuration | 7 |
| `Dockerfile` | Production hardening | 7 |
| `.github/workflows/ci.yml` | Add E2E, load tests | 7 |

### Files to Delete
| File | Reason | Phase |
|------|--------|-------|
| `app/charities/page.tsx` | Redirect → dynamic route | 2 |
| `app/corporate/page.tsx` | Redirect → dynamic route | 2 |
| `app/government/page.tsx` | Redirect → dynamic route | 2 |
| `app/healthcare/page.tsx` | Redirect → dynamic route | 2 |
| `app/political/page.tsx` | Redirect → dynamic route | 2 |
| `app/consumer/page.tsx` | Redirect → dynamic route | 2 |

---

## Adding New Categories (The Extensibility Goal)

After this plan is executed, adding a new fraud tracking category requires:

### Step 1: Add to Category Registry
```typescript
// lib/categories.ts
{
  slug: "new-category",
  name: "New Category Name",
  iconName: "NewCategoryIcon",
  color: "teal",
  description: "Description of this category",
  searchType: "new_category_type",
  entityDetailRoute: "/new-category/[id]",
  sortOrder: 17,
  status: "active",
}
```

### Step 2: Add Prisma Model
```prisma
model NewCategoryProfile {
  id              String    @id @default(uuid())
  CanonicalEntity CanonicalEntity @relation(fields: [canonicalEntityId], references: [id])
  canonicalEntityId String
  // ... category-specific fields
  
  @@index([canonicalEntityId])
}
```

### Step 3: Add Ingestion Script
```
scripts/ingest-new-category.ts
```

### Step 4: Add Fraud Detector
```
lib/fraud-scoring/new-category-detectors.ts
```

### Step 5: Add to Search Reindex
```typescript
// scripts/reindex-search.ts
// Add NewCategoryProfile indexing logic
```

**That's it.** The dynamic `app/[category]/page.tsx` renders the landing page. The unified search picks up new entities. The fraud scoring engine processes new signals.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FraudMap can't be fixed | Medium | Medium | Graceful SVG fallback map |
| Redis unavailable | Low | Medium | In-memory fallback already exists |
| Meilisearch performance at scale | Low | High | Paginate, cache, consider Elasticsearch migration path |
| PostgreSQL performance at scale | Medium | High | Index strategy, connection pooling, read replicas |
| Ingestion API rate limits | High | Low | Retry logic, exponential backoff, respect robots.txt |
| Data accuracy issues | Medium | High | Source attribution, user feedback, community tips |
| Legal liability | Low | Critical | Disclaimer on all pages, not legal advice |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Homepage load time | < 2s |
| Search response time | < 100ms |
| API response time (cached) | < 200ms |
| API response time (uncached) | < 500ms |
| Database query time (p95) | < 100ms |
| Error rate | < 0.1% |
| Uptime | > 99.9% |
| Test coverage | > 80% |
| E2E tests passing | 100% |
| Lighthouse score | > 90 |

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1. Critical Fixes | 3 days | App compiles, runs, no blocking issues |
| 2. UI/UX Cohesion | 4 days | Consistent, professional UI across all pages |
| 3. Data Layer | 3 days | Optimized database, consistent data |
| 4. Scalability | 4 days | Caching, background jobs, horizontal scaling |
| 5. Fraud Pipeline | 4 days | Reliable scoring, cross-category correlation |
| 6. Search Enhancement | 3 days | Rich search with autocomplete, facets |
| 7. Production Deploy | 4 days | Deployed, monitored, documented |
| **Total** | **~25 days** | **Production-ready platform** |

---

## Handoff Notes

This plan is designed to be executed sequentially but can be parallelized where dependencies allow. Each phase has clear acceptance criteria. After each phase:
1. Run `npm test` — all tests pass
2. Run `npm run test:e2e` — all E2E tests pass
3. Run `npm run build` — build succeeds
4. Manual verification of key user flows
5. Git commit with descriptive message

The goal is not just "it builds" but "it works as intended, looks great, and scales."
