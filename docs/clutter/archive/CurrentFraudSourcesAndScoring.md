🗺️ TrackFraud — Complete Data Source End-to-End Map

## How to Read This

For each data source:
- **Script**: The ingestion script file
- **Status**: `✅ REAL` (working), `🟡 PARTIAL` (works with issues), `❌ PLACEHOLDER` (no actual data)
- **Purpose**: Why we ingest this data, what it provides for fraud detection
- **Source URL**: Where the raw data comes from
- **Auth Needed**: API keys or authentication required
- **Flow**: Step-by-step data path from source → script → storage → database tables
- **Schema**: Key fields ingested

---

## 1. IRS Exempt Organizations Business Master File (EO BMF)

| Field | Detail |
|---|---|
| **Script** | `ingest-irs-eo-bmf.ts` (+ `ingest-irs-eo-bmf-safe.sh` wrapper) |
| **Status** | ✅ REAL — 1.95M rows ingested |
| **Purpose** | Core registry of ALL tax-exempt organizations in the US. Provides EIN, legal name, address, IRS section (501c3, 501c4, etc.), asset codes, income, filing requirements. This is the foundation for the charity/nonprofit domain. |
| **Source URL** | `https://www.irs.gov/pub/irs-soi/` — multiple CSV files by "file code" (pr, ca, xx, ry, rj, rc, rl, rb, etc.) |
| **Auth** | None — public CSV download |
| **Storage Lib** | `lib/irs-eo-bmf.ts` → `persistIrsEoBmfBatch()` |
| **DB Tables** | `CharityBusinessMasterRecord`, `CharityProfile`, `CanonicalEntity`, `EntityIdentifier`, `EntityAlias` |
| **Flow** | Download CSV per file code → Parse fixed-width CSV fields → Batch upsert (500 rows) → Link to CanonicalEntity via EIN → Create CharityProfile |
| **Key Fields** | EIN, TaxpayerName, LegalSummary, City, State, Zip, SectionCode (501c type), SubsectionCode, AssetCode, IncomeCode, FilingCode, AccountingPeriod, ActivityCode, RulingDate, SourceOfData, LatestAnnualRevenue, LatestFilingDate |

---

## 2. IRS Form 990-N (e-Postcard)

| Field | Detail |
|---|---|
| **Script** | `ingest-irs-990n.ts` |
| **Status** | ✅ REAL — 50K rows ingested |
| **Purpose** | Simplified return for small tax-exempt organizations (<$200K gross receipts). Shows organizations that are active but too small for full 990 filing. Used for baseline nonprofit tracking. |
| **Source URL** | `https://apps.irs.gov/pub/epostcard/data-download-epostcard.zip` |
| **Auth** | None — public ZIP download |
| **Storage Lib** | `lib/irs-990n.ts` → `persistIrs990NBatch()` |
| **DB Tables** | `CharityEpostcard990NRecord`, `CanonicalEntity`, `EntityIdentifier` |
| **Flow** | Download ZIP → Extract .txt file → Parse fixed-width header + data lines → Batch upsert (5000 rows) → Link entity via EIN |
| **Key Fields** | EIN, OrganizationName, Address, City, State, Zip, FilingYear |

---

## 3. IRS Auto Revocation List

| Field | Detail |
|---|---|
| **Script** | `ingest-irs-auto-revocation.ts` |
| **Status** | ✅ REAL — 49K rows ingested |
| **Purpose** | **CRITICAL FRAUD SIGNAL**: Organizations that lost tax-exempt status for failing to file 990-N for 3 consecutive years. Direct indicator of potentially abandoned or fraudulent nonprofits. |
| **Source URL** | `https://apps.irs.gov/pub/epostcard/data-download-revocation.zip` |
| **Auth** | None — public ZIP download |
| **Storage Lib** | `lib/irs-auto-revocation.ts` → `persistIrsAutoRevocationBatch()` |
| **DB Tables** | `CharityAutomaticRevocationRecord`, `CanonicalEntity`, `EntityIdentifier`, `FraudSignalEvent` |
| **Flow** | Download ZIP → Extract .txt → Parse fixed-width lines → Batch upsert (5000 rows) → Create FraudSignalEvent for each revoked entity |
| **Key Fields** | EIN, OrganizationName, Address, City, State, Zip, RevocationDate |

---

## 4. IRS Publication 78

| Field | Detail |
|---|---|
| **Script** | `ingest-irs-pub78.ts` |
| **Status** | ✅ REAL — 50K rows ingested |
| **Purpose** | IRS cumulative list of organizations eligible to receive tax-deductible charitable contributions. Cross-reference against EO BMF to find organizations claiming deductibility. |
| **Source URL** | `https://apps.irs.gov/pub/epostcard/data-download-pub78.zip` |
| **Auth** | None — public ZIP download |
| **Storage Lib** | `lib/irs-pub78.ts` → `persistIrsPub78Batch()` |
| **DB Tables** | `CharityPublication78Record`, `CanonicalEntity`, `EntityIdentifier` |
| **Flow** | Download ZIP → Extract .txt → Parse fixed-width lines → Batch upsert (5000 rows) |
| **Key Fields** | EIN, OrganizationName, Address, City, State, Zip |

