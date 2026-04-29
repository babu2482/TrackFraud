# TrackFraud Production Plan — Progress Tracker

> **Last Updated:** 2025-01-20
> **Current Phase:** Phase 1 (Foundation) → Phase 2 (Pipeline) transition
> **Overall Progress:** ~45% of Phase 1-2 complete

---

## Executive Summary

The TrackFraud production plan is actively being executed. Core fraud scoring infrastructure has been built, weak signals have been fixed, new detectors for healthcare and consumer categories have been implemented, and the scoring systems have been consolidated. Remaining work includes running ingestion scripts, executing the full scoring pipeline, adding sanctions detectors, automation, and documentation.

---

## Phase-by-Phase Status

### Phase 1: Foundation — Data & Quality (Days 1-3)

| Task | Status | Details |
|------|--------|---------|
| **1.1 Run Fixed Ingestion Scripts** | ⏳ Pending | HHS, FDA, FTC scripts exist and are functional but haven't been executed yet |
| **1.2 Fix Auto-Revocation Linking** | ✅ Code Complete | `scripts/link-auto-revocations.ts` created with EIN normalization + fuzzy name matching. Needs to be executed against live DB |
| **1.3 Fix Weak Signals** | ✅ Complete | `charity_not_in_pub78` now requires recent BMF record (reduced false positives). `missing_filings` thresholds increased to 730/1095 days |
| **1.4 Consolidate Scoring Systems** | ✅ Complete | `scorer.ts` now delegates to `fraud-meter.ts` via `score-adapter.ts`. Unified scoring path established |

#### Phase 1.3 — Signal Fixes Applied

**`charity_not_in_pub78` (signal-detectors.ts):**
- Before: Flagged ANY 501(c)(3) not in Pub 78 → ~8,750 false positives
- After: Only flags entities with 501(c)(3) + active BMF record (published within 365 days) + not in Pub 78
- Score impact reduced from 15 → 10 points
- Methodology version bumped to "v2"

**`charity_missing_filings` (signal-detectors.ts):**
- Before: Flagged at 180 days (medium) and 365 days (high)
- After: Flagged at 730 days (medium) and 1095 days (high)
- Reduces false positives on historical entities that legitimately stopped filing
- Methodology version bumped to "v2"

#### Phase 1.4 — Files Created

- `lib/fraud-scoring/score-adapter.ts` — Bridge between batch detection and fraud-meter
- Functions: `mapSeverity()`, `mapLevelToDb()`, `detectedSignalToRisk()`, `categoryToDomain()`, `unifiedScore()`

#### Phase 1.2 — Auto-Revocation Linking Script

- `scripts/link-auto-revocations.ts` — EIN normalization + fuzzy name matching
- Methods: Exact EIN match → Fuzzy name+state match (Jaccard similarity ≥ 85%)
- Supports `--dry-run`, `--max-links`, `--ein-only` flags
- Estimated improvement: 14% → 60%+ linking rate

---

### Phase 2: Pipeline — Scale & Automate (Days 4-6)

| Task | Status | Details |
|------|--------|---------|
| **2.1 Run Full Charity Scoring Pipeline** | ⏳ Pending | Pipeline script updated, needs execution against 1.95M entities |
| **2.2 Add Healthcare Entity Detectors** | ✅ Complete | `lib/fraud-scoring/healthcare-detectors.ts` with 5 detectors |
| **2.3 Add Consumer Entity Detectors** | ✅ Complete | `lib/fraud-scoring/consumer-detectors.ts` with 5 detectors |
| **2.4 Add Sanctions Cross-Referencing** | ⏳ Pending | Needs `sanctions-detectors.ts` and `string-match.ts` |

#### Phase 2.2 — Healthcare Detectors (5 signals)

| Signal | Threshold | Score Impact | Severity |
|--------|-----------|-------------|----------|
| `excluded_provider_billing` | On HHS exclusion + has payments | 50 pts | critical |
| `payment_concentration` | >50% from single company | 20 pts | high |
| `structured_payments` | >50 small payments (<$100)/year | 15 pts | medium |
| `rapid_volume_growth` | >2x YoY payment increase | 10 pts | medium |
| `cms_safeguard_exclusion` | On CMS Program Safeguard list | 40 pts | high |

#### Phase 2.3 — Consumer Detectors (5 signals)

