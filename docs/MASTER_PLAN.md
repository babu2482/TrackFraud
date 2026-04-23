# TrackFraud - Master Hardening Plan

> **Created:** 2026-04-23
> **Status:** ACTIVE - Foundation hardening required before feature work
> **Estimated Effort:** 13-18 working days to solid foundation
> **Goal:** Harden the foundation so the project actually works, then modernize

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [What's Working](#2-whats-working)
3. [Critical Issues - Will Prevent App from Working](#3-critical-issues---will-prevent-app-from-working)
4. [Important Issues - Will Cause Feature Failures](#4-important-issues---will-cause-feature-failures)
5. [Missing Features - Quality & Production Readiness](#5-missing-features---quality--production-readiness)
6. [Tech Stack Audit](#6-tech-stack-audit)
7. [Recommended Target Stack](#7-recommended-target-stack)
8. [Key Architectural Decisions](#8-key-architectural-decisions)
9. [Phased Execution Plan](#9-phased-execution-plan)
10. [Risk Register](#10-risk-register)

---

## 1. Project Overview

**TrackFraud** is a unified fraud tracking and government transparency platform that:
- Ingests data from **50+ government sources** (IRS, SEC, FEC, CFPB, CMS, OFAC, EPA, FDA, HHS, SAM.gov, Congress.gov, USASpending, etc.)
- Correlates and analyzes data across categories to detect financial fraud patterns
- Scores entities for fraud risk using a signal-based algorithm
- Provides a unified search/browse UI across all entity types

### Current State Summary

| Metric | Value |
|--------|-------|
| Database records | ~2.4M (1.9M charities, 453K corporate, 18K FDA, 6K FTC, 438K CFPB, etc.) |
| Prisma models | 81 (~2000 lines of schema) |
| Ingestion scripts | 30+ |
| Uncommitted changes | 195 files, +4320/-9539 lines |
| Backend architectures | 2 (Next.js API routes + Python FastAPI) |
| ORMs | 2 (Prisma + SQLAlchemy) |

---

## 2. What's Working

### Infrastructure
- [x] **PostgreSQL 16** - Running, properly configured with performance tuning (2GB shared_buffers, 200 connections)
- [x] **Redis 7** - Running for caching and Celery broker
- [x] **Meilisearch v1.10** - Running for full-text search
- [x] **Docker Compose** - All services orchestrated with health checks for PostgreSQL, Redis, Meilisearch
- [x] **Network** - `trackfraud-network` bridge network connecting all services

### Data
- [x] **~2.4M records ingested** across multiple categories
- [x] **30+ ingestion scripts** for various government data sources
- [x] **Prisma migrations** exist and are tracked

### Frontend
- [x] **Next.js 14 App Router** with TypeScript and Tailwind CSS
- [x] **Category pages** built (charities, corporate, government, political, healthcare, consumer)
- [x] **FraudMap component** for visualizing fraud data
- [x] **API route layer** extensively organized

### Backend
- [x] **FastAPI application** with proper middleware, CORS, exception handlers
- [x] **Celery workers** for background tasks
- [x] **Test infrastructure** (Vitest for TS, pytest for Python)

---

## 3. Critical Issues - Will Prevent App from Working

### C1. Sensitive Data Exposed in Git 🔴🔴🔴

**Severity:** CRITICAL - Security breach
**File:** `.env` at project root

The `.env` file contains the **real Congress API key** (`CONGRESS_API_KEY="V9lAVabC86CKSob2EDVogEh4FZwLS26udRW70FNb"`), and the file appears in `git diff --stat`, meaning it is **tracked by git** and exposed in the public GitHub repository.

**Fix:**
1. Revoke the exposed API key immediately at Congress.gov
2. Remove `.env` from git tracking: `git rm --cached .env`
3. Ensure `.env` is in `.gitignore` (verify the entry exists)
4. Get a new API key from Congress.gov
5. Recreate `.env` from `.env.example`

---

### C2. Redis Port Mismatch 🔴🔴

**Severity:** HIGH - Caching layer broken
**Files:** `.env`, `docker-compose.yml`

| Config | Value |
|--------|-------|
| `.env` REDIS_PORT | `6380` |
| `.env` REDIS_URL | `redis://localhost:6380` |
| docker-compose exposed port | `${REDIS_PORT:-6379}` → resolves to `6380` from .env |
| Docker internal Redis port | `6379` (container-to-container) |

The Next.js app tries to connect to Redis on port 6380, but the actual port mapping depends on the `.env` value. The inconsistency between local development URLs and Docker internal URLs causes cache operations in `lib/cache.ts` to fail.

**Fix:** Align all Redis references. Either:
- Option A: Set `REDIS_PORT=6379` everywhere (recommended, standard port)
- Option B: Set `REDIS_PORT=6380` everywhere if port 6379 is in use

**Root cause:** Port 6379 may already be in use on the host system, hence the change to 6380. Verify before changing.

---

### C3. Dual Backend Architecture 🔴🔴

**Severity:** HIGH - Architecture complexity, maintenance nightmare

The project has **two separate backend systems** serving the same application:

| Layer | Technology | Endpoints |
|-------|-----------|-----------|
| Next.js API routes | TypeScript + Prisma | `/api/charities/*`, `/api/corporate/*`, `/api/government/*`, `/api/political/*`, `/api/healthcare/*`, `/api/search`, `/api/fraud-scores`, etc. |
| Python FastAPI | Python + SQLAlchemy | `/api/v1/presidents`, `/api/v1/politicians`, `/api/v1/bills`, `/api/v1/promises`, `/api/v1/votes`, `/api/v1/search`, `/api/v1/analytics`, etc. |

**Problems:**
- Two ORMs (Prisma + SQLAlchemy) querying the same PostgreSQL database
- Schema drift risk - models can get out of sync
- No clear boundary - frontend doesn't know which backend to call
- Double the deployment complexity
- Debugging nightmare when issues span both backends
- No transaction consistency across backends

**Decision required:** See [Key Architectural Decisions](#8-key-architectural-decisions)

---

### C4. Dual Schema in Prisma (81 Models) 🔴🔴

**Severity:** HIGH - Data inconsistency, wasted resources

The `prisma/schema.prisma` file contains **two parallel sets of models** for the same data domains:

| Canonical Models | Legacy Models |
|-----------------|---------------|
| `Bill` | `bills` |
| `BillSponsor` | `bill_sponsors` |
| `BillVote` | `votes`, `vote_results` |
| `PoliticianClaim` | `politician_claims_legacy` |
| `CabinetMember` | `cabinet_members_legacy` |
| `President` | `presidents_legacy` |

**Problems:**
- Data inconsistency between parallel models
- Wasted storage (same data stored twice)
- Confusing API layer (which model to query?)
- Orphaned records with no relations
- Slow Prisma client generation
- Complex migrations

**Fix:** Audit all 81 models, identify which are actually used in code, remove legacy models, migrate data if needed.

---

### C5. Backend Python File Duplication 🔴

**Severity:** MEDIUM - Dead code, confusion

| Duplicate | Location 1 | Location 2 |
|-----------|-----------|------------|
| Database config | `backend/app/database.py` | `backend/app/db/database.py` |
| App config | `backend/app/config.py` | `backend/app/core/config.py` |

The `main.py` imports from `app.core.config` and `app.db.database` (the nested ones), making the flat top-level files dead code.

**Fix:** Delete `backend/app/database.py` and `backend/app/config.py`.

---

### C6. FastAPI Uses `create_all()` Instead of Migrations 🔴

**Severity:** MEDIUM - Schema drift

In `backend/app/main.py` line 73:
```python
Base.metadata.create_all(bind=engine)
```

This creates tables from SQLAlchemy models on startup rather than using Alembic migrations. This means:
- FastAPI may create tables that don't match the Prisma schema
- Columns may be missing or have wrong types
- No migration history for the Python-side schema

**Fix:** Either use Alembic with proper migrations, or remove SQLAlchemy models entirely and use raw SQL/Prisma.

---

### C7. node-fetch v2 Security Vulnerability 🔴

**Severity:** MEDIUM - Known CVEs
**File:** `package.json`

`node-fetch: ^2.7.0` has known security vulnerabilities. Node.js 18+ (which this project uses) has native `fetch` support.

**Fix:** Replace all `node-fetch` imports with native `fetch`, remove from `package.json`, remove `@types/node-fetch` from devDependencies.

---

## 4. Important Issues - Will Cause Feature Failures

### I1. No Clear API Boundary

Next.js API routes and FastAPI routes overlap in functionality (both have `/search` endpoints). The frontend has no clear routing strategy for which backend to call for which data.

**Impact:** Broken features when the wrong backend is called.

### I2. Meilisearch Search Indexing Uncertain

`lib/search/indexer.ts` exists (324 lines in uncommitted diff) but there's no clear initialization flow to populate indexes. Search may return empty results even with 2.4M records in the database.

**Impact:** Search functionality broken despite having data.

### I3. Fraud Scoring Pipeline Fragmented

Two separate scoring implementations exist:
- **TypeScript:** `lib/fraud-scoring/scorer.ts` + `signal-detectors.ts`
- **Python:** `backend/app/ai/` + `backend/app/analytics/scoring.py`

**Impact:** Inconsistent fraud scores depending on which backend calculates them.

### I4. Python Dependencies Severely Outdated

| Package | Current in Project | Latest (2026) |
|---------|-------------------|---------------|
| fastapi | 0.109.0 | 0.122+ |
| uvicorn | 0.27.0 | 0.34+ |
| sqlalchemy | 2.0.25 | 2.0.44+ |
| pydantic | 2.5.3 | 2.12+ |
| celery | 5.3.4 | 5.5+ |
| pytest | 7.4.3 | 8.4+ |
| httpx | 0.26.0 | 0.28+ |
| pandas | 2.1.3 | 2.2+ |
| numpy | 1.26.2 | 2.1+ |

**Impact:** Security vulnerabilities, missing performance improvements, compatibility issues.

### I5. Prisma v5 is EOL

`@prisma/client: ^5.22.0` - Prisma 6.x is the current major version with better performance, improved TypeScript types, and bug fixes.

**Impact:** Missing improvements, but v5 still functional.

### I6. Duplicate Entry in requirements.txt

`python-multipart==0.0.6` appears twice (lines 22 and 33).

### I7. Heavy AI/ML Dependencies May Not Be Used

`spacy`, `numpy`, `scikit-learn`, `pandas`, `nltk` in `requirements.txt` add huge install times and Docker image size. Need to verify these are actually used.

**Impact:** Slower builds, larger images (multi-GB Docker image), more attack surface.

### I8. ESLint Configuration Issues

`eslint: ^8` but ESLint v9 (Flat Config) is current. No `eslint.config.js` visible in the project. Linting may not work properly.

### I9. 195 Files Uncommitted

+4,320 / -9,539 lines of uncommitted changes means the codebase is in a dirty, unstable state with no reliable rollback point.

---

## 5. Missing Features - Quality & Production Readiness

### M1. No Input Validation on Next.js API Routes
No Zod schema validation on API route inputs. FastAPI has Pydantic validation, but Next.js routes likely don't.
**Risk:** Malformed input, injection attacks

### M2. No React Error Boundaries
No error boundary components visible.
**Risk:** One component crash takes down the entire page

### M3. No API Rate Limiting on Next.js Routes
FastAPI has `slowapi` for rate limiting. Next.js API routes have none.
**Risk:** API abuse, especially on search endpoints

### M4. No Logging/Observability
No structured logging (pino, winston), no error tracking (Sentry), no request logging middleware.
**Risk:** When things break, you won't know why

### M5. No Database Connection Pooling Configuration
Prisma default connection pool is small. PostgreSQL configured for 200 connections but Prisma may not use them efficiently.
**Risk:** Connection exhaustion under load

### M6. No CI/CD Pipeline
No GitHub Actions workflows (one commit mentions "Remove CI workflows").
**Risk:** No automated testing on push, no quality gates

### M7. No SEO Configuration
No meta tags, Open Graph, or structured data visible.
**Risk:** Hard to discover organically for a public transparency platform

### M8. No Accessibility
No `aria-*` attributes, keyboard navigation, or screen reader support visible.
**Risk:** Excludes users with disabilities

### M9. No Environment-Specific Configuration
Same `.env` for development and production. No `.env.local`, `.env.production` strategy.
**Risk:** Accidentally using dev settings in production

### M10. No Automated Database Backups
No backup strategy for the 2.4M records in PostgreSQL.
**Risk:** Data loss

---

## 6. Tech Stack Audit

### Current Stack

| Layer | Current Version | Status | Assessment |
|-------|----------------|--------|------------|
| **Frontend Framework** | Next.js 14.2.18 | Stable | ✅ Good, 14.2.18 is last 14.x and very stable |
| **UI Library** | React 18.3.1 | Good | ⬆️ React 19 available with better server components |
| **Styling** | Tailwind CSS 3.4.1 | Good | ✅ Works fine, v4 is nice-to-have |
| **Database** | PostgreSQL 16 | Excellent | ✅ Best choice, don't change |
| **ORM (TypeScript)** | Prisma 5.22 | EOL | ⬆️ Upgrade to Prisma 6 |
| **ORM (Python)** | SQLAlchemy 2.0.25 | Outdated | ⬆️ Update OR eliminate with Python backend |
| **Search** | Meilisearch v1.10 | Good | ✅ Keep, great choice for full-text search |
| **Cache/Queue** | Redis 7 | Good | ✅ Keep, standard choice |
| **Backend API (TS)** | Next.js API Routes | Good | ✅ Keep |
| **Backend API (PY)** | FastAPI 0.109 | Outdated | 🔴 Major decision: keep or eliminate |
| **Task Queue** | Celery 5.3 + Flower | Heavy | 🟡 Consider BullMQ (TypeScript native) |
| **Testing (TS)** | Vitest 4.1.4 | Current | ✅ Keep |
| **Testing (PY)** | pytest 7.4.3 | Outdated | ⬆️ Update to 8.x |
| **Maps** | react-simple-maps 3.0 | Works | ✅ Keep |
| **TypeScript** | 5.9.3 | Good | ✅ Keep |
| **Package Manager** | npm | Fine | Consider bun for speed |

### What to Keep (Good Choices)
- PostgreSQL 16 - Best relational database choice
- Meilisearch - Excellent for full-text search
- Redis 7 - Standard for caching and queues
- Next.js 14 - Stable, proven framework
- Prisma - Best TypeScript ORM
- Vitest - Fast, modern test runner
- Tailwind CSS - Efficient utility-first CSS
- Docker Compose - Proper container orchestration

### What to Change
- **Dual backend → Single backend** (see Architectural Decisions)
- **Prisma 5 → Prisma 6** (major version upgrade)
- **node-fetch v2 → native fetch** (security)
- **Python deps → Update all** (security + compatibility)
- **Celery → Consider BullMQ** (if eliminating Python backend)

---

## 7. Recommended Target Stack

### After Foundation Hardening (Phase 0-4)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 14 (keep for now) | Stable, upgrade to 15 later |
| UI | React 18 (keep for now) | Stable, upgrade to 19 with Next.js 15 |
| Styling | Tailwind CSS 3 (keep) | Works fine |
| Database | PostgreSQL 16 | Don't change |
| ORM | Prisma 6 | Better types, performance |
| Search | Meilisearch | Don't change |
| Cache | Redis 7 | Don't change |
| Backend | Next.js API routes ONLY | Single backend, simpler |
| Tasks | BullMQ or Server Actions | TypeScript native, no Python needed |
| Testing | Vitest + Playwright | TS tests + E2E |
| Maps | react-simple-maps | Don't change |

### Future Modernization (Phase 5, Optional)

| Layer | Upgrade | Benefit |
|-------|---------|---------|
| Next.js | 14 → 15 | Turbopack, partial prerendering, React 19 |
| React | 18 → 19 | Better server components, `use()` hook |
| Tailwind | 3 → 4 | Rust engine, faster builds |
| ESLint | 8 → 9 | Flat config, better performance |

---

## 8. Key Architectural Decisions

### Decision 1: Single Backend vs Dual Backend

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Keep Both** | Next.js for charity/corporate data, FastAPI for political/AI | No migration needed, Python AI libraries work | Two ORMs, deployment complexity, debugging nightmare |
| **B: Next.js Only** ⭐ RECOMMENDED | All API routes in Next.js with Prisma | Single codebase, single ORM, simpler deployment, one language | Need TS alternatives for Python AI features |
| **C: FastAPI Only** | All frontend becomes SPA, all data from FastAPI | Python ecosystem for data/ML | Lose Next.js SSR/SSG, worse SEO, worse DX |

**Recommendation: Option B - Next.js Only**

Rationale: The platform is primarily a data display/search UI. Next.js Server Actions + Prisma can handle all data operations. The AI/ML features (claim detection, sentiment analysis) are nice-to-have and can be added later as a separate Python microservice if needed.

**If choosing Option B:**
- Migrate critical FastAPI endpoints to Next.js API routes
- Remove Python backend, Celery, SQLAlchemy
- Replace Celery with BullMQ (Redis-based, TypeScript native) for background jobs
- Remove heavy AI/ML Python dependencies (spacy, numpy, scikit-learn, pandas)

### Decision 2: Prisma Schema Cleanup

**Approach:**
1. Search all code for imports/usage of each Prisma model
2. Mark each model as USED or UNUSED
3. For legacy models that duplicate canonical models:
   - If UNUSED: Delete immediately
   - If USED: Migrate code to use canonical model, then delete legacy
4. Run `prisma migrate dev` to create clean migration

### Decision 3: Task Queue

| Option | Description | Recommendation |
|--------|-------------|----------------|
| Keep Celery | Full Python stack with Redis | Only if keeping FastAPI |
| **BullMQ** | Redis-based, TypeScript native | ⭐ RECOMMENDED if eliminating Python |
| Next.js Server Actions | Built-in, no queue needed | For simple synchronous operations |

---

## 9. Phased Execution Plan

### PRE-FLIGHT: Safety First (30 minutes)

**Before making ANY changes:**

- [ ] **Backup PostgreSQL database**
  ```bash
  docker exec trackfraud-postgres pg_dump -U trackfraud trackfraud > /tmp/trackfraud-backup-$(date +%Y%m%d).sql
  ```
- [ ] **Check disk space**
  ```bash
  df -h / && docker system df
  ```
- [ ] **Verify Docker image state**
  ```bash
  docker compose ps && docker images | grep trackfraud
  ```

---

### PHASE 0: Emergency Triage (Day 1)

**Goal:** Stop the bleeding. Get the app to start without errors.

- [ ] **0.1** Revoke exposed Congress API key at Congress.gov
- [ ] **0.2** Remove `.env` from git: `git rm --cached .env`
- [ ] **0.3** Verify `.env` is in `.gitignore`
- [ ] **0.4** Recreate `.env` from `.env.example` with new API key
- [ ] **0.5** Fix Redis port mismatch - align `.env` REDIS_PORT to consistent value
- [ ] **0.6** Commit checkpoint: `git commit -m "checkpoint: pre-hardening state"`
- [ ] **0.7** Start Docker services: `docker compose up -d --wait`
- [ ] **0.8** Verify all services healthy: `docker compose ps`
- [ ] **0.9** Start Next.js: `npm run dev` - verify no errors
- [ ] **0.10** Test database connectivity from Next.js
- [ ] **0.11** Test Redis connectivity from Next.js
- [ ] **0.12** Test Meilisearch connectivity

**Definition of Done:** `npm run dev` starts, all Docker services are healthy, database/Redis/Meilisearch connections work.

---

### PHASE 1: Architectural Decision (Days 2-4)

**Goal:** Eliminate architectural confusion. Single source of truth.

- [ ] **1.1** Make the backend decision (Next.js only vs dual)
- [ ] **1.2** Document API boundary decision in `docs/ARCHITECTURE.md`
- [ ] **1.3** Remove dead Python files (`backend/app/database.py`, `backend/app/config.py`)
- [ ] **1.4** If eliminating FastAPI:
  - [ ] Inventory all FastAPI endpoints
  - [ ] Migrate critical endpoints to Next.js API routes
  - [ ] Update frontend to call Next.js routes instead of FastAPI
  - [ ] Remove Python backend code
  - [ ] Remove Celery from docker-compose
  - [ ] Remove Python Docker image
- [ ] **1.5** If keeping FastAPI:
  - [ ] Update all Python dependencies to latest versions
  - [ ] Fix duplicate entry in `requirements.txt`
  - [ ] Set up Alembic migrations properly
  - [ ] Document which endpoints live in which backend
- [ ] **1.6** Commit phase 1 changes

**Definition of Done:** Clear architectural boundary documented, no duplicate files, all API routes work from the chosen backend(s).

---

### PHASE 2: Schema & Dependency Cleanup (Days 5-7)

**Goal:** Clean database schema, update dependencies.

- [ ] **2.1** Audit all 81 Prisma models - search codebase for usage
- [ ] **2.2** Create usage matrix: Model Name | Used In | Can Delete?
- [ ] **2.3** Remove unused legacy models from schema
- [ ] **2.4** Migrate code using legacy models to canonical models
- [ ] **2.5** Run `prisma migrate dev` to apply schema changes
- [ ] **2.6** Upgrade Prisma from v5 to v6
- [ ] **2.7** Replace `node-fetch` v2 with native `fetch`
- [ ] **2.8** Remove `@types/node-fetch` from devDependencies
- [ ] **2.9** Remove `@types/follow-redirects` from production dependencies (move to devDependencies or remove)
- [ ] **2.10** Fix ESLint configuration
- [ ] **2.11** Verify `npm run build` succeeds
- [ ] **2.12** Commit phase 2 changes

**Definition of Done:** Clean Prisma schema with no duplicate models, all dependencies updated, build succeeds.

---

### PHASE 3: Core Pipeline (Days 8-10)

**Goal:** Make the core data flows actually work.

- [ ] **3.1** Unify fraud scoring to single implementation (TypeScript recommended)
- [ ] **3.2** Remove duplicate scoring code from the eliminated backend
- [ ] **3.3** Fix Meilisearch search indexing:
  - [ ] Verify index initialization on app startup
  - [ ] Create reindex script that populates all indexes from DB
  - [ ] Run full reindex
  - [ ] Verify search returns results
- [ ] **3.4** Verify data integrity:
  - [ ] Spot-check charity records are queryable
  - [ ] Spot-check corporate records are queryable
  - [ ] Spot-check government records are queryable
  - [ ] Verify fraud scores are calculated and stored
- [ ] **3.5** If eliminating Celery, implement BullMQ for background tasks:
  - [ ] Install `bullmq` and `@bull-board/api` packages
  - [ ] Migrate Celery tasks to BullMQ queues
  - [ ] Set up Bull Board for monitoring
- [ ] **3.6** Commit phase 3 changes

**Definition of Done:** Fraud scoring works consistently, search returns results, data is queryable through API routes.

---

### PHASE 4: Test & Harden (Days 11-13)

**Goal:** Everything tested, quality gates in place.

- [ ] **4.1** Get TypeScript test suite passing (Vitest)
  - [ ] Run `npm test`
  - [ ] Fix failing tests
  - [ ] Add missing tests for critical paths
- [ ] **4.2** Get Python test suite passing (pytest) - if keeping FastAPI
  - [ ] Run `cd backend && pytest`
  - [ ] Fix failing tests
  - [ ] Update pytest to v8
- [ ] **4.3** Add integration smoke tests:
  - [ ] Test each major API route returns valid responses
  - [ ] Test database queries return expected data
  - [ ] Test search endpoint returns results
- [ ] **4.4** End-to-end test main user flows:
  - [ ] Search for an entity → results displayed
  - [ ] Browse a category → entities listed
  - [ ] View entity detail → profile shown with fraud score
- [ ] **4.5** Performance baseline:
  - [ ] Measure page load times for main pages
  - [ ] Measure API response times
  - [ ] Document baseline metrics
- [ ] **4.6** Set up GitHub Actions CI:
  - [ ] Create `.github/workflows/ci.yml`
  - [ ] Run lint + test + build on every push
- [ ] **4.7** Add basic error boundaries in React
- [ ] **4.8** Add input validation with Zod on API routes
- [ ] **4.9** Commit phase 4 changes

**Definition of Done:** All tests pass, CI runs on push, main user flows work end-to-end.

---

### PHASE 5: Modernization (Optional, Days 14+)

**Goal:** Upgrade to latest versions, polish.

- [ ] **5.1** Upgrade Next.js from 14 to 15
- [ ] **5.2** Upgrade React from 18 to 19
- [ ] **5.3** Upgrade Tailwind CSS from 3 to 4
- [ ] **5.4** Add Playwright E2E tests
- [ ] **5.5** Add SEO meta tags, Open Graph, structured data
- [ ] **5.6** Add accessibility improvements (aria attributes, keyboard nav)
- [ ] **5.7** Add structured logging (pino)
- [ ] **5.8** Add error tracking (Sentry or similar)
- [ ] **5.9** Add API rate limiting on Next.js routes
- [ ] **5.10** Performance optimization
- [ ] **5.11** Set up automated database backups
- [ ] **5.12** Create environment-specific configs (.env.development, .env.production)

**Definition of Done:** Latest versions, polished UI, production-ready.

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Database corruption during schema cleanup | Low | Critical | **Always backup before schema changes** |
| Data loss when removing legacy models | Medium | Critical | Backup + test on copy first |
| Breaking working features during refactoring | Medium | High | Test after each phase, not all at once |
| Prisma v6 upgrade breaks existing queries | Low | Medium | Test thoroughly, v6 has migration guide |
| Next.js 15 upgrade breaks App Router | Low | Medium | Defer to Phase 5, not required |
| Losing uncommitted work | High | High | Commit checkpoint before starting |
| API key exposure (already happened) | N/A | Critical | Revoke immediately, never commit .env |
| Docker disk space exhaustion | Medium | Medium | Monitor with `docker system df`, clean unused images |

---

## Rules for Execution

1. **Work one phase at a time.** Do not skip ahead. Each phase builds on the previous one.
2. **Commit after every phase.** Create a git commit at the end of each phase with a clear message.
3. **Test before moving on.** Verify the Definition of Done for each phase before starting the next.
4. **Backup before schema changes.** Always run `pg_dump` before modifying the database schema.
5. **Small, verifiable steps.** Each task within a phase should be independently testable.
6. **Document decisions.** Update `docs/ARCHITECTURE.md` when making architectural choices.

---

## Quick Reference - Commands

```bash
# Pre-flight
docker exec trackfraud-postgres pg_dump -U trackfraud trackfraud > /tmp/backup.sql
df -h / && docker system df

# Phase 0
git rm --cached .env
docker compose up -d --wait
docker compose ps
npm run dev

# Phase 2
npx prisma migrate dev
npx prisma generate
npm run build

# General
npm test
npm run lint
```

---

*This document is the single source of truth for the TrackFraud hardening effort. All assessment findings, technical decisions, and execution steps are consolidated here.*