/**
 * Category Registry — Single source of truth for all platform categories.
 *
 * Adding a new category requires:
 *  1. Adding one entry to the CATEGORIES array below
 *  2. (Optional) Adding an API endpoint for stats/recent
 *
 * Zero UI code changes needed.
 */

export type CategoryStatus = "active" | "beta" | "coming_soon";

export interface CategoryConfig {
  /** URL slug (e.g., "charities", "corporate") */
  slug: string;
  /** Display name */
  name: string;
  /** SVG icon name (maps to components/ui/Icons.tsx CategoryIconName) */
  iconName: string;
  /** Tailwind color name for theming */
  color: string;
  /** Short description shown on landing */
  description: string;
  /** Nav label (defaults to name, truncated) */
  navLabel?: string;
  /** Search type filter value */
  searchType?: string;
  /** Stats API endpoint (optional) */
  statsEndpoint?: string;
  /** Entity detail route pattern (optional) */
  entityDetailRoute?: string;
  /** Entity label (e.g., "Charity", "Corporation") */
  entityLabel?: string;
  /** Entity ID param name (e.g., "ein", "cik") */
  entityIdParam?: string;
  /** Sub-links shown in sidebar */
  childLinks?: { name: string; href: string; description?: string }[];
  /** Sort order (lower = first) */
  sortOrder: number;
  /** Status */
  status: CategoryStatus;
}

