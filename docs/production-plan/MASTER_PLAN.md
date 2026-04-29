# TrackFraud Production-Ready Fraud Scoring System — Master Plan

> **Status:** DRAFT — Ready for Execution
> **Author:** Agent
> **Last Updated:** 2025-01-20
> **Target:** Production-Ready v1.0

---

## Executive Summary

TrackFraud has a rich data foundation (25M+ records across 20+ sources) and a well-designed fraud detection architecture. The current gap is **execution scope** — only 0.2% of charities are scored, healthcare/consumer/corporate categories lack per-entity detectors, and three ingestion sources (HHS, FDA, FTC) are empty despite having fixed scripts.

This plan brings the system to production-ready status by:
1. **Consolidating** two scoring systems into one
2. **Expanding** detection to healthcare and consumer categories
3. **Running** the full scoring pipeline at scale
4. **Fixing** signal quality issues
5. **Automating** the pipeline with monitoring
6. **Hardening** tests, CI/CD, and documentation

---

## Current State Assessment

### Data Inventory

| Source | Records | Linked to Entities | Status |
|--------|---------|-------------------|--------|
| Charity BMF | 1.95M | 1.95M | ✅ Complete |
| Charity Auto-Revocation | 49K | 6.8K (14%) | ⚠️ 86% unlinked |
| Charity 990-N Epostcards | 50K | 50K | ✅ Complete |
| Charity Publication 78 | 50K | 50K | ✅ Complete |
| Consumer Complaints | 5.16M | 5.16M | ✅ Complete |
| Healthcare Payments | 262K | 262K | ✅ Complete |
| Healthcare Recipients | 89K | 89K | ✅ Complete |
| OFAC Sanctions | 18.7K | Partial | ✅ Complete |
| Corporate Profiles | 8K | 8K | ✅ Complete |
| Government Awards | 100 | 100 | ✅ Complete |
| **HHS OIG Exclusions** | **0** | **0** | ❌ Empty — Script Fixed |
| **FDA Warning Letters** | **0** | **0** | ❌ Empty — Script Fixed |
| **FTC Data Breaches** | **0** | **0** | ❌ Empty — Script Fixed |
| SAM Exclusions | 3 | 3 | ⚠️ API Key Needed |

### Scoring State

| Metric | Value |
|--------|-------|
| Entities Scored | 4,525 / 1.95M charities (0.2%) |
| Critical Risk | 1,137 (25%) |
| High Risk | 24 (0.5%) |
| Medium Risk | 561 (12%) |
| Low Risk | 2,803 (62%) |
| Active Signals | 12,182 |
| Signal Distribution | 8,750 "not in pub78" + 2,994 "high compensation" + rest |

### Architecture Issues

1. **Dual Scoring Systems:** `scorer.ts` (batch, 0-100 scale) vs `fraud-meter.ts` (real-time API, different algorithm)
2. **Single Category Focus:** Charity detectors implemented; healthcare, consumer, corporate, sanctions lack per-entity detectors
3. **Weak Signal:** "Not in Pub 78" generates 8,750 false positives (Pub 78 is a 50K sample of 1.95M charities)
4. **Linking Gap:** 42K auto-revocation records don't match to charity profiles
5. **No Automation:** Pipeline runs manually; no scheduled execution
6. **Test Coverage:** Basic integration tests only; no unit tests for scoring logic

---

## Phase 1: Foundation — Data & Quality (Days 1-3)

### 1.1 Run Fixed Ingestion Scripts

**Goal:** Populate HHS, FDA, FTC data

**Scripts to Execute:**
```bash
# HHS OIG Exclusions (List of Excluded Individuals/Entities)
npx tsx scripts/ingest-hhs-oig-exclusions.ts

# FDA Warning Letters & Enforcement Reports
npx tsx scripts/ingest-fda-warning-letters.ts

# FTC Data Breach Database
npx tsx scripts/ingest-ftc-data-breach.ts

# Cabinet Members (historical data)
npx tsx scripts/ingest-cabinet-members.ts
```

**Expected Results:**
- HHS OIG: ~80K exclusions (current list)
- FDA Warning Letters: ~5K letters
- FTC Data Breach: ~500 breach records
- Cabinet Members: ~250 records

**Verification:**
```sql
SELECT 'HHSExclusion' as tbl, COUNT(*) as cnt FROM "HHSExclusion"
UNION ALL SELECT 'FDAWarningLetter', COUNT(*) FROM "FDAWarningLetter"
UNION ALL SELECT 'FTCDataBreach', COUNT(*) FROM "FTCDataBreach"
UNION ALL SELECT 'CabinetMember', COUNT(*) FROM "CabinetMember";
```

**Success Criteria:**
- [ ] HHSExclusion: >1,000 records
- [ ] FDAWarningLetter: >100 records
- [ ] FTCDataBreach: >50 records
- [ ] CabinetMember: >100 records
- [ ] No ingestion errors in logs