---

## 5. IRS Form 990 XML Filings

| Field | Detail |
|---|---|
| **Script** | `ingest-irs-990-xml.ts` |
| **Status** | 🟡 PARTIAL — Complex two-phase script (index + parse) |
| **Purpose** | **DEEP FINANCIAL DATA**: Full Form 990 XML filings contain detailed revenue, expenses, program service expenses, officer compensation, assets, liabilities. Used for fraud scoring ratios (program spending %, fundraising costs, officer comp share). |
| **Source URL** | Yearly index CSVs from `https://apps.irs.gov/pub/epostcard/990/xml` → Archive ZIPs containing individual XML filings |
| **Auth** | None — public download |
| **Storage Lib** | `lib/irs-990-xml.ts` + `lib/charity-storage.ts` → `persistCharityComputation()` + fraud scoring |
| **DB Tables** | `CharityFiling990Index`, `CharityFiling`, `CanonicalEntity`, `FraudSignalEvent`, `FraudSnapshot` |
| **Flow** | Phase 1 (index): Download yearly CSV manifests → Parse into CharityFiling990Index. Phase 2 (parse): Download archive ZIPs → Extract individual XMLs → Parse financial fields → Create CharityFiling → Recompute FraudSignalEvent + FraudSnapshot |
| **Key Fields** | EIN, TaxpayerName, ReturnYear, FilingDate, TotalRevenue, TotalExpenses, ProgramServiceExpenses, FundraisingExpenses, AdministrativeExpenses, OfficerCompensation, TotalAssets, TotalLiabilities |

---

## 6. CFPB Consumer Complaints

| Field | Detail |
|---|---|
| **Script** | `ingest-cfpb-complaints.ts` |
| **Status** | ✅ REAL — 5.16M rows ingested |
| **Purpose** | **LARGEST DATA SOURCE**: Consumer complaints against financial companies. Shows patterns of consumer harm, complaint volumes per company, dispute rates. Core signal for financial fraud detection. |
| **Source URL** | `https://files.consumerfinance.gov/ccdb/complaints.csv.zip` |
| **Auth** | None — public CSV download |
| **Storage Lib** | `lib/consumer-storage.ts` → `persistConsumerComplaintBatch()` |
| **DB Tables** | `ConsumerComplaintRecord`, `CanonicalEntity`, `EntityIdentifier`, `ConsumerCompanySummary` |
| **Flow** | Download ZIP → Spawn `unzip -p` → Stream CSV with csv-parse → Parse each row → Batch upsert (2000 rows) → Update ConsumerCompanySummary aggregations |
| **Key Fields** | ComplaintId, Product, SubProduct, Issue, SubIssue, Company, CompanyResponse, State, Zip, Timeliness, ConsumerComplaintDisplayed, Tags, SubmittedDate, CompanyResponseDate, ProductAsFreeText, ConsumerNarrative |

---

## 7. CMS Open Payments (Healthcare)

| Field | Detail |
|---|---|
| **Script** | `ingest-cms-open-payments.ts` |
| **Status** | ✅ REAL — 262K payment rows + 89K recipient profiles |
| **Purpose** | Payments from pharmaceutical/medical device manufacturers to physicians and teaching hospitals. Tracks potential conflicts of interest, kickback patterns, excessive payments to specific physicians. |
| **Source URL** | CMS Open Payments Program — catalog at `file:///Volumes/MacBackup/TrackFraudProject/data/healthcare/catalog/local-catalog.json` (local mirror of `https://transparentreporting.data.cms.gov/`) |
| **Auth** | None — public CSV download |
| **Storage Lib** | `lib/healthcare-storage.ts` → `persistHealthcarePaymentBatch()` + `persistHealthcareRecipientSupplementBatch()` |
| **DB Tables** | `HealthcarePaymentRecord`, `HealthcareRecipientProfile`, `CanonicalEntity`, `EntityIdentifier` |
| **Flow** | Load catalog → For each dataset: Download CSV → Parse (payment or supplement kind) → Batch upsert payments + recipient profiles → Link via CMS recipient keys/NPIs |
| **Key Fields** | (Payments) RecipientName, RecipientCity, RecipientState, PayerName, TotalPayment, PaymentType, ClinicalArea, DeliveryChannel, FirstPaymentYear, RelatedSocial, ProgramYear. (Profiles) NPI, Specialty, Address, City, State, Zip |

---

## 8. FEC Campaign Finance Data

