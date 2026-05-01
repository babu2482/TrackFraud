# TrackFraud — Production Readiness Handoff

> **Date:** 2026-05-01
> **Prepared by:** AI Agent
> **Plan:** `docs/PRODUCTION_READINESS_PLAN.md`
> **Status:** Phase 1 ✅ complete, Phase 2 ✅ complete, ready for Phase 3
> **Review:** Second-pass review completed — 6 changes applied
> **Last Commit:** `550c59e` — Phase 2 data layer optimization

---

## Phase 2: Data Layer Optimization ✅ COMPLETE (Commit: 550c59e)

### Changes Applied:
1. **Database Index Strategy** — Added indexes to CharityProfile (ein, updatedAt), CorporateCompanyProfile (cik), CanonicalEntity (displayName, normalizedName)
2. **Eliminated FraudCategory Model** — Deleted model + all relations. categoryId is now a String slug.
3. **Single Source of Truth** — `lib/categories.ts` is THE source. No DB category model.
4. **Updated 5 API Routes** — /api/categories, /api/subscribe, /api/tips, /api/admin/*
5. **Updated 10 Ingestion Scripts** — All use category slugs directly
6. **Updated Seed Script** — Removed FraudCategory seeding loop
7. **Deleted** scripts/add-global-categories.ts (obsolete)

### Migration Required:
```
npx prisma migrate dev --name remove-fraud-category-model
```

### Verification:
- `npx tsc --noEmit` — 0 errors
- `npm run build` — Compiles successfully
- 17 files changed, net: -865 lines

---

## Phase 1: Critical Fixes ✅ COMPLETE (Commit: a86b5de)

### Changes Applied:
1. **FraudMap webpack fix** — Added `transpilePackages` and webpack fallback config in `next.config.mjs`
2. **FraudMapWrapper TypeScript fix** — Proper typing, replaced emoji with SVG icons
3. **AnimatedBackground re-enabled** — Dynamic import, shows on home page only
4. **Homepage updated** — FraudMap component replaces placeholder
5. **Search pagination** — Page state, offset calculation, Pagination component wired in
6. **Redis caching** — `lib/cache.ts` rewritten with Redis + in-memory fallback, all consumers updated
7. **Admin authentication** — Cookie-based auth, login page, verify API endpoint, middleware check
8. **Rate limiting consolidated** — Search API uses `lib/rate-limiter.ts` (Redis-backed)
9. **Test infrastructure** — vitest path aliases, cache mock, all cache tests passing

### Verification:
- `npx tsc --noEmit` — 0 errors
- `npm run build` — Compiles successfully
- `npm run test` — Cache tests (14) pass, search tests pass
- E2E tests — 33 tests (search/home) pass

---

## What Was Done in This Session

### 1. Comprehensive Codebase Audit
- Reviewed every directory: `app/`, `components/`, `lib/`, `prisma/`, `scripts/`, `tests/`, `docs/`, `.github/`
- Read all configuration files: `package.json`, `next.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `docker-compose.yml`, `Dockerfile`, `playwright.config.ts`, `middleware.ts`
- Read all documentation: `README.md`, `ARCHITECTURE.md`, `DATA_MODELS.md`, `FRAUD_SCORING.md`, `DATA_SOURCES.md`, `UI_OVERHAUL_PLAN.md`, `HANDOFF_UI_OVERHAUL.md`, `E2E_TESTING_REPORT.md`, `CLEANUP_HANDOFF.md`
- Reviewed key source files: `layout.tsx`, `page.tsx`, `Navbar.tsx`, `Footer.tsx`, `categories.ts`, `cache.ts`, `rate-limiter.ts`, `search.ts`, `risk-scoring.ts`, `search/route.ts`, `health/route.ts`
- Checked TypeScript compilation: 1 error found (`FraudMapWrapper.tsx` type mismatch)

### 2. Web Research
- Searched best practices for fraud tracking platforms, scalability patterns, and production deployment strategies
- Gathered industry benchmarks for performance targets

### 3. Created Production Readiness Plan
- Full plan at `docs/PRODUCTION_READINESS_PLAN.md` (~1000 lines after review)
- 7 phases, ~30 days total
- Every issue identified, prioritized, and assigned to a phase
- Architecture redesign principles documented
- Extensibility pattern defined (5 steps to add new category)

### 4. Second-Pass Review — Changes Applied
The following changes were made during planning review:
1. **Phase reordering:** Phase 2 (Data Layer) now runs before Phase 3 (UI/UX). DB migration before UI polish.
2. **Category duplication:** Changed from sync-script approach to deleting `FraudCategory` model entirely. Use string slugs + CHECK constraints.
3. **MeiliSearch kill switch:** If search doesn't work by end of Phase 2, fall back to Postgres FTS. Don't block launch.
4. **Rate limiting consolidation:** All API routes use `lib/rate-limiter.ts`. Removed duplicated inline rate limiter from search API.
5. **Legal disclaimers:** Added disclaimer footer, takedown process, source attribution. New pages: `/disclaimer`, `/contact/takedown`.
6. **Timeline buffer:** 25 → 30 days. Added buffer for Phase 3 (5 days), Phase 5, and Phase 7 (7 days).

### 5. Key Findings

#### Strengths (Keep These)
- Next.js 15 + React 19 modern stack
- Prisma ORM with 53 well-designed models
- `CanonicalEntity` cross-referencing pattern (correct approach)
- `lib/categories.ts` registry pattern (clean, extensible)
- `lib/env.ts` Zod-validated environment
- `lib/rate-limiter.ts` Redis-backed with in-memory fallback
- `lib/logger.ts` structured logging
- 40+ API routes with comprehensive coverage
- 353 unit tests + 27 E2E tests passing
- CI/CD pipeline with GitHub Actions
- Security: Zod validation, rate limiting, CSP headers, middleware

#### Critical Issues (Fix First)
- **FraudMap webpack crash** — Homepage centerpiece broken
- **AnimatedBackground disabled** — Layout component commented out
- **TypeScript error** in `FraudMapWrapper.tsx`
- **In-memory caching** — `lib/cache.ts` uses Maps, won't scale
- **Admin panel no auth** — Security risk
- **No search pagination** — UX broken for large results
- **Duplicate category data** — Delete `FraudCategory` model, use string slugs

#### UI Inconsistencies
- Legacy `dark:` Tailwind classes in charity detail, about, submit pages
- Emoji still used in ComingSoon component and `lib/categories.ts`
- 6 category pages are just client-side redirects
- Inconsistent loading/error states across pages
- Search page missing autocomplete (component exists but not wired in)

#### Scalability Gaps
- No Redis caching for API responses
- No background job queue for scoring/ingestion
- No CDN/edge caching strategy
- No database index strategy documented
- Fraud scoring runs synchronously
- No performance monitoring beyond Sentry

---

## Project Structure (Current)

```
TrackFraudProject/
├── app/                          # Next.js App Router
│   ├── [category]/page.tsx       # Dynamic category landing (GOOD — use this)
│   ├── charities/
│   │   ├── page.tsx              # REDIRECT (delete in Phase 2)
│   │   └── [ein]/page.tsx        # Charity detail (needs dark: cleanup)
│   ├── corporate/page.tsx        # REDIRECT (delete in Phase 2)
│   ├── government/page.tsx       # REDIRECT (delete in Phase 2)
│   ├── healthcare/page.tsx       # REDIRECT (delete in Phase 2)
│   ├── political/page.tsx        # REDIRECT (delete in Phase 2)
│   ├── consumer/page.tsx         # REDIRECT (delete in Phase 2)
│   ├── search/page.tsx           # Main search (needs pagination + autocomplete)
│   ├── submit/page.tsx           # Tip submission (needs dark: cleanup)
│   ├── about/page.tsx            # About page (needs dark: cleanup)
│   ├── admin/page.tsx            # Admin dashboard (needs auth)
│   ├── api/                      # 40+ API routes
│   ├── layout.tsx                # Root layout (good)
│   ├── page.tsx                  # Homepage (good, but FraudMap broken)
│   └── globals.css               # Dark theme tokens (good)
├── components/
│   ├── layout/
│   │   ├── ClientLayout.tsx      # Layout wrapper (good, AnimatedBackground disabled)
│   │   ├── Navbar.tsx            # Navigation (good)
│   │   └── Footer.tsx            # Footer (good)
│   ├── ui/                       # Shared components
│   │   ├── Icons.tsx             # SVG icons (expand with more icons)
│   │   ├── AnimatedBackground.tsx # Canvas animation (webpack issue)
│   │   ├── DataSourcesMarquee.tsx # Data sources strip (good)
│   │   ├── Button.tsx, Card.tsx, Input.tsx, Badge.tsx, etc.
│   ├── search/
│   │   └── AutocompleteDropdown.tsx # EXISTS but not wired in
│   ├── FraudMap.tsx              # US fraud heatmap (webpack issue)
│   ├── FraudMapWrapper.tsx       # Wrapper (TypeScript error)
│   └── ComingSoon.tsx            # Uses emoji (replace with SVG)
├── lib/
│   ├── db.ts                     # Prisma client (good)
│   ├── cache.ts                  # IN-MEMORY (rewrite with Redis)
│   ├── rate-limiter.ts           # Redis-backed (good)
│   ├── logger.ts                 # Structured logging (good)
│   ├── env.ts                    # Zod-validated env (good)
│   ├── categories.ts             # Category registry (good, replace emoji)
│   ├── search.ts                 # Meilisearch client (good)
│   ├── risk-scoring.ts           # Risk scoring engine (good, make async)
│   ├── fraud-scoring/            # Signal detectors per category
│   └── [other utilities]
├── prisma/
│   └── schema.prisma             # 53 models (add indexes)
├── scripts/                      # 20+ ingestion scripts
├── tests/                        # 353 unit + 27 E2E
└── docs/
    ├── PRODUCTION_READINESS_PLAN.md  # ← NEW: The master plan
    ├── HANDOFF_PRODUCTION_READINESS.md  # ← THIS FILE
    └── [existing docs]
```

---

## Immediate Next Steps (In Order)

### Day 1: Fix Blocking Issues
1. **Fix FraudMap webpack** — Add `transpilePackages` to `next.config.mjs`
2. **Fix FraudMapWrapper TypeScript** — Proper dynamic import with `.then(mod => ({ default: mod.FraudMap }))`
3. **Fix AnimatedBackground** — Check `"use client"` boundary, use `next/dynamic` if needed
4. **Verify:** `npx tsc --noEmit` passes, `npm run build` succeeds

### Day 2: Redis Caching + Admin Auth + Rate Limiting
5. **Rewrite `lib/cache.ts`** — Redis with in-memory fallback
6. **Add admin auth to `middleware.ts`** — Cookie-based session check
7. **Consolidate rate limiting** — Remove inline rate limiter from `app/api/search/route.ts`, use `lib/rate-limiter.ts`
8. **Add pagination to search** — `components/ui/Pagination.tsx`

### Day 3: Database Migration (FraudCategory Deletion)
9. **Run `scripts/migrate-category-refs.ts`** — Verify all `categoryId` values are valid slugs
10. **Delete `FraudCategory` model** — Prisma migration: remove model, remove relations, add CHECK constraints
11. **Add DB indexes** — Apply index strategy from Phase 2.1

---

## Decisions Made

1. **FraudMap approach:** Fix webpack (transpilePackages). Timebox: 2 hours. Fallback: static SVG map.
2. **Deployment platform:** Self-hosted on VPS (Docker Compose + Nginx). Co-locates PostgreSQL, Redis, MeiliSearch. Cheaper than Vercel + managed services.
3. **Managed services:** Docker Compose. Graduate individual services to managed (AWS RDS, ElastiCache) only when needed.
4. **Job queue:** BullMQ (Redis-based). Already have Redis. Battle-tested. No vendor lock-in.
5. **Admin auth:** Simple cookie secret. Internal tooling, single admin. Add full auth only if multi-admin needed.
6. **Category data:** Delete `FraudCategory` model. Use string slugs with CHECK constraints. One source of truth: `lib/categories.ts`.
7. **MeiliSearch:** Keep for now (typo tolerance matters for entity search). If not working by end of Phase 2, fall back to Postgres FTS temporarily.

---

## Files Created in This Session

| File | Lines | Description |
|------|-------|-------------|
| `docs/PRODUCTION_READINESS_PLAN.md` | 930 | Comprehensive production plan |
| `docs/HANDOFF_PRODUCTION_READINESS.md` | ~300 | This handoff document |

---

## Things to Keep in Mind

- **The vision matters most.** Every change should make it easier for users to track fraud and follow the money.
- **Dark theme is permanent.** Don't add light mode back. It's a data intelligence platform.
- **No emoji.** SVG icons only. It looks professional.
- **`lib/categories.ts` is THE source of truth** for UI categories. No DB category model. `categoryId` is a plain String with CHECK constraints.
- **Test everything.** Not just "it builds" but "it works as intended." Use Playwright for E2E verification.
- **Git commit after each phase.** Descriptive messages, clean history.
- **Legal matters.** Disclaimers on every page. Takedown process accessible. Source attribution on data points.

---

*Plan is ready for execution. Start with Phase 1.*