**Files Modified:**
- `docs/HANDOFF-fraud-sources-2026-04-28.md` — Update ingestion status
- `scripts/ingest-hhs-oig-exclusions.ts` — Minor fixes if needed
- `scripts/ingest-fda-warning-letters.ts` — Minor fixes if needed
- `scripts/ingest-ftc-data-breach.ts` — Minor fixes if needed

---

### 1.2 Fix Auto-Revocation Linking

**Problem:** 42,313 auto-revocation records don't link to charity profiles because EIN format mismatches exist.

**Root Cause:** IRS auto-revocation list uses different EIN formatting (e.g., `123456789` vs `12-3456789` vs `12345678`).

**Solution:**
```typescript
// Add EIN normalization to linking process
function normalizeEIN(ein: string): string {
  return ein.replace(/[-\s]/g, '').padStart(9, '0');
}

// In ingestion/linking script:
const normalizedAutoRevocations = autoRevocations.map(ar => ({
  ...ar,
  ein: normalizeEIN(ar.ein)
}));

// Link via normalized EIN
const matches = await prisma.charityProfile.findMany({
  where: {
    ein: { in: normalizedAutoRevocations.map(ar => normalizeEIN(ar.ein)) }
  }
});
```

**Create Script:** `scripts/link-auto-revocations.ts`

**Success Criteria:**
- [ ] Auto-revocation linked rate improves from 14% to >60%
- [ ] No false matches due to EIN collision
- [ ] Linking documented with methodology

**Files Created:**
- `scripts/link-auto-revocations.ts`

**Files Modified:**
- `lib/fraud-scoring/signal-detectors.ts` — Use normalized EIN in detection

---

### 1.3 Fix Weak Signals

**Problem:** `charity_not_in_pub78` generates 8,750 false positives because Publication 78 is a sample, not a complete list.

**Solution:** Replace with conditional logic:

```typescript
// OLD: Flag anyone not in Pub 78 who claims 501(c)(3)
// NEW: Only flag if they claim 501(c)(3) AND are in BMF AND not in Pub 78

if (profile.subsectionCode === 3 && profile.inBmf === true && !pub78Record) {
  // Only flag if they have active BMF record (not dormant)
  const hasRecentBmf = bmfRecords.some(r => 
    r.sourcePublishedAt > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  );
  
  if (hasRecentBmf) {
    signals.push({
      signalKey: "charity_not_in_pub78",
      severity: "medium", // Downgrade from medium
      scoreImpact: 10, // Reduce from 15
      // ...
    });
  }
}
```

**Also Deprecate:** `missing_filings_overdue` from `signal-definitions.ts` (batch version) because it flags entities with records older than 2 years, which is too aggressive for historical data.

**Success Criteria:**
- [ ] "Not in Pub 78" signals reduced by >50%
- [ ] "Missing filings" no longer flags historical entities
- [ ] Signal weights recalibrated

**Files Modified:**
- `lib/fraud-scoring/signal-detectors.ts` — Fix `detectAutoRevocationStatus()`
- `lib/fraud-scoring/signal-definitions.ts` — Fix `missing_filings_overdue` threshold

---

### 1.4 Consolidate Scoring Systems

**Problem:** Two systems exist:
- `scorer.ts` — Batch scoring with corroboration logic (used by pipeline)
- `fraud-meter.ts` — Real-time scoring used by API routes (different algorithm)

**Decision:** Keep `fraud-meter.ts` as the canonical scoring system. It's more sophisticated (handles corroboration, domains, continuous metrics).

**Action:**
1. Update `scorer.ts` to use `fraud-meter.ts` for score calculation
2. Update `detection-engine.ts` to generate `RiskSignal[]` compatible with `fraud-meter.ts`
3. Keep `scorer.ts` for batch processing, but delegate scoring to `fraud-meter.ts`
4. Update all API routes to use unified scoring

**Mapping:**
```
scorer.ts severity → fraud-meter.ts severity
critical → high
high → high
medium → medium
low → medium (fraud-meter doesn't have "low" severity)
```

```
scorer.ts score → fraud-meter.ts level
80-100 → severe
60-79 → high
40-59 → elevated
15-39 → guarded
0-14 → low
```

**Success Criteria:**
- [ ] All API routes use unified scoring
- [ ] Pipeline output matches API scoring logic
- [ ] No regression in score distribution
- [ ] Documentation updated

**Files Modified:**
- `lib/fraud-scoring/scorer.ts` — Delegate to `fraud-meter.ts`
- `lib/fraud-scoring/detection-engine.ts` — Generate `RiskSignal[]`
- `app/api/fraud-scores/route.ts` — Use unified scoring
- `docs/FRAUD_SCORING.md` — Updated architecture

**Files Created:**
- `lib/fraud-scoring/score-adapter.ts` — Bridge between detection and meter

---

## Phase 2: Pipeline — Scale & Automate (Days 4-6)

### 2.1 Run Full Charity Scoring Pipeline

**Goal:** Score all 1.95M charity entities

**Current Limitation:** Pipeline runs in batches of 100. At this rate, scoring 1.95M entities would take ~19,500 batches × ~50ms = ~975 seconds (~16 minutes). Acceptable.

