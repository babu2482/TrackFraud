# 0007: Fraud Scoring Algorithm - Weighted Signal Aggregation with Corroboration

## Status
Accepted

## Context

The platform needs to calculate a unified fraud risk score (0-100) for each entity based on multiple detected fraud signals. Each signal has different severity levels and impacts, and we need an algorithm that:

1. Combines multiple signals into a single interpretable score
2. Rewards corroboration (multiple signals in same category increase confidence)
3. Provides clear explanations for the calculated score
4. Maintains audit trail of scoring history

### Requirements from Priority 4 Task:
- Define first 5 charity fraud signals ✅
- Create weighted scoring algorithm
- Implement corroboration logic
- Persist scores with full explanation

## Decision

We will use a **weighted signal aggregation algorithm with category-based corroboration bonus**.

### Algorithm Specification (v1):

```typescript
function calculateScore(signals: FraudSignal[]): number {
  // Step 1: Sum weighted impacts from all signals
  let baseScore = sum(signals.map(s => severityWeight(s.severity) * signalSpecificWeight(s)))
  
  // Cap base score at 85 (leave room for corroboration bonus)
  baseScore = min(baseScore, 85)
  
  // Step 2: Calculate corroboration bonus
  const categoryCounts = groupByCategory(signals)
  const corroboratedCategories = filter(categoryCounts, count > 1)
  const corroborationBonus = min(corroboratedCategories.length * 5, 15)
  
  // Step 3: Final score (capped at 100)
  return min(baseScore + corroborationBonus, 100)
}

// Severity weights
function severityWeight(severity): number {
  switch(severity) {
    case 'critical': return 2.0
    case 'high': return 1.5
    case 'medium': return 1.0
    case 'low': return 0.5
  }
}
```

### Severity Impact Ranges:

| Severity | Base Impact Range | Example Signals |
|----------|------------------|-----------------|
| **Critical** | 25-50 points | IRS Auto-Revocation, Operating Post-Revocation |
| **High** | 15-25 points | Compensation >30%, Missing 2+ years filings, Asset ratio >30x |
| **Medium** | 10-20 points | Compensation 20-30%, Missing 1 year filing, Frequent name changes |
| **Low** | 3-10 points | Filing type downgrade, Minor anomalies |

### Risk Level Bands:

| Score Range | Risk Level | UI Color | Action Required |
|-------------|------------|----------|-----------------|
| 80-100 | Critical | 🔴 Red | Immediate investigation |
| 60-79 | High | 🟠 Orange | Priority review within 7 days |
| 40-59 | Medium | 🟡 Yellow | Review within 30 days |
| 0-39 | Low | 🟢 Green | Routine monitoring |

### Corroboration Logic:

When multiple signals appear in the same category (e.g., both "high compensation" AND "low program expenses" in financial category), we add **+5 points per corroborated category** (max +15).

Rationale: Multiple independent red flags in the same domain significantly increase fraud probability compared to a single isolated anomaly.

## Alternatives Considered

### Alternative A: Simple Sum of Signal Impacts
**Why not chosen:** Doesn't account for corroboration. An entity with 3 unrelated low-severity signals would score same as entity with 1 critical signal, even though the latter is more concerning.

### Alternative B: Machine Learning Model (Random Forest/Gradient Boosting)
**Why not chosen:** 
- Requires labeled training data (we don't have historical fraud determinations yet)
- Black box - can't explain "why" to users or regulators
- Overkill for MVP; can add later as Phase 3 enhancement

### Alternative C: Rule-Based Expert System (IF-THEN chains)
**Why not chosen:** 
- Becomes unmaintainable with many signals
- Hard to adjust weights without rewriting rules
- Less transparent than weighted scoring

### Alternative D (Chosen): Weighted Aggregation + Corroboration
**Benefits:**
- Transparent and explainable
- Easy to tune weights as we learn from real cases
- Mathematically sound but simple enough for non-technical stakeholders
- Corroboration bonus captures important domain insight
- Can be implemented without training data

## Consequences

### Positive:
1. **Immediate deployment** - No training data or ML infrastructure needed
2. **Explainable scores** - Every point can be traced to specific signals
3. **Adjustable weights** - Can fine-tune as we get feedback from investigators
4. **Audit trail** - Full history in `FraudSnapshot` table with methodology version

### Negative:
1. **Manual weight tuning required** - Need domain expert input to set initial weights
2. **May need recalibration** - As real fraud cases emerge, weights may need adjustment
3. **No predictive power beyond signals** - Won't catch novel fraud patterns (yet)

### Mitigations:
1. Document all weights and rationale in code comments ✅
2. Version the methodology (`methodologyVersion` field) to track changes
3. Plan for ML enhancement in Phase 3 once we have labeled data
4. Create admin UI for weight adjustment without code deployment (future)

## Implementation Details

### Database Schema:
```prisma
model FraudSnapshot {
  entityId           String   // Reference to CanonicalEntity
  score              Int      // 0-100 final score
  level              String   // 'low' | 'medium' | 'high' | 'critical'
  baseScore          Int?     // Score before corroboration bonus
  corroborationCount Int      // Number of categories with multiple signals
  activeSignalCount  Int      // Total number of contributing signals
  explanation        String?  // Human-readable summary
  methodologyVersion String   @default("v1")
  isCurrent          Boolean  @default(true)
  computedAt         DateTime
}
```

### Signal Weight Configuration:
All weights are configurable in `lib/fraud-scoring/signal-detectors.ts`:

```typescript
// Example from detectHighCompensationRatio()
scoreImpact: severity === 'critical' ? 25 : 
              severity === 'high' ? 20 : 15
```

## Related Documents

- [PROJECT_STATUS.md](../../PROJECT_STATUS.md) - Implementation tracking
- `lib/fraud-scoring/signal-detectors.ts` - Signal detection implementation
- `lib/fraud-scoring/scorer.ts` - Scoring algorithm implementation
- ADR 0006: Schema Coverage Strategy - Related data source decisions

## Future Enhancements (Phase 3)

1. **Machine Learning Augmentation**: Train ML model on scored entities + investigator outcomes to suggest weight adjustments
2. **Temporal Decay**: Reduce impact of old signals over time if no new evidence emerges
3. **Network Effects**: Boost scores for entities connected to confirmed fraud cases
4. **Adaptive Thresholds**: Automatically adjust signal thresholds based on statistical distributions

## Approval History

- **Created:** 2026-04-12 by TrackFraud Development Team
- **Approved:** Self-approved (technical implementation decision)
- **Methodology Version:** v1 (initial release)

---

*This is an Architecture Decision Record (ADR). Future changes to scoring algorithm should create a new ADR and increment methodologyVersion.*
