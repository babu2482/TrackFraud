# Fraud Scoring

Fraud scoring runs entirely in TypeScript. The engine analyzes entities across multiple signal categories to produce a risk score.

## Overview

| Component | File | Purpose |
|-----------|------|---------|
| Risk Engine | `lib/risk-scoring.ts` | Main scoring orchestration |
| Signal Detectors | `lib/fraud-scoring/signal-detectors.ts` | Individual signal detection |
| Detection Engine | `lib/fraud-scoring/detection-engine.ts` | Execute signals by category |
| Scorer | `lib/fraud-scoring/scorer.ts` | Score calculation and persistence |
| Signal Definitions | `lib/fraud-scoring/signal-definitions.ts` | Type definitions |

## How It Works

```
Entity Data → Signal Detectors → Detection Engine → Scorer → FraudSnapshot
                    ↑                                                    ↓
              Signal Definitions                              Store in Database
```

1. **Signal Detection:** Each detector examines entity data for specific fraud indicators
2. **Detection Engine:** Executes applicable signals by entity category, collects results
3. **Scoring:** Calculates weighted scores with corroboration bonuses
4. **Storage:** Results stored in `FraudSnapshot` table

## Risk Levels

| Level | Score | Description |
|-------|-------|-------------|
| Low | 0-39 | Minimal risk indicators |
| Medium | 40-59 | Some risk indicators present |
| High | 60-79 | Multiple risk indicators |
| Critical | 80-100 | Severe risk indicators |

## Signal Categories

### Financial Signals
- Revenue vs industry average anomalies
- Asset growth patterns
- Tax exemption revocation history
- Form 990 filing inconsistencies

### Network Signals
- Shared addresses with flagged entities
- Shared board members across organizations
- Related organization patterns

### Compliance Signals
- Regulatory actions history
- Legal proceedings
- Government contract violations

### Charity-Specific Signals
- Excessive compensation ratios
- Frequent name changes
- Missing Form 990 filings
- IRS auto-revocation status
- Asset-revenue anomalies

## Scoring Algorithm

1. Each signal produces a weighted score based on severity
2. Corroboration bonus: +5 points per corroborating category (max +15)
3. Final score mapped to risk level using thresholds
4. Results cached in `FraudSnapshot` with timestamp

## API Usage

```typescript
// Get fraud score for an entity
// GET /api/fraud-scores?ein=123456789
// GET /api/fraud-scores?cik=12345

interface FraudScoreResponse {
  ein?: string;
  cik?: string;
  score: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: FraudSignal[];
  updatedAt: string;
}
```

## Running Scoring

```bash
# Score all charities
npx tsx lib/risk-scoring.ts --entity-type charity

# Score specific entity
npx tsx lib/risk-scoring.ts --ein 123456789
```

## Adding New Signals

1. Add signal definition to `lib/fraud-scoring/signal-definitions.ts`
2. Implement detector in `lib/fraud-scoring/signal-detectors.ts`
3. Register in detection engine
4. Update weights in `lib/risk-scoring.ts`