**Pre-Run:**
```bash
# First, run ingestion to get fresh data
npx tsx scripts/ingest-irs-auto-revocation.ts
npx tsx scripts/ingest-irs-eo-bmf.ts
npx tsx scripts/ingest-irs-pub78.ts
npx tsx scripts/ingest-irs-990n.ts
```

**Execution:**
```bash
# Phase 1: Signal Detection
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --detect-only

# Phase 2: Scoring (reuses existing signals + new ones)
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --score-only

# Or full pipeline:
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity
```

**Monitoring:**
```bash
# Watch progress in real-time
docker exec trackfraud-postgres psql -U trackfraud -d trackfraud -c "
SELECT level, COUNT(*) as cnt 
FROM FraudSnapshot WHERE isCurrent=true 
GROUP BY level 
ORDER BY CASE level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END;
"
```

**Success Criteria:**
- [ ] 1.95M charities scored
- [ ] Distribution makes sense (<5% critical, <20% high/medium)
- [ ] No database timeouts or memory issues
- [ ] Pipeline completes in <2 hours

**Post-Run Analysis:**
```sql
-- Score distribution
SELECT level, COUNT(*) as cnt, 
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) as pct
FROM FraudSnapshot WHERE isCurrent=true AND entityId IN (
  SELECT id FROM CanonicalEntity WHERE categoryId = 'charities'
)
GROUP BY level;

-- Top signals after full run
SELECT signalKey, COUNT(*) as cnt
FROM FraudSignalEvent 
WHERE status = 'active' 
  AND entityId IN (SELECT id FROM CanonicalEntity WHERE categoryId = 'charities')
GROUP BY signalKey 
ORDER BY cnt DESC 
LIMIT 20;
```

**Files Modified:**
- `scripts/run-fraud-analysis-pipeline.ts` — Add progress logging, error recovery

---

### 2.2 Add Healthcare Entity Detectors

**Goal:** Score 89K healthcare recipients

**Data Available:**
- 262K payment records
- 89K recipient profiles
- HHS exclusions (after Phase 1.1)
- CMS Program Safeguard exclusions

**New Detectors:** `lib/fraud-scoring/healthcare-detectors.ts`

| Signal | What It Detects | Threshold | Score Impact |
|--------|----------------|-----------|--------------|
| Excluded Provider Billing | On HHS exclusion list but has payments | Any match | 50 pts |
| High Payment Concentration | >50% payments from single company | >50% | 20 pts |
| Structured Payments | >50 small payments (<$100) in year | >50 payments | 15 pts |
| Rapid Volume Growth | >2x year-over-year payment increase | >2x | 10 pts |
| CMS Safeguard Exclusion | On CMS Program Safeguard list | Any match | 40 pts |

**Implementation:**
```typescript
export async function detectHealthcareSignals(
  entityId: string,
): Promise<RiskSignal[]> {
  const signals: RiskSignal[] = [];
  
  // Check HHS exclusion
  const isExcluded = await checkHHSExclusion(entityId);
  if (isExcluded) {
    signals.push(makeSignal('high', {
      key: 'hc_excluded_billing',
      label: 'Excluded Provider with Active Payments',
      detail: 'Provider on HHS exclusion list has received payments',
    }));
  }
  
  // Check payment concentration
  const concentration = await calculatePaymentConcentration(entityId);
  if (concentration > 0.5) {
    signals.push(makeSignal('high', {
      key: 'hc_payment_concentration',
      label: 'High Payment Concentration',
      detail: `${(concentration * 100).toFixed(1)}% of payments from single source`,
      value: concentration,
      threshold: 0.5,
    }));
  }
  
  // ... more detectors
  
  return signals;
}
```

**Success Criteria:**
- [ ] 89K healthcare recipients scored
- [ ] Excluded providers correctly flagged
- [ ] Payment concentration signals working
- [ ] Pipeline includes healthcare category

**Files Created:**
- `lib/fraud-scoring/healthcare-detectors.ts`
- `lib/healthcare-analysis.ts` — Extend existing with scoring signals

**Files Modified:**
- `scripts/run-fraud-analysis-pipeline.ts` — Add healthcare category

---

### 2.3 Add Consumer Entity Detectors

**Goal:** Score consumer-facing companies

**Data Available:**
- 5.16M consumer complaints
- Company profiles in ConsumerCompanySummary

**New Detectors:** `lib/fraud-scoring/consumer-detectors.ts`

| Signal | What It Detects | Threshold | Score Impact |
|--------|----------------|-----------|--------------|
| High Complaint Volume | >100 complaints/year | >100 | 20 pts |
| Low Response Rate | <20% company response rate | <20% | 15 pts |
| Repeat Issues | Same issue >30% of complaints | >30% | 10 pts |
| FTC Data Breach | Company in FTC breach database | Any match | 25 pts |
| Non-Timely Response | <50% timely responses | <50% | 10 pts |

**Success Criteria:**
- [ ] Consumer companies scored
- [ ] Complaint volume correctly calculated
- [ ] FTC breach data linked (after Phase 1.1)

