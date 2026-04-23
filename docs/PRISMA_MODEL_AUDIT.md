# Prisma Model Usage Audit

> **Created:** 2026-04-23
> **Total Models:** 81
> **Used in Code:** 42
> **Unused in Code:** 39

---

## Model Usage Matrix

### Used Models (42)

| Model | Used In | Status |
|-------|---------|--------|
| Bill | scripts/reindex-search.ts | ✅ USED |
| BillVote | scripts/reindex-search.ts | ✅ USED |
| CMSProgramSafeguardExclusion | scripts/reindex-search.ts | ✅ USED |
| CabinetMember | scripts/reindex-search.ts | ✅ USED |
| CanonicalEntity | scripts/reindex-search.ts | ✅ USED |
| CharityAutomaticRevocationRecord | scripts/reindex-search.ts | ✅ USED |
| CharityBusinessMasterRecord | scripts/reindex-search.ts | ✅ USED |
| CharityEpostcard990NRecord | scripts/reindex-search.ts | ✅ USED |
| CharityFiling | scripts/reindex-search.ts | ✅ USED |
| CharityFiling990Index | scripts/reindex-search.ts | ✅ USED |
| CharityProfile | scripts/reindex-search.ts, lib/*.ts | ✅ USED |
| CharityPublication78Record | scripts/reindex-search.ts | ✅ USED |
| ConsumerCompanySummary | scripts/reindex-search.ts | ✅ USED |
| ConsumerComplaintRecord | scripts/reindex-search.ts | ✅ USED |
| CorporateCompanyFactsSnapshot | scripts/reindex-search.ts | ✅ USED |
| CorporateCompanyProfile | scripts/reindex-search.ts, lib/*.ts | ✅ USED |
| CorporateFilingRecord | scripts/reindex-search.ts | ✅ USED |
| EPAEnforcementAction | scripts/reindex-search.ts | ✅ USED |
| EntityAlias | scripts/reindex-search.ts | ✅ USED |
| EntityIdentifier | scripts/reindex-search.ts | ✅ USED |
| FTCDataBreach | scripts/reindex-search.ts | ✅ USED |
| FederalRegisterDocument | scripts/reindex-search.ts | ✅ USED |
| FraudCategory | scripts/reindex-search.ts | ✅ USED |
| FraudSignalEvent | scripts/reindex-search.ts | ✅ USED |
| FraudSnapshot | scripts/reindex-search.ts | ✅ USED |
| GovernmentAwardRecord | scripts/reindex-search.ts | ✅ USED |
| HHSExclusion | scripts/reindex-search.ts | ✅ USED |
| HealthcarePaymentRecord | scripts/reindex-search.ts | ✅ USED |
| HealthcareRecipientProfile | scripts/reindex-search.ts | ✅ USED |
| IngestionRun | scripts/reindex-search.ts | ✅ USED |
| MemberVote | scripts/reindex-search.ts | ✅ USED |
| OFACSanction | scripts/reindex-search.ts | ✅ USED |
| PoliticalCandidateProfile | scripts/reindex-search.ts | ✅ USED |
| PoliticalCommitteeProfile | scripts/reindex-search.ts | ✅ USED |
| PoliticalCycleSummary | scripts/reindex-search.ts | ✅ USED |
| PoliticalDataSync | scripts/reindex-search.ts | ✅ USED |
| ProPublicaNonprofit | scripts/reindex-search.ts | ✅ USED |
| RawArtifact | scripts/reindex-search.ts | ✅ USED |
| SAMExclusion | scripts/reindex-search.ts | ✅ USED |
| SourceSystem | scripts/reindex-search.ts | ✅ USED |
| Subscriber | scripts/reindex-search.ts | ✅ USED |
| Tip | scripts/reindex-search.ts | ✅ USED |

### Unused Models (39)

| Model | Type | Recommendation |
|-------|------|----------------|
| DOJCivilFraud | Missing from Prisma client | Check schema |
| FDAWarningLetter | Missing from Prisma client | Check schema |
| FINRADisclosure | Missing from Prisma client | Check schema |
| FTCConsumerProtectionAction | Missing from Prisma client | Check schema |
| FactCheck | Missing from Prisma client | Check schema |
| MemberVote | Missing from Prisma client | Check schema |
| PoliticianClaim | Legacy model | DELETE |
| PoliticianCommittee | Legacy model | DELETE |
| President | Legacy model | DELETE |
| PresidentialAction | Legacy model | DELETE |
| SECEnforcementAction | Missing from Prisma client | Check schema |
| BillSponsor | Legacy model | DELETE |
| action_topics | Legacy table | DELETE |
| actions | Legacy table | DELETE |
| bill_sponsors | Legacy table | DELETE |
| bills | Legacy table | DELETE |
| cabinet_members_legacy | Legacy table | DELETE |
| coalitions | Legacy table | DELETE |
| evidence | Legacy table | DELETE |
| fact_checks | Legacy table | DELETE |
| factor_metrics | Legacy table | DELETE |
| factor_scores | Legacy table | DELETE |
| pattern_analyses | Legacy table | DELETE |
| politician_claims_legacy | Legacy table | DELETE |
| politician_coalitions | Legacy table | DELETE |
| politician_sentiment | Legacy table | DELETE |
| politician_topics | Legacy table | DELETE |
| politicians | Legacy table | DELETE |
| predictions | Legacy table | DELETE |
| presidential_actions_legacy | Legacy table | DELETE |
| presidents_legacy | Legacy table | DELETE |
| promise_metrics | Legacy table | DELETE |
| promise_updates | Legacy table | DELETE |
| promises | Legacy table | DELETE |
| sentiment_snapshots | Legacy table | DELETE |
| topics | Legacy table | DELETE |
| transparency_scores | Legacy table | DELETE |
| users | Legacy table | DELETE |
| vote_results | Legacy table | DELETE |
| votes | Legacy table | DELETE |

---

## Cleanup Priority

### Phase 1: Delete Legacy Tables (30 models)
These are clearly legacy tables that duplicate canonical models:
- `bills`, `bill_sponsors`, `votes`, `vote_results`
- `politicians`, `politician_claims_legacy`, `politician_topics`
- `presidents_legacy`, `presidential_actions_legacy`
- `cabinet_members_legacy`
- `promises`, `promise_metrics`, `promise_updates`
- `fact_checks`, `fact_check`
- `actions`, `action_topics`
- `coalitions`, `politician_coalitions`
- `sentiment_snapshots`, `politician_sentiment`
- `predictions`, `pattern_analyses`
- `factor_metrics`, `factor_scores`
- `transparency_scores`
- `topics`
- `users`

### Phase 2: Investigate Missing Models (7 models)
These models exist in schema but not in Prisma client:
- `DOJCivilFraud`
- `FDAWarningLetter`
- `FINRADisclosure`
- `FTCConsumerProtectionAction`
- `FactCheck`
- `MemberVote`
- `SECEnforcementAction`

### Phase 3: Verify Canonical Models (42 models)
These are the canonical models that are actively used and should be kept.

---

## Commands for Cleanup

```bash
# 1. Backup database first
docker exec trackfraud-postgres pg_dump -U trackfraud trackfraud > /tmp/backup-pre-cleanup.sql

# 2. Delete legacy tables (example)
# npx prisma migrate dev --name remove_legacy_tables

# 3. Regenerate Prisma client
npx prisma generate

# 4. Run tests
npm test
```

---

*This audit is the basis for C4: Dual Schema Cleanup in the MASTER_PLAN.*