| Signal | Threshold | Score Impact | Severity |
|--------|-----------|-------------|----------|
| `high_complaint_volume` | >100 complaints/year | 20-30 pts | high→critical |
| `low_response_rate` | <20% response rate | 15-20 pts | medium→high |
| `repeat_issues` | >30% same issue category | 10-15 pts | medium→high |
| `ftc_data_breach` | Company in FTC breach DB | 25-35 pts | high→critical |
| `non_timely_response` | <50% timely responses | 10-15 pts | low→medium |

#### Pipeline Script Updates

`scripts/run-fraud-analysis-pipeline.ts` now supports:
- `--category charity` — 1.95M charity entities
- `--category healthcare` — 89K healthcare recipients
- `--category consumer` — Consumer complaint companies
- `--detect-only`, `--score-only`, `--limit N`, `--no-reindex`

---

### Phase 3: Automation & Reliability (Days 7-9)

| Task | Status | Details |
|------|--------|---------|
| **3.1 Scheduled Pipeline Execution** | ⏳ Pending | No cron/scheduler configured yet |
| **3.2 Monitoring & Alerting** | ✅ Code Complete | `app/api/admin/fraud-health/route.ts` created |
| **3.3 Pipeline Error Recovery** | ⏳ Pending | No retry logic or PipelineRun model yet |

#### Phase 3.2 — Fraud Health Endpoint

`GET /api/admin/fraud-health` returns:
- Pipeline health (last run, age, healthy flag)
- Scoring health (total scored, distribution, top signals, anomaly detection)
- Ingestion health (record counts for 10 sources, last sync time)
- Simple anomaly detection: flags if >50% of entities are critical/high

---

### Phase 4: Testing & Quality (Days 10-11)

| Task | Status | Details |
|------|--------|---------|
| **4.1 Unit Tests for Scoring Logic** | ✅ Partial | New tests added; existing fraud-meter tests unchanged |
| **4.2 Integration Tests for Pipeline** | ⏳ Pending | No pipeline integration test yet |
| **4.3 E2E Tests for API** | ⏳ Pending | Existing fraud-scores.spec.ts; needs updates |
| **4.4 Update CI/CD** | ✅ Complete | CI workflow updated with fraud scoring tests |

#### New Test Files Created

- `tests/unit/healthcare-detectors.test.ts` — 33 tests for healthcare detectors
- `tests/unit/score-adapter.test.ts` — 44 tests for score adapter
- Consumer-detectors tests created by parallel agent

#### CI/CD Updates

`.github/workflows/ci.yml` now includes:
- Dedicated fraud scoring test step (fraud-meter, score-adapter, healthcare, consumer)
- Pipeline smoke test (`--category charity --limit 100 --score-only --no-reindex`)

---

### Phase 5: Documentation & Handoff (Days 12-13)

| Task | Status | Details |
|------|--------|---------|
| **5.1 Update FRAUD_SCORING.md** | ⏳ Pending | Architecture changed; needs update |
| **5.2 Create System Architecture Diagram** | ⏳ Pending | ARCHITECTURE.md exists but not updated |
| **5.3 Create Runbook** | ⏳ Pending | RUNBOOK.md needs creation |

---

### Phase 6: Production Hardening (Days 14-15)

| Task | Status | Details |
|------|--------|---------|
| **6.1 Performance Optimization** | ⏳ Pending | Batch size, indexes, connection pooling |
| **6.2 Security Hardening** | ⏳ Pending | Rate limiting exists; needs audit logging |
| **6.3 Backup & Recovery** | ⏳ Pending | No backup script yet |

---

## Files Created in This Execution Session

### New Files
1. `scripts/link-auto-revocations.ts` — EIN normalization and linking (312 lines)
2. `lib/fraud-scoring/score-adapter.ts` — Bridge between detection and meter (184 lines)
3. `lib/fraud-scoring/healthcare-detectors.ts` — Healthcare signal detection (~740 lines)
4. `lib/fraud-scoring/consumer-detectors.ts` — Consumer signal detection (657 lines)
5. `app/api/admin/fraud-health/route.ts` — Pipeline health endpoint (307 lines)
6. `tests/unit/healthcare-detectors.test.ts` — 33 healthcare detector tests
7. `tests/unit/score-adapter.test.ts` — 44 score adapter tests
8. `docs/production-plan/PROGRESS.md` — This file