**Files Created:**
- `lib/fraud-scoring/consumer-detectors.ts`

---

### 2.4 Add Sanctions Cross-Referencing

**Goal:** Cross-reference entities against OFAC and SAM exclusions

**Data Available:**
- 18.7K OFAC sanctions (11.3K entities, 7.4K individuals)
- 3 SAM exclusions (need API key for more)

**New Detectors:** `lib/fraud-scoring/sanctions-detectors.ts`

| Signal | What It Detects | Threshold | Score Impact |
|--------|----------------|-----------|--------------|
| OFAC Sanction Match | Name matches OFAC SDN list | Any match | 60 pts |
| SAM Exclusion | On SAM.gov exclusion list | Any match | 45 pts |
| Multi-List Match | On 2+ exclusion lists | >1 list | 10 pts bonus |

**Name Matching Strategy:**
```typescript
// Fuzzy matching for sanctions
function nameMatches(candidate: string, target: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const c = normalize(candidate);
  const t = normalize(target);
  
  // Exact match
  if (c === t) return true;
  
  // Contains match (one name contains the other)
  if (c.includes(t) || t.includes(c)) return true;
  
  // Levenshtein distance < 3 for short names
  if (c.length < 20 && levenshtein(c, t) <= 3) return true;
  
  return false;
}
```

**Success Criteria:**
- [ ] OFAC matches found for corporate/healthcare entities
- [ ] SAM exclusions cross-referenced
- [ ] Fuzzy matching reduces false negatives

**Files Created:**
- `lib/fraud-scoring/sanctions-detectors.ts`
- `lib/string-match.ts` — Name matching utilities

---

## Phase 3: Automation & Reliability (Days 7-9)

### 3.1 Scheduled Pipeline Execution

**Goal:** Automated daily scoring with monitoring

**Cron Configuration:**
```bash
# Add to crontab or use a task scheduler
0 2 * * * cd /app && npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity >> /logs/pipeline-charity.log 2>&1
30 2 * * * cd /app && npx tsx scripts/run-fraud-analysis-pipeline.ts --category healthcare >> /logs/pipeline-healthcare.log 2>&1
0 3 * * * cd /app && npx tsx scripts/run-fraud-analysis-pipeline.ts --category consumer >> /logs/pipeline-consumer.log 2>&1
30 3 * * * cd /app && npx tsx scripts/run-fraud-analysis-pipeline.ts --category sanctions >> /logs/pipeline-sanctions.log 2>&1
```

**Docker Implementation:**
```yaml
# Add to docker-compose.yml
pipeline-scheduler:
  image: alpine/cron
  volumes:
    - ./scripts:/app/scripts
    - ./docker-compose.yml:/app/docker-compose.yml
  environment:
    - CRON_SCHEDULE="0 2 * * *"
```

**Success Criteria:**
- [ ] Pipeline runs automatically daily
- [ ] Logs are captured and accessible
- [ ] Failed runs are detected and alerted

**Files Created:**
- `scripts/schedule-pipeline.sh` — Pipeline scheduler wrapper

**Files Modified:**
- `docker-compose.yml` — Add scheduler service (optional)
- `scripts/run-fraud-analysis-pipeline.ts` — Add logging and error reporting

---

### 3.2 Monitoring & Alerting

**Goal:** Detect pipeline failures and score anomalies

**Health Check Endpoint:**
```typescript
// app/api/admin/fraud-health/route.ts
export async function GET() {
  const [
    lastRun,
    totalScored,
    scoreDistribution,
    signalCount,
    ingestionStatus
  ] = await Promise.all([
    // ... queries
  ]);
  
  const health = {
    pipeline: {
      lastRun,
      lastRunAge: Date.now() - lastRun.getTime(),
      healthy: lastRun.getTime() > Date.now() - 24 * 60 * 60 * 1000
    },
    scoring: {
      totalScored,
      distribution: scoreDistribution,
      anomaly: detectAnomaly(scoreDistribution)
    },
    ingestion: ingestionStatus
  };
  
  return NextResponse.json(health);
}
```

**Alert Thresholds:**
- Pipeline not run in 24 hours → Alert
- Score distribution shifts >20% from previous day → Alert
- Ingestion source returns 0 records → Alert
- Error rate >5% in pipeline → Alert

**Success Criteria:**
- [ ] Health endpoint returns pipeline status
- [ ] Anomalies detected in score distribution
- [ ] Alerts configured (can use simple email or webhook)

**Files Created:**
- `app/api/admin/fraud-health/route.ts`
- `lib/fraud-monitoring.ts` — Health check and anomaly detection

---

### 3.3 Pipeline Error Recovery

**Goal:** Handle failures gracefully and resume

