import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    id: "charities",
    name: "Charities & Nonprofits",
    slug: "charities",
    description:
      "Track nonprofit transparency: how much charities take in vs. how they spend on the cause. Powered by IRS Form 990 data.",
    status: "active",
    iconName: "heart",
    sortOrder: 1,
  },
  {
    id: "political",
    name: "Political & Campaign Finance",
    slug: "political",
    description:
      "Follow political money: PAC spending, campaign finance violations, dark money, and lobbying disclosures.",
    status: "active",
    iconName: "landmark",
    sortOrder: 2,
  },
  {
    id: "corporate",
    name: "Corporate & Securities",
    slug: "corporate",
    description:
      "Track corporate fraud: SEC enforcement actions, accounting irregularities, insider trading, and shareholder lawsuits.",
    status: "active",
    iconName: "building",
    sortOrder: 3,
  },
  {
    id: "government",
    name: "Government Spending",
    slug: "government",
    description:
      "Monitor government waste: contract fraud, earmark abuse, procurement irregularities, and misuse of public funds.",
    status: "active",
    iconName: "banknotes",
    sortOrder: 4,
  },
  {
    id: "healthcare",
    name: "Healthcare Fraud",
    slug: "healthcare",
    description:
      "Expose healthcare billing fraud: Medicare/Medicaid abuse, upcoding, phantom billing, and kickback schemes.",
    status: "active",
    iconName: "hospital",
    sortOrder: 5,
  },
  {
    id: "consumer",
    name: "Consumer Fraud & Scams",
    slug: "consumer",
    description:
      "Track consumer fraud: Ponzi schemes, FTC enforcement, CFPB complaints, and state attorney general actions.",
    status: "active",
    iconName: "shield-alert",
    sortOrder: 6,
  },
  {
    id: "environmental",
    name: "Environmental & Climate Fraud",
    slug: "environmental",
    description:
      "Track environmental violations: EPA enforcement, carbon credit fraud, greenwashing, and climate-related financial crimes.",
    status: "active",
    iconName: "leaf",
    sortOrder: 7,
  },
  {
    id: "immigration",
    name: "Immigration & Visa Fraud",
    slug: "immigration",
    description:
      "Monitor immigration fraud: USCIS enforcement, visa scams, H-1B abuse, and employment verification fraud.",
    status: "active",
    iconName: "globe",
    sortOrder: 8,
  },
  {
    id: "housing",
    name: "Housing & Real Estate Fraud",
    slug: "housing",
    description:
      "Track housing fraud: HUD enforcement, mortgage scams, rental fraud, REIT violations, and appraisal fraud.",
    status: "active",
    iconName: "building-2",
    sortOrder: 9,
  },
  {
    id: "financial-services",
    name: "Financial Services & Banking",
    slug: "financial-services",
    description:
      "Monitor banking fraud: FDIC enforcement, FinCEN actions, unlicensed lending, and financial institution violations.",
    status: "active",
    iconName: "banknotes",
    sortOrder: 10,
  },
  {
    id: "insurance",
    name: "Insurance Fraud",
    slug: "insurance",
    description:
      "Track insurance fraud: NAIC enforcement, health insurance scams, auto insurance fraud, and claim manipulation.",
    status: "active",
    iconName: "shield",
    sortOrder: 11,
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity & Data Breaches",
    slug: "cybersecurity",
    description:
      "Monitor cybersecurity incidents: FTC data breach actions, CISA alerts, privacy violations, and critical infrastructure attacks.",
    status: "active",
    iconName: "lock",
    sortOrder: 12,
  },
  {
    id: "supply-chain",
    name: "Supply Chain & Import Fraud",
    slug: "supply-chain",
    description:
      "Track import fraud: CBP seizures, OFAC sanctions, forced labor violations, and counterfeit goods.",
    status: "active",
    iconName: "package",
    sortOrder: 13,
  },
  {
    id: "education",
    name: "Education & Student Loans",
    slug: "education",
    description:
      "Monitor education fraud: ED enforcement, student loan servicer misconduct, for-profit college scams, and accreditation fraud.",
    status: "active",
    iconName: "graduation-cap",
    sortOrder: 14,
  },
  {
    id: "pharmaceutical",
    name: "Pharmaceutical & Medical Devices",
    slug: "pharmaceutical",
    description:
      "Track pharma fraud: FDA warning letters, DOJ settlements, off-label marketing, and medical device violations.",
    status: "active",
    iconName: "pill",
    sortOrder: 15,
  },
  {
    id: "energy",
    name: "Energy & Utilities",
    slug: "energy",
    description:
      "Monitor energy fraud: FERC enforcement, utility rate violations, pipeline safety, and oil & gas violations.",
    status: "active",
    iconName: "zap",
    sortOrder: 16,
  },
];

