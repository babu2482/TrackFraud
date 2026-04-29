# Consumer Fraud Detectors — Handoff Document

**Created:** 2025-01-02
**Author:** Agent (qwen3.6-27b)
**Status:** ✅ Complete — implemented, tested, committed
**Commit:** `fbb4a5f`

---

## Summary

Implemented consumer-specific fraud signal detection in `lib/fraud-scoring/consumer-detectors.ts` with 5 signal detectors, aggregate runner, batch processing, persistence helpers, CLI entry point, and 39 unit tests.

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/fraud-scoring/consumer-detectors.ts` | Main implementation (657 lines) |
| `tests/unit/consumer-detectors.test.ts` | Unit tests (801 lines, 39 tests, all passing) |

---

## Signal Detectors Implemented

| # | Signal Key | Description | Threshold | Score | Severity | Data Source |
|---|------------|-------------|-----------|-------|----------|-------------|
| 1 | `high_complaint_volume` | CFPB complaints in last 12 months | >100 | 20–30 pts | high → critical | `ConsumerComplaintRecord.dateReceived` |
| 2 | `low_response_rate` | Company response rate to complaints | <20% | 15–20 pts | medium → high | `ConsumerComplaintRecord.companyResponse` |
| 3 | `repeat_issues` | Single issue category concentration | >30% | 10–15 pts | medium → high | `ConsumerComplaintRecord.issue` (raw SQL GROUP BY) |
| 4 | `ftc_data_breach` | Match in FTC data breach database | ≥1 match | 25–35 pts | high → critical | `FTCDataBreach.company` ↔ `CanonicalEntity.displayName` |
| 5 | `non_timely_response` | Timely response rate to complaints | <50% | 10–15 pts | low → medium | `ConsumerComplaintRecord.timely` ("Yes"/"No") |

### Severity Escalation Rules

- **high_complaint_volume:** 101–199 → high/20pts, 200–299 → high/25pts, 300+ → critical/30pts
- **low_response_rate:** 5–20% → medium/15pts, <5% → high/20pts
- **repeat_issues:** 30–60% → medium/10pts, ≥60% → high/15pts
- **ftc_data_breach:** <100k records → high/25pts, 100k+ → high/30pts, 1M+ → critical/35pts
- **non_timely_response:** 20–50% → low/10pts, <20% → medium/15pts

---

## API Surface

### Exported Functions

```typescript
// Individual detectors (all return DetectedSignal[])
detectHighComplaintVolume(entityId: string, sourceSystemId?: string)
detectLowResponseRate(entityId: string, sourceSystemId?: string)
detectRepeatIssues(entityId: string, sourceSystemId?: string)
detectFtcDataBreach(entityId: string, sourceSystemId?: string)
detectNonTimelyResponse(entityId: string, sourceSystemId?: string)

// Aggregate
detectAllConsumerSignals(entityId: string, sourceSystemId?: string)

// Persistence
persistConsumerSignals(signals: DetectedSignal[])

// Batch
batchDetectConsumerSignals(batchSize?: number, limit?: number)
```

### CLI Usage

```bash
# Single entity
tsx lib/fraud-scoring/consumer-detectors.ts single <entityId> [--persist]