**Implementation:**
```typescript
// In run-fraud-analysis-pipeline.ts
async function runPipelineWithRecovery(options: PipelineOptions) {
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await runPipeline(options);
      await markPipelineSuccessful(options.category);
      return;
    } catch (error) {
      await logPipelineError(options.category, error, attempt);
      
      if (attempt === maxRetries) {
        await sendAlert(`Pipeline failed after ${maxRetries} attempts`);
        throw error;
      }
      
      // Exponential backoff
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
}

// Track last successful run
async function markPipelineSuccessful(category: string) {
  await prisma.pipelineRun.create({
    data: {
      category,
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date()
    }
  });
}
```

**Success Criteria:**
- [ ] Pipeline retries on failure
- [ ] Failed runs logged with details
- [ ] Recovery point tracking (resume from last success)

**Files Modified:**
- `scripts/run-fraud-analysis-pipeline.ts` — Add error recovery
- `prisma/schema.prisma` — Add PipelineRun model

---

## Phase 4: Testing & Quality (Days 10-11)

### 4.1 Unit Tests for Scoring Logic

**Goal:** Comprehensive test coverage for fraud scoring

**Test Files to Create:**
```
tests/unit/
├── fraud-meter.test.ts
├── signal-detectors.test.ts
├── detection-engine.test.ts
├── scorer.test.ts
├── healthcare-detectors.test.ts
├── consumer-detectors.test.ts
└── sanctions-detectors.test.ts
```

**Example Test:**
```typescript
// tests/unit/fraud-meter.test.ts
describe('Fraud Meter', () => {
  it('should calculate correct score for charity with revocation', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [
        { key: 'revocation', severity: 'high', label: 'IRS Revocation', detail: '...' }
      ],
      externalCorroboration: []
    });
    
    expect(meter.score).toBeGreaterThanOrEqual(50);
    expect(meter.level).toBe('high' || 'severe');
  });
  
  it('should apply corroboration bonus', () => {
    const meter = buildFraudMeter({
      domain: 'charities',
      riskSignals: [
        { key: 'revocation', severity: 'high', label: 'Revocation', detail: '...' },
        { key: 'not_in_pub78', severity: 'medium', label: 'Not in Pub 78', detail: '...' }
      ],
      externalCorroboration: [
        { category: 'revocation', severity: 'high', ... }
      ]
    });
    
    expect(meter.corroborationCount).toBe(1);
    expect(meter.score).toBeGreaterThan(
      buildFraudMeter({
        domain: 'charities',
        riskSignals: [
          { key: 'revocation', severity: 'high', label: 'Revocation', detail: '...' }
        ],
        externalCorroboration: []
      }).score
    );
  });
});
```

**Success Criteria:**
- [ ] 90%+ coverage for `lib/fraud-meter.ts`
- [ ] 80%+ coverage for `lib/fraud-scoring/*`
- [ ] All new detectors have tests
- [ ] Tests pass in CI

**Files Created:**
- `tests/unit/fraud-meter.test.ts`
- `tests/unit/signal-detectors.test.ts`
- `tests/unit/detection-engine.test.ts`
- `tests/unit/scorer.test.ts`
- `tests/unit/healthcare-detectors.test.ts`
- `tests/unit/consumer-detectors.test.ts`
- `tests/unit/sanctions-detectors.test.ts`

---

### 4.2 Integration Tests for Pipeline

**Goal:** End-to-end test of scoring pipeline

**Test:**
```typescript
// tests/integration/pipeline.test.ts
describe('Fraud Analysis Pipeline', () => {
  it('should score entities end-to-end', async () => {
    // 1. Create test entity with known fraud indicators
    const entity = await createTestCharity({
      ein: '12-3456789',
      name: 'Test Charity',
      hasAutoRevocation: true,
      hasHighCompensation: true
    });
    
    // 2. Run detection
    const signals = await detectAllCharitySignals(entity.entityId);
    expect(signals.length).toBeGreaterThanOrEqual(2);
    
    // 3. Run scoring
    const score = await calculateFraudScore(signals);
    expect(score.score).toBeGreaterThan(0);
    expect(score.level).not.toBe('low');
    
    // 4. Verify snapshot created
    const snapshot = await prisma.fraudSnapshot.findFirst({
      where: { entityId: entity.entityId, isCurrent: true }
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot!.score).toBe(score.score);
    
    // Cleanup
    await cleanupTestEntity(entity.entityId);
  });
});
```

**Success Criteria:**
- [ ] Pipeline test passes
- [ ] Test data cleanup works
- [ ] Tests can run in isolation

**Files Created:**
- `tests/integration/pipeline.test.ts`

---

### 4.3 E2E Tests for API

**Goal:** Verify fraud scoring API works end-to-end

