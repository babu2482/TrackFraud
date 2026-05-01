import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Categories are defined in lib/categories.ts (single source of truth).
// The categoryId in SourceSystem is a plain String slug (e.g., "charities").

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
  // Categories are defined in lib/categories.ts — no DB seeding needed.
  // SourceSystem.categoryId is a plain String slug.

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
    `Seeded ${SOURCE_SYSTEMS.length} source systems. (Categories are config-driven via lib/categories.ts)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
