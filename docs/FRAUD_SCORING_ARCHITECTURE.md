# Fraud Scoring Architecture

> **Created:** 2026-04-23
> **Status:** ACTIVE
> **Goal:** Unify fraud scoring implementation across TypeScript and Python

---

## Current State

### TypeScript Implementation
- **Location:** `lib/fraud-scoring/scorer.ts` + `signal-detectors.ts`
- **Status:** Primary implementation
- **Signals:** 42+ fraud signals detected

### Python Implementation
- **Location:** `backend/app/ai/` + `backend/app/analytics/scoring.py`
- **Status:** Legacy, to be removed
- **Signals:** Duplicate signals with different algorithms

---

## Decision

**Choose TypeScript as the single source of truth for fraud scoring.**

### Rationale
1. **Next.js Only backend** (ADR-001) means TypeScript is primary
2. **Prisma ORM** only works with TypeScript
3. **Single codebase** reduces maintenance burden
4. **Python AI/ML** can be added later as microservice if needed

---

## Migration Plan

### Phase 1: Document TypeScript Implementation
- [x] Audit existing TypeScript fraud scoring code
- [ ] Document all signal detectors
- [ ] Document scoring algorithm
- [ ] Document risk level thresholds

### Phase 2: Remove Python Implementation
- [ ] Remove `backend/app/ai/` directory
- [ ] Remove `backend/app/analytics/scoring.py`
- [ ] Update any frontend code calling Python endpoints
- [ ] Remove Python dependencies from requirements.txt

### Phase 3: Enhance TypeScript Implementation
- [ ] Add more signal detectors
- [ ] Improve scoring algorithm
- [ ] Add real-time scoring via API routes
- [ ] Add batch scoring via scripts

---

## Signal Detectors

### Financial Signals
- Revenue vs industry average
- Asset growth patterns
- Tax exemption revocation history
- Form 990 filing inconsistencies

### Network Signals
- Shared addresses with flagged entities
- Shared board members
- Related organization patterns

### Compliance Signals
- Regulatory actions history
- Legal proceedings
- Government contract violations

---

## Risk Level Thresholds

| Level | Score | Description |
|-------|-------|-------------|
| Low | 0-39 | Minimal risk indicators |
| Medium | 40-59 | Some risk indicators present |
| High | 60-79 | Multiple risk indicators |
| Critical | 80-100 | Severe risk indicators |

---

## API Endpoint

```typescript
// GET /api/fraud-scores?ein=123456789
interface FraudScoreResponse {
  ein: string;
  score: number;
  riskLevel: string;
  signals: FraudSignal[];
  updatedAt: string;
}
```

---

*This document supports C3: Single Backend Architecture decision.*