export const CATEGORIES: CategoryConfig[] = [
  {
    slug: "charities",
    name: "Charities & Nonprofits",
    iconName: "heart",
    color: "red",
    description:
      "Track nonprofit organizations, IRS Form 990 filings, charity compliance, and financial transparency.",
    navLabel: "Charities",
    searchType: "charity",
    entityDetailRoute: "/charities/[ein]",
    entityLabel: "Charity",
    entityIdParam: "ein",
    childLinks: [
      { name: "Search Charities", href: "/search?type=charity" },
      { name: "IRS Form 990", href: "/search?type=charity&source=irs-990" },
      {
        name: "Revoked Organizations",
        href: "/search?type=charity&status=revoked",
      },
    ],
    sortOrder: 1,
    status: "active",
  },
  {
    slug: "corporate",
    name: "Corporate & Securities",
    iconName: "building",
    color: "blue",
    description:
      "Monitor SEC filings, corporate entities, insider trading, and securities violations.",
    navLabel: "Corporate",
    searchType: "corporation",
    entityDetailRoute: "/corporate/company/[cik]",
    entityLabel: "Corporation",
    entityIdParam: "cik",
    childLinks: [
      { name: "SEC Filings", href: "/corporate" },
      { name: "Company Profiles", href: "/corporate?view=profiles" },
      { name: "Insider Trading", href: "/corporate?filter=insider" },
    ],
    sortOrder: 2,
    status: "active",
  },
  {
    slug: "government",
    name: "Government & Contracts",
    iconName: "landmark",
    color: "indigo",
    description:
      "Track federal contracts, government spending, SAM.gov exclusions, and enforcement actions.",
    navLabel: "Government",
    searchType: "government_contractor",
    entityDetailRoute: "/government/award/[id]",
    entityLabel: "Award",
    entityIdParam: "id",
    childLinks: [
      { name: "Federal Contracts", href: "/government" },
      { name: "SAM Exclusions", href: "/government?source=sam" },
      { name: "EPA Enforcement", href: "/government?source=epa" },
    ],
    sortOrder: 3,
    status: "active",
  },
  {
    slug: "healthcare",
    name: "Healthcare & Medical",
    iconName: "hospital",
    color: "emerald",
    description:
      "Monitor CMS payments, healthcare providers, FDA warning letters, and HHS exclusions.",
    navLabel: "Healthcare",
    searchType: "healthcare_provider",
    entityDetailRoute: "/healthcare/[id]",
    entityLabel: "Provider",
    entityIdParam: "id",
    childLinks: [
      { name: "CMS Payments", href: "/healthcare" },
      { name: "FDA Warning Letters", href: "/healthcare?source=fda" },
      { name: "HHS Exclusions", href: "/healthcare?source=hhs" },
    ],
    sortOrder: 4,
    status: "active",
  },
  {
    slug: "political",
    name: "Political & Campaign Finance",
    iconName: "vote",
    color: "purple",
    description:
      "Track campaign contributions, FEC filings, cabinet members, and political influence.",
    navLabel: "Political",
    searchType: "politician",
    entityDetailRoute: "/political/candidate/[id]",
    entityLabel: "Candidate",
    entityIdParam: "id",
    childLinks: [
      { name: "Campaign Contributions", href: "/political" },
      { name: "FEC Data", href: "/political?source=fec" },
      { name: "Cabinet Members", href: "/political?source=cabinet" },
    ],
    sortOrder: 5,
    status: "active",
  },
  {
    slug: "consumer",
    name: "Consumer Protection",
    iconName: "shield",
    color: "teal",
    description:
      "Monitor CFPB complaints, FTC data breaches, OFAC sanctions, and consumer fraud.",
    navLabel: "Consumer",
    searchType: "consumer_entity",
    entityDetailRoute: "/consumer/[id]",
    entityLabel: "Entity",
    entityIdParam: "id",
    childLinks: [
      { name: "CFPB Complaints", href: "/consumer" },
      { name: "FTC Breaches", href: "/consumer?source=ftc" },
      { name: "OFAC Sanctions", href: "/consumer?source=ofac" },
    ],
    sortOrder: 6,
    status: "active",
  },
  {
    slug: "financial-services",
    name: "Financial Services & Banking",
    iconName: "dollarSign",
    color: "amber",
    description:
      "Track banking violations, financial fraud, regulatory actions, and institutional risk.",
    navLabel: "Financial",
    searchType: "financial",
    sortOrder: 7,
    status: "beta",
  },
  {
    slug: "insurance",
    name: "Insurance Fraud",
    iconName: "fileText",
    color: "cyan",
    description:
      "Monitor insurance claims fraud, carrier violations, and payout irregularities.",
    navLabel: "Insurance",
    sortOrder: 8,
    status: "beta",
  },
  {
    slug: "cybersecurity",
    name: "Cybersecurity & Data Breaches",
    iconName: "lock",
    color: "slate",
    description:
      "Track data breaches, cyber attacks, vulnerability disclosures, and compliance failures.",
    navLabel: "Cyber",
    sortOrder: 9,
    status: "beta",
  },
  {
    slug: "environmental",
    name: "Environmental & Climate Fraud",
    iconName: "globe",
    color: "green",
    description:
      "Monitor environmental violations, carbon credit fraud, EPA enforcement, and climate misconduct.",
    navLabel: "Environment",
    searchType: "environmental",
    sortOrder: 10,
    status: "coming_soon",
  },
  {
    slug: "immigration",
    name: "Immigration & Visa Fraud",
    iconName: "passport",
    color: "orange",
    description:
      "Track immigration violations, visa fraud, sponsorship abuse, and border security issues.",
    navLabel: "Immigration",
    sortOrder: 11,
    status: "coming_soon",
  },
  {
    slug: "housing",
    name: "Housing & Real Estate Fraud",
    iconName: "home",
    color: "rose",
    description:
      "Monitor housing fraud, mortgage scams, foreclosure abuse, and real estate violations.",
    navLabel: "Housing",
    sortOrder: 12,
    status: "coming_soon",
  },
  {
    slug: "education",
    name: "Education & Student Loans",
    iconName: "bookOpen",
    color: "violet",
    description:
      "Track student loan fraud, university misconduct, Title VI violations, and education fund misuse.",
    navLabel: "Education",
    sortOrder: 13,
    status: "coming_soon",
  },
  {
    slug: "pharmaceutical",
    name: "Pharmaceutical & Medical Devices",
    iconName: "pill",
    color: "pink",
    description:
      "Monitor FDA violations, drug safety issues, medical device fraud, and healthcare product misconduct.",
    navLabel: "Pharma",
    sortOrder: 14,
    status: "coming_soon",
  },
  {
    slug: "energy",
    name: "Energy & Utilities",
    iconName: "zap",
    color: "yellow",
    description:
      "Track energy sector violations, utility fraud, grid security issues, and environmental compliance.",
    navLabel: "Energy",
    sortOrder: 15,
    status: "coming_soon",
  },
  {
    slug: "supply-chain",
    name: "Supply Chain & Import Fraud",
    iconName: "package",
    color: "stone",
    description:
      "Monitor import violations, customs fraud, supply chain abuse, and trade compliance failures.",
    navLabel: "Supply Chain",
    sortOrder: 16,
    status: "coming_soon",
  },
];

