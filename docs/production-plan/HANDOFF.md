# TrackFraud Production Plan — Handoff Document

> **Date:** 2025-01-20
> **Author:** Agent (qwen/qwen3.6-27b)
> **Session:** Production Plan Execution — Phases 1-2 (Partial)
> **Status:** In Progress — Ready for Next Engineer

---

## What Was Accomplished

This execution session focused on laying the foundation for a production-ready fraud scoring system across multiple entity categories. Here is what was completed:

### 1. Fixed Weak Signals (Phase 1.3 — ✅ Complete)

**Problem:** The `charity_not_in_pub78` signal was generating ~8,750 false positives because IRS Publication 78 is a sample list (~50K of 1.95M charities), not a comprehensive directory. Similarly, `charity_missing_filings` was too aggressive at 180/365 day thresholds, flagging historical entities that legitimately stopped filing.

**What Changed:**

- **`charity_not_in_pub78`** (`lib/fraud-scoring/signal-detectors.ts`): Now requires the entity to have a recent BMF record (published within 365 days) before flagging. Score impact reduced from 15 → 10 points. Methodology version bumped to `"v2"`.
- **`charity_missing_filings`** (`lib/fraud-scoring/signal-detectors.ts`): Thresholds increased from 180/365 days → 730/1095 days (medium/high). Methodology version bumped to `"v2"`.

**Expected Impact:** `charity_not_in_pub78` false positives should drop by >70%. `charity_missing_filings` should no longer flag dormant or historical entities.

### 2. Consolidated Scoring Systems (Phase 1.4 — ✅ Complete)

**Problem:** Two scoring systems existed with different algorithms:
- `scorer.ts` — Batch scoring (0-100 scale, simple corroboration)
- `fraud-meter.ts` — Real-time API scoring (sophisticated corroboration with floors, synergy bonuses)

**What Changed:**

- Created `lib/fraud-scoring/score-adapter.ts` (184 lines) — Bridge module providing:
  - `mapSeverity()` — Maps scorer severities (critical/high/medium/low) to fraud-meter severities (high/medium)
  - `mapLevelToDb()` — Maps fraud-meter levels (severe/high/elevated/guarded/low) to DB strings (critical/high/medium/low)
  - `detectedSignalToRisk()` — Converts `DetectedSignal` → `RiskSignal`
  - `unifiedScore()` — Single entry point for scoring that delegates to `buildFraudMeter()`
- Updated `scorer.ts` to call `unifiedScore()` instead of its own algorithm. Legacy `calculateFraudScore()` interface preserved for backwards compatibility.

**Key Decision:** `fraud-meter.ts` is the canonical scoring engine. All new code should use `buildFraudMeter()` or `unifiedScore()`.

### 3. Created Auto-Revocation Linking Script (Phase 1.2 — ✅ Code Complete)

**Problem:** 42,313 auto-revocation records (86% of 49K) are unlinked to charity profiles due to EIN format mismatches (e.g., `123456789` vs `12-3456789`).

**What Was Created:**

- `scripts/link-auto-revocations.ts` (312 lines) — Script with two matching strategies:
  1. **EIN normalization + exact match** (primary) — Strips dashes/spaces, zero-pads to 9 digits
  2. **Fuzzy name + state matching** (fallback) — Jaccard word-set similarity ≥ 85% with state boost (+0.2 if state matches, -20% penalty if mismatch)

**Usage:**
```bash
npx tsx scripts/link-auto-revocations.ts --dry-run   # Preview matches
npx tsx scripts/link-auto-revocations.ts              # Apply to DB
npx tsx scripts/link-auto-revocations.ts --ein-only   # EIN matching only
npx tsx scripts/link-auto-revocations.ts --max-links 1000  # Test subset
```

**Expected Impact:** Link rate should improve from 14% → 60%+ (30K+ additional links).

### 4. Built Healthcare Detectors (Phase 2.2 — ✅ Complete)

**What Was Created:**

- `lib/fraud-scoring/healthcare-detectors.ts` (~740 lines) — 5 signal detectors for CMS Open Payments recipients:

| Signal | What It Detects | Threshold | Score Impact | Severity |
|--------|----------------|-----------|-------------|----------|
| `hc_excluded_billing` | On HHS exclusion list but has payments | Any match | 50 pts | critical |
| `hc_payment_concentration` | >50% payments from single company | >50% | 20 pts | high |
| `hc_structured_payments` | >50 small payments (<$100) in a year | >50 count | 15 pts | medium |
| `hc_rapid_volume_growth` | >2x year-over-year payment increase | >2x | 10 pts | medium |
| `hc_cms_safeguard_exclusion` | On CMS Program Safeguard list | Any match | 40 pts | high |