# Batch mode
tsx lib/fraud-scoring/consumer-detectors.ts batch [limit]
```

---

## Design Decisions

### 1. Methodology Version "v2"
Aligned with the request. The existing `signal-detectors.ts` uses "v1" for charity signals.

### 2. categoryId: `"consumer"`
Discovered from `lib/consumer-storage.ts` and `lib/consumer-read.ts` — the codebase uses `"consumer"` (not `"consumer_companies"`) as the FraudCategory slug for consumer entities.

### 3. Prisma NOT filter pattern
Fixed initial `error TS1117` where `{ not: null, not: "" }` produced duplicate object keys. Replaced with:
```typescript
NOT: { OR: [{ issue: null }, { issue: "" }] }
```
This is the correct Prisma syntax for "not null AND not empty string."

### 4. Raw SQL for repeat_issues
Used `$queryRawUnsafe` for the GROUP BY / aggregation query because Prisma's `groupBy` has limited support for the specific aggregation pattern needed (COUNT by issue, ORDER BY DESC, LIMIT 1).

### 5. FTC breach matching
Uses case-insensitive exact match on `company` field via `{ equals: displayName, mode: "insensitive" }`. This is stricter than fuzzy matching but avoids false positives from partial name collisions.

### 6. Parallel detection in `detectAllConsumerSignals`
All 5 detectors run via `Promise.all()`, matching the pattern from `detectAllCharitySignals` in `signal-detectors.ts`. Each detector has its own try/catch, so one failure doesn't affect others.

### 7. Self-contained `DetectedSignal` interface
Re-exported the interface in this file (same shape as `signal-detectors.ts`) for file self-containment. Could be consolidated into a shared types file later.

### 8. Separate Prisma instance
Each detector file creates its own `new PrismaClient()`. This matches the existing pattern in `signal-detectors.ts`. Consider consolidating to a shared instance in `lib/db.ts` as future refactoring.

---

## Test Coverage (39 tests, all passing)

| Detector | Tests | Coverage |
|----------|-------|----------|
| `detectHighComplaintVolume` | 6 | Below threshold, at threshold, 200+, 300+, sourceSystemId passthrough, DB error |
| `detectLowResponseRate` | 5 | No complaints, rate >= 20%, rate < 20%, rate < 5%, DB error |
| `detectRepeatIssues` | 5 | Fewer than 10 complaints, concentration <= 30%, > 30%, >= 60%, DB error |
| `detectFtcDataBreach` | 7 | Entity not found, no displayName, no breach, breach found (<100k), 100k+, 1M+, multiple breaches, DB error |
| `detectNonTimelyResponse` | 5 | No timely data, rate >= 50%, rate < 50%, rate < 20%, DB error |
| `detectAllConsumerSignals` | 3 | No triggers, aggregation, error isolation |
| `persistConsumerSignals` | 3 | Empty array, upsert, re-throw on error |
| `batchDetectConsumerSignals` | 4 | Basic batch, categoryId filter, error continuation, signal detection across batch |

### Test Mocking Strategy
- Module-level `vi.mock("@prisma/client")` with a proper `class MockPrismaClient` constructor (not `vi.fn()`, which isn't callable with `new`).
- `vi.resetModules()` in `beforeEach` to get a fresh module evaluation per test.
- Global mutable `_globalPrismaMock` reference swapped before each import.
- Closure-based counters (`let _calls = 0`) instead of `mock.calls.length` for deterministic multi-call mocks.

---

## What Was Not Done (Future Work)

1. **Integration tests** — Only unit tests with mocked Prisma. Real DB integration tests would require seed data in `ConsumerComplaintRecord` and `FTCDataBreach`.

2. **Signal consolidation** — The `DetectedSignal` interface is duplicated in `consumer-detectors.ts`, `signal-detectors.ts`, and `score-adapter.ts`. Consider extracting to a shared `lib/fraud-scoring/types.ts`.

3. **Rate limit awareness** — The batch function doesn't implement any rate limiting between detector calls.

4. **Deduplication across runs** — `persistConsumerSignals` uses `entityId_signalKey_observedAt` composite upsert. If run multiple times in the same millisecond, could collide. Consider using a more granular timestamp or adding a run ID.

5. **Consumer complaint data enrichment** — The `repeat_issues` detector could benefit from hierarchical issue categorization (parent/child issue mapping) rather than raw string matching.

---

## Dependencies & Schema Reference

### Prisma Models Used
- `ConsumerComplaintRecord` — CFPB complaint data (entityId, issue, companyResponse, timely, dateReceived)
- `ConsumerCompanySummary` — Aggregated complaint summary (not directly queried but part of the same data domain)
- `FTCDataBreach` — FTC data breach records (company, recordsAffected, notificationDate, dataTypesExposed)
- `CanonicalEntity` — Entity registry (displayName for FTC breach matching, categoryId: "consumer")
- `FraudSignalEvent` — Signal persistence target (upsert with entityId_signalKey_observedAt composite key)

### Key Fields
| Model | Field | Type | Notes |
|-------|-------|------|-------|
| `ConsumerComplaintRecord` | `timely` | `String?` | Values: "Yes", "No", or null |
| `ConsumerComplaintRecord` | `companyResponse` | `String?` | Non-empty string = responded |
| `ConsumerComplaintRecord` | `issue` | `String?` | Free-text issue category |
| `FTCDataBreach` | `company` | `String` | Company name for matching |
| `FTCDataBreach` | `recordsAffected` | `Int?` | Can be null |

---

## Quick Verification Commands

```bash
# Run tests
npx vitest run tests/unit/consumer-detectors.test.ts

# TypeScript check (no errors expected)
npx tsc --noEmit --project tsconfig.json 2>&1 | grep consumer-detectors

# CLI single entity (requires live DB)
tsx lib/fraud-scoring/consumer-detectors.ts single <entityId> --persist

# CLI batch mode (requires live DB)
tsx lib/fraud-scoring/consumer-detectors.ts batch 10
```

---

## Related Files

| File | Relationship |
|------|-------------|
| `lib/fraud-scoring/signal-detectors.ts` | Pattern reference (charity signals, same architecture) |
| `lib/fraud-scoring/signal-definitions.ts` | Signal metadata definitions (CONSUMER_FRAUD_SIGNALS array) |
| `lib/fraud-scoring/score-adapter.ts` | Score computation layer (may consume these signals) |
| `lib/consumer-storage.ts` | Ingestion layer (populates ConsumerComplaintRecord) |
| `lib/consumer-read.ts` | Read layer (consumer complaint queries) |
| `prisma/schema.prisma` | Data models (L387-L443, L632-L649) |
| `tests/setup-prisma.ts` | Shared Prisma mocking infrastructure |
| `vitest.config.ts` | Test configuration |