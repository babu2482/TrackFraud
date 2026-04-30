# Archived Scripts

Scripts removed from active use but kept for reference.

## `legacy-orchestrators/`
Old orchestration scripts superseded by individual ingestion scripts and the pipeline system:
- `execute-full-plan.ts` — Legacy phased execution
- `ingest-all.ts` / `ingest-all-parallel.ts` — Old unified orchestrators
- `ingest-global-all.ts` — Script with 100+ placeholder categories
- `run-all-parsers.ts` — Referenced non-existent parser directory
- `sync-political-data.ts` — Redundant political sync

## `obsolete-utilities/`
Niche or redundant utility scripts:
- `build-charity-ein-list.ts` — EIN list builder (superseded)
- `check-charity-profile.ts` — Redundant with `check-db-status.ts`

## `old-scripts/`
Superseded or one-off scripts:
- `setup-and-ingest.sh` — Old setup script (replaced by `start.sh`)
- `ingest-sec-edgar-simple.ts` — Test-only SEC ingestion
- `ingest-sec-local.ts` — Local file SEC ingestion
- `ingest-sec-bulk.ts` — Raw SQL bulk SEC ingestion
- `ingest-usaspending-cached.ts` — Pre-cached USAspending ingestion
- `ingest-irs-eo-bmf-safe.sh` — Shell wrapper for IRS BMF
- `run-all-ingests.sh` / `run-all-ingests-lightweight.sh` — Superseded by pipeline
- `fix-ingestion-retry-logic.sh` — One-time fix script
- `monitor-ingestion.sh` / `monitor-disk-usage.sh` — Operational monitoring
- `check-and-cleanup-logs.sh` / `cleanup-disk-space.sh` — Disk cleanup
- `backup-database.sh` — DB backup
- `analyze-ai-dependencies.ts` — Referenced non-existent backend/

## How to Restore

```bash
# Example: restore a legacy orchestrator
mv scripts/archive/legacy-orchestrators/ingest-all.ts scripts/
```
