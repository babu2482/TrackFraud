# TrackFraud Production Plan — Handoff Document

> **Last Updated:** 2026-04-29
> **Status:** Phases 1-4 complete, Phase 3 automation pending
> **Tests:** 353 passing (21 test files)

---

## What Was Accomplished

### 1. Fixed HHS OIG Ingestion Script ✅
- **Problem:** Old Socrata JSON API URL returned 404; CSV format changed completely
- **Solution:** Rewrote script to use `https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv`
- **New CSV format:** LASTNAME, FIRSTNAME, BUSNAME, NPI, EXCLTYPE, EXCLDATE (YYYYMMDD)
- **Result:** 82,654 HHS exclusion records ingested
- **File:** `scripts/ingest-hhs-oig-exclusions.ts`

### 2. Fixed FDA openFDA API Script ✅
- **Problem:** API response changed from `meta.result_count` to `meta.results.total`
- **Solution:** Updated `OpenFDAResponse` interface and all references
- **Result:** 4,881 FDA enforcement records ingested (drug + device + food)
- **File:** `scripts/ingest-fda-warning-letters.ts`

### 3. Fixed FTC Ingestion Script ✅
- **Problem:** Upsert by custom `id` caused unique constraint violations; `summary` field not in schema
- **Solution:** Upsert by `url` (added `@unique` constraint); removed `summary` field
- **Result:** 25 data breaches + 4 consumer protection actions ingested
- **Files:** `scripts/ingest-ftc-data-breach.ts`, `prisma/schema.prisma`

### 4. Fixed ES Module Compatibility ✅
- **Problem:** 9 files used `require.main === module` (CommonJS), causing runtime errors
- **Solution:** Converted to `import.meta.url` pattern
- **Files:** signal-detectors, scorer, healthcare, consumer, sanctions, detection-engine, indexer, reindex-all, pipeline

### 5. Added Schema Unique Constraints ✅
- Added `@unique` to `url` on: FDAWarningLetter, FTCDataBreach, FTCConsumerProtectionAction
- Enables upsert-by-url pattern in ingestion scripts
- **File:** `prisma/schema.prisma`

### 6. Auto-Revocation Linking Script Fixed ✅
- **Problem:** `require.main === module` didn't work in ES modules
- **Solution:** Converted to `import.meta.url`
- **Result:** 48,895 unlinked records found; EIN exact + fuzzy name matching working
- **File:** `scripts/link-auto-revocations.ts`

### 7. Scoring Pipelines Operational ✅
- Charity: 5,525 entities scored (57.5 avg, 1,186 critical)
- Healthcare: 5,011 entities scored (57.5 avg, 1,204 critical)
- Consumer: 5,511 entities scored (56.2 avg, 1,209 critical)
- **File:** `scripts/run-fraud-analysis-pipeline.ts`

### 8. Tests Updated ✅
- Fixed `integration.smoke.test.ts` to include `api_json` and `scraping` ingestion modes
- All 353 tests passing

---

## What Still Needs To Be Done

### High Priority
1. **Configure scheduled pipeline** — Set up cron or Docker scheduler for daily runs
2. **Add PipelineRun model** — Track pipeline executions in database
3. **Add pipeline error recovery** — Retry logic with exponential backoff
4. **Complete auto-revocation linking** — Run `link-auto-revocations.ts` to completion (48,895 records)

### Medium Priority
5. **Update FRAUD_SCORING.md** — Document new architecture and signal definitions
6. **Create RUNBOOK.md** — Operations guide for the platform
7. **Update ARCHITECTURE.md** — System diagram
8. **Re-ingest SAM exclusions** — Only 3 records currently (script exists)

### Lower Priority
9. **Performance optimization** — Batch size increase, database indexes
10. **Security hardening** — Audit logging, input validation

---

## Architecture Overview

### Scoring Pipeline
```
Ingestion → Signal Detection → Fraud Meter → Score Storage → Search Index
```

### Signal Detectors by Category
- **Charity:** signal-detectors.ts (v2 methodology)
- **Healthcare:** healthcare-detectors.ts (5 signals)
- **Consumer:** consumer-detectors.ts (5 signals)
- **Sanctions:** sanctions-detectors.ts (5 signals)
- **String Matching:** string-match.ts (normalization, Jaccard, Levenshtein)

### Key Design Decisions
1. `fraud-meter.ts` is the canonical scoring engine
2. `scorer.ts` delegates to fraud-meter via `score-adapter.ts`
3. Methodology versioning: "v1" (original) → "v2" (updated thresholds)
4. Auto-revocation linking: EIN exact → fuzzy name (Jaccard ≥ 85%)
5. Upsert by `url` for external data sources

---

## Database State

| Source | Records | Status |
|--------|---------|--------|
| Charity Profiles | 1,952,238 | ✅ |
| Healthcare Payments | 261,933 | ✅ |
| HHS OIG Exclusions | 82,654 | ✅ Newly ingested |
| FDA Warning Letters | 4,881 | ✅ Newly ingested |
| Consumer Complaints | 5,162,000 | ✅ |
| FTC Data Breaches | 25 | ✅ Newly ingested |
| OFAC Sanctions | 18,732 | ✅ |
| SAM Exclusions | 3 | ⚠️ Needs re-ingestion |

---

## Quick Start Commands

```bash
# Verify everything works
npm test

# Run ingestion
npx tsx scripts/ingest-hhs-oig-exclusions.ts
npx tsx scripts/ingest-fda-warning-letters.ts --type all
npx tsx scripts/ingest-ftc-data-breach.ts

# Link auto-revocations
npx tsx scripts/link-auto-revocations.ts --dry-run
npx tsx scripts/link-auto-revocations.ts

# Score entities
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 500
npx tsx scripts/run-fraud-analysis-pipeline.ts --category healthcare --limit 500
npx tsx scripts/run-fraud-analysis-pipeline.ts --category consumer --limit 500

# Check health
curl http://localhost:3001/api/admin/fraud-health
```

---

## Risks & Caveats

1. **Auto-revocation linking** takes ~60+ seconds to index 1.95M charity profiles
2. **SAM exclusions** only has 3 records — the ingestion script may need investigation
3. **Full pipeline runs** (no `--limit`) will take significant time at 1.95M entities
4. **FTC data** is limited to publicly available enforcement actions; Consumer Sentinel data requires law enforcement access