| Field | Detail |
|---|---|
| **Script** | `ingest-fec-summaries.ts` |
| **Status** | ✅ REAL — 7.8K candidates, 19.4K committees, 17.1K cycle summaries |
| **Purpose** | Federal Election Commission data on candidates, committees, and financial totals. Shows campaign funding patterns, dark money flows, committee-candidate relationships. Critical for political transparency and lobbying fraud detection. |
| **Source URL** | `https://www.fec.gov/data/browse-data/` — ZIP downloads of candidate master, committee master, candidate summary, committee summary files per election cycle |
| **Auth** | None — public ZIP download |
| **Storage Lib** | `lib/political-storage.ts` → `persistPoliticalCandidateBatch()`, `persistPoliticalCommitteeBatch()`, `persistPoliticalTotalsBatch()` |
| **DB Tables** | `PoliticalCandidateProfile`, `PoliticalCommitteeProfile`, `PoliticalCycleSummary`, `CanonicalEntity`, `EntityIdentifier` |
| **Flow** | For each cycle: Download 4 ZIP files (candidate master, committee master, candidate summary, committee summary) → Extract .txt files → Parse pipe-delimited records → Batch upsert candidates → committees → financial totals |
| **Key Fields** | (Candidates) CandidacyId, Name, Party, Office, State, District, IncumbentChallenge, Status, ElectionYears. (Committees) CommitteeId, Name, Type, Designation, Party, State, Treasurer, CandidateIds. (Totals) Receipts, Disbursements, CashOnHand, DebtsOwed, IndividualContributions, CommitteeContributions, OperatingExpenditures |

---

## 9. Congress.gov API

| Field | Detail |
|---|---|
| **Script** | `ingest-congress-api.ts` |
| **Status** | ✅ REAL — 23.3K bills ingested |
| **Purpose** | Tracks legislation in Congress: bill introductions, statuses, committee referrals, votes. Shows what laws are being pushed, who sponsors what, voting patterns. Critical for understanding legislative influence and regulatory capture. |
| **Source URL** | `https://api.congress.gov/v3` — REST API |
| **Auth** | `CONGRESS_API_KEY` required (free from congress.gov) |
| **Storage Lib** | `lib/political-storage.ts` (shared) + direct Prisma in script |
| **DB Tables** | `Bill`, `BillVote`, `MemberVote` |
| **Flow** | Iterate bill types (hr, hres, hconres, s, sres, sconres) per Congress → Fetch bill details → Upsert Bill records → For votes: Fetch rollcall votes → Upsert BillVote + MemberVote |
| **Key Fields** | (Bill) CongressNumber, BillNumber, BillType, Title, ShortTitle, Summary, IntroducedDate, LatestAction, Status, Chamber. (Vote) VoteType, QuestionText, VoteDate, Result, Yeas, Nays, NotVoting, RollcallNumber |

---

## 10. OFAC SDN List

| Field | Detail |
|---|---|
| **Script** | `ingest-ofac-sanctions.ts` |
| **Status** | ✅ REAL — 18.7K rows ingested |
| **Purpose** | **CRITICAL SANCTIONS DATA**: Specially Designated Nationals list from Treasury. Includes terrorist organizations, narcotics traffickers, cyber threat actors, human rights abusers, sanctioned countries. Any entity matching this list is a major fraud risk. |
| **Source URL** | `https://www.treasury.gov/ofac/downloads/` — Local CSV file in `./data/treasury/ofac/` |
| **Auth** | None — public CSV |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `OFACSanction`, `CanonicalEntity`, `EntityIdentifier`, `FraudSignalEvent` |
| **Flow** | Read local CSV file (pre-downloaded) → Detect CSV format (simplified vs standard) → Parse records → Batch upsert (100 rows) → Create FraudSignalEvent for matches |
| **Key Fields** | OfacId, Name, EntityType (individual/entity), Programs (sanction programs), Addresses, IDs (passport/national ID), DatesOfBirth, PlacesOfBirth, CitizenCountries |

---

## 11. Federal Register

| Field | Detail |
|---|---|
| **Script** | `ingest-federal-register.ts` |
| **Status** | ✅ REAL — 180 rows ingested |
| **Purpose** | Official journal of the US government. Rules, proposed rules, notices from all federal agencies. Shows regulatory activity, proposed policy changes, public comment periods. Useful for tracking regulatory enforcement patterns. |
| **Source URL** | `https://www.federalregister.gov/api/v1` — REST API |
| **Auth** | None — rate-limited public API |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `FederalRegisterDocument` |
| **Flow** | Build API filters (agency, type, date range) → Paginate through results → Map document fields → Upsert per document_number |
| **Key Fields** | ExternalId (document_number), Title, DocumentType (Rule/Proposed Rule/Notice), Agencies, PublicationDate, EffectiveDate, Summary, URL, PDF_URL, DocketIds |

---

## 12. ProPublica Congress API (Politicians)

