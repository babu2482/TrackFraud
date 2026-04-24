# Archived Data Sources

This document lists data sources that are planned for future development but not yet implemented. They have been removed from the active seed to keep the admin dashboard focused on working sources.

## Criteria for Re-activation

A source should be moved back to `prisma/seed.ts` when:
1. The corresponding database table(s) exist in `prisma/schema.prisma`
2. A working ingestion script exists in `scripts/`
3. The source has been tested and successfully ingested data

---

## Political & Campaign Finance

| Source | Slug | Description |
|--------|------|-------------|
| Federal Election Commission Bulk Data | `federal-election-commission-bulk-data` | Candidate master files, committee master files, and cycle summary bulk data from the FEC |

## Corporate & Securities

| Source | Slug | Description |
|--------|------|-------------|
| SEC EDGAR | `sec-edgar` | Corporate submissions, filing indexes, and machine-readable financial facts |

## Government Spending

| Source | Slug | Description |
|--------|------|-------------|
| USAspending API | `usaspending-api` | Federal award and spending records for contracts, grants, and related obligations |

## Healthcare Fraud

| Source | Slug | Description |
|--------|------|-------------|
| CMS Open Payments | `cms-open-payments` | Yearly CMS Open Payments bulk datasets |

## Consumer Fraud & Scams

| Source | Slug | Description |
|--------|------|-------------|
| CFPB Consumer Complaint Database | `cfpb-consumer-complaints` | Published consumer complaints and company responses |

---

## Environmental & Climate Fraud (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| EPA Enforcement & Compliance History | `epa-enforcement` | EPA enforcement actions, compliance violations, and penalty assessments |
| EPA Grants & Cooperative Agreements | `epa-grants` | EPA grant awards, cooperative agreements, and environmental funding |

## Immigration & Visa Fraud (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| USCIS Fraud Detection Notices | `uscis-fraud-detection` | USCIS fraud detection notices, revocation notices |
| DHS Immigration Enforcement | `dhs-enforcement` | DHS immigration enforcement actions and violations |

## Housing & Real Estate Fraud (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| HUD Enforcement & Compliance | `hud-enforcement` | HUD enforcement actions, fair housing violations |
| FHFA Enforcement Actions | `fhfa-enforcement` | Federal Housing Finance Agency enforcement actions |

## Financial Services & Banking (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| FDIC Enforcement Actions | `fdic-enforcement` | FDIC enforcement actions against insured depository institutions |
| FinCEN Enforcement & SARs | `fincen-enforcement` | Financial Crimes Enforcement Network enforcement actions |

## Insurance Fraud (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| NAIC Enforcement Actions | `naic-enforcement` | National Association of Insurance Commissioners enforcement |
| State Insurance Departments | `state-insurance-depts` | State-level insurance department enforcement actions |

## Cybersecurity & Data Breaches (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| FTC Data Breach Actions | `ftc-data-breach` | FTC enforcement actions related to data breaches |
| CISA Alerts & Advisories | `cisa-alerts` | Cybersecurity and Infrastructure Security Agency alerts |

## Supply Chain & Import Fraud (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| CBP Seizures & Forfeitures | `cbp-seizures` | Customs and Border Protection seizure records |
| OFAC Sanctions List | `ofac-sanctions` | Office of Foreign Assets Control sanctions list |

## Education & Student Loans (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| ED Enforcement Actions | `ed-enforcement` | Department of Education enforcement actions |
| Student Loan Servicer Actions | `student-loan-servicers` | CFPB actions against student loan servicers |

## Pharmaceutical & Medical Devices (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| FDA Warning Letters | `fda-warning-letters` | FDA warning letters for drug, device, and biologic violations |
| DOJ Pharma Settlements | `doj-pharma-settlements` | DOJ settlements for pharmaceutical fraud |
| CMS OIG Exclusions | `cms-oig-exclusions` | CMS Office of Inspector General exclusions |

## Energy & Utilities (Category: coming_soon)

| Source | Slug | Description |
|--------|------|-------------|
| FERC Enforcement Actions | `ferc-enforcement` | Federal Energy Regulatory Commission enforcement actions |
| State PUC Enforcement | `state-puc-enforcement` | State Public Utility Commission enforcement actions |

---

_Last updated: April 22, 2026_