const SOURCE_SYSTEMS = [
  {
    id: "propublica_nonprofit_explorer",
    categoryId: "charities",
    name: "ProPublica Nonprofit Explorer",
    slug: "propublica-nonprofit-explorer",
    description:
      "Search and organization profile data for US tax-exempt organizations, derived from IRS Form 990 filings.",
    ingestionMode: "api",
    baseUrl: "https://projects.propublica.org/nonprofits/api/v2",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "irs_eo_bmf",
    categoryId: "charities",
    name: "IRS EO BMF",
    slug: "irs-eo-bmf",
    description:
      "Complete exempt-organization directory records from the IRS Exempt Organizations Business Master File extract.",
    ingestionMode: "bulk",
    baseUrl:
      "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: false,
  },
  {
    id: "irs_auto_revocation",
    categoryId: "charities",
    name: "IRS Automatic Revocation List",
    slug: "irs-automatic-revocation",
    description:
      "Bulk revocation records for organizations that lost tax-exempt status.",
    ingestionMode: "bulk",
    baseUrl:
      "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: false,
  },
  {
    id: "irs_pub78",
    categoryId: "charities",
    name: "IRS Publication 78",
    slug: "irs-publication-78",
    description:
      "IRS cumulative list of organizations eligible to receive tax-deductible charitable contributions.",
    ingestionMode: "bulk",
    baseUrl:
      "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: false,
  },
  {
    id: "irs_990n",
    categoryId: "charities",
    name: "IRS Form 990-N (e-Postcard)",
    slug: "irs-990n-epostcard",
    description:
      "IRS e-Postcard filings for small tax-exempt organizations with gross receipts normally under $50,000.",
    ingestionMode: "bulk",
    baseUrl:
      "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: false,
  },
  {
    id: "irs_990_xml",
    categoryId: "charities",
    name: "IRS Form 990 XML Archive",
    slug: "irs-990-xml",
    description:
      "Yearly IRS filing indexes plus XML archive ZIP files for Form 990, 990-EZ, and 990-PF returns.",
    ingestionMode: "bulk",
    baseUrl: "https://apps.irs.gov/pub/epostcard/990/xml",
    refreshCadence: "monthly",
    freshnessSlaHours: 24 * 31,
    supportsIncremental: true,
  },
  {
    id: "ofac_sdn",
    categoryId: "charities",
    name: "OFAC SDN List",
    slug: "ofac-sdn-list",
    description:
      "Office of Foreign Assets Control sanctions list used for adverse-name corroboration.",
    ingestionMode: "bulk",
    baseUrl: "https://sanctionssearch.ofac.treas.gov/",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "fec_api",
    categoryId: "political",
    name: "Federal Election Commission Bulk Data",
    slug: "federal-election-commission-bulk-data",
    description:
      "Candidate master files, committee master files, and cycle summary bulk data from the Federal Election Commission.",
    ingestionMode: "bulk",
    baseUrl: "https://www.fec.gov/data/browse-data/",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "sec_edgar",
    categoryId: "corporate",
    name: "SEC EDGAR",
    slug: "sec-edgar",
    description:
      "Corporate submissions, filing indexes, and machine-readable financial facts from the Securities and Exchange Commission.",
    ingestionMode: "bulk",
    baseUrl: "https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "usaspending_api",
    categoryId: "government",
    name: "USAspending API",
    slug: "usaspending-api",
    description:
      "Federal award and spending records for contracts, grants, and related obligations.",
    ingestionMode: "api",
    baseUrl: "https://api.usaspending.gov/api/v2",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "cms_open_payments",
    categoryId: "healthcare",
    name: "CMS Open Payments",
    slug: "cms-open-payments",
    description:
      "Yearly CMS Open Payments bulk datasets plus the covered recipient supplement used for local healthcare-payment mirroring.",
    ingestionMode: "bulk",
    baseUrl: "https://openpaymentsdata.cms.gov/api/1/metastore/schemas/dataset/items",
    refreshCadence: "yearly",
    freshnessSlaHours: 24 * 365,
    supportsIncremental: false,
  },
  {
    id: "cfpb_consumer_complaints",
    categoryId: "consumer",
    name: "CFPB Consumer Complaint Database",
    slug: "cfpb-consumer-complaints",
    description:
      "Published consumer complaints and company responses from the Consumer Financial Protection Bureau, retained from official bulk complaint exports.",
    ingestionMode: "bulk",
    baseUrl:
      "https://www.consumerfinance.gov/data-research/consumer-complaints/",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  // Environmental & Climate Fraud
  {
    id: "epa_enforcement",
    categoryId: "environmental",
    name: "EPA Enforcement & Compliance History",
    slug: "epa-enforcement",
    description:
      "EPA enforcement actions, compliance violations, and penalty assessments for environmental law violations.",
    ingestionMode: "api",
    baseUrl: "https://www.epa.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "epa_grants",
    categoryId: "environmental",
    name: "EPA Grants & Cooperative Agreements",
    slug: "epa-grants",
    description:
      "EPA grant awards, cooperative agreements, and environmental funding disbursements.",
    ingestionMode: "bulk",
    baseUrl: "https://www.epa.gov/grants",
    refreshCadence: "monthly",
    freshnessSlaHours: 24 * 31,
    supportsIncremental: true,
  },
  // Immigration & Visa Fraud
  {
    id: "uscis_fraud_detection",
    categoryId: "immigration",
    name: "USCIS Fraud Detection Notices",
    slug: "uscis-fraud-detection",
    description:
      "USCIS fraud detection notices, revocation notices, and immigration enforcement actions.",
    ingestionMode: "bulk",
    baseUrl: "https://www.uscis.gov/news/fraud-and-enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "dhs_enforcement",
    categoryId: "immigration",
    name: "DHS Immigration Enforcement",
    slug: "dhs-enforcement",
    description:
      "Department of Homeland Security immigration enforcement actions and violations.",
    ingestionMode: "bulk",
    baseUrl: "https://www.dhs.gov/immigration-enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  // Housing & Real Estate Fraud
  {
    id: "hud_enforcement",
    categoryId: "housing",
    name: "HUD Enforcement & Compliance",
    slug: "hud-enforcement",
    description:
      "HUD enforcement actions, fair housing violations, and housing program fraud.",
    ingestionMode: "bulk",
    baseUrl: "https://www.hud.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "fhfa_actions",
    categoryId: "housing",
    name: "FHFA Enforcement Actions",
    slug: "fhfa-enforcement",
    description:
      "Federal Housing Finance Agency enforcement actions against GSEs and regulated entities.",
    ingestionMode: "bulk",
    baseUrl: "https://www.fhfa.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  // Financial Services & Banking
  {
    id: "fdic_enforcement",
    categoryId: "financial-services",
    name: "FDIC Enforcement Actions",
    slug: "fdic-enforcement",
    description:
      "Federal Deposit Insurance Corporation enforcement actions against insured depository institutions.",
    ingestionMode: "bulk",
    baseUrl: "https://www.fdic.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "fincen_enforcement",
    categoryId: "financial-services",
    name: "FinCEN Enforcement & SARs",
    slug: "fincen-enforcement",
    description:
      "Financial Crimes Enforcement Network enforcement actions and public SAR summaries.",
    ingestionMode: "bulk",
    baseUrl: "https://www.fincen.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  // Insurance Fraud
  {
    id: "naic_enforcement",
    categoryId: "insurance",
    name: "NAIC Enforcement Actions",
    slug: "naic-enforcement",
    description:
      "National Association of Insurance Commissioners enforcement actions and licensing violations.",
    ingestionMode: "bulk",
    baseUrl: "https://www.naic.org",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "state_insurance_depts",
    categoryId: "insurance",
    name: "State Insurance Departments",
    slug: "state-insurance-depts",
    description:
      "State-level insurance department enforcement actions and consumer complaints.",
    ingestionMode: "bulk",
    baseUrl: "https://www.naic.org/state_web_map.htm",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  // Cybersecurity & Data Breaches
  {
    id: "ftc_data_breach",
    categoryId: "cybersecurity",
    name: "FTC Data Breach Actions",
    slug: "ftc-data-breach",
    description:
      "FTC enforcement actions related to data breaches, privacy violations, and security failures.",
    ingestionMode: "bulk",
    baseUrl: "https://www.ftc.gov/news-events/news/press-releases",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "cisa_alerts",
    categoryId: "cybersecurity",
    name: "CISA Alerts & Advisories",
    slug: "cisa-alerts",
    description:
      "Cybersecurity and Infrastructure Security Agency alerts, advisories, and critical infrastructure incidents.",
    ingestionMode: "bulk",
    baseUrl: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  // Supply Chain & Import Fraud
  {
    id: "cbp_seizures",
    categoryId: "supply-chain",
    name: "CBP Seizures & Forfeitures",
    slug: "cbp-seizures",
    description:
      "Customs and Border Protection seizure records, import violations, and customs fraud.",
    ingestionMode: "bulk",
    baseUrl: "https://www.cbp.gov/trade/enforcement/seizures",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "ofac_sanctions",
    categoryId: "supply-chain",
    name: "OFAC Sanctions List",
    slug: "ofac-sanctions",
    description:
      "Office of Foreign Assets Control sanctions list for trade and financial sanctions violations.",
    ingestionMode: "bulk",
    baseUrl: "https://sanctionssearch.ofac.treas.gov/",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  // Education & Student Loans
  {
    id: "ed_enforcement",
    categoryId: "education",
    name: "ED Enforcement Actions",
    slug: "ed-enforcement",
    description:
      "Department of Education enforcement actions, Title IV violations, and accreditation issues.",
    ingestionMode: "bulk",
    baseUrl: "https://www.ed.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "student_loan_servicers",
    categoryId: "education",
    name: "Student Loan Servicer Actions",
    slug: "student-loan-servicers",
    description:
      "Consumer Financial Protection Bureau actions against student loan servicers and misconduct.",
    ingestionMode: "bulk",
    baseUrl: "https://www.consumerfinance.gov/data-research/consumer-complaints/",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  // Pharmaceutical & Medical Devices
  {
    id: "fda_warning_letters",
    categoryId: "pharmaceutical",
    name: "FDA Warning Letters",
    slug: "fda-warning-letters",
    description:
      "FDA warning letters for drug, device, and biologic violations and safety concerns.",
    ingestionMode: "bulk",
    baseUrl: "https://www.fda.gov/inspections-compliance-enforcement-and-fda-advisory-committees/warning-letters",
    refreshCadence: "daily",
    freshnessSlaHours: 24,
    supportsIncremental: true,
  },
  {
    id: "doj_pharma_settlements",
    categoryId: "pharmaceutical",
    name: "DOJ Pharma Settlements",
    slug: "doj-pharma-settlements",
    description:
      "Department of Justice settlements for pharmaceutical fraud, off-label marketing, and pricing violations.",
    ingestionMode: "bulk",
    baseUrl: "https://www.justice.gov/opa/press-releases",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "cms_oig_exclusions",
    categoryId: "pharmaceutical",
    name: "CMS OIG Exclusions",
    slug: "cms-oig-exclusions",
    description:
      "CMS Office of Inspector General exclusions and sanctions for healthcare providers and suppliers.",
    ingestionMode: "bulk",
    baseUrl: "https://oig.hhs.gov/exclusions/",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  // Energy & Utilities
  {
    id: "ferc_enforcement",
    categoryId: "energy",
    name: "FERC Enforcement Actions",
    slug: "ferc-enforcement",
    description:
      "Federal Energy Regulatory Commission enforcement actions for energy market manipulation and violations.",
    ingestionMode: "bulk",
    baseUrl: "https://www.ferc.gov/enforcement",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
  {
    id: "state_puc_actions",
    categoryId: "energy",
    name: "State PUC Enforcement",
    slug: "state-puc-enforcement",
    description:
      "State Public Utility Commission enforcement actions and utility rate violations.",
    ingestionMode: "bulk",
    baseUrl: "https://www.naruc.org/",
    refreshCadence: "weekly",
    freshnessSlaHours: 168,
    supportsIncremental: true,
  },
];

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.fraudCategory.upsert({
      where: { id: cat.id },
      update: {
        name: cat.name,
        description: cat.description,
        status: cat.status,
        iconName: cat.iconName,
        sortOrder: cat.sortOrder,
      },
      create: cat,
    });
  }

  for (const source of SOURCE_SYSTEMS) {
    await prisma.sourceSystem.upsert({
      where: { id: source.id },
      update: {
        categoryId: source.categoryId,
        name: source.name,
        slug: source.slug,
        description: source.description,
        ingestionMode: source.ingestionMode,
        baseUrl: source.baseUrl,
        refreshCadence: source.refreshCadence,
        freshnessSlaHours: source.freshnessSlaHours,
        supportsIncremental: source.supportsIncremental,
      },
      create: source,
    });
  }

  console.log(
    `Seeded ${CATEGORIES.length} fraud categories and ${SOURCE_SYSTEMS.length} source systems.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