| Field | Detail |
|---|---|
| **Script** | `ingest-propublica-politicians.ts` |
| **Status** | ✅ REAL — Populates PoliticalCandidateProfile |
| **Purpose** | Biographical data on current/former members of Congress. Contact info, social media, first elected date, office location. Enriches the political domain with human-readable data about politicians. |
| **Source URL** | `https://api.propublica.org/congress/v1` — REST API |
| **Auth** | `PROPUBLICA_API_KEY` (free from ProPublica) |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `PoliticalCandidateProfile` |
| **Flow** | Fetch current House + Senate members (or filter by chamber/class) → Map member attributes → Upsert by bioguide_id |
| **Key Fields** | BioguideId, FirstName, LastName, Party, State, Office, Gender, BirthDate, FirstElected, ContactFormUrl, Phone, Website, TwitterId, FacebookId, WikipediaUrl |

---

## 13. EPA ECHO Facility Database

| Field | Detail |
|---|---|
| **Script** | `ingest-epa-enforcement.ts` |
| **Status** | 🟡 PARTIAL — 3 rows (likely fell back to demo data) |
| **Purpose** | EPA enforcement actions and facility compliance history. Shows environmental violations, penalties, clean air/water act enforcement. Useful for environmental fraud detection and corporate compliance tracking. |
| **Source URL** | `https://echo.epa.gov/files/epafacility.csv` (primary) or `https://data.ecfrapid.com/data/ecf/2018-epafacility.csv` (fallback) |
| **Auth** | None — public CSV |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `EPAEnforcementAction` |
| **Flow** | Download CSV (or use local fallback) → Parse facility records → Batch upsert (500 rows) by FEDSID |
| **Key Fields** | FacilityId (FEDSID), FacilityName, IndustryType, FacilityOpStatus |

---

## 14. USAspending.gov (Government Awards)

| Field | Detail |
|---|---|
| **Script** | `ingest-usaspending-awards.ts` (search API), `ingest-usaspending-bulk.ts` (bulk CSV), `ingest-usaspending-cached.ts` (pre-downloaded) |
| **Status** | 🟡 PARTIAL — 100 rows via search API; bulk endpoint has socket hangup issues |
| **Purpose** | Federal contract awards and grants. Shows who receives government money, contract values, awarding agencies. Core for tracking government contracting fraud, grant misuse, no-bid contracts. |
| **Source URL** | `https://api.usaspending.gov/api/v2` — REST API (search + bulk endpoints) |
| **Auth** | None — public API |
| **Storage Lib** | `lib/government-storage.ts` → `persistGovernmentAwardSummaries()` + `persistGovernmentAwardDetail()` |
| **DB Tables** | `GovernmentAwardRecord`, `CanonicalEntity`, `EntityIdentifier` |
| **Flow** | (Search API) Paginate search results → Map award fields → Upsert summaries → Optionally hydrate detail. (Bulk) POST bulk request → Poll status → Download ZIP → Stream-extract CSVs → Parse → Upsert. (Cached) Read pre-downloaded JSON pages → Parse → Upsert |
| **Key Fields** | AwardId, RecipientName, AwardingAgency, ActionDate, ActionDateType, BaseAndAllOptionsValue, CurrentTotalValue, FiscalYear, LastOrderDate, LegalDescription,ModificationNumber, PlaceOfPerformance, PricingTypeReference, ReferenceToCompetitiveProcedure, SubAwardLinkage, UEI, AwardType |

---

## 15. SEC EDGAR (Corporate Filings)

| Field | Detail |
|---|---|
| **Script** | `ingest-sec-edgar.ts` (full), `ingest-sec-edgar-simple.ts` (sample), `ingest-sec-bulk.ts` (local bulk), `ingest-sec-local.ts` (local JSON) |
| **Status** | ✅ REAL — 445K filing records + 383 company facts snapshots |
| **Purpose** | Securities and Exchange Commission filings. 10-K, 10-Q, 8-K, proxy statements, insider trading reports. Core financial transparency data for publicly traded companies. Shows corporate governance, executive compensation, material events. |
| **Source URL** | `https://data.sec.gov` — REST API + bulk downloads. `https://www.sec.gov/files/company_tickers.json` for ticker index. |
| **Auth** | None — public API |
| **Storage Lib** | `lib/corporate-storage.ts` → `persistCorporateTickerUniverse()`, `persistCorporateSubmissions()`, `persistCorporateCompanyFacts()` + `lib/sec.ts` (API client) |
| **DB Tables** | `CorporateTicker`, `CorporateCompanyFactsSnapshot`, `CorporateFilingRecord`, `CanonicalEntity`, `EntityIdentifier` |
| **Flow** | (Full) Download ticker index → For each CIK: Fetch company facts + submissions → Upsert. (Simple) Pre-selected CIKs (AAPL, AMZN, GOOGL, etc.) → Fetch facts + submissions. (Bulk) Read local `data/corporate/sec/` → Raw SQL bulk insert. (Local) Read local JSON files → Batch upsert |
| **Key Fields** | (Tickers) CIK, Ticker, Title. (Facts) Balance sheet, income, cash flow data in JSON. (Submissions) AccessionNumber, FilingDate, AcceptedDate, Act, Form, FileNumber, FilmNumber, Sizes3D |