**Test:**
```typescript
// tests/e2e/fraud-scores.test.ts
describe('Fraud Scores API', () => {
  it('GET /api/fraud-scores?entityId=X returns valid score', async () => {
    const res = await fetch(`http://localhost:3001/api/fraud-scores?entityId=${testEntityId}`);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.hasScore).toBe(true);
    expect(data.current.score).toBeGreaterThanOrEqual(0);
    expect(data.current.score).toBeLessThanOrEqual(100);
    expect(data.current.level).toMatch(/^(low|guarded|elevated|high|severe)$/);
  });
  
  it('POST /api/fraud-scores triggers recalculation', async () => {
    const res = await fetch('http://localhost:3001/api/fraud-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: testEntityId, detectSignals: true })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.signalsDetected).toBeGreaterThanOrEqual(0);
  });
});
```

**Success Criteria:**
- [ ] API tests pass
- [ ] Score recalculation works
- [ ] Error handling verified

**Files Created:**
- `tests/e2e/fraud-scores.test.ts`

---

### 4.4 Update CI/CD

**Goal:** Run fraud scoring tests in CI

**Changes to `.github/workflows/ci.yml`:**
```yaml
- name: Run fraud scoring tests
  run: npm test -- tests/unit/fraud-*.test.ts tests/integration/pipeline.test.ts

- name: Run pipeline smoke test
  run: npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 100 --score-only
```

**Success Criteria:**
- [ ] CI runs fraud tests
- [ ] Pipeline smoke test in CI
- [ ] No CI failures

**Files Modified:**
- `.github/workflows/ci.yml`

---

## Phase 5: Documentation & Handoff (Days 12-13)

### 5.1 Update FRAUD_SCORING.md

**Goal:** Accurate documentation of scoring system

**Content:**
```markdown
# Fraud Scoring System

## Architecture
- `fraud-meter.ts` — Canonical scoring engine
- `lib/fraud-scoring/*` — Signal detectors by category
- `scripts/run-fraud-analysis-pipeline.ts` — Orchestration

## Signal Categories
| Category | Detectors | Data Sources |
|----------|-----------|--------------|
| Charity | 7 signals | IRS BMF, Auto-Revocation, Pub 78, 990-N |
| Healthcare | 5 signals | CMS Open Payments, HHS OIG, CMS Safeguard |
| Consumer | 5 signals | CFPB Complaints, FTC Breach |
| Sanctions | 3 signals | OFAC, SAM.gov |

## Scoring Algorithm
[Detailed explanation]

## Running the Pipeline
[Commands and options]

## Monitoring
[Health checks and alerts]
```

**Success Criteria:**
- [ ] Documentation matches code
- [ ] Examples provided
- [ ] Architecture diagram included

**Files Modified:**
- `docs/FRAUD_SCORING.md`

---

### 5.2 Create System Architecture Diagram

**Goal:** Visual representation of the system

**Content:** Text-based Mermaid diagram

```mermaid
graph TB
    subgraph Data Sources
        IRS[IRS BMF/990]
        HHS[HHS OIG]
        CMS[CMS Payments]
        CFPB[CFPB Complaints]
        OFAC[OFAC Sanctions]
        FTC[FTC Breach]
    end
    
    subgraph Ingestion Layer
        Scripts[Ingestion Scripts]
        DB[(PostgreSQL)]
    end
    
    subgraph Detection Layer
        Charity[Charity Detectors]
        Health[Healthcare Detectors]
        Consumer[Consumer Detectors]
        Sanctions[Sanctions Detectors]
    end
    
    subgraph Scoring Layer
        Meter[Fraud Meter]
        Adapter[Score Adapter]
    end
    
    subgraph API Layer
        Scores[Fraud Scores API]
        Health[Fraud Health API]
        Metrics[Fraud Metrics API]
    end
    
    subgraph Frontend
        Dashboard[Fraud Dashboard]
        Entity[Entity Pages]
        Search[Search Results]
    end
    
    IRS --> Scripts
    HHS --> Scripts
    CMS --> Scripts
    CFPB --> Scripts
    OFAC --> Scripts
    FTC --> Scripts
    
    Scripts --> DB
    
    DB --> Detection Layer
    Detection --> Meter
    Meter --> DB
    Meter --> API
    
    API --> Dashboard
    API --> Entity
    API --> Search
```

**Success Criteria:**
- [ ] Diagram created
- [ ] Added to documentation

**Files Created:**
- `docs/ARCHITECTURE.md`

---

### 5.3 Create Runbook

**Goal:** Operations guide for running the system

**Content:**
```markdown
# Fraud Scoring Runbook

## Daily Checks
1. Verify pipeline ran: `GET /api/admin/fraud-health`
2. Check for failed ingestion: `GET /api/admin/ingestion-status`
3. Review anomaly alerts

## Running Manual Pipeline
```bash
# Single category
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity

# All categories
for cat in charity healthcare consumer sanctions; do
  npx tsx scripts/run-fraud-analysis-pipeline.ts --category $cat
done
```

## Emergency Procedures
1. If pipeline stuck: Kill process, clear temp data, restart
2. If scores look wrong: Check signal definitions, re-run detection
3. If database slow: Check table locks, vacuum analyze

