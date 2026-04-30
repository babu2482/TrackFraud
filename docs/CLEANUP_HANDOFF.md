# Repo Cleanup Handoff

> **Date:** 2026-04-30
> **Status:** Complete

## Summary

Cleaned up a bloated repository. Removed ~542 macOS resource fork files, 22GB+ of stale build/test/log artifacts, archived obsolete docs and scripts, and organized the project structure.

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

- **`../archived-logs_202604/`** — 22GB of archived log files (irs-bmf, corporate-ingest)
- **Docker volumes** — `trackfraud-postgres-data`, `trackfraud-meilisearch-data`, `trackfraud-redis-data`
