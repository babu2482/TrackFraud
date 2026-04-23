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
    status: "coming_soon",
    iconName: "leaf",
    sortOrder: 7,
  },
  {
    id: "immigration",
    name: "Immigration & Visa Fraud",
    slug: "immigration",
    description:
      "Monitor immigration fraud: USCIS enforcement, visa scams, H-1B abuse, and employment verification fraud.",
    status: "coming_soon",
    iconName: "globe",
    sortOrder: 8,
  },
  {
    id: "housing",
    name: "Housing & Real Estate Fraud",
    slug: "housing",
    description:
      "Track housing fraud: HUD enforcement, mortgage scams, rental fraud, REIT violations, and appraisal fraud.",
    status: "coming_soon",
    iconName: "building-2",
    sortOrder: 9,
  },
  {
    id: "financial-services",
    name: "Financial Services & Banking",
    slug: "financial-services",
    description:
      "Monitor banking fraud: FDIC enforcement, FinCEN actions, unlicensed lending, and financial institution violations.",
    status: "coming_soon",
    iconName: "banknotes",
    sortOrder: 10,
  },
  {
    id: "insurance",
    name: "Insurance Fraud",
    slug: "insurance",
    description:
      "Track insurance fraud: NAIC enforcement, health insurance scams, auto insurance fraud, and claim manipulation.",
    status: "coming_soon",
    iconName: "shield",
    sortOrder: 11,
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity & Data Breaches",
    slug: "cybersecurity",
    description:
      "Monitor cybersecurity incidents: FTC data breach actions, CISA alerts, privacy violations, and critical infrastructure attacks.",
    status: "coming_soon",
    iconName: "lock",
    sortOrder: 12,
  },
  {
    id: "supply-chain",
    name: "Supply Chain & Import Fraud",
    slug: "supply-chain",
    description:
      "Track import fraud: CBP seizures, OFAC sanctions, forced labor violations, and counterfeit goods.",
    status: "coming_soon",
    iconName: "package",
    sortOrder: 13,
  },
  {
    id: "education",
    name: "Education & Student Loans",
    slug: "education",
    description:
      "Monitor education fraud: ED enforcement, student loan servicer misconduct, for-profit college scams, and accreditation fraud.",
    status: "coming_soon",
    iconName: "graduation-cap",
    sortOrder: 14,
  },
  {
    id: "pharmaceutical",
    name: "Pharmaceutical & Medical Devices",
    slug: "pharmaceutical",
    description:
      "Track pharma fraud: FDA warning letters, DOJ settlements, off-label marketing, and medical device violations.",
    status: "coming_soon",
    iconName: "pill",
    sortOrder: 15,
  },
  {
    id: "energy",
    name: "Energy & Utilities",
    slug: "energy",
    description:
      "Monitor energy fraud: FERC enforcement, utility rate violations, pipeline safety, and oil & gas violations.",
    status: "coming_soon",
    iconName: "zap",
    sortOrder: 16,
  },
];

// ACTIVE SOURCE SYSTEMS: Only sources with working ingestion scripts and database tables.
// Additional sources are archived in docs/ARCHIVED_SOURCES.md for future development.
const SOURCE_SYSTEMS = [
  // --- Charities & Nonprofits (CORE - Active & Working) ---
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