## Monitoring Queries
```sql
-- Recent pipeline runs
SELECT * FROM PipelineRun ORDER BY startedAt DESC LIMIT 10;

-- Score distribution
SELECT level, COUNT(*) FROM FraudSnapshot WHERE isCurrent=true GROUP BY level;

-- Failed signals
SELECT * FROM FraudSignalEvent WHERE status = 'error' ORDER BY observedAt DESC;
```
```

**Success Criteria:**
- [ ] Runbook covers common operations
- [ ] Emergency procedures documented
- [ ] Monitoring queries provided

**Files Created:**
- `docs/RUNBOOK.md`

---

## Phase 6: Production Hardening (Days 14-15)

### 6.1 Performance Optimization

**Goal:** Ensure pipeline can handle 2M+ entities

**Optimizations:**
1. **Batch Processing:** Increase batch size from 100 to 500
2. **Database Indexes:** Add indexes for common queries
3. **Connection Pooling:** Configure Prisma pool size
4. **Caching:** Cache entity lookups in Redis

**New Indexes:**
```sql
-- For auto-revocation detection
CREATE INDEX idx_charity_ein_normalized ON CharityProfile (lower(regexp_replace(ein, '[-\s]', '', 'g')));

-- For signal aggregation
CREATE INDEX idx_fraud_signal_entity_active ON FraudSignalEvent (entityId) WHERE status = 'active';

-- For snapshot lookup
CREATE INDEX idx_fraud_snapshot_current ON FraudSnapshot (entityId) WHERE isCurrent = true;

-- For healthcare payments
CREATE INDEX idx_healthcare_payments_recipient ON HealthcarePaymentRecord (recipientEntityId);
```

**Success Criteria:**
- [ ] Pipeline processes 1M entities in <1 hour
- [ ] API response time <500ms for 95th percentile
- [ ] Database queries optimized

**Files Modified:**
- `prisma/schema.prisma` — Add indexes
- `scripts/run-fraud-analysis-pipeline.ts` — Increase batch size
- `lib/db.ts` — Configure connection pool

---

### 6.2 Security Hardening

**Goal:** Secure the fraud scoring system

**Actions:**
1. **Rate Limiting:** Add rate limiting to fraud score API
2. **CORS:** Restrict API access to known domains
3. **Input Validation:** Validate all API inputs
4. **Audit Logging:** Log all fraud score accesses

**Rate Limiting:**
```typescript
// Middleware
import { rateLimit } from 'express-rate-limit';

export const fraudScoreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many fraud score requests'
});
```

**Success Criteria:**
- [ ] Rate limiting configured
- [ ] Input validation in place
- [ ] Audit logging enabled

**Files Modified:**
- `app/api/fraud-scores/route.ts` — Add validation
- `middleware.ts` — Add rate limiting

---

### 6.3 Backup & Recovery

**Goal:** Ensure data is backed up and recoverable

**Actions:**
1. **Database Backups:** Daily pg_dump
2. **Point-in-Time Recovery:** Enable WAL archiving
3. **Test Restore:** Monthly restore test

**Backup Script:**
```bash
#!/bin/bash
# scripts/backup-fraud-data.sh

BACKUP_DIR="/backups/trackfraud"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/fraud_data_$DATE.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump database
pg_dump -h localhost -p 5433 -U trackfraud trackfraud | gzip > "$BACKUP_FILE"

# Keep only last 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
  echo "Backup successful: $BACKUP_FILE"
else
  echo "Backup failed!"
  exit 1
