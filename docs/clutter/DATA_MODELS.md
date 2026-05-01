# Data Models

The Prisma schema defines 53 models across 6 main categories. Schema is located at `prisma/schema.prisma`.

## Category Overview

| Category | Key Models | Records |
|----------|-----------|---------|
| Charity | `CharityProfile`, `CharityFiling`, `CharityBusinessMasterRecord` | ~1.9M |
| Corporate | `CorporateCompanyProfile`, `CorporateFilingRecord` | ~453K |
| Government | `GovernmentAwardRecord`, `SourceSystem` | 37 sources |
| Political | `Bill`, `BillVote`, `PoliticianCandidateProfile` | Varies |
| Healthcare | `HealthcareRecipientProfile`, `CMSProgramSafeguardExclusion` | ~18K |
| Consumer | `ConsumerComplaintRecord`, `CFPBComplaint` | ~438K |

## Core Models

### Entity Management

| Model | Purpose |
|-------|---------|
| `CanonicalEntity` | Cross-references entities across categories |
| `EntityAlias` | Alternate names for entities |
| `EntityIdentifier` | External IDs (EIN, CIK, etc.) |

### Fraud Tracking

| Model | Purpose |
|-------|---------|
| `FraudSnapshot` | Calculated fraud scores per entity |
| `FraudSignalEvent` | Individual fraud signals detected |
| `FraudCategory` | Categories (charity, corporate, etc.) |

### Data Ingestion

| Model | Purpose |
|-------|---------|
| `SourceSystem` | Government data sources (50+) |
| `IngestionRun` | History of ingestion executions |
| `RawArtifact` | Raw data artifacts from ingestion |

## Key Entity Models

### Charity (`CharityProfile`)
Core model for IRS-registered charities. Linked to:
- `CharityBusinessMasterRecord` (IRS BMF data)
- `CharityEpostcard990NRecord` (Form 990-N e-Postcards)
- `CharityFiling` / `CharityFiling990Index` (Form 990 filings)
- `CharityPublication78Record` (IRS Pub 78)
- `CharityAutomaticRevocationRecord` (Auto-revocations)

### Corporate (`CorporateCompanyProfile`)
SEC-registered companies. Linked to:
- `CorporateCompanyFactsSnapshot` (Financial facts)
- `CorporateFilingRecord` (SEC filings)

### Healthcare (`HealthcareRecipientProfile`)
Healthcare providers. Linked to:
- `HealthcarePaymentRecord` (CMS Open Payments)
- `CMSProgramSafeguardExclusion` (Program exclusions)
- `HHSExclusion` (HHS OIG exclusions)

### Political
- `Bill` / `BillVote` / `BillSponsor` - Legislation
- `PoliticalCandidateProfile` - Candidates
- `PoliticalCommitteeProfile` - PACs/committees
- `PoliticalCycleSummary` - Election cycle data

### Government
- `GovernmentAwardRecord` - Federal contracts/awards
- `EPAEnforcementAction` - EPA violations
- `SAMExclusion` - SAM.gov exclusions
- `OFACSanction` - OFAC sanctions list

## Schema History

- **Original:** 81 models (included legacy duplicate models)
- **After cleanup:** 53 models (28 legacy models removed)
- Legacy tables dropped: actions, bills, politicians, promises, votes, and more
- All legacy tables were empty - no data loss

## Adding New Models

1. Add model to `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_your_change`
3. Run `npx prisma generate`
4. Add to `scripts/reindex-search.ts` if searchable
5. Add Zod validation schema to `lib/validators.ts` if exposed via API

## Useful Commands

```bash
npx prisma studio           # Open database GUI
npx prisma generate         # Regenerate Prisma client
npx prisma migrate dev      # Create and apply migration
npx prisma migrate status   # Check migration status