- `tests/unit/healthcare-detectors.test.ts` (33 tests) — Full coverage with mocked Prisma calls.

### 5. Built Consumer Detectors (Phase 2.3 — ✅ Complete)

**What Was Created:**

- `lib/fraud-scoring/consumer-detectors.ts` (657 lines) — 5 signal detectors for CFPB consumer complaint companies:

| Signal | What It Detects | Threshold | Score Impact | Severity |
|--------|----------------|-----------|-------------|----------|
| `high_complaint_volume` | >100 complaints/year | >100 | 20-30 pts | high→critical |
| `low_response_rate` | <20% company response rate | <20% | 15-20 pts | medium→high |
| `repeat_issues` | Same issue >30% of complaints | >30% | 10-15 pts | medium→high |
| `ftc_data_breach` | Company in FTC breach database | Any match | 25-35 pts | high→critical |
| `non_timely_response` | <50% timely responses | <50% | 10-15 pts | low→medium |

- `tests/unit/consumer-detectors.test.ts` (39 tests) — Full coverage with mocked Prisma calls.

### 6. Updated Pipeline Script (Phase 2.1 — ✅ Ready to Execute)

**What Changed:**

- `scripts/run-fraud-analysis-pipeline.ts` — Now supports three categories via a switch statement:
  - `--category charity` → Calls `batchDetectCharitySignals()`
  - `--category healthcare` → Calls `batchDetectHealthcareSignals()`
  - `--category consumer` → Calls `batchDetectConsumerSignals()`
- Help text updated with category descriptions and examples.

### 7. Created Fraud Health API (Phase 3.2 — ✅ Code Complete)

**What Was Created:**

- `app/api/admin/fraud-health/route.ts` (307 lines) — Health check endpoint returning:

```json
{
  "pipeline": { "lastRun": "...", "healthy": true, "status": "healthy" },
  "scoring": { "totalScored": 4525, "distribution": {...}, "anomalyDetected": false },
  "ingestion": { "sources": [...], "overallHealthy": true },
  "timestamp": "..."
}
```

- Checks 10 ingestion sources for record counts and last sync time.
- Anomaly detection: Flags if >50% of scored entities are in critical/high bands.

### 8. Created Unit Tests (Phase 4.1 — ✅ Partial)

**What Was Created:**

- `tests/unit/score-adapter.test.ts` (44 tests) — Tests all mapping functions, signal conversion, category-to-domain resolution, and unified scoring integration.
- `tests/unit/healthcare-detectors.test.ts` (33 tests) — Tests all 5 healthcare detectors plus the aggregate function.
- Consumer-detectors tests (39 tests) — Created by parallel agent.

### 9. Updated CI/CD (Phase 4.4 — ✅ Complete)

**What Changed:**

- `.github/workflows/ci.yml` — Added two new steps:
  1. **Run fraud scoring tests** — Runs fraud-meter, score-adapter, healthcare, and consumer detector tests.
  2. **Pipeline smoke test** — Runs `run-fraud-analysis-pipeline.ts --category charity --limit 100 --score-only --no-reindex`.

### 10. Created Progress Tracking (Phase 5.1 — ✅ Partial)

**What Was Created:**

- `docs/production-plan/PROGRESS.md` (275 lines) — Detailed phase-by-phase status with tables, file inventories, database state, and remaining work.
- `docs/production-plan/HANDOFF.md` — This file.

---

## What Still Needs To Be Done

### High Priority (Blockers to Production)

1. **Run ingestion scripts** — HHS OIG (~80K records), FDA Warning Letters (~5K), FTC Data Breaches (~500). Scripts exist and are fixed; they just need to be executed:
   ```bash
   npx tsx scripts/ingest-hhs-oig-exclusions.ts
   npx tsx scripts/ingest-fda-warning-letters.ts
   npx tsx scripts/ingest-ftc-data-breach.ts
   ```

2. **Execute auto-revocation linking** — Run the dry run first to verify matching quality, then apply:
   ```bash
   npx tsx scripts/link-auto-revocations.ts --dry-run
   npx tsx scripts/link-auto-revocations.ts
   ```

3. **Run full charity scoring pipeline** — Score all 1.95M entities:
   ```bash
   # Test with limit first
   npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 1000
   
   # Full run
   npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity
   ```

4. **Create sanctions detectors** — `lib/fraud-scoring/sanctions-detectors.ts` and `lib/string-match.ts` for OFAC/SAM cross-referencing. This is the last major detector category.

5. **Add PipelineRun model to Prisma schema** — For error recovery and run tracking. Needs migration.

### Medium Priority (Reliability & Observability)

6. **Add pipeline error recovery** — Retry logic with exponential backoff in the pipeline script.
7. **Configure scheduled pipeline execution** — Cron-based or Docker-based daily runs.
8. **Create integration tests** — End-to-end pipeline tests with test data setup/cleanup.
9. **Update `docs/FRAUD_SCORING.md`** — Reflect the new architecture (score-adapter, multi-category, etc.).

### Lower Priority (Hardening)

10. **Performance optimization** — Increase batch size from 100 → 500, add database indexes, tune connection pooling.
11. **Security hardening** — Audit logging for fraud score access, input validation on API routes.
12. **Backup & recovery** — `scripts/backup-fraud-data.sh` for daily pg_dump.
13. **Create `docs/RUNBOOK.md`** — Operations guide with daily checks, troubleshooting, and emergency procedures.
14. **Update `docs/ARCHITECTURE.md`** — System diagram with all new components.

---

## Architecture Overview (As of This Handoff)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Data Sources                              │
│  IRS BMF | IRS Auto-Rev | IRS Pub78 | IRS 990-N | CMS Payments │
│  CFPB Complaints | OFAC SDN | SAM Excl | HHS OIG | FDA | FTC    │
└──────────────┬──────────────────────────────────────────────────┘
               │ Ingestion Scripts (scripts/ingest-*.ts)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL (16)                              │
│  CanonicalEntity | CharityProfile | HealthcareRecipientProfile  │
│  ConsumerCompanySummary | FraudSignalEvent | FraudSnapshot       │
│  HHSExclusion | FDAWarningLetter | FTCDataBreach | OFACSanction  │
└──────────────┬──────────────────────────────────────────────────┘
               │ Prisma Client
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Detection Layer                                │
│  signal-detectors.ts (charity)                                   │
│  healthcare-detectors.ts (new)                                   │
│  consumer-detectors.ts (new)                                     │
│  sanctions-detectors.ts (TODO)                                   │
└──────────────┬──────────────────────────────────────────────────┘
               │ DetectedSignal[]
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Scoring Layer                                  │
│  score-adapter.ts (new) — Converts DetectedSignal → RiskSignal  │
│  fraud-meter.ts (canonical) — buildFraudMeter()                 │
│  scorer.ts — Delegates to fraud-meter via score-adapter         │
└──────────────┬──────────────────────────────────────────────────┘
               │ FraudSnapshot
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Layer                                    │
│  GET /api/fraud-scores — Query scores by entity                 │
│  POST /api/fraud-scores — Trigger recalculation                 │
│  GET /api/admin/fraud-health — Pipeline health (new)            │
│  GET /api/admin/fraud-metrics — Aggregated metrics              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. `fraud-meter.ts` Is the Canonical Scoring Engine

`scorer.ts` used to have its own scoring algorithm. It now delegates to `fraud-meter.ts` via `score-adapter.ts`. This ensures that API routes and batch pipelines produce identical scores.

**Rationale:** `fraud-meter.ts` has more sophisticated logic (corroboration floors, synergy bonuses, per-domain metadata). The old scorer was simpler but produced different results for the same signals.

### 2. Methodology Versioning (`"v1"` → `"v2"`)

Signals are tagged with a methodology version. The fixes to weak signals use `"v2"` to distinguish them from existing `"v1"` signals in the database. This allows historical comparison and rollback if needed.

### 3. Auto-Revocation Linking Uses Two-Stage Matching

EIN normalization alone won't link all records. The script falls back to fuzzy name matching with a high similarity threshold (≥ 85%) to avoid false matches. State matching provides a 20% boost.

**Rationale:** False positives in revocation linking are dangerous — they could flag innocent charities as revoked. High threshold + dry-run mode minimizes risk.

### 4. Healthcare/Consumer Detectors Follow the Same Pattern

Both new detector files export individual `detect*()` functions, a `detectAll*()` aggregate, and a `batchDetect*()` function. This matches the charity detector pattern in `signal-detectors.ts`.

---

## Database State

| Source | Records | Linked | Status |
|--------|---------|--------|--------|
| Charity BMF | 1,952,238 | 1,952,238 | ✅ Complete |
| Charity Auto-Revocation | 49,000 | ~6,800 (14%) | ⚠️ Script ready to link |
| Charity 990-N Epostcards | 50,000 | 50,000 | ✅ Complete |
| Charity Publication 78 | 50,000 | 50,000 | ✅ Complete |
| Consumer Complaints | 5,162,000 | 5,162,000 | ✅ Complete |
| Healthcare Payments | 261,933 | 261,933 | ✅ Complete |
| Healthcare Recipients | ~89,000 | ~89,000 | ✅ Complete |
| OFAC Sanctions | 37,464 | Partial | ✅ Complete |
| Corporate Profiles | 8,000 | 8,000 | ✅ Complete |
| SEC Filings | 445,000 | 445,000 | ✅ Complete |
| **HHS OIG Exclusions** | **0** | **0** | ❌ Not ingested |
| **FDA Warning Letters** | **0** | **0** | ❌ Not ingested |
| **FTC Data Breaches** | **0** | **0** | ❌ Not ingested |

---

## File Inventory

### Files Created in This Session
| File | Lines | Purpose |
|------|-------|---------|
| `scripts/link-auto-revocations.ts` | 312 | EIN normalization + fuzzy matching |
| `lib/fraud-scoring/score-adapter.ts` | 184 | Bridge between scorer and fraud-meter |
| `lib/fraud-scoring/healthcare-detectors.ts` | ~740 | 5 healthcare signal detectors |
| `lib/fraud-scoring/consumer-detectors.ts` | 657 | 5 consumer signal detectors |
| `app/api/admin/fraud-health/route.ts` | 307 | Pipeline health endpoint |
| `tests/unit/healthcare-detectors.test.ts` | — | 33 healthcare detector tests |
| `tests/unit/score-adapter.test.ts` | — | 44 score adapter tests |
| `tests/unit/consumer-detectors.test.ts` | — | 39 consumer detector tests |
| `docs/production-plan/PROGRESS.md` | 275 | Phase-by-phase progress tracker |
| `docs/production-plan/HANDOFF.md` | — | This document |

### Files Modified in This Session
| File | Change |
|------|--------|
| `lib/fraud-scoring/signal-detectors.ts` | Fixed `charity_not_in_pub78` + `charity_missing_filings` (v2) |
| `lib/fraud-scoring/scorer.ts` | Delegates to `fraud-meter` via `score-adapter` |
| `scripts/run-fraud-analysis-pipeline.ts` | Added healthcare + consumer categories |
| `.github/workflows/ci.yml` | Added fraud scoring tests + pipeline smoke test |

---

## Quick Start for Next Engineer

### 1. Verify Everything Compiles
```bash
cd /Volumes/MacBackup/TrackFraudProject
npx prisma generate
npm test
```

### 2. Run the Ingestion Scripts
```bash
npx tsx scripts/ingest-hhs-oig-exclusions.ts
npx tsx scripts/ingest-fda-warning-letters.ts
npx tsx scripts/ingest-ftc-data-breach.ts
```

### 3. Link Auto-Revocations
```bash
npx tsx scripts/link-auto-revocations.ts --dry-run
npx tsx scripts/link-auto-revocations.ts
```

### 4. Run the Full Pipeline
```bash
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity
npx tsx scripts/run-fraud-analysis-pipeline.ts --category healthcare
npx tsx scripts/run-fraud-analysis-pipeline.ts --category consumer
```

### 5. Check Health
```bash
curl http://localhost:3001/api/admin/fraud-health
```

### 6. Create the Sanctions Detectors
See `MASTER_PLAN.md` section 2.4 for the spec.

---

## Risks & Caveats

1. **Prisma model mismatches:** Some Prisma models may not have corresponding DB tables (or vice versa). The `count()` calls in health checks may fail if models aren't migrated. Run `npx prisma migrate status` to check.

2. **Signal quality after v2 fix:** The `charity_not_in_pub78` reduction will significantly lower false positives, but the exact count depends on how many charities have recent BMF records. Monitor the distribution after running the pipeline.

3. **Auto-revocation linking thresholds:** The 85% similarity threshold is conservative. If the dry run shows too few matches, you may need to lower it to 80%. Be cautious — false matches are worse than missed matches.

4. **Pipeline runtime for 1.95M charities:** At batch size 100, expect ~16-60 minutes depending on database load. Consider increasing batch size to 500 for Phase 6.

5. **FTC Data Breach ingestion:** The script scrapes FTC web pages. If the FTC site changes its HTML structure, the scraper will return 0 records. Check if this is the case before proceeding.

---

## Contact & Context

- **Master Plan:** `docs/production-plan/MASTER_PLAN.md`
- **Progress Tracker:** `docs/production-plan/PROGRESS.md`
- **Existing Docs:** `docs/FRAUD_SCORING.md`, `docs/ARCHITECTURE.md`
- **Test Config:** `vitest.config.ts` (node environment, globals)
- **CI/CD:** `.github/workflows/ci.yml` (PostgreSQL 16 + Redis 7 + Meilisearch)

---

*End of Handoff Document*