---

## 16. HHS OIG Exclusion List

| Field | Detail |
|---|---|
| **Script** | `ingest-hhs-oig-exclusions.ts` |
| **Status** | ❌ BROKEN — 0 rows. DNS failure: `exclusions.hhs.gov` not found. Socrata fallback at `https://data.hhs.gov/resource/8i6q-9pqr.json` also likely dead. |
| **Purpose** | List of Excluded Individuals/Entities from HHS OIG. People/organizations barred from participating in Medicare/Medicaid. Direct fraud indicator for healthcare domain. |
| **Source URL** | Primary: `https://data.hhs.gov/resource/8i6q-9pqr.json` (Socrata API). Fallback: `https://exclusions.hhs.gov/sites/default/files/leie.csv` |
| **Auth** | None — public API |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `HHSExclusion` |
| **Flow** | Try Socrata JSON API → Fallback to CSV download → Parse records → Batch upsert (100 rows) by UI_E_Provider_ID |
| **Key Fields** | UI_E_Provider_ID, LastName, FirstName, MiddleName, OrganizationName, ExclusionReasons, ProgramInvolvement, EffectiveDate, TerminationDate, StateLicenseInfo |

---

## 17. SAM.gov Exclusions

| Field | Detail |
|---|---|
| **Script** | `ingest-sam-exclusions.ts` |
| **Status** | 🟡 PARTIAL — 3 rows (demo data fallback, not real data) |
| **Purpose** | System for Award Management exclusions. Debarred/suspended entities excluded from federal contracts and assistance programs. Direct fraud indicator for government contracting. |
| **Source URL** | `https://www.sam.gov/content/sam/files/SAMExclusionList.csv` |
| **Auth** | None — public CSV (but download may fail/redirect to login) |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `SAMExclusion` |
| **Flow** | Try SAM.gov CSV download → Verify CSV content (not HTML) → Fall back to demo data if failed → Parse → Batch upsert (50 rows) by UEI |
| **Key Fields** | UEI, LegalName, ExclusionReasons, EffectiveDate, ExpirationDate, IssuingAgency |

---

## 18. FDA Warning Letters

| Field | Detail |
|---|---|
| **Script** | `ingest-fda-warning-letters.ts` |
| **Status** | ❌ PLACEHOLDER — Creates SourceSystem only, no data fetched. Needs FDA_API_KEY. |
| **Purpose** | FDA warning letters to companies for violations of food/drug/device regulations. Shows regulatory enforcement actions in healthcare/pharma. |
| **Source URL** | Not implemented |
| **Auth** | `FDA_API_KEY` required (not yet obtained) |
| **Storage Lib** | None — placeholder |
| **DB Tables** | `SourceSystem` only |

---

## 19. FTC Data Breach

| Field | Detail |
|---|---|
| **Script** | `ingest-ftc-data-breach.ts` |
| **Status** | ❌ PLACEHOLDER — Creates SourceSystem only, no data fetched. |
| **Purpose** | FTC data breach settlements and enforcement actions. Shows companies that had data breaches and the settlements they paid. Consumer protection signal. |
| **Source URL** | Not implemented |
| **Auth** | Not required |
| **Storage Lib** | None — placeholder |
| **DB Tables** | `SourceSystem` only |

---

## 20. Cabinet Members

| Field | Detail |
|---|---|
| **Script** | `ingest-cabinet-members.ts` |
| **Status** | ❌ PLACEHOLDER — Hardcoded sample data (Blinken, Yellen, Austin, Garland). No API integration. |
| **Purpose** | Historical cabinet member data for political transparency. Shows who served in what role, under which president. Context for revolving door analysis. |
| **Source URL** | None — hardcoded sample data |
| **Auth** | None |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `CabinetMember`, `SourceSystem` |

---

## 21. CMS Program Safeguard Exclusions

| Field | Detail |
|---|---|
| **Script** | `ingest-cms-program-safeguard.ts` |
| **Status** | ❌ PLACEHOLDER — Has code but uses wrong Socrata endpoint (`78i6-9pqr` which is actually HHS data, not CMS). No data ingested. |
| **Purpose** | Medicare/Medicaid program safeguard exclusions from CMS. Similar to HHS OIG but specific to CMS enforcement. |
| **Source URL** | `https://data.cms.gov/api/views/78i6-9pqr/rows.csv` (wrong endpoint, points to HHS data) |
| **Auth** | `CMS_API_KEY` noted but not used |
| **Storage Lib** | Direct Prisma in script |
| **DB Tables** | `CMSSafeguardExclusion` |

---

## 22. ProPublica Nonprofit Explorer (Charity Detail)

