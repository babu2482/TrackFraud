import Link from "next/link";
import { prisma } from "@/lib/db";
import { DataSourcesMarquee } from "@/components/ui/DataSourcesMarquee";
import {
  IconSearch,
  IconActivity,
  IconDatabase,
  IconMapPin,
} from "@/components/ui/Icons";
import { FraudMap } from "@/components/FraudMapWrapper";

export const revalidate = 60;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(0) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

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
  } catch {
    return null;
  }
}

// Server-side HeroSearch component to avoid client bundle bloat on this form
function HeroSearch() {
  return (
    <form action="/search" className="max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
          <input
            type="search"
            name="q"
            placeholder="Search by name, EIN, CIK, or keywords..."
            className="w-full pl-12 pr-4 py-4 rounded-xl bg-gray-900/60 border border-gray-700/50 text-white placeholder-gray-500 text-base focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all backdrop-blur-sm"
            aria-label="Search fraud database"
          />
        </div>
        <button
          type="submit"
          className="px-8 py-4 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors shadow-lg shadow-red-500/10 sm:w-auto w-full text-sm uppercase tracking-wider"
        >
          Search
        </button>
      </div>
    </form>
  );
}

// Live stats ticker
function StatsTicker({
  stats,
}: {
  stats: Awaited<ReturnType<typeof getDatabaseStats>>;
}) {
  if (!stats) return null;

  const items = [
    {
      value: formatNumber(stats.charityProfiles),
      label: "Charities",
      icon: IconActivity,
    },
    {
      value: formatNumber(stats.corporateProfiles),
      label: "Companies",
      icon: IconDatabase,
    },
    {
      value: formatNumber(stats.corporateFilings),
      label: "SEC Filings",
      icon: IconActivity,
    },
    {
      value: formatNumber(stats.canonicalEntities),
      label: "Entities",
      icon: IconDatabase,
    },
    {
      value: stats.sourceSystems.toString(),
      label: "Data Sources",
      icon: IconMapPin,
    },
    { value: "Live", label: "Updated", icon: IconActivity },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 px-4 py-2">
      {items.map((item, i) => {
        const IconComp = item.icon;
        return (
          <span
            key={item.label}
            className="flex items-center gap-1.5 text-xs text-gray-500"
          >
            <IconComp className="w-3 h-3 text-red-500/40" />
            <span className="text-gray-300 font-semibold">{item.value}</span>
            <span>{item.label}</span>
            {i < items.length - 1 && (
              <span className="mx-2 text-gray-800">·</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default async function LandingPage() {
  const stats = await getDatabaseStats();

  return (
    <div className="relative">
      {/* ===== HERO: Map + Search ===== */}
      <section className="relative min-h-[calc(100vh-40px)] flex flex-col">
        {/* Top: Search area */}
        <div className="relative z-10 px-4 pt-12 pb-6 text-center">
          {/* Live indicator */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
              </span>
              <span className="text-green-400 text-xs font-medium">
                Live Data
              </span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Track <span className="text-red-500">Fraud</span> Across America
          </h1>
          <p className="mt-3 text-sm sm:text-base text-gray-400 max-w-xl mx-auto">
            Follow the money. Search 2M+ entities across charities,
            corporations, government contracts, and healthcare.
          </p>

          {/* Search */}
          <div className="mt-8">
            <HeroSearch />
          </div>
        </div>

        {/* Stats Ticker */}
        <div className="relative z-10 border-y border-gray-800/30 bg-gray-950/50 backdrop-blur-sm">
          <StatsTicker stats={stats} />
        </div>

        {/* Interactive Fraud Map */}
        <div className="relative z-10 flex-1 px-2 sm:px-4 py-4">
          <div className="max-w-7xl mx-auto h-full">
            <FraudMap />
          </div>
        </div>
      </section>

      {/* ===== DATA SOURCES MARQUEE ===== */}
      <div className="relative z-10">
        <DataSourcesMarquee />
      </div>

      {/* ===== CTA: Submit a Tip ===== */}
      <section className="relative z-10 border-t border-gray-800/50 bg-gray-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            See something? Say something.
          </h2>
          <p className="mt-3 text-gray-400 max-w-lg mx-auto">
            TrackFraud is powered by public data and community accountability.
            Anonymous tips welcome — no account required.
          </p>
          <Link
            href="/submit"
            className="mt-8 inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors shadow-lg shadow-red-500/10 text-sm uppercase tracking-wider"
          >
            Submit a Tip
          </Link>
        </div>
      </section>
    </div>
  );
}