fi
```

**Success Criteria:**
- [ ] Daily backups configured
- [ ] Backup verification working
- [ ] Restore tested

**Files Created:**
- `scripts/backup-fraud-data.sh`

---

## Execution Timeline

| Week | Phase | Deliverables |
|------|-------|-------------|
| **Days 1-3** | Foundation | HHS/FDA/FTC data loaded, auto-revocation linking fixed, signals de-duplicated, scoring consolidated |
| **Days 4-6** | Pipeline | Full charity scoring complete, healthcare/consumer detectors implemented, sanctions cross-referencing |
| **Days 7-9** | Automation | Scheduled pipeline, monitoring/alerting, error recovery |
| **Days 10-11** | Testing | Unit tests, integration tests, E2E tests, CI/CD updated |
| **Days 12-13** | Documentation | FRAUD_SCORING.md updated, architecture diagram, runbook |
| **Days 14-15** | Hardening | Performance optimization, security, backups |

**Total Timeline:** 15 days (3 weeks)

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Charities Scored | 4,525 (0.2%) | 1.95M (100%) |
| Healthcare Scored | 0 | 89K (100%) |
| Consumer Scored | 0 | All companies |
| HHS Data | 0 records | 80K+ records |
| FDA Data | 0 records | 5K+ records |
| FTC Data | 0 records | 500+ records |
| Auto-Revocation Linked | 14% | 60%+ |
| Pipeline Automation | Manual | Daily scheduled |
| Test Coverage | Basic | 80%+ fraud code |
| API Response Time | Unknown | <500ms |
| CI/CD Fraud Tests | None | All fraud tests |

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Pipeline timeout on 1.95M entities | High | Batch processing, progress tracking, resume capability |
| Memory issues during scoring | Medium | Streaming queries, connection pooling |
| Signal quality regression | High | Test coverage, manual review of sample |
| Database locks during scoring | Medium | Maintenance windows, query optimization |
| Scoring inconsistency | High | Unified scoring system, deterministic algorithms |
| Data leakage | High | Access controls, audit logging, rate limiting |

---

## Dependencies

### Required
- PostgreSQL 16+ (running)
- Prisma Client (installed)
- Node.js 20+ (installed)
- TypeScript 5+ (installed)

### Optional
- SAM.gov API key (for full SAM exclusions)
- External alerting system (email, Slack, etc.)
- Additional ingestion sources (as needed)

### External Services
- IRS EO BMF (free)
- IRS Auto-Revocation (free)
- IRS Publication 78 (free)
- HHS OIG LEIE (free)
- FDA Warning Letters (free)
- FTC Data Breach (free)
- OFAC SDN (free)
- CFPB Complaints (free)
- CMS Open Payments (free)

---

## Handoff Checklist

### Pre-Handoff
- [ ] All phases completed
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Runbook created
- [ ] Monitoring configured
- [ ] Backups verified

### Knowledge Transfer
- [ ] Architecture walkthrough completed
- [ ] Code review sessions held
- [ ] Pipeline execution demonstrated
- [ ] Troubleshooting guide shared

### Post-Handoff
- [ ] 24-hour support period
- [ ] Bug fix SLA defined
- [ ] Feature request process established
- [ ] Regular review cadence set

---

## File Change Summary

### Files Created
1. `scripts/link-auto-revocations.ts` — EIN normalization and linking
2. `lib/fraud-scoring/score-adapter.ts` — Bridge between detection and meter
3. `lib/fraud-scoring/healthcare-detectors.ts` — Healthcare signal detection
4. `lib/fraud-scoring/consumer-detectors.ts` — Consumer signal detection
5. `lib/fraud-scoring/sanctions-detectors.ts` — Sanctions signal detection
6. `lib/string-match.ts` — Name matching utilities
7. `lib/fraud-monitoring.ts` — Health checks and anomaly detection
8. `app/api/admin/fraud-health/route.ts` — Pipeline health endpoint
9. `scripts/schedule-pipeline.sh` — Pipeline scheduler
10. `scripts/backup-fraud-data.sh` — Database backup script
11. `tests/unit/fraud-meter.test.ts` — Fraud meter tests
12. `tests/unit/signal-detectors.test.ts` — Signal detector tests
13. `tests/unit/detection-engine.test.ts` — Detection engine tests
14. `tests/unit/scorer.test.ts` — Scorer tests
15. `tests/unit/healthcare-detectors.test.ts` — Healthcare detector tests
16. `tests/unit/consumer-detectors.test.ts` — Consumer detector tests
17. `tests/unit/sanctions-detectors.test.ts` — Sanctions detector tests
18. `tests/integration/pipeline.test.ts` — Pipeline integration tests
19. `tests/e2e/fraud-scores.test.ts` — Fraud scores API tests
20. `docs/ARCHITECTURE.md` — System architecture
21. `docs/RUNBOOK.md` — Operations runbook
22. `docs/production-plan/PROGRESS.md` — Progress tracking
23. `docs/production-plan/HANDOFF.md` — Handoff document

### Files Modified
1. `lib/fraud-scoring/signal-detectors.ts` — Fix weak signals
2. `lib/fraud-scoring/signal-definitions.ts` — Fix thresholds
3. `lib/fraud-scoring/scorer.ts` — Delegate to fraud-meter
4. `lib/fraud-scoring/detection-engine.ts` — Generate RiskSignal[]
5. `app/api/fraud-scores/route.ts` — Unified scoring
6. `scripts/run-fraud-analysis-pipeline.ts` — Add logging, error recovery
7. `prisma/schema.prisma` — Add indexes, PipelineRun model
8. `lib/db.ts` — Connection pool configuration
9. `middleware.ts` — Rate limiting
10. `docs/FRAUD_SCORING.md` — Updated architecture
11. `.github/workflows/ci.yml` — Add fraud tests
12. `docker-compose.yml` — Add scheduler (optional)
13. `package.json` — Add backup script command

---

## Appendix: Quick Reference Commands

```bash
# Run full pipeline (all categories)
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity
npx tsx scripts/run-fraud-analysis-pipeline.ts --category healthcare
npx tsx scripts/run-fraud-analysis-pipeline.ts --category consumer
npx tsx scripts/run-fraud-analysis-pipeline.ts --category sanctions

# Run pipeline on subset (for testing)
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 1000

# Run detection only
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --detect-only

# Run scoring only (reuse existing signals)
npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --score-only

# Check pipeline health
curl http://localhost:3001/api/admin/fraud-health

# Check fraud metrics
curl http://localhost:3001/api/admin/fraud-metrics

# Get entity score
curl "http://localhost:3001/api/fraud-scores?entityId=<entity_id>"

# Trigger score recalculation
curl -X POST http://localhost:3001/api/fraud-scores \
  -H "Content-Type: application/json" \
  -d '{"entityId": "<entity_id>", "detectSignals": true}'

# Run database backup
./scripts/backup-fraud-data.sh

# Run tests
npm run test:coverage

# Run CI locally
npm run lint && npm run test && npm run build
```
