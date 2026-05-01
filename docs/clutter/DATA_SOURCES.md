# Comprehensive Fraud & Regulatory Data API Research

**Last Updated:** April 7, 2026  
**Purpose:** Complete inventory of all available fraud, regulatory, and transparency APIs for TrackFraud platform

---

## Executive Summary

This document catalogs **35+ government and regulatory data sources** that can be integrated into TrackFraud to make it the most comprehensive fraud tracking platform on the internet. Sources are categorized by domain and prioritized by implementation value.

### Quick Reference: API Priority Matrix

| Priority | Domain | APIs | Records Available | Implementation Effort |
|----------|--------|------|-------------------|----------------------|
| 🔴 HIGH | Financial/SEC | 5 | ~100k enforcement actions | Medium |
| 🔴 HIGH | Healthcare Fraud | 4 | ~2M exclusions/sanctions | Low-Medium |
| 🟡 MEDIUM | Environmental/EPA | 6 | ~500k violations | Medium |
| 🟡 MEDIUM | Consumer Protection | 3 | ~1M complaints/actions | Low |
| 🟢 LOW | Political Transparency | 4 | Already implemented | - |
| 🟢 LOW | Government Spending | 2 | Already implemented | - |

---

## Table of Contents

1. [Financial & Securities Fraud (SEC)](#1-financial--securities-fraud-sec)
2. [Healthcare Fraud (HHS OIG, CMS)](#2-healthcare-fraud-hhs-oig-cms)
3. [Environmental Enforcement (EPA)](#3-environmental-enforcement-epa)
4. [Consumer Protection (FTC, CFPB)](#4-consumer-protection-ftc-cfpb)
5. [Food & Drug Safety (FDA)](#5-food--drug-safety-fda)
6. [Department of Justice Fraud](#6-department-of-justice-fraud)
7. [Treasury Sanctions & Enforcement](#7-treasury-sanctions--enforcement)
8. [IRS Tax Enforcement](#8-irs-tax-enforcement)
9. [Government Contracting (SAM.gov)](#9-government-contracting-samgov)
10. [ProPublica Nonprofit Data](#10-propublica-nonprofit-data)
11. [Political Transparency APIs](#11-political-transparency-apis)
12. [State-Level Fraud Databases](#12-state-level-fraud-databases)

---

## 1. Financial & Securities Fraud (SEC)

### 1.1 SEC EDGAR API ✅ Already Implemented
**Status:** Partially implemented (`ingest-sec-edgar.ts`)  
**Base URL:** `https://www.sec.gov/cgi-bin/browse-edgar`  
**Authentication:** None required  

| Data Type | Endpoint | Records | Notes |
|-----------|----------|---------|-------|
| Company Filings | `/company-search` | ~10M companies | CIK lookup, ticker symbols |
| Filing Search | `/search-forms` | ~500M filings | 10-K, 10-Q, 8-K, DEF 14A |
| Facts API | `https://data.sec.gov/api/xbrl/facts/company.json?cik=` | All companies | Structured financial data |

**Implementation Status:** ✅ CorporateCompanyProfile, CorporateFilingRecord models exist

---

### 1.2 SEC Enforcement Actions 🔴 HIGH PRIORITY
**Base URL:** `https://www.sec.gov/litigation`  
**Authentication:** None required  

| Data Type | Endpoint | Records Available | Update Frequency |
|-----------|----------|-------------------|------------------|
| Litigation Releases | `/lit-sec/lit.shtml` | ~10,000+ cases | Weekly |
| Administrative Proceedings | `/lit-admin/admin.shtml` | ~8,000+ cases | Weekly |
| Cease-and-Desist Orders | `/lit-admin/ced.shtml` | ~5,000+ orders | Monthly |
| Accounting & Auditing | `/lit-accounting/lit-acctg.shtml` | ~1,000+ cases | Monthly |

**Data Schema:**
```typescript
interface SECEnforcementAction {
  releaseNumber: string;      // e.g., "34-99876"
  date: Date;
  respondents: string[];      // Named entities/individuals
  summary: string;
  violations: string[];       // Securities Act sections violated
  penalties: {
    disgorgement?: number;
    prejudgmentInterest?: number;
    civilPenalty?: number;
    total?: number;
  };
  orderType: 'injunctive' | 'cease-and-desist' | 'administrative';
  settled: boolean;
  url: string;
}
```

**Implementation Notes:**
- Requires HTML parsing (no direct API)
- Can use `https://www.sec.gov/cgi-bin/lit-release.pl` for individual releases
- Consider scraping + caching strategy

---

### 1.3 SEC Investment Adviser Admissions 🔴 HIGH PRIORITY
**Base URL:** `https://adviserinfo.sec.gov/`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Form ADV Filings | ~65,000 advisers | Disclosures of disciplinary events |
| Disciplinary Events | ~10,000+ records | Criminal, civil, regulatory actions |

**API Endpoints:**
```bash
# Search for advisers
https://adviserinfo.sec.gov/search/IAD/search?q=QUERY&searchType=all

# Get adviser details (requires parsing)
https://adviserinfo.sec.gov/advisor/DETAILS?advisorId=ID
```

---

### 1.4 FINRA BrokerCheck 🔴 HIGH PRIORITY
**Base URL:** `https://brokercheck.finra.org/`  
**Authentication:** API key required (free)  

| Data Type | Endpoint | Records Available |
|-----------|----------|-------------------|
| Broker Search | `/api/v1/broker` | ~650,000 brokers |
| Firm Search | `/api/v1/firm` | ~7,000 firms |
| Disclosures | `/api/v1/disclosure` | ~200,000+ events |

**API Key Request:** https://developer.finra.org/

**Data Schema:**
```typescript
interface FINRADisclosure {
  type: 'criminal' | 'civil' | 'regulatory' | 'arbitration' | 'customerDispute';
  status: 'alleged' | 'convicted' | 'settled' | 'dismissed';
  date: Date;
  description: string;
  amount?: number;
}
```

---

### 1.5 CFTC Enforcement Actions 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.cftc.gov/Enforcement/enforcementactions0.htm`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Enforcement Actions | ~3,000+ cases | Commodities futures fraud |
| Administrative Proceedings | ~2,000+ cases | Regulatory violations |

---

## 2. Healthcare Fraud (HHS OIG, CMS)

### 2.1 HHS OIG Exclusion List 🔴 HIGH PRIORITY
**Base URL:** `https://data.hhs.gov/Health-System-Performance-and-Fraud-Prevention/System-for-Award-Management-SAM-Exclusions/`  
**Authentication:** None required  

| Data Type | Format | Records Available | Update Frequency |
|-----------|--------|-------------------|------------------|
| LEIE (List of Excluded Individuals/Entities) | CSV/XML/API | ~10,000+ excluded | Daily |
| GME (General Management Exclusions) | CSV | ~5,000+ records | Weekly |

**API Endpoints:**
```bash
# Direct API access
https://exclusions.hhs.gov/api/v1/excluded-parties/search?name=QUERY

# Bulk download (recommended)
https://data.hhs.gov/api/views/8i6q-9pqr/rows.csv?accessType=DOWNLOAD
```

**Data Schema:**
```typescript
interface HHSExclusion {
  uiEProviderId: string;      // Unique ID
  lastName: string;
  firstName: string;
  middleName?: string;
  organizationName?: string;
  exclusionReason: string[];  // e.g., "Fraud", "Patient Abuse"
  programInvolvement: string[];
  effectiveDate: Date;
  terminationDate?: Date;      // Null = permanent
  stateLicenseInfo: {
    state: string;
    licenseNumber: string;
    actionType: string;
    effectiveDate: Date;
  }[];
}
```

**Implementation Priority:** 🔴 HIGH - Critical for healthcare fraud detection

---

### 2.2 HHS OIG Sanctions Database 🔴 HIGH PRIORITY
**Base URL:** `https://oig.hhs.gov/oas/reports/`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Administrative Sanctions | ~5,000+ cases | Monetary penalties, exclusions |
| Criminal Convictions | ~3,000+ cases | Healthcare fraud convictions |

**Data Schema:**
```typescript
interface HHSSanction {
  sanctionType: 'exclusion' | 'civilMoneyPenalty' | 'criminalFine';
  amount?: number;
  respondentName: string;
  violationDescription: string;
  effectiveDate: Date;
  caseNumber: string;
}
```

---

### 2.3 CMS Program Safeguard Exclusions 🔴 HIGH PRIORITY
**Base URL:** `https://data.cms.gov/dataset/program-safeguard-exclusions`  
**Authentication:** API key required (free)  

| Data Type | Records Available | Update Frequency |
|-----------|-------------------|------------------|
| Medicare/Medicaid Exclusions | ~15,000+ | Daily |

**API Key:** https://data.cms.gov/account/register

---

### 2.4 CMS Open Payments ✅ Already Implemented
**Status:** Fully implemented (`ingest-cms-open-payments.ts`)  
**Records:** ~945k payments ingested  

---

## 3. Environmental Enforcement (EPA)

### 3.1 EPA ECHO (Enforcement and Compliance History Online) 🟡 MEDIUM PRIORITY
**Base URL:** `https://echo.epa.gov/`  
**Authentication:** API key recommended  

| Data Type | Endpoint | Records Available |
|-----------|----------|-------------------|
| Facility Violations | `/api/facilities` | ~200,000+ facilities |
| Enforcement Actions | `/api/enforcement_actions` | ~500,000+ actions |
| Penalties | `/api/penalties` | ~300,000+ records |

**API Documentation:** https://echo.epa.gov/static/api/index.html

**Data Schema:**
```typescript
interface EPAEnforcementAction {
  facilityName: string;
  facilityId: string;
  address: string;
  state: string;
  violationType: string;
  violationDescription: string;
  actionDate: Date;
  penaltyAmount?: number;
  status: 'open' | 'closed' | 'pending';
  program: 'air' | 'water' | 'waste' | 'pesticide';
}
```

---

### 3.2 EPA Environmental Justice Screening 🟢 LOW PRIORITY
**Base URL:** `https://ejscreen.epa.gov/`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Facility Pollution Scores | ~1M+ facilities | EJScreen data |

---

### 3.3 EPA Grants Database 🟢 LOW PRIORITY
**Base URL:** `https://www.epa.gov/data/grants-api`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Grant Awards | ~50,000+ grants | State/tribal grants |

---

## 4. Consumer Protection (FTC, CFPB)

### 4.1 FTC Data Breach Notification Database 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.ftc.gov/enforcement/data-breaches`  
**Authentication:** None required  

| Data Type | Records Available | Update Frequency |
|-----------|-------------------|------------------|
| Data Breach Reports | ~400+ breaches | Ongoing |

**Data Schema:**
```typescript
interface FTCDataBreach {
  company: string;
  industry: string;
  breachDate: Date;
  notificationDate: Date;
  recordsAffected: number;
  dataTypesExposed: string[];
  settlementAmount?: number;
  url: string;
}
```

---

### 4.2 FTC Consumer Protection Actions 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.ftc.gov/enforcement/cases-proceedings`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Litigation Dockets | ~10,000+ cases | Consumer fraud cases |
| Settlements | ~5,000+ settlements | Monetary penalties |

---

### 4.3 CFPB Consumer Complaints ✅ Already Implemented
**Status:** Fully implemented (`ingest-cfpb-complaints.ts`)  
**Records:** ~100k complaints ingested  

---

## 5. Food & Drug Safety (FDA)

### 5.1 FDA Warning Letters 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters`  
**Authentication:** None required  

| Data Type | Records Available | Update Frequency |
|-----------|-------------------|------------------|
| Warning Letters | ~10,000+ letters | Weekly |

**Data Schema:**
```typescript
interface FDAWarningLetter {
  recipientName: string;
  recipientAddress: string;
  issueDate: Date;
  violationType: string[];
  productCategory: 'food' | 'drug' | 'device' | 'cosmetic';
  summary: string;
  url: string;
}
```

---

### 5.2 FDA Enforcement Reports 🟢 LOW PRIORITY
**Base URL:** `https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/enforcement-reports`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Import Alerts | ~1,000+ alerts | Detained products |
| Debarment List | ~500+ individuals | Excluded persons |

---

## 6. Department of Justice Fraud

### 6.1 DOJ Civil Fraud Recoveries 🔴 HIGH PRIORITY
**Base URL:** `https://www.justice.gov/press-releases/subject/civil-fraud-recoveries-over-1-million`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Civil Fraud Cases | ~5,000+ cases | FCA cases, fraud recoveries |

**Data Schema:**
```typescript
interface DOJCivilFraud {
  caseNumber: string;
  dateAnnounced: Date;
  defendantName: string;
  recoveryAmount: number;
  falseClaimsAct: boolean;
  summary: string;
  url: string;
}
```

---

### 6.2 DOJ Corporate Integrity Agreements 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.justice.gov/criminal-fraud/health-care-fraud`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| CIAs | ~200+ agreements | Healthcare fraud settlements |

---

## 7. Treasury Sanctions & Enforcement

### 7.1 OFAC Sanctions List 🔴 HIGH PRIORITY
**Base URL:** `https://www.treasury.gov/ofac/downloads/`  
**Authentication:** None required  

| Data Type | Format | Records Available | Update Frequency |
|-----------|--------|-------------------|------------------|
| SDN List (Specially Designated Nationals) | CSV/XML/JSON | ~12,000+ entities | Daily |
| Consolidated Sanctions | JSON | ~15,000+ records | Daily |

**API Endpoints:**
```bash
# Direct download (recommended)
https://www.treasury.gov/ofac/downloads/sdn.csv

# API access
https://services.officeofforeignassetscontrol.treasury.gov/v1/sanctions/individuals
```

**Data Schema:**
```typescript
interface OFACSanction {
  id: string;
  program: string[];           // e.g., "UKRAINE-EO13662", "IRAN"
  title?: string;
  type: 'Individual' | 'Entity';
  callSign?: string;
  vatNumber?: string;
  taxIdNumber?: string;
  addresses: {
    address: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    country?: string;
  }[];
  datesOfBirth?: string[];
  placesOfBirth?: string[];
  citizenCountries?: string[];
  ids: {
    idType: string;
    idNumber: string;
    issuingCountry: string;
  }[];
}
```

---

### 7.2 FinCEN Enforcement Actions 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.fincen.gov/enforcement-actions`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Civil Money Penalties | ~1,000+ actions | BSA/AML violations |

---

## 8. IRS Tax Enforcement

### 8.1 IRS Tax-Exempt Organizations ✅ Already Implemented
**Status:** Partially implemented (EO BMF, Auto-Revocation, Pub 78)  

---

### 8.2 IRS UDLI (Unlisted Debtors List Index) 🟢 LOW PRIORITY
**Base URL:** `https://www.irs.gov/businesses/small-businesses-self-employed/list-of-unpaid-tax-liens`  
**Authentication:** None required  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Federal Tax Liens | ~50,000+ liens | Unpaid tax debts |

---

## 9. Government Contracting (SAM.gov)

### 9.1 SAM Excluded Entities 🔴 HIGH PRIORITY
**Base URL:** `https://www.sam.gov/`  
**Authentication:** None required  

| Data Type | Records Available | Update Frequency |
|-----------|-------------------|------------------|
| Excluded Entities | ~30,000+ entities | Daily |

**API Endpoints:**
```bash
# Entity search
https://api.sam.gov/api/v1/entity_search?search_text=QUERY

# Bulk exclusion list
https://www.sam.gov/content/sam/public/pages/static_content_files/Excluded_Entities.csv
```

**Data Schema:**
```typescript
interface SAMExclusion {
  uei: string;                  // Unique Entity Identifier
  legalBusinessName: string;
  exclusionReason: string[];
  effectiveDate: Date;
  expirationDate?: Date;
  issuingAgency: string;
}
```

---

## 10. ProPublica Nonprofit Data

### 10.1 ProPublica Nonprofits API 🔴 HIGH PRIORITY
**Base URL:** `https://projects.propublica.org/nonprofits/api`  
**Authentication:** API key required (free)  

| Data Type | Endpoint | Records Available |
|-----------|----------|-------------------|
| Search Organizations | `/v2/search/` | ~1.9M organizations |
| Get Organization Details | `/v2/orgs/{ein}/` | Full 990 data |
| Get Filings | `/v2/orgs/{ein}/returns/` | Historical filings |

**API Key Request:** https://projects.propublica.org/nonprofits/api/

**Data Schema:**
```typescript
interface ProPublicaNonprofit {
  ein: string;
  organization_name: string;
  city: string;
  state: string;
  zip_code: string;
  ruling_date: Date;
  subsection_code: string;      // e.g., "501(c)(3)"
  foundation_code: number;
  ntee_codes: string[];         // NTEE classification codes
  asset_amount: number;
  income_amount: number;
  filing_requirements: string;
  returns: {
    form_type: '990' | '990-EZ' | '990-PF';
    tax_period: string;
    assets: number;
    liabilities: number;
    total_revenue: number;
    total_expenses: number;
  }[];
}
```

**Implementation Notes:**
- Much richer data than IRS EO BMF
- Includes parsed 990 form line items
- Rate limit: ~100 requests/minute with API key

---

## 11. Political Transparency APIs

### 11.1 ProPublica Congress API ✅ Already Implemented
**Status:** Implemented (`ingest-propublica-politicians.ts`)  

---

### 11.2 FEC Campaign Finance ✅ Already Implemented
**Status:** Implemented (`ingest-fec-summaries.ts`)  

---

### 11.3 Congress.gov API ✅ Already Implemented
**Status:** Implemented (`ingest-congress-api.ts`)  

---

### 11.4 OpenSecrets API 🟡 MEDIUM PRIORITY
**Base URL:** `https://www.opensecrets.org/open-data`  
**Authentication:** API key required (free)  

| Data Type | Records Available | Notes |
|-----------|-------------------|-------|
| Campaign Contributions | ~100M+ transactions | Donor data |
| Lobbying Disclosure | ~500k+ filings | Lobbyist payments |

**API Key:** https://www.opensecrets.org/open-data/api

---

## 12. State-Level Fraud Databases

### 12.1 State Attorney General Consumer Complaints 🟢 LOW PRIORITY
Multiple state AG offices maintain consumer complaint databases:
- California: https://oag.ca.gov/consumers/file-complaint
- New York: https://www.ag.ny.gov/consumer-fraud
- Texas: https://consumer.texasattorneygeneral.gov/

### 12.2 State Licensing Board Actions 🟢 LOW PRIORITY
Professional licensing boards maintain disciplinary action databases:
- Medical boards (all 50 states)
- Real estate commissions
- Securities regulators (state-level)

---

## Implementation Roadmap

### Phase 1: High Priority (Weeks 1-4)
1. **SEC Enforcement Actions** - HTML scraping + parsing
2. **HHS OIG Exclusion List** - CSV import, daily sync
3. **OFAC Sanctions List** - CSV/JSON import, daily sync
4. **SAM.gov Exclusions** - API integration
5. **ProPublica Nonprofits API** - Full 990 data integration

### Phase 2: Medium Priority (Weeks 5-8)
1. **FINRA BrokerCheck** - API integration
2. **FTC Data Breach Database** - HTML scraping
3. **FDA Warning Letters** - HTML scraping
4. **DOJ Civil Fraud Recoveries** - Press release parsing
5. **EPA ECHO** - API integration

### Phase 3: Low Priority (Weeks 9-12)
1. **OpenSecrets API** - Lobbying data
2. **State-level databases** - Select high-value states
3. **Additional EPA datasets** - Environmental justice

---

## Database Schema Extensions Needed

```prisma
// New models to add:

model SECEnforcementAction {
  id              String   @id @default(cuid())
  sourceSystemId  String
  releaseNumber   String   @unique
  date            DateTime
  respondents     String[]
  summary         String?
  violations      String[]
  penaltyAmount   Float?
  orderType       String
  settled         Boolean
  url             String
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([date])
  @@index([orderType])
}

model HHSExclusion {
  id                String   @id @default(cuid())
  sourceSystemId    String
  uiEProviderId     String   @unique
  lastName          String
  firstName         String?
  organizationName  String?
  exclusionReasons  String[]
  effectiveDate     DateTime
  terminationDate   DateTime?
  createdAt         DateTime @default(now())
  sourceSystem      SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([lastName, firstName])
  @@index([effectiveDate])
}

model OFACSanction {
  id              String   @id @default(cuid())
  sourceSystemId  String
  ofacId          String   @unique
  programs        String[]
  name            String?
  entityType      String
  addresses       Json
  ids             Json
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([name])
  @@index([entityType])
}

model SAMExclusion {
  id              String   @id @default(cuid())
  sourceSystemId  String
  uei             String   @unique
  legalName       String
  exclusionReasons String[]
  effectiveDate   DateTime
  expirationDate  DateTime?
  issuingAgency   String
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([legalName])
  @@index([effectiveDate])
}

model ProPublicaNonprofit {
  id              String   @id @default(cuid())
  sourceSystemId  String
  ein             String   @unique
  organizationName String
  city            String?
  state           String?
  subsectionCode  String?
  nteeCodes       String[]
  assetAmount     Float?
  incomeAmount    Float?
  latestFiling    Json?
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([state, city])
  @@index([subsectionCode])
}

model FTCDataBreach {
  id              String   @id @default(cuid())
  sourceSystemId  String
  company         String
  industry        String?
  breachDate      DateTime?
  notificationDate DateTime
  recordsAffected Int?
  dataTypesExposed String[]
  settlementAmount Float?
  url             String
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([company])
  @@index([notificationDate])
}

model FDAWarningLetter {
  id              String   @id @default(cuid())
  sourceSystemId  String
  recipientName   String
  recipientAddress String?
  issueDate       DateTime
  violationTypes  String[]
  productCategory String
  summary         String?
  url             String
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([recipientName])
  @@index([issueDate])
}

model DOJCivilFraud {
  id              String   @id @default(cuid())
  sourceSystemId  String
  caseNumber      String?
  dateAnnounced   DateTime
  defendantName   String
  recoveryAmount  Float?
  falseClaimsAct  Boolean
  summary         String?
  url             String
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([dateAnnounced])
  @@index([defendantName])
}

model FINRADisclosure {
  id              String   @id @default(cuid())
  sourceSystemId  String
  finraId         String?
  brokerOrFirm    String
  entityType      'broker' | 'firm'
  disclosureType  String
  status          String
  date            DateTime?
  description     String?
  amount          Float?
  createdAt       DateTime @default(now())
  sourceSystem    SourceSystem @relation(fields: [sourceSystemId], references: [id])
  
  @@index([brokerOrFirm])
  @@index([entityType])
}
```

---

## API Keys Summary

| Service | Key Required | How to Obtain | Cost |
|---------|--------------|---------------|------|
| ProPublica Nonprofits | Yes | https://projects.propublica.org/nonprofits/api/ | Free |
| CMS Data | Yes | https://data.cms.gov/account/register | Free |
| FINRA | Yes | https://developer.finra.org/ | Free |
| OpenSecrets | Yes | https://www.opensecrets.org/open-data/api | Free |
| EPA ECHO | Recommended | https://echo.epa.gov/static/api/index.html | Free |

**No API Key Required:**
- SEC EDGAR & Enforcement
- HHS OIG Exclusions
- OFAC Sanctions
- SAM.gov
- FDA Warning Letters
- FTC Data Breaches
- DOJ Civil Fraud

---

## Next Steps

1. **Update `.env.example`** with new API key variables
2. **Add Prisma models** for new data types
3. **Create ingestion scripts** for each high-priority source
4. **Build API endpoints** for querying new data
5. **Create frontend pages** to display fraud data by category

---

*Document maintained by TrackFraud development team*  
*Last updated: April 7, 2026*