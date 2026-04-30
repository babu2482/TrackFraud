import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getActiveCategories } from "@/lib/categories";

const CATEGORY_ICONS: Record<string, string> = {
  heart: "❤️",
  landmark: "🏛",
  building: "🏢",
  banknotes: "💵",
  hospital: "🏥",
  "shield-alert": "🛡",
  vote: "🗳",
};

async function getDatabaseStats() {
  try {
    const [
      charityProfiles,
      corporateProfiles,
      corporateFilings,
      canonicalEntities,
      sourceSystems,
      ingestionRuns,
    ] = await Promise.all([
      prisma.charityProfile.count(),
      prisma.corporateCompanyProfile.count(),
      prisma.corporateFilingRecord.count(),
      prisma.canonicalEntity.count(),
      prisma.sourceSystem.count(),
      prisma.ingestionRun.count({
        where: { status: "completed" },
      }),
    ]);

    return {
      charityProfiles,
      corporateProfiles,
      corporateFilings,
      canonicalEntities,
      sourceSystems,
      ingestionRuns,
    };
  } catch (err) {
    console.error("[getDatabaseStats] Failed to fetch stats:", err);
    return null;
  }
}

async function getRecentTips() {
  try {
    const tips = await prisma.tip.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
    });
    return tips;
  } catch (err) {
    console.error("[getRecentTips] Failed to fetch recent tips:", err);
    return [];
  }
}

export const revalidate = 60;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "K";
  return n.toLocaleString();
}

export default async function LandingPage() {
  const categories = await prisma.fraudCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const stats = await getDatabaseStats();
  const recentTips = await getRecentTips();
  const activeCategories = await getActiveCategories();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-950 via-red-950/20 to-gray-950">
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 py-16 sm:py-24 lg:py-32">
          {/* Live status badge */}
          {stats && (
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live Data · {formatNumber(stats.canonicalEntities)} entities
                tracked
              </div>
            </div>
          )}

          {/* Headline */}
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight text-white">
              Track{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-600">
                Fraud
              </span>{" "}
              Across America
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
              Follow the money with real-time fraud tracking. Search 2+ million
              charities, political campaigns, corporations, government
              contracts, and healthcare payments.
            </p>

            {/* Hero Search */}
            <form action="/search" className="mt-10 max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="search"
                  name="q"
                  placeholder="Search by name, EIN, CIK, or keywords..."
                  className="flex-1 px-5 py-4 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-400 text-base focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all backdrop-blur-sm"
                  aria-label="Search fraud database"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="sm:w-auto w-full"
                >
                  <span>🔍</span>
                  <span>Search</span>
                </Button>
              </div>
              <p className="mt-3 text-sm text-gray-400">
                Search across charities, corporations, politicians, government
                contracts, and more
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* ===== LIVE STATS BANNER ===== */}
      {stats && (
        <section className="border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-red-50/50 via-white to-amber-50/50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-950">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
              <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(stats.charityProfiles)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Charities
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(stats.corporateProfiles)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Companies
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(stats.corporateFilings)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  SEC Filings
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(stats.canonicalEntities)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Entities
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.sourceSystems}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Data Sources
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.ingestionRuns}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Syncs
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== EXPLORE BY CATEGORY ===== */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Explore by Category
          </h2>
          <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Dive into specific areas of financial transparency and
            accountability.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeCategories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/search?type=${cat.searchType || cat.slug}`}
              className="group block p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-red-200 dark:hover:border-red-900/50 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-4">
                <span className="text-3xl flex-shrink-0">{cat.icon}</span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                    {cat.navLabel || cat.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {cat.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== RECENT TIPS ===== */}
      {recentTips.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Latest Community Tips
            </h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400">
              Recent reports from the community.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {recentTips.map((tip) => (
              <Card key={tip.id} className="p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {tip.entityName || "Unknown Entity"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-3">
                  {tip.description}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {new Date(tip.createdAt).toLocaleDateString()}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ===== SUBMIT TIP CTA ===== */}
      <section className="border-t border-gray-200 dark:border-gray-800 bg-gradient-to-r from-red-600 to-red-700 dark:from-red-800 dark:to-red-900">
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            See something? Say something.
          </h2>
          <p className="text-red-100 mb-8 max-w-lg mx-auto">
            TrackFraud is powered by public data and community accountability.
            Anonymous tips welcome — no account required.
          </p>
          <Link
            href="/submit"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-red-600 font-semibold hover:bg-red-50 transition-colors shadow-lg"
          >
            Submit a Tip
          </Link>
        </div>
      </section>

      {/* ===== DATA SOURCES ===== */}
      <section className="border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <h3 className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-6">
            Data from Public Records
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400 dark:text-gray-500">
            {[
              "IRS",
              "SEC",
              "FEC",
              "CFPB",
              "CMS",
              "OFAC",
              "EPA",
              "FDA",
              "HHS",
              "SAM.gov",
              "Congress.gov",
              "USASpending.gov",
            ].map((source) => (
              <span
                key={source}
                className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
