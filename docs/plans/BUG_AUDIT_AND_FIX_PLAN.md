# TrackFraud — Comprehensive Bug Audit & Fix Plan

**Generated:** 2026-04-26
**Repository:** TrackFraudProject @ `fefce40`
**Severity legend:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | 🔵 Info

---

## Table of Contents

1. [Summary by Severity](#1-summary-by-severity)
2. [Critical Bugs](#2-critical-bugs)
3. [High Severity Bugs](#3-high-severity-bugs)
4. [Medium Severity Issues](#4-medium-severity-issues)
5. [Low Severity & Code Quality](#5-low-severity--code-quality)
6. [Accessibility Issues](#6-accessibility-issues)
7. [Performance Issues](#7-performance-issues)
8. [Security Gaps](#8-security-gaps)
9. [Configuration & DevOps](#9-configuration--devops)
10. [Recommended Fix Order](#10-recommended-fix-order)

---

## 1. Summary by Severity

| Severity | Count | Short Description |
|----------|-------|-------------------|
| 🔴 Critical | 2 | Runtime crash (unawaited Promise), Hardcoded API key |
| 🟠 High | 5 | Silent error swallowing (3), In-memory rate limiting, Cmd+K race condition |
| 🟡 Medium | 12 | Manual `<head>` in App Router, Type assertions, Missing CSP, Docker memory, Zod 4, Unused imports |
| 🟢 Low | 15+ | Console statements, `any` types, TODO comments, Directive placement, Loose version ranges |
| ♿ Accessibility | 3 | Missing `aria-label`, Missing `<label>`, `alert()` usage |
| ⚡ Performance | 3 | Redundant event listeners, Aggressive PostgreSQL settings, Sequential test execution |

**Total issues found: ~40+**

---

## 2. Critical Bugs

### BUG-001: `getActiveCategories()` not awaited — Runtime crash

- **File:** `app/page.tsx:76`
- **Severity:** 🔴 Critical
- **Problem:** `getActiveCategories()` returns a Promise, but it's called without `await`. On line 200, `.map()` is invoked on the Promise object, which crashes at runtime: `activeCategories.map is not a function`.
- **Current code:**
  ```ts
  const activeCategories = getActiveCategories(); // line 76
  // ...
  activeCategories.map(...) // line 200 — crashes
  ```
- **Fix:**
  ```ts
  const activeCategories = await getActiveCategories();
  ```
- **Impact:** Homepage will 500 error on every load.

### BUG-002: Hardcoded API key in `.env`

- **File:** `.env:37`
- **Severity:** 🔴 Critical
- **Problem:** `CONGRESS_API_KEY="V9lAVabC86CKSob2EDVogEh4FZwLS26udRW70FNb"` — a real API key is hardcoded in the development `.env`.
- **Status:** `.env` IS in `.gitignore`, so it was not committed. However, anyone with local repo access can see it.
- **Fix:**
  1. Rotate the key immediately (assume it's compromised).
  2. Replace with a placeholder: `CONGRESS_API_KEY="${CONGRESS_API_KEY}"`
  3. Document in `GETTING_STARTED.md` that the key must be set via Docker runtime environment or a secrets manager.
- **Impact:** If the `.env` is ever accidentally committed, the key is exposed.

---

## 3. High Severity Bugs

### BUG-003: Silent error swallowing in `getDatabaseStats()`

- **File:** `app/page.tsx:45-47`
- **Severity:** 🟠 High
- **Problem:** Database errors are caught with no logging, returning `null` silently.
  ```ts
  } catch {
    return null;
  }
  ```
- **Fix:** Add structured logging:
  ```ts
  } catch (err) {
    console.error('[getDatabaseStats] Failed to fetch stats:', err);
    return null;
  }
  ```

### BUG-004: Silent error swallowing in `getRecentFraudAlerts()`

- **File:** `app/page.tsx:57-59`
- **Severity:** 🟠 High
- **Problem:** Same pattern as BUG-003.
- **Fix:** Add error logging before returning the fallback value.

### BUG-005: Silent error swallowing in Charity peer data fetch

- **File:** `app/charities/[ein]/page.tsx:47`
- **Severity:** 🟠 High
- **Problem:** `.catch(() => {})` on peer data fetch silently discards errors.
- **Fix:** `.catch((err) => console.error('Failed to fetch peer data:', err))`

### BUG-006: Silent error swallowing in Map data fetch

- **File:** `components/FraudMap.tsx:148`
- **Severity:** 🟠 High
- **Problem:** `.catch(() => {})` on map data fetch.
- **Fix:** Log the error or show a user-facing message.

### BUG-007: In-memory `Map` for rate limiting in Edge Middleware

- **File:** `middleware.ts:30`
- **Severity:** 🟠 High
- **Problem:** `const edgeRateLimitMap = new Map<...>()` — Edge workers are isolated and ephemeral. Each worker has its own Map, so rate limiting is per-worker, not per-IP. Provides a false sense of security.
- **Fix:** Replace with Redis/Upstash-backed rate limiting. The repo already has `lib/rate-limiter.ts` — verify if it supports Redis and migrate.
- **Quick mitigation:** Document the limitation in runbooks.

### BUG-008: ⌘K Double-toggle race condition

- **Files:** `components/layout/Navbar.tsx:64-75, 268-277`
- **Severity:** 🟠 High
- **Problem:** Both `CommandPalette` (line 67) and parent `Navbar` (line 268) attach `⌘K` handlers on `window` with no `stopPropagation`. Pressing `⌘K` when the palette is open causes it to close via the CommandPalette handler, then immediately re-open via the Navbar handler.
- **Fix:** In the Navbar handler, check if the CommandPalette is open before toggling:
  ```ts
  // Navbar keydown handler
  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    // Let CommandPalette handle its own close
    if (!commandOpen) setCommandOpen(true);
  }
  ```

---

## 4. Medium Severity Issues

### BUG-009: Manual `<head>` tag in App Router

- **File:** `app/layout.tsx:92-98`
- **Severity:** 🟡 Medium
- **Problem:** Next.js App Router manages `<head>` automatically via the `metadata` export. Manually injecting `<link>`, `<meta>` tags causes duplicate tags and potential hydration mismatches.
  ```tsx
  <head>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#1e40af" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  ```
- **Fix:** Move all entries into the `metadata` object:
  ```ts
  export const metadata: Metadata = {
    // ...existing...
    icons: {
      icon: '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
    manifest: '/manifest.json',
    themeColor: '#1e40af',
    viewport: { width: 'device-width', initialScale: 1 },
  };
  ```
  Then remove the `<head>` block entirely.

### BUG-010: `suppressHydrationWarning` on `<html>`

- **File:** `app/layout.tsx:91`
- **Severity:** 🟡 Medium
- **Problem:** `<html lang="en" suppressHydrationWarning>` — likely masking hydration warnings from the manual `<head>` block. Should not be needed once BUG-009 is fixed.
- **Fix:** Remove `suppressHydrationWarning` after fixing BUG-009. Verify no hydration warnings remain.

### BUG-011: Placeholder Google verification

- **File:** `app/layout.tsx:81`
- **Severity:** 🟡 Medium
- **Problem:** `google: "your-google-verification-code"` will break Google Search Console if deployed as-is.
- **Fix:** Either set the real value or conditionally include it:
  ```ts
  ...(process.env.GOOGLE_SITE_VERIFICATION && {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  }),
  ```

### BUG-012: Incorrect `params` type in category page

- **File:** `app/[category]/page.tsx:7`
- **Severity:** 🟡 Medium
- **Problem:** Declared as `{ category: string }` but Next.js 15 requires `Promise<{ category: string }>`. Line 114 correctly awaits `params`, but the type annotation causes a TypeScript error.
- **Fix:** Remove the type annotation and let TypeScript infer, or use:
  ```ts
  async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  ```

### BUG-013: `id` mapped from optional fields

- **File:** `app/[category]/page.tsx:74, 95`
- **Severity:** 🟡 Medium
- **Problem:** `id: c.ein` and `id: c.cik` where `ein`/`cik` are optional (`?`). This produces `undefined` React keys, causing reconciliation warnings.
- **Fix:** Provide fallback:
  ```ts
  id: c.ein ?? crypto.randomUUID(),
  ```

### BUG-014: Unsafe `as number` type assertion

- **File:** `app/[category]/page.tsx:255-258`
- **Severity:** 🟡 Medium
- **Problem:** `riskScore` is `number | null`, but `as number` hides the null. Code relies on JS coercion (`null >= 70` → `false`), which works but is misleading.
- **Fix:** Use null coalescing: `riskScore ?? 0`

### BUG-015: Spoofable IP extraction in middleware

- **File:** `middleware.ts:134-137`
- **Severity:** 🟡 Medium
- **Problem:** `x-forwarded-for` and `x-real-ip` can be client-supplied. A malicious user can spoof their IP to bypass rate limits.
- **Fix:** Trust only headers set by the reverse proxy. In production, these headers are set by Cloudflare/Vercel, so document that the middleware should not be used without a trusted proxy.

### BUG-016: Only URL sanitized in middleware, not request body

- **File:** `middleware.ts:85-101`
- **Severity:** 🟡 Medium
- **Problem:** POST/PUT/PATCH bodies pass through unfiltered. XSS and injection payloads in bodies are not caught.
- **Fix:** Add body inspection for POST/PUT/PATCH requests (clone the request, read body as text, apply the same sanitization).

### BUG-017: Deprecated `X-XSS-Protection` header

- **File:** `next.config.mjs:45-47`
- **Severity:** 🟡 Medium
- **Problem:** OWASP explicitly recommends removing this header. It can introduce reflected XSS vulnerabilities in older browsers.
- **Fix:** Remove the header entirely. Rely on CSP instead.

### BUG-018: Missing Content-Security-Policy header

- **File:** `next.config.mjs`
- **Severity:** 🟡 Medium
- **Problem:** A fraud-tracking platform should have CSP. This is a significant security gap.
- **Fix:** Add CSP header:
  ```js
  'Content-Security-Policy': [
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;",
  ],
  ```

### BUG-019: `@types/react-simple-maps` in `dependencies` instead of `devDependencies`

- **File:** `package.json:67`
- **Severity:** 🟡 Medium
- **Fix:** Move to `devDependencies`.

### BUG-020: Zod 4 major version

- **File:** `package.json:78`
- **Severity:** 🟡 Medium
- **Problem:** `zod: "^4.3.6"` — Zod 4 has breaking API changes from Zod 3. The codebase uses standard APIs (`z.object`, `z.string`, `z.coerce`, `z.infer`) which appear compatible, but verify no Zod 3-specific patterns are used.
- **Action:** Run `npm test` and verify all Zod validations pass. Search for `.superRefine`, `.refine`, `.transform` patterns.

### BUG-021: Stale model mocks in test setup

- **File:** `tests/setup-prisma.ts:42, 46-47, 52`
- **Severity:** 🟡 Medium
- **Problem:**
  - Line 42: Mocks `politicalBillRecord` but schema model is named `Bill`
  - Lines 46-47: Mocks `regulatoryAction` and `job` models that do not exist in the Prisma schema
  - Line 52: Mocks `cmsOpenPaymentRecord` which does not exist
- **Fix:** Update mock model names to match the actual Prisma schema.

### BUG-022: `tests` excluded from TypeScript compilation

- **File:** `tsconfig.json:32`
- **Severity:** 🟡 Medium
- **Problem:** `"exclude": ["node_modules", "tests"]` means test files get no type checking.
- **Fix:** Remove `"tests"` from the exclude array, or create a separate `tsconfig.test.json` that extends the base config.

---

## 5. Low Severity & Code Quality

### BUG-023: `"use client"` not at line 1

- **File:** `components/ErrorBoundary.tsx:8`
- **Severity:** 🟢 Low
- **Problem:** The directive is on line 8 after a JSDoc comment block. Next.js requires `"use client"` at the very first line.
- **Fix:** Move `"use client"` to line 1, above the comment block.

### BUG-024: Potential undefined access on `error.stack`

- **File:** `components/ErrorBoundary.tsx:84`
- **Severity:** 🟢 Low
- **Problem:** `this.state.error.stack` — `.stack` can be `undefined` in minified builds.
- **Fix:** Use optional chaining: `{this.state.error?.stack}`

### BUG-025: Unused `categorySlug` prop

- **File:** `components/ComingSoon.tsx:11`
- **Severity:** 🟢 Low
- **Fix:** Remove the prop from the destructuring and interface.

### BUG-026: Unused import `getCategoryColorClass`

- **File:** `components/layout/Footer.tsx:4`
- **Severity:** 🟢 Low
- **Fix:** Remove the unused import.

### BUG-027: Dynamic Tailwind hover class

- **File:** `components/ui/Toast.tsx:113`
- **Severity:** 🟢 Low
- **Problem:** `hover:${config.dismissHover}` is dynamically constructed. Tailwind's JIT compiler cannot detect such class names at build time.
- **Fix:** Use a static class map:
  ```ts
  const hoverMap = {
    red: 'hover:bg-red-700',
    amber: 'hover:bg-amber-700',
    // ...
  };
  // then: className={hoverMap[config.dismissHover]}
  ```

### BUG-028: Convenience methods not exposed in Toast context

- **File:** `components/ui/Toast.tsx:58-65`
- **Severity:** 🟢 Low
- **Problem:** `success`, `error`, `warning`, and `info` methods are created inside `ToastProvider` but not included in the context value. `useToast()` only returns `{ toast, dismiss }`.
- **Fix:** Include them in the context value:
  ```ts
  value={{ toast, dismiss, success, error, warning, info }}
  ```

### BUG-029: Hardcoded API endpoint in FraudMap

- **File:** `components/FraudMap.tsx:141`
- **Severity:** 🟢 Low
- **Problem:** `fetch("/api/charities/hottest?limit=100")` always fetches charity data regardless of which `platformCategoryId` is selected.
- **Fix:** Parameterize the fetch by category:
  ```ts
  fetch(`/api/entities/hottest?category=${platformCategoryId}&limit=100`)
  ```

### BUG-030: `parseInt` on EIN with dashes

- **File:** `components/FraudMap.tsx:557-558`
- **Severity:** 🟢 Low
- **Problem:** `parseInt("12-3456789", 10)` returns `12` (stops at the dash). All EINs sharing the same prefix get identical jitter values.
- **Fix:** Strip non-numeric chars first:
  ```ts
  const seed = parseInt(ein.replace(/\D/g, ''), 10) || 0;
  ```

### BUG-031: Console statements in API routes

- **Files:** 21 occurrences across `app/api/`
- **Severity:** 🟢 Low
- **Problem:** `console.log`, `console.error`, `console.warn` used directly instead of a structured logging library.
- **Fix:** Replace with `lib/logger.ts` wrapper or a structured logger like `pino`.

### BUG-032: `as any` type assertions in production code

- **Files:** 13 occurrences across `app/api/` and `lib/`
- **Severity:** 🟢 Low
- **Notable occurrences:**
  - `app/api/search/route.ts:184` — accessing `__serializedInfo`
  - `app/api/fraud-scores/route.ts:193-194, 229, 264` — Prisma type workarounds
  - `lib/fraud-scoring/scorer.ts:203, 294` — severity enum casting
- **Fix:** Create proper TypeScript interfaces for the Prisma return types.

### BUG-033: `: any` type declarations in API routes

- **Files:** 60+ occurrences across `app/api/`
- **Severity:** 🟢 Low
- **Pattern:** `const where: any = {}` and `const orderBy: any = {}` repeated in every filtered API route.
- **Fix:** Create a shared `BuildFilter` utility type in `lib/types.ts`.

### BUG-034: Unsafe `as unknown as` cast in FraudMap

- **File:** `components/FraudMap.tsx:516-517`
- **Severity:** 🟢 Low
- **Problem:** `e as unknown as React.MouseEvent` double-cast suppresses a type mismatch. `clientX/clientY` may not exist.
- **Fix:** Check for property existence before access:
  ```ts
  const x = ('clientX' in e) ? e.clientX : 0;
  ```

---

## 6. Accessibility Issues

### A11Y-001: Missing `aria-label` on desktop search button

- **File:** `components/layout/Navbar.tsx:356`
- **Severity:** ♿ Accessibility
- **Problem:** The desktop search trigger button has no `aria-label`. The mobile version (line 371) correctly has one.
- **Fix:** Add `aria-label="Open search"` to the button.

### A11Y-002: Missing `<label>` on email input

- **File:** `components/ComingSoon.tsx:71-76`
- **Severity:** ♿ Accessibility
- **Problem:** The email input has only a `placeholder` attribute. Screen readers cannot announce its purpose.
- **Fix:** Add `aria-label="Email address"` or wrap in a `<label>`.

### A11Y-003: `alert()` instead of Toast

- **File:** `components/ComingSoon.tsx:70`
- **Severity:** ♿ Accessibility + UX
- **Problem:** Uses blocking browser `alert()` instead of the app's Toast system. Jarring and inaccessible.
- **Fix:** Replace with Toast:
  ```ts
  const { success } = useToast();
  onSubmit={(e) => { e.preventDefault(); success("Thanks for subscribing!"); }}
  ```

---

## 7. Performance Issues

### PERF-001: Redundant keydown listeners in Navbar

- **File:** `components/layout/Navbar.tsx:268-277, 280-289`
- **Severity:** ⚡ Performance
- **Problem:** Two separate `useEffect` blocks attach independent `keydown` listeners on `window`.
- **Fix:** Consolidate into a single listener.

### PERF-002: Layout flex bug (footer not sticky)

- **File:** `components/layout/ClientLayout.tsx:11`
- **Severity:** ⚡ Performance (visual)
- **Problem:** `<main className="flex-1">` has no effect because the parent `<ToastProvider>` doesn't render a flex container.
- **Fix:**
  ```tsx
  <ToastProvider>
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  </ToastProvider>
  ```

### PERF-003: Duplicate dark-mode detection in FraudMap

- **File:** `components/FraudMap.tsx:132-138`
- **Severity:** ⚡ Performance
- **Problem:** Implements its own `matchMedia` listener that ignores the user's manual `localStorage` override (`trackfraud-theme`).
- **Fix:** Use the shared `useDarkMode()` hook from the Navbar instead of duplicating logic.

---

## 8. Security Gaps

### SEC-001: Missing Content-Security-Policy

- **File:** `next.config.mjs`
- **Severity:** 🟡 Medium
- **See:** BUG-018

### SEC-002: Deprecated X-XSS-Protection header

- **File:** `next.config.mjs:45-47`
- **Severity:** 🟡 Medium
- **See:** BUG-017

### SEC-003: Request body not sanitized in middleware

- **File:** `middleware.ts:85-101`
- **Severity:** 🟡 Medium
- **See:** BUG-016

### SEC-004: In-memory rate limiting (false security)

- **File:** `middleware.ts:30`
- **Severity:** 🟠 High
- **See:** BUG-007

---

## 9. Configuration & DevOps

### CONF-001: `synchronous_commit=off` in Docker PostgreSQL

- **File:** `docker-compose.yml:32`
- **Severity:** 🟠 High
- **Problem:** DATA LOSS RISK. If PostgreSQL crashes or power is lost, recently committed data is lost.
- **Fix:** Change to `synchronous_commit=on` for production. Keep `off` only for development if acceptable.

### CONF-002: Aggressive PostgreSQL memory settings

- **File:** `docker-compose.yml:23-35`
- **Severity:** 🟡 Medium
- **Problem:** `shared_buffers=2GB`, `effective_cache_size=6GB`, `work_mem=128MB`, `maintenance_work_mem=1GB`, `max_wal_size=8GB` — these can cause OOM kills on typical developer machines.
- **Fix:** Reduce for development:
  ```yaml
  POSTGRES_SHARED_BUFFERS: "256MB"
  POSTGRES_EFFECTIVE_CACHE_SIZE: "1GB"
  POSTGRES_WORK_MEM: "16MB"
  POSTGRES_MAINTENANCE_WORK_MEM: "128MB"
  POSTGRES_MAX_WAL_SIZE: "1GB"
  ```

### CONF-003: High max_connections for dev

- **File:** `docker-compose.yml:31`
- **Severity:** 🟢 Low
- **Problem:** `max_connections=200` — unnecessarily high for development.
- **Fix:** Reduce to `50`.

### CONF-004: Missing `autoprefixer` in PostCSS config

- **File:** `postcss.config.mjs`
- **Severity:** 🟢 Low
- **Problem:** `autoprefixer` not explicitly included. Next.js 13+ handles this internally, but explicit is better.

### CONF-005: Tests run sequentially in Playwright

- **File:** `playwright.config.ts:12`
- **Severity:** 🟢 Low
- **Problem:** `fullyParallel: false` — tests run sequentially.
- **Fix:** Enable parallel execution if tests don't share state.

### CONF-006: ESLint version loosely pinned

- **File:** `package.json:88`
- **Severity:** 🟢 Low
- **Problem:** `"eslint": "^9"` — loose caret range.
- **Fix:** Pin to minor: `"eslint": "^9.18.0"`.

### CONF-007: Vitest uses `node` environment

- **File:** `vitest.config.ts:6`
- **Severity:** 🟢 Low
- **Problem:** If any tests render React components, they need `jsdom` environment.
- **Fix:** Verify — if component tests exist, change to `environment: 'jsdom'`.

---

## 10. Recommended Fix Order

### Phase 1: Fix immediately (blocks deployment)

| # | Issue | Effort |
|---|-------|--------|
| 1 | BUG-001: Await `getActiveCategories()` | 5 min |
| 2 | BUG-002: Rotate and externalize API key | 30 min |
| 3 | BUG-003, 004, 005, 006: Add error logging to silent catches | 30 min |

### Phase 2: Fix this sprint (high impact)

| # | Issue | Effort |
|---|-------|--------|
| 4 | BUG-008: Fix ⌘K race condition | 30 min |
| 5 | BUG-009, 010: Fix `<head>` anti-pattern in layout | 45 min |
| 6 | BUG-011: Fix Google verification placeholder | 10 min |
| 7 | BUG-012: Fix `params` type in category page | 15 min |
| 8 | A11Y-001, 002, 003: Accessibility fixes | 45 min |

### Phase 3: Fix next sprint (security & stability)

| # | Issue | Effort |
|---|-------|--------|
| 9 | BUG-017, 018: Fix security headers | 30 min |
| 10 | BUG-007: Migrate rate limiting to Redis | 2-4 hrs |
| 11 | BUG-016: Add request body sanitization | 1 hr |
| 12 | CONF-001, 002: Fix Docker PostgreSQL settings | 15 min |

### Phase 4: Technical debt reduction

| # | Issue | Effort |
|---|-------|--------|
| 13 | BUG-032, 033: Replace `any` types with proper interfaces | 2-4 hrs |
| 14 | BUG-029: Parameterize FraudMap API endpoint | 1 hr |
| 15 | PERF-001, 002, 003: Performance fixes | 1 hr |
| 16 | BUG-020: Verify Zod 4 compatibility | 1 hr |
| 17 | BUG-021: Fix stale test mocks | 30 min |
| 18 | CONF-002 through CONF-007: Configuration cleanup | 1 hr |

### Phase 5: Ongoing

| # | Issue | Effort |
|---|-------|--------|
| 19 | BUG-031: Replace `console.*` with structured logger | Ongoing |
| 20 | Clean up 300+ TODO comments in archived scripts | Low priority |

---

## Appendix: Files Requiring Attention

```
app/layout.tsx                    — BUG-009, 010, 011
app/page.tsx                      — BUG-001, 003, 004
app/[category]/page.tsx           — BUG-012, 013, 014
app/charities/[ein]/page.tsx      — BUG-005
middleware.ts                      — BUG-007, 015, 016
next.config.mjs                   — BUG-017, 018
package.json                      — BUG-019, 020, CONF-006
tsconfig.json                     — BUG-022
components/layout/ClientLayout.tsx — PERF-002
components/layout/Navbar.tsx      — BUG-008, A11Y-001, PERF-001
components/layout/Footer.tsx      — BUG-026
components/ui/Toast.tsx           — BUG-027, 028
components/ErrorBoundary.tsx      — BUG-023, 024
components/FraudMap.tsx           — BUG-006, 029, 030, 034, PERF-003
components/ComingSoon.tsx         — BUG-025, A11Y-002, 003
docker-compose.yml                — CONF-001, 002, 003
tests/setup-prisma.ts             — BUG-021
.env                              — BUG-002
postcss.config.mjs                — CONF-004
playwright.config.ts              — CONF-005
vitest.config.ts                  — CONF-007
```

---

*Document generated by automated code audit. Last verified against commit `fefce40`.*