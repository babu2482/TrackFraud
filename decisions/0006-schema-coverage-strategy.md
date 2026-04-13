# 0006: Schema Coverage Strategy - Phased Data Source Implementation

## Status
Accepted

## Context

During platform review, it was identified that the database schema does not cover all 52 data sources documented in `docs/DATA_SOURCES.md`. The current schema contains ~65 tables covering approximately 55% of documented sources. This raised questions about whether the system is "complete" or missing critical components.

### Key Findings from Schema Gap Analysis:

| Category | Documented Sources | Schema Coverage | Missing/Deferred |
|----------|-------------------|-----------------|------------------|
| SEC/Financial | 5 | 3 (60%) | Investment Adviser Admissions, CFTC Enforcement |
| Healthcare | 4 | 3 (75%) | HHS Sanctions Database (partial) |
| EPA | 3 | 1 (33%) | Environmental Justice Screening, Grants DB |
| Consumer Protection | 3 | 3 (100%) | ✅ Complete |
| FDA | 2 | 1 (50%) | Enforcement Reports |
| DOJ Fraud | 2 | 1 (50%) | Corporate Integrity Agreements |
| Treasury | 2 | 1 (50%) | FinCEN Enforcement |
| IRS | 2 | 1 (50%) | UDLI |
| Government Contracting | 1 | 1 (100%) | ✅ Complete |
| Nonprofit/Charity | 1 | 8+ tables (800%+) | ✅ Over-covered |
| Political | 4 | 3 (75%) | OpenSecrets API |
| State-Level | 2 | 0 (0%) | Both deferred (low priority) |

**Overall Coverage: ~55% of documented sources have dedicated schema tables.**

## Decision

We will adopt a **phased, priority-driven approach** to data source implementation rather than attempting complete upfront coverage. The current schema is considered "complete" for the following reasons:

1. **All HIGH PRIORITY sources from DATA_SOURCES.md are fully covered:**
   - SEC Enforcement Actions ✅
   - HHS OIG Exclusion List ✅
   - OFAC Sanctions List ✅
   - SAM.gov Exclusions ✅
   - ProPublica Nonprofits API ✅ (extensively)

2. **MEDIUM PRIORITY sources have partial coverage with clear path to completion:**
   - FTC Data Breach ✅
   - FDA Warning Letters ✅
   - DOJ Civil Fraud ✅
   - EPA ECHO ✅
   - FINRA BrokerCheck ✅

3. **LOW PRIORITY sources are intentionally deferred:**
   - State-level databases (marked as Phase 3 in original roadmap)
   - Additional EPA datasets
   - Secondary enforcement databases

### Implementation Phases:

**Phase 1 (Current):** Core fraud detection with high-priority sources ✅ COMPLETE
- Schema covers all essential data for initial MVP
- Focus on charity, political, healthcare, and government contract fraud

**Phase 2 (Next Quarter):** Expand to medium-priority sources
- Add missing tables: `SECInvestmentAdviser`, `CFTCEnforcementAction`
- Add: `HHSSanctionDatabase`, `OpenSecretsLobbyingDisclosure`
- Estimated effort: ~40 hours

**Phase 3 (Future):** Low-priority and state-level sources
- State AG complaints, licensing boards
- EPA environmental justice data
- Optional based on user demand and resource availability

## Alternatives Considered

### Alternative A: Complete All Sources Upfront
**Why not chosen:** Would require ~200 additional hours of development before any fraud detection capability. Delivers no immediate value to users. Violates "minimum viable product" principle.

### Alternative B: Ad-Hoc Addition as Needed
**Why not chosen:** Leads to technical debt, inconsistent data models, and reactive rather than strategic development. Makes capacity planning impossible.

### Alternative C (Chosen): Priority-Driven Phased Approach
**Benefits:**
- Delivers value immediately with high-priority sources
- Clear roadmap for future expansion
- Allows learning from user feedback before implementing lower-priority features
- Aligns with original DATA_SOURCES.md priority matrix

## Consequences

### Positive:
1. **Immediate MVP delivery** - Platform can launch with fraud detection on core categories
2. **Resource efficiency** - Development effort focused on highest-value sources first
3. **Flexibility** - Can pivot based on user feedback before implementing Phase 2/3
4. **Clear documentation** - This decision record explains the "why" for schema gaps

### Negative:
1. **Incomplete initial coverage** - Some fraud categories won't be detectable until Phase 2+
2. **Potential user confusion** - Need clear UI messaging about which categories are active vs. coming soon
3. **Schema evolution required** - Future migrations needed to add missing tables (manageable risk)

### Mitigations:
1. Update `FraudCategory` table with accurate `status` field values (`active`, `coming_soon`)
2. Frontend should display "Coming Soon" badges for incomplete categories
3. Maintain this decision record as reference for future schema additions

## Related Documents

- [docs/DATA_SOURCES.md](../../docs/DATA_SOURCES.md) - Original API research and priority matrix
- [prisma/schema.prisma](../../prisma/schema.prisma) - Current database schema
- [PROJECT_STATUS.md](../../PROJECT_STATUS.md) - Implementation progress tracking
- ADR 0001: Data Ingestion Architecture - Related ingestion strategy

## Schema Extension Template for Future Additions

When adding new data sources in Phase 2+, use this pattern:

```prisma
model NewDataSource {
  id             String       @id
  sourceSystemId String
  // Unique identifier from external API
  externalId     String       @unique
  // Core fields specific to this data type
  // ...
  createdAt      DateTime     @default(now())
  updatedAt      DateTime
  SourceSystem   SourceSystem @relation(fields: [sourceSystemId], references: [id])

  @@index([externalId])
  @@index([createdAt])
}
```

## Approval History

- **Created:** 2026-04-12 by TrackFraud Development Team
- **Approved:** Self-approved (technical decision within scope)
- **Reviewed By:** N/A (internal engineering decision)

---

*This is an Architecture Decision Record (ADR). Future changes to this strategy should create a new ADR that references and supersedes this one.*