| Field | Detail |
|---|---|
| **Script** | `ingest-charity.ts` (single EIN), `ingest-charities.ts` (batch EINs) |
| **Status** | ✅ REAL — On-demand lookup. Not run as bulk ingestion, triggered per EIN. |
| **Purpose** | Detailed nonprofit profiles from ProPublica's enriched data. Includes 990 tax filings with full financial breakdown. Powers the fraud scoring engine (program spending ratios, fundraising costs, officer compensation share). |
| **Source URL** | `https://api.propublica.org/nonprofit/v1/` — REST API |
| **Auth** | `PROPUBLICA_API_KEY` required |
| **Storage Lib** | `lib/charity-detail.ts` → `loadCharityComputation()` + `lib/charity-storage.ts` → `persistCharityComputation()` |
| **DB Tables** | `CharityProfile`, `CharityFiling`, `CanonicalEntity`, `EntityIdentifier`, `EntityAlias`, `FraudSignalEvent`, `FraudSnapshot`, `RawArtifact` |
| **Flow** | Load charity by EIN → Fetch from ProPublica API → Parse 990 filings → Compute financial ratios → Generate fraud risk signals → Persist entity + filings + signals + snapshot |
| **Key Fields** | (Profile) EIN, Name, Address, City, State, Zip, Section501Type, RulingDate, Deductibility, AssetAmount, IncomeAmount, FilingRequirementAmount, FiscalYearEnd, LatestFilingYear, AffiliatedOrganizations. (Filing) Revenue, Expenses, ProgramServiceExpenses, FundraisingExpenses, AdministrativeExpenses, OfficerCompensation, Assets, Liabilities |

---

## Summary: Ingestion Script Status Matrix

| Script | Status | Rows | Auth | Issue |
|---|---|---|---|---|
| `ingest-irs-eo-bmf.ts` | ✅ REAL | 1.95M | None | Large, use safe wrapper |
| `ingest-irs-990n.ts` | ✅ REAL | 50K | None | — |
| `ingest-irs-auto-revocation.ts` | ✅ REAL | 49K | None | — |
| `ingest-irs-pub78.ts` | ✅ REAL | 50K | None | — |
| `ingest-irs-990-xml.ts` | 🟡 PARTIAL | Complex | None | Two-phase, resource-heavy |
| `ingest-cfpb-complaints.ts` | ✅ REAL | 5.16M | None | Transaction timeout on large batches |
| `ingest-cms-open-payments.ts` | ✅ REAL | 262K | None | — |
| `ingest-fec-summaries.ts` | ✅ REAL | 7.8K+19.4K | None | — |
| `ingest-congress-api.ts` | ✅ REAL | 23.3K | `CONGRESS_API_KEY` | — |
| `ingest-ofac-sanctions.ts` | ✅ REAL | 18.7K | None | — |
| `ingest-federal-register.ts` | ✅ REAL | 180 | None | Rate-limited |
| `ingest-propublica-politicians.ts` | ✅ REAL | 7.8K | `PROPUBLICA_API_KEY` | — |
| `ingest-sec-edgar.ts` | ✅ REAL | 445K | None | — |
| `ingest-sec-edgar-simple.ts` | ✅ REAL | Sample | None | Testing only |
| `ingest-sec-bulk.ts` | ✅ REAL | N/A | None | Needs local data files |
| `ingest-sec-local.ts` | ✅ REAL | N/A | None | Needs local data files |
| `ingest-usaspending-awards.ts` | 🟡 PARTIAL | 100 | None | Socket hangup |
| `ingest-usaspending-bulk.ts` | 🟡 PARTIAL | N/A | None | Socket hangup |
| `ingest-usaspending-cached.ts` | ✅ REAL | N/A | None | Needs cached pages |
| `ingest-epa-enforcement.ts` | 🟡 PARTIAL | 3 | None | Likely demo data fallback |
| `ingest-hhs-oig-exclusions.ts` | ❌ BROKEN | 0 | None | DNS failure, URL changed |
| `ingest-sam-exclusions.ts` | 🟡 PARTIAL | 3 | None | Demo data fallback |
| `ingest-cms-program-safeguard.ts` | ❌ WRONG | 0 | `CMS_API_KEY` | Wrong endpoint |
| `ingest-charity.ts` | ✅ REAL | On-demand | `PROPUBLICA_API_KEY` | — |
| `ingest-charities.ts` | ✅ REAL | On-demand | `PROPUBLICA_API_KEY` | — |
| `ingest-fda-warning-letters.ts` | ❌ PLACEHOLDER | 0 | `FDA_API_KEY` | Not implemented |
| `ingest-ftc-data-breach.ts` | ❌ PLACEHOLDER | 0 | None | Not implemented |
| `ingest-cabinet-members.ts` | ❌ PLACEHOLDER | 0 | None | Hardcoded sample data |
| `ingest-worker.ts` | ✅ ORCHESTRATOR | N/A | None | Dispatches other scripts |

---

