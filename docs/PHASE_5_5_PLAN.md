# Phase 5.5: Foundation Completion

> **Created:** 2026-04-24
> **Status:** IN PROGRESS
> **Prerequisite:** Phase 0-5 complete (all 33 hardening issues resolved)
> **Goal:** Transform 4 weak areas into solid green so the project is genuinely production-ready

---

## Areas to Address

| Area | Current | Target | Est. Days |
|------|---------|--------|-----------|
| Production Config | 🔴 MISSING | ✅ Complete | 2-3 |
| Rate Limiting | 🟡 In-memory | ✅ Redis-backed | 1 |
| Tests | 🟡 Partial (150) | ✅ Comprehensive (400+) | 4-5 |
| UI Shell | 🟡 Skeleton | ✅ Complete | 3-4 |
| **Total** | | | **~11-13 days** |

---

## Execution Order

```
Step 1: Production Config (2-3 days) → Unblocks everything
Step 2: Rate Limiting (1 day) → Depends on Redis, small focused change
Step 3: Tests (4-5 days) → Validate everything before UI changes
Step 4: UI Shell (3-4 days) → Visual changes last, easiest to review
Step 5: Final Verification → Build, test, lint all pass
```

---

## STEP 1: Production Config (2-3 days)

- [x] **Task 1.1:** Environment Validation (`lib/env.ts`) — Zod-based env var validation
- [ ] **Task 1.2:** Next.js Configuration (`next.config.mjs` rewrite) — Security headers, standalone output, etc.
- [ ] **Task 1.3:** Edge Middleware (`middleware.ts`) — Rate limiting, CORS, security headers
- [ ] **Task 1.4:** Dockerfile (multi-stage build) — Optimized production image
- [ ] **Task 1.5:** ESLint Fixes — Enable lint in builds, fix all errors
- [ ] **Task 1.6:** Production Env Template — `.env.production`, update `.env.example`

---

## STEP 2: Rate Limiting (1 day)

- [ ] **Task 2.1:** Install `ioredis` package
- [ ] **Task 2.2:** Redis-backed rate limiter rewrite (`lib/rate-limiter.ts`)
- [ ] **Task 2.3:** Integrate with middleware (`middleware.ts`)

---

## STEP 3: Tests (4-5 days)

- [ ] **Task 3.1:** Test infrastructure (`tests/setup.ts`, `tests/utils/test-helpers.ts`)
- [ ] **Task 3.2:** API route tests (8 files — search, charities, corporate, government, healthcare, political, consumer, admin)
- [ ] **Task 3.3:** Library function tests (5 files — risk-scoring, validators, rate-limiter, search, ingestion-utils)
- [ ] **Task 3.4:** E2E test expansion (8 files — navigation, detail-pages, fraud-scores, error-handling, rate-limiting, mobile, seo, accessibility)
- [ ] **Task 3.5:** Test configuration updates (vitest coverage, playwright multi-browser)

---

## STEP 4: UI Shell (3-4 days)

- [ ] **Task 4.1:** Design system update (`tailwind.config.ts`, `app/globals.css`)
- [ ] **Task 4.2:** Layout components (Navbar, Footer, Sidebar, Breadcrumbs, MainLayout, layout.tsx update)
- [ ] **Task 4.3:** State components (LoadingSpinner, EmptyState, Pagination, DataTable, StatusBadge)
- [ ] **Task 4.4:** Search components (SearchBar, SearchFilters, SearchResults)
- [ ] **Task 4.5:** Entity components (EntityCard, EntityHeader)
- [ ] **Task 4.6:** Update existing pages with new layout/components

---

## STEP 5: Final Verification

- [ ] `npm run lint` → exits 0
- [ ] `npm run build` → succeeds with ESLint enabled
- [ ] `npm test` → 400+ tests pass
- [ ] `npm run test:coverage` → >70% coverage
- [ ] `npx playwright test` → All E2E tests pass
- [ ] `docker build -t trackfraud .` → Image builds <200MB
- [ ] `docker run trackfraud` → App starts and serves pages
- [ ] Security headers present in responses
- [ ] Rate limiting works (429 after threshold)
- [ ] Dark mode works
- [ ] Mobile responsive (375px, 768px, 1024px)
- [ ] No console errors in browser DevTools

---

## Definition of Done

Phase 5.5 is complete when:
1. All API routes have dedicated test coverage
2. All major lib functions have unit tests
3. E2E tests cover all user flows
4. Site has navbar, footer, sidebar, breadcrumbs, loading/empty states
5. Security headers applied via middleware
6. ESLint passes with no ignores
7. Dockerfile with multi-stage build exists
8. Rate limiting uses Redis and works across restarts
9. `npm run build` succeeds with ESLint enabled
10. `npm test` runs 400+ tests and all pass