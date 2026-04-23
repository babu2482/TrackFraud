import Link from "next/link";
import { prisma } from "@/lib/db";
import { FraudMap } from "@/components/FraudMap";

const CATEGORY_ICONS: Record<string, string> = {
  heart: "❤",
  landmark: "🏛",
  building: "🏢",
  banknotes: "💵",
  hospital: "🏥",
  "shield-alert": "🛡",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Live",
  beta: "Beta",
  coming_soon: "Coming Soon",
};

export const revalidate = 60;

async function getDatabaseStats() {
  try {
    const [
      charityProfiles,
      corporateProfiles,
      corporateFilings,
      canonicalEntities,
      entityIdentifiers,
      fraudSnapshots,
      ingestionRuns,
      sourceSystems,
    ] = await Promise.all([
      prisma.charityProfile.count(),
      prisma.corporateCompanyProfile.count(),
      prisma.corporateFilingRecord.count(),
      prisma.canonicalEntity.count(),
      prisma.entityIdentifier.count(),
      prisma.fraudSnapshot.count(),
      prisma.ingestionRun.count({
        where: { status: "completed" },
      }),
      prisma.sourceSystem.count(),
    ]);

    const recentIngestions = await prisma.ingestionRun.findMany({
      take: 5,
      orderBy: { startedAt: "desc" },
      include: {
        SourceSystem: { select: { name: true, slug: true } },
      },
    });

    return {
      charityProfiles,
      corporateProfiles,
      corporateFilings,
      canonicalEntities,
      entityIdentifiers,
      fraudSnapshots,
      ingestionRuns,
      sourceSystems,
      recentIngestions,
    };
  } catch (error) {
    console.error("Error fetching database stats:", error);
    return null;
  }
}

export default async function LandingPage() {
  const categories = await prisma.fraudCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { Tip: true } } },
  });

  const totalTips = await prisma.tip.count();
  const stats = await getDatabaseStats();

  return (
    <div className="space-y-12">
      {/* Live Stats Banner */}
      {stats && (
        <section className="border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-950/20 dark:to-amber-950/20">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live Data
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-900/80">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {(stats.charityProfiles / 1000000).toFixed(1)}M
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Charities</p>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-900/80">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {stats.corporateProfiles.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Companies</p>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-900/80">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {(stats.corporateFilings / 1000).toFixed(0)}K
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">SEC Filings</p>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-900/80">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {(stats.canonicalEntities / 1000000).toFixed(2)}M
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Entities</p>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-900/80">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {stats.sourceSystems}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Data Sources</p>
              </div>
              <div className="p-2 rounded-lg bg-white/80 dark:bg-gray-900/80">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {stats.ingestionRuns}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Syncs</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="text-center py-12 sm:py-20">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Track <span className="text-red-600 dark:text-red-500">Fraud</span>{" "}
          Across America
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
          Follow the money with real-time fraud tracking. Search 2+ million charities,
          political campaigns, corporations, government contracts, and healthcare payments.
          Powered by public records from the IRS, SEC, FEC, and other government agencies.
        </p>
         {/* Hero Search Input */}
         <div className="mt-8 max-w-2xl mx-auto">
           <form action="/search" className="flex gap-2 flex-wrap justify-center">
             <input
               type="search"
               name="q"
               placeholder="Search by name, EIN, CIK, or keywords..."
               className="flex-1 min-w-[250px] px-5 py-4 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 text-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
               aria-label="Search fraud database"
             />
             <button
               type="submit"
               className="px-8 py-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-lg transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl"
             >
               <span>🔍</span>
               <span>Search</span>
             </button>
           </form>
           <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
             Search across charities, corporations, politicians, government contracts, and more
           </p>
         </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-4">
          Fraud Heatmap
        </h2>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xl mx-auto">
          Pick a fraud category below. The US heatmap and fraud filters apply to{" "}
          <strong className="font-medium text-gray-700 dark:text-gray-300">
            Charities &amp; Nonprofits
          </strong>{" "}
          (IRS Form 990 data). Other categories open their own fraud explorers.
        </p>
        <FraudMap
          platformCategories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            status: c.status,
            icon: CATEGORY_ICONS[c.iconName ?? ""] ?? "📊",
          }))}
        />
      </section>

      {totalTips > 0 && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {totalTips} community {totalTips === 1 ? "tip" : "tips"} submitted
          </div>
        </div>
      )}

      <section className="text-center py-8 border-t border-gray-200 dark:border-gray-800">
        {categories.filter((cat) => cat.status === "coming_soon").length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              More Categories Coming Soon
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {categories
                .filter((cat) => cat.status === "coming_soon")
                .map((cat) => cat.name)
                .join(", ")}
            </p>
          </div>
        )}
      </section>
      <section className="text-center py-8 border-t border-gray-200 dark:border-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
          See something? Say something.
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-lg mx-auto">
          TrackFraud is powered by public data and community accountability.
          Anonymous tips welcome — no account required.
        </p>
        <Link
          href="/submit"
          className="inline-block px-6 py-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          Submit a Tip
        </Link>
      </section>
    </div>
  );
}