## What's Missing (No Script Exists)

- **FINRA BrokerCheck** — `FINRADisclosure` table exists, no ingestion script
- **FTC Consumer Protection Actions** — `FTCConsumerProtectionAction` table exists, no script
- **DOJ Civil Fraud** — `DOJCivilFraud` table exists, no script
- **BillSponsors** — `BillSponsor` table exists, no script (Congress API has this data)
- **BillVote / MemberVote** — Tables exist, `ingest-congress-api.ts` partially implements
- **ProPublica Nonprofit** (bulk) — `ProPublicaNonprofit` table exists, only on-demand scripts
- **FactCheck / PoliticianClaim / PoliticianCommittee** — Tables exist, no scripts
- **CMS Program Safeguard Exclusions** — Has script but wrong endpoint

Want me to now focus on fixing the broken sources, or building the missing ingestion scripts?

Current State of the Fraud Scoring System

### Architecture Overview

There are actually **three parallel systems** for fraud scoring:

1. **Signal Definitions + Detection Engine** (`lib/fraud-scoring/signal-definitions.ts` + `lib/fraud-scoring/detection-engine.ts`)
   - Batch-level batch detection using SQL queries against the database
   - Defines signals per category (charity, healthcare, corporate, consumer, sanctions)
   - Creates `FraudSignalEvent` records
   - Calculates weighted scores with severity multipliers

2. **Signal Detectors + Scorer** (`lib/fraud-scoring/signal-detectors.ts` + `lib/fraud-scoring/scorer.ts`)
   - Per-entity detection (row by row)
   - More detailed individual signal analysis
   - Calculates score using `scoreImpact` + corroboration bonus
   - Persists `FraudSnapshot` records

3. **Risk Scoring Engine** (`lib/risk-scoring.ts`)
   - Highest-level orchestration
   - Combines signals into category-based scores (regulatory, network, compliance, financial)
   - Uses weighted scoring (30% regulatory, 25% network, 25% compliance, 20% financial)

4. **Fraud Meter** (`lib/fraud-meter.ts`)
   - Used by API routes for real-time scoring
   - Different from the batch scoring system
   - Uses `RiskSignal` objects + external corroboration

### Data Status

- **Total Entities**: 2,083,979 CanonicalEntities
- **Charity Profiles**: 1,952,238 (most have BMF records)
- **Auto Revocations**: 49,104 records
- **Publication 78**: 50,000 records


- **990-N Epostcards**: 50,000 records
- **Healthcare Payments**: 261,933 records (89,340 recipients)
- **Consumer Complaints**: 5,162,000 records
- **OFAC Sanctions**: 18,732 records
- **Corporate Profiles**: 8,029 records
- **SAM Exclusions**: 3 records
- **HHS Exclusions**: 0 records
- **FDA Warning Letters**: 0 records
- **FTC Data Breach**: 0 records
- **Government Award Records**: 100 records

The database is being populated across multiple domains, with particularly strong coverage in charity data and consumer complaints, though some regulatory datasets like HHS exclusions and FDA warnings remain empty.

Fraud scoring has already run across 4,525 charity entities, with a distribution showing 1,137 critical cases, 24 high, 561 medium, and 2,803 low risk. The system detected over 12,000 signals, dominated by publication 78 mismatches and compensation ratio anomalies.

The main gap is that HHS, FDA, and FTC exclusions lack data entirely, and the signal detection only processes charities—the healthcare, corporate, consumer, sanctions, and government categories need their own signal detectors implemented. There are also inconsistencies between different scoring systems that need reconciliation.

The charity scoring itself works, but it's limited to just a few entities despite having millions of records available. The scoring pipeline runs detection then calculation, though some signals are poorly named or produce duplicates. Beyond charity-specific signals, the other categories have definitions but no actual detector functions to execute them.

The API currently only scores charities, and while the "hottest charities" endpoint uses a fraud meter, the main listing doesn't display fraud scores. I need to fix the data gaps in exclusions, expand signal detection across all categories, and unify the scoring approach.
</think>

Now I have a **comprehensive picture**. Let me give you the full analysis.

---

## Fraud Logic Deep Dive — Here's Everything

Your project has **multiple scoring systems** that evolved over time. Let me break it down clearly:

### The 4 Scoring Systems (Yes, 4)

| # | System | Files | Purpose | Status |
|---|--------|-------|---------|--------|
| 1 | **Signal Definitions + Detection Engine** | `lib/fraud-scoring/signal-definitions.ts` + `detection-engine.ts` | Batch batch detection via SQL queries across all categories | Has definitions, creates events |
| 2 | **Signal Detectors + Scorer** | `lib/fraud-scoring/signal-detectors.ts` + `scorer.ts` | Per-entity detailed detection + score calculation with corroboration | Works for charities only |
| 3 | **Risk Scoring Engine** | `lib/risk-scoring.ts` | Highest-level orchestration: combines signals into category scores (regulatory 30%, network 25%, compliance 25%, financial 20%) | Exists but not actively used |
| 4 | **Fraud Meter** | `lib/fraud-meter.ts` | Real-time scoring used by API routes. Different algorithm entirely. | Used in "hottest charities" endpoint |

