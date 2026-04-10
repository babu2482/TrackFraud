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

export const revalidate = 300;

export default async function LandingPage() {
  const categories = await prisma.fraudCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { tips: true } } },
  });

  const totalTips = await prisma.tip.count();

  return (
    <div className="space-y-16">
      <section className="text-center py-12 sm:py-20">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Track <span className="text-red-600 dark:text-red-500">All</span> Fraud
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          One platform to follow the money with category-specific fraud meters.
          Charity transparency, political spending, corporate disclosures,
          government contracts, and more — powered by public records and
          community tips.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/charities"
            className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
          >
            Explore Charities
          </Link>
          <Link
            href="/submit"
            className="px-6 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Submit a Tip
          </Link>
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

      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-8">
          Fraud Categories
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const isActive = cat.status === "active";
            const icon = CATEGORY_ICONS[cat.iconName ?? ""] ?? "📊";

            const cardContent = (
              <>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{icon}</span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {STATUS_LABELS[cat.status] ?? cat.status}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {cat.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {cat.description}
                </p>
                {cat._count.tips > 0 && (
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                    {cat._count.tips} {cat._count.tips === 1 ? "tip" : "tips"} submitted
                  </p>
                )}
                {!isActive && (
                  <p className="mt-4 text-sm text-red-600 dark:text-red-400 font-medium">
                    Learn more & subscribe →
                  </p>
                )}
              </>
            );

            const cardClass = `relative block p-6 rounded-xl border transition-all ${
              isActive
                ? "border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 hover:shadow-md"
                : "border-gray-200 dark:border-gray-700 opacity-80 hover:opacity-100"
            } bg-white dark:bg-gray-900`;

            return (
              <Link key={cat.id} href={`/${cat.slug}`} className={cardClass}>
                {cardContent}
              </Link>
            );
          })}
        </div>
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