// ---- Helper Functions ----

/** Get a category by its slug */
export function getCategory(slug: string): CategoryConfig | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

/** Get all active categories sorted by sort order */
export function getActiveCategories(): CategoryConfig[] {
  return CATEGORIES.filter((c) => c.status === "active").sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Get all categories filtered by status */
export function getCategoriesByStatus(
  status: CategoryStatus,
): CategoryConfig[] {
  return CATEGORIES.filter((c) => c.status === status).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Get all categories, sorted */
export function getAllCategories(): CategoryConfig[] {
  return [...CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Get categories that have a search type mapping */
export function getSearchableCategories(): CategoryConfig[] {
  return CATEGORIES.filter((c) => c.searchType);
}

/** Get categories that have entity detail routes */
export function getDetailCategories(): CategoryConfig[] {
  return CATEGORIES.filter((c) => c.entityDetailRoute);
}

/** Get the color class for a category (for badges, icons, etc.) */
export function getCategoryColorClass(
  color: string,
  variant: "bg" | "text" | "border" = "bg",
): string {
  const colorMap: Record<string, { bg: string; text: string; border: string }> =
    {
      red: {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-200 dark:border-red-800",
      },
      blue: {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-700 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-800",
      },
      indigo: {
        bg: "bg-indigo-100 dark:bg-indigo-900/30",
        text: "text-indigo-700 dark:text-indigo-400",
        border: "border-indigo-200 dark:border-indigo-800",
      },
      emerald: {
        bg: "bg-emerald-100 dark:bg-emerald-900/30",
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-200 dark:border-emerald-800",
      },
      purple: {
        bg: "bg-purple-100 dark:bg-purple-900/30",
        text: "text-purple-700 dark:text-purple-400",
        border: "border-purple-200 dark:border-purple-800",
      },
      teal: {
        bg: "bg-teal-100 dark:bg-teal-900/30",
        text: "text-teal-700 dark:text-teal-400",
        border: "border-teal-200 dark:border-teal-800",
      },
      amber: {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-200 dark:border-amber-800",
      },
      cyan: {
        bg: "bg-cyan-100 dark:bg-cyan-900/30",
        text: "text-cyan-700 dark:text-cyan-400",
        border: "border-cyan-200 dark:border-cyan-800",
      },
      slate: {
        bg: "bg-slate-100 dark:bg-slate-900/30",
        text: "text-slate-700 dark:text-slate-400",
        border: "border-slate-200 dark:border-slate-800",
      },
      green: {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-700 dark:text-green-400",
        border: "border-green-200 dark:border-green-800",
      },
      orange: {
        bg: "bg-orange-100 dark:bg-orange-900/30",
        text: "text-orange-700 dark:text-orange-400",
        border: "border-orange-200 dark:border-orange-800",
      },
      rose: {
        bg: "bg-rose-100 dark:bg-rose-900/30",
        text: "text-rose-700 dark:text-rose-400",
        border: "border-rose-200 dark:border-rose-800",
      },
      violet: {
        bg: "bg-violet-100 dark:bg-violet-900/30",
        text: "text-violet-700 dark:text-violet-400",
        border: "border-violet-200 dark:border-violet-800",
      },
      pink: {
        bg: "bg-pink-100 dark:bg-pink-900/30",
        text: "text-pink-700 dark:text-pink-400",
        border: "border-pink-200 dark:border-pink-800",
      },
      yellow: {
        bg: "bg-yellow-100 dark:bg-yellow-900/30",
        text: "text-yellow-700 dark:text-yellow-400",
        border: "border-yellow-200 dark:border-yellow-800",
      },
      stone: {
        bg: "bg-stone-100 dark:bg-stone-900/30",
        text: "text-stone-700 dark:text-stone-400",
        border: "border-stone-200 dark:border-stone-800",
      },
    };

  const entry = colorMap[color] ?? {
    bg: "bg-gray-100 dark:bg-gray-900/30",
    text: "text-gray-700 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-800",
  };
  return entry[variant];
}

/** Build a full URL from a category's entity detail route and ID */
export function buildEntityUrl(
  category: CategoryConfig,
  entityId: string,
): string | null {
  if (!category.entityDetailRoute) return null;
  const param = category.entityIdParam ?? "id";
  return category.entityDetailRoute.replace(`[${param}]`, entityId);
}