### The Core Fraud Logic (What Actually Works)

**Signal Detectors** (`signal-detectors.ts`) — These are the actual detectors for charities:

| Signal | What It Detects | Threshold | Score Impact |
|--------|----------------|-----------|--------------|
| **High Compensation Ratio** | Income-to-revenue ratio > 20% | 20%/25%/30%/40% | 15-25 pts |
| **Frequent Name Changes** | >2 name changes in 3 years | 3/4/5+ changes | 10-20 pts |
| **Missing Tax Filings** | No filings + record >180/365 days old | 180/365 days | 15-25 pts |
| **IRS Auto Revocation** | On IRS automatic revocation list | Any = critical | **50 pts** |
| **Operating Post-Revocation** | Still active >1 year after revocation | 365 days | 20 pts |
| **Not in Publication 78** | Claims 501(c)(3) but not in IRS Pub 78 | Not listed | 15 pts |
| **Asset-Revenue Anomaly** | Assets >10x annual revenue (non-foundation) | 10x/20x/30x/50x | 5-20 pts |

**Scoring Algorithm** (`scorer.ts`):
```
baseScore = SUM of scoreImpact from all signals (capped at 85)
corroborationBonus = +5 per category with 2+ signals (max +15)
finalScore = baseScore + corroborationBonus (capped at 100)

Risk Levels:  0-39=Low | 40-59=Medium | 60-79=High | 80-100=Critical
```

### Current Data State

**Data You HAVE (massive):**
- 5.16M Consumer Complaints
- 2.6M Healthcare Payment Records (89K recipients)  
- 1.95M Charity BMF Records
- 49K Auto Revocations
- 18.7K OFAC Sanctions
- 8K Corporate Profiles
- 50K each: 990-N Epostcards, Publication 78

**Data You DON'T HAVE (scripts were fixed but not run):**
- HHS OIG Exclusions: **0** (endpoint was broken, now fixed)
- SAM Exclusions: **3** (API key needed for full data)
- FDA Warning Letters: **0** (script fixed, not run)
- FTC Data Breaches: **0** (script fixed, not run)

**Scoring State:**
- 4,525 charities scored (out of 1.95M profiles — ~0.2%)
- Distribution: 1,137 Critical | 24 High | 561 Medium | 2,803 Low
- Top signal: `charity_not_in_pub78` (8,750 hits) — this is basically a "not in a 50K sample of a 1.95M universe" which is a weak signal

### The Real Problems

1. **Only charities are scored** — healthcare, corporate, consumer, sanctions categories have NO per-entity detectors, only batch SQL definitions
2. **The "not in Pub 78" signal is noisy** — Pub 78 has 50K records but you have 1.95M charities. Not being in Pub 78 doesn't mean much
3. **49K auto-revocations exist but many aren't matched to profiles** — the `CharityAutomaticRevocationRecord` has 49K records but signal events show only 3K `charity_high_compensation_ratio` and 0 explicit `charity_auto_revocation` from detectors
4. **Two scoring systems coexist** — `scorer.ts` (batch) vs `fraud-meter.ts` (real-time API) with different algorithms
5. **Healthcare data is rich** (262K payments) but no per-entity detectors exist
6. **Consumer complaints are the biggest dataset** (5.16M) but no per-entity scoring

### What Needs to Happen (Production-Ready Plan)

**Phase 1: Fix what exists (this week)**
1. Re-run the fixed ingestion scripts (HHS, FDA, FTC, Cabinet) to get that data in
2. Fix the "not in Pub 78" signal — either remove it or make it conditional
3. Run the charity detection pipeline on ALL charities, not just a sample
4. Consolidate the scoring — pick ONE system and stick with it

**Phase 2: Extend to other categories (next sprint)**
5. Write per-entity detectors for Healthcare (excluded provider billing, payment structuring)
6. Write per-entity detectors for Consumer (complaint volume, non-response patterns)
7. Write per-entity detectors for Sanctions (OFAC/SAM cross-referencing)

**Phase 3: Polish (after scoring works)**
8. Add fraud scores to the main category listing pages (they're missing)
9. Build the fraud detail UI per entity
10. Set up scheduled pipeline runs

---

The fraud logic itself is solid for what exists — the charity detectors are well-designed with appropriate thresholds and severity scaling. The scoring algorithm with corroboration bonuses is a good approach. The main issue is **scope** — it only covers charities and hasn't been run at scale.

Want me to start tackling Phase 1? I'd recommend starting with:
1. Running the fixed ingestion scripts to get HHS/FDA/FTC data
2. Then fixing the scoring pipeline to run on all charities
3. Then extending to healthcare/consumer detectors
