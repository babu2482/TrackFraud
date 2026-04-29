# Archived Scripts

This directory contains scripts that have been removed from active use but kept for reference.

## Directory Structure

### legacy-orchestrators/
Old orchestration scripts superseded by individual ingestion scripts:
- `execute-full-plan.ts` - Legacy phased execution with placeholder implementations
- `ingest-all.ts` - Old unified orchestrator with placeholder functions
- `ingest-all-parallel.ts` - Old parallel orchestrator
- `run-all-parsers.ts` - References non-existent `scripts/parsers/` directory
- `sync-political-data.ts` - Redundant political sync orchestration
- `ingest-global-all.ts` - Massive script with 100+ placeholder categories

### obsolete-utilities/
Niche or redundant utility scripts:
- `build-charity-ein-list.ts` - EIN list builder (superseded by direct ingestion)
- `check-charity-profile.ts` - Redundant with `check-db-status.ts`

### obsolete-dirs/
Obsolete directories that contained unused tools:
- `check-charity-profile/` - Old charity profile checking tools
- `check-db/` - Old database checking tools
- `local-ingestion/` - Old local ingestion scripts

### old-scripts/
Superseded setup/operation scripts:
- `setup-and-ingest.sh` - Old setup script (replaced by `start.sh`)

## How to Restore

If you need any of these scripts for debugging or historical purposes, you can restore them:

```bash
# Example: restore a legacy orchestrator
mv scripts/archive/legacy-orchestrators/ingest-all.ts scripts/