### Modified Files
1. `lib/fraud-scoring/signal-detectors.ts` — Fixed weak signals (v2 methodology)
2. `lib/fraud-scoring/scorer.ts` — Now delegates to fraud-meter via score-adapter
3. `scripts/run-fraud-analysis-pipeline.ts` — Added healthcare + consumer categories
4. `.github/workflows/ci.yml` — Added fraud scoring tests + pipeline smoke test

---

## Remaining Work (Priority Order)

### High Priority
1. **Run ingestion scripts** — HHS OIG, FDA Warning Letters, FTC Data Breaches
2. **Execute auto-revocation linking** — Run `link-auto-revocations.ts` against live DB
3. **Run full charity scoring pipeline** — Score 1.95M entities
4. **Create sanctions detectors** — `lib/fraud-scoring/sanctions-detectors.ts`
5. **Create `lib/string-match.ts`** — Name matching utilities for sanctions

### Medium Priority
6. **Add PipelineRun model** — For error recovery and tracking
7. **Add pipeline error recovery** — Retry logic with exponential backoff
8. **Configure scheduled pipeline** — Cron or Docker-based scheduling
9. **Create integration tests** — End-to-end pipeline tests
10. **Update FRAUD_SCORING.md** — Reflect new architecture

### Lower Priority
11. **Performance optimization** — Batch size increase, database indexes
12. **Security hardening** — Audit logging, input validation
13. **Backup & recovery** — Database backup script
14. **Create RUNBOOK.md** — Operations guide
15. **Update ARCHITECTURE.md** — System diagram

---

## Database State

| Metric | Value |
|--------|-------|
| Total Records | ~7.86M |
| Charity Entities | 1,952,238 |
| Healthcare Payments | 261,933 |
| Healthcare Recipients | ~89K |
| Consumer Complaints | 5,162,000 |
| Corporate Profiles | 8,000 |
| SEC Filings | 445,000 |
| OFAC Sanctions | 37,464 |
| HHS Exclusions | 0 (not ingested) |
| FDA Warning Letters | 0 (not ingested) |
| FTC Data Breaches | 0 (not ingested) |

### Scoring State
| Metric | Value |
|--------|-------|
| Entities Scored | ~4,525 charities (0.2%) |
| Active Signals | ~12,182 |
| Top Signal | `charity_not_in_pub78` (8,750 — will be reduced by v2 fix) |

---

## Commands for Remaining Tasks

```bash
# 1. Run ingestion scripts
npx tsx scripts/ingest-hhs-oig-exclusions.ts
npx tsx scripts/ingest-fda-warning-letters.ts
npx tsx scripts/ingest-ftc-data-breach.ts

# 2. Link auto-revocations (dry run first)
npx tsx scripts/link-auto-revocations.ts --dry-run
npx tsx scripts/link-auto-revocations.ts

# 3. Run charity scoring pipeline (limited test)
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 1000

# 4. Run healthcare scoring pipeline
npx tsx scripts/run-fraud-analysis-pipeline.ts --category healthcare --limit 1000

# 5. Run consumer scoring pipeline
npx tsx scripts/run-fraud-analysis-pipeline.ts --category consumer --limit 1000

# 6. Check pipeline health
curl http://localhost:3001/api/admin/fraud-health

# 7. Run tests
npm test
npx vitest run tests/unit/fraud-meter.test.ts tests/unit/score-adapter.test.ts
```

---

## Notes & Decisions

### Scoring System Consolidation
- **Decision:** Keep `fraud-meter.ts` as canonical engine (more sophisticated corroboration logic)
- `scorer.ts` delegates to `fraud-meter.ts` via `score-adapter.ts`
- Legacy `calculateFraudScore()` still exists for backwards compatibility
- All new scoring should use `unifiedScore()` from score-adapter

### Signal Methodology Versions
- "v1" — Original signal definitions (kept in existing data)
- "v2" — Updated thresholds and reduced false positives (new detections)

### Auto-Revocation Linking Strategy
- Primary: Exact EIN match after normalization (remove dashes, zero-pad to 9 digits)
- Fallback: Fuzzy name matching with Jaccard similarity ≥ 85% + state boost
- No linking if similarity < 70% — too risky for false positives

### Category Mapping
- Pipeline `--category charity` → DB `categoryId: "charities"`
- Pipeline `--category healthcare` → DB `categoryId: "healthcare"`
- Pipeline `--category consumer` → DB `categoryId: "consumer"`
