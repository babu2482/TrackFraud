import Link from "next/link";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { CATEGORIES, getCategory, getCategoryColorClass } from "@/lib/categories";

type CategoryPageProps = { params: Promise<{ category: string }> };

async function getCategoryStats(slug: string) {
  try {
    const category = getCategory(slug);
    if (!category) return null;

    let count = 0;
    switch (category.slug) {
      case "charities":
        count = await prisma.charityProfile.count();
        break;
      case "corporate":
        count = await prisma.corporateCompanyProfile.count();
        break;
      case "government":
        count = await prisma.canonicalEntity.count();
        break;
      case "healthcare":
        count = await prisma.cMSProgramSafeguardExclusion.count();
        break;
      case "political":
        count = await prisma.cabinetMember.count();
        break;
      case "consumer":
        count = await prisma.consumerCompanySummary.count();
        break;
      default:
        count = 0;
    }

    return count;
  } catch {
    return null;
  }
}

interface EntityRow {
  id: string;
  name: string;
  ein?: string;
  cik?: string;
  state: string | null;
  riskScore: number | null;
  date: Date;
}

async function getRecentEntities(slug: string): Promise<EntityRow[]> {
  try {
    const category = getCategory(slug);
    if (!category) return [];

    switch (category.slug) {
      case "charities": {
        const charities = await prisma.charityProfile.findMany({
          take: 10,
          orderBy: { updatedAt: "desc" },
          select: {
            ein: true,
            state: true,
            updatedAt: true,
            CanonicalEntity: {
              select: { displayName: true },
            },
          },
        });
        return charities.map((c) => ({
          id: c.ein ?? crypto.randomUUID(),
          name: (c as any).CanonicalEntity?.displayName ?? c.ein,
          ein: c.ein,
          state: c.state,
          riskScore: null,
          date: c.updatedAt,
        }));
      }
      case "corporate": {
        const companies = await prisma.corporateCompanyProfile.findMany({
          take: 10,
          orderBy: { updatedAt: "desc" },
          select: {
            cik: true,
            stateOfIncorporation: true,
            updatedAt: true,
            CanonicalEntity: {
              select: { displayName: true },
            },
          },
        });
        return companies.map((c) => ({
          id: c.cik ?? crypto.randomUUID(),
          name: (c as any).CanonicalEntity?.displayName ?? c.cik,
          cik: c.cik,
          state: c.stateOfIncorporation,
          riskScore: null,
          date: c.updatedAt,
        }));
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

export const revalidate = 300;

export default async function CategoryLandingPage({ params }: CategoryPageProps) {
  const category = getCategory((await params).category);

  if (!category) notFound();

  const count = await getCategoryStats(category.slug);
  const recentEntities = await getRecentEntities(category.slug);

  const colorClasses = getCategoryColorClass(category.color, "bg");

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className={`rounded-xl p-6 sm:p-8 ${colorClasses} bg-opacity-20 dark:bg-opacity-10 border border-gray-200 dark:border-gray-800`}>
        <div className="flex items-start gap-4">
          <span className="text-4xl">{category.icon}</span>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {category.name}
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400 max-w-2xl">
              {category.description}
            </p>
            {count !== null && (
              <div className="mt-4 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {count.toLocaleString()}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {category.entityLabel || "Entities"}
                  </span>
                </div>
                {category.childLinks && (
                  <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span>•</span>
                    <span>{category.childLinks.length} sub-categories</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-links */}
      {category.childLinks && category.childLinks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {category.childLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="card card-hover group p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                    {link.name}
                  </h3>
                  {link.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {link.description}
                    </p>
                  )}
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Recent Entities */}
      {recentEntities.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recently Updated
          </h2>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    ID
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    State
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Risk
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentEntities.slice(0, 5).map((entity) => {
                  const entityId = entity.ein || entity.cik || entity.id;
                  const detailHref = category.entityDetailRoute
                    ? category.entityDetailRoute.replace(
                        `[${category.entityIdParam || "id"}]`,
                        entityId
                      )
                    : "#";

                  return (
                    <tr
                      key={entity.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                        <Link
                          href={detailHref}
                          className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          {entity.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {entityId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {entity.state || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            (entity.riskScore ?? 0) >= 70
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : (entity.riskScore ?? 0) >= 40
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}
                        >
                          {entity.riskScore != null ? entity.riskScore : "Low"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(entity.date).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-center">
            <Link
              href={`/search?type=${category.searchType || category.slug}`}
              className="inline-block px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              View All {category.navLabel || category.name}
            </Link>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="text-center py-8 border-t border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Ready to explore {category.name}?
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
          Search across {count?.toLocaleString() ?? "thousands"} of {category.entityLabel?.toLowerCase() ?? "entities"} with advanced filters.
        </p>
        <Link
          href={`/search?type=${category.searchType || category.slug}`}
          className="inline-block px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
        >
          Search {category.navLabel || category.name}
        </Link>
      </div>
    </div>
  );
}

// Generate static params for all categories
export function generateStaticParams() {
  return CATEGORIES.map((cat) => ({
    category: cat.slug,
  }));
}