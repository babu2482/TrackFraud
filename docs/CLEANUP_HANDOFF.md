# Repo Cleanup Handoff

> **Date:** 2026-04-30
> **Status:** Complete + Verified

## Summary

Cleaned up a bloated repository. Removed ~542 macOS resource fork files, 22GB+ of stale build/test/log artifacts, archived obsolete docs and scripts, and organized the project structure. Verified all services start, stop, and run correctly after cleanup.

## What Was Done

### Space Reclaimed
- **284MB** — Cleaned `logs/` directory
- **252MB** — Cleaned `.next/` build cache
- **22GB** — Moved `archives/logs_202604/` outside the repo (`../archived-logs_202604/`)
- **9.1MB** — Cleaned `coverage/` directory
- **5.4MB** — Cleaned `.playwright-mcp/` session logs
- **542 files** — Deleted macOS `._*` resource fork files

### Files Deleted (Not Archived)
- `s` — Mysterious stray Java source file
- `congress-ingest-output.log` — Run log in root
- `.execution-progress.json` — Runtime state
- `.env.bak`, `.env.development.bak`, `.env.production`, `.env.test` — Stale env files
- `prisma/dev.db` — Dev database (should be regenerated)
- `tsconfig.tsbuildinfo` — TS cache
- `prisma/schema-expanded.prisma` — Unused schema file
- `scripts/parsers/*.backup` — Backup files
- Empty `data/` subdirectories (consumer, corporate, government, etc.)

### Docs Archived to `archives/production-plan/`
- `MASTER_PLAN.md` — 1275-line production hardening plan (historical)
- `PROGRESS.md` — Phase-by-phase tracker (historical)
- `HANDOFF.md` — Previous handoff doc
- `PIPELINE_INFRASTRUCTURE_HANDOFF.md` — Pipeline details
- `UI_OVERHAUL_HANDOFF.md` — UI overhaul details
- `VERIFICATION_HANDOFF.md` — E2E verification details

### Docs Deleted (Already Superseded)
- `docs/archives/` — Entire directory (stale status reports)
- `docs/plans/` — Entire directory (old plan docs)
- `docs/handoff/` — Entire directory
- `docs/UserThreads/` — Entire directory
- `docs/HANDOFF-fraud-sources-2026-04-28.md`
- `docs/fraud-sources-research-2025.md`

### Scripts Archived to `scripts/archive/old-scripts/`
- SEC variants: `ingest-sec-edgar-simple.ts`, `ingest-sec-local.ts`, `ingest-sec-bulk.ts`
- `ingest-usaspending-cached.ts` — Pre-cached variant
- `analyze-ai-dependencies.ts` — References non-existent `backend/`
- Shell scripts: `run-all-ingests.sh`, `run-all-ingests-lightweight.sh`, `monitor-*.sh`, `cleanup-*.sh`, `backup-database.sh`, `fix-ingestion-retry-logic.sh`
- `ingest-irs-eo-bmf-safe.sh` — Shell wrapper

### Moved
- `prisma/migrations_sqlite_archive/` → `archives/sqlite-migrations-archive/`
- `query_*.sql` → `docs/` (diagnostic queries)

### Created
- `README.md` — Root-level README with quick start, scripts, doc links
- `archives/README.md` — Archive index
- Updated `docs/README.md` — Cleaned navigation, removed stale links
- Updated `scripts/archive/README.md` — Full inventory of archived scripts

### `.gitignore` Updates
- Added: `.playwright-mcp/`, `playwright-report/`, `test-results/`, `archives/`, `.execution-progress.json`, `congress-ingest-output.log`, `prisma/dev.db`, `*.ts.backup`
- Removed: Stale Python sections, duplicate entries

## Project Structure (After)

```
TrackFraudProject/
├── README.md                    # NEW - Quick start
├── app/                         # Next.js pages + API routes
├── components/                  # React components
├── lib/                         # Shared utilities
├── prisma/                      # Schema + PostgreSQL migrations
├── scripts/                     # Active ingestion scripts (~20)
│   ├── archive/                 # Deprecated scripts
│   │   ├── legacy-orchestrators/
│   │   ├── obsolete-utilities/
│   │   └── old-scripts/
│   └── parsers/
├── tests/                       # Unit, integration, E2E
├── docs/                        # Active documentation
│   ├── runbooks/                # Operational procedures
│   └── query_*.sql              # Diagnostic queries
└── archives/                    # Archived data + historical docs
    ├── production-plan/         # Historical handoff docs
    └── sqlite-migrations-archive/
```

## Verification

- **Unit Tests:** 353/353 passing
- **Git Commit:** `d6d4de2` — 96 files changed, 1120 insertions, 116,804 deletions

## Things Outside the Repo

- **`../archived-logs_202604/`** — ~~22GB of archived log files~~ **DELETED** (22 GB reclaimed, no longer needed)
- **Docker volumes** — `trackfraud-postgres-data`, `trackfraud-meilisearch-data`, `trackfraud-redis-data`

## Post-Cleanup Verification (2026-04-30)

### Services Verified
| Service | Port | Status |
|---------|------|--------|
| PostgreSQL (Docker) | 5433 | ✅ Healthy |
| Redis (Docker) | 6379 | ✅ Healthy |
| Meilisearch (Docker) | 7700 | ✅ Healthy |
| Next.js Frontend | 3001 | ✅ HTTP 200 |

### API Endpoints Verified
| Endpoint | Status | Notes |
|----------|--------|-------|
| `/` | 200 | 87 KB HTML, title: "TrackFraud" |
| `/api/health` | 200 | DB: 4 ms, Search: 5 ms |
| `/api/categories` | 200 | 16 fraud categories returned |
| `/api/charities?limit=3` | 200 | Real charity data with EINs |
| `/api/search?q=charity` | 200 | Full-text search working |

### start.sh Commands Tested
| Command | Result |
|---------|--------|
| `(default)` — Smart Start | ✅ Full lifecycle: prerequisites → cleanup → ports → env → caches → deps → infra → DB → frontend |
| `start` | ✅ Quick start with infrastructure + frontend |
| `stop` | ✅ Graceful shutdown of frontend + Docker containers |
| `status` | ✅ Shows all services UP and healthy |
| `ports` | ✅ Shows port mapping with conflict resolution (5432→5433) |
| `health` | ✅ All 5 checks pass (PostgreSQL, Redis, Meilisearch, Frontend, Prisma) |

### Tests
- **Unit Tests:** 353/353 passing (21 test files, 3.16 s)
- **Integration Smoke:** 18 tests passing (3 API endpoint tests)

### Notes
- Port 5432 conflict with native PostgreSQL → auto-resolved to 5433 (handled correctly by start.sh)
- Node.js v25.8.2, Next.js 15.5.15 with Turbopack — all working
- No changes needed to start.sh
