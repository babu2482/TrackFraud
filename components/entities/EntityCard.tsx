import Link from "next/link";
import { Badge } from "../ui/Badge";
import { StatusBadge } from "../ui/StatusBadge";

interface EntityCardProps {
  entity: {
    id: string;
    name: string;
    category: string;
    href: string;
    description?: string;
    riskScore?: number;
    location?: string;
    identifiers?: string[];
  };
}

function getRiskLevel(score?: number): "low" | "medium" | "high" | "critical" {
  if (score == null) return "low";
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

const CATEGORY_ICONS: Record<string, string> = {
  charity: "❤",
  corporate: "🏢",
  government: "🏛",
  healthcare: "🏥",
  political: "🗳",
  consumer: "🛡",
};

export function EntityCard({ entity }: EntityCardProps) {
  const riskLevel = getRiskLevel(entity.riskScore);
  const icon = CATEGORY_ICONS[entity.category.toLowerCase()] ?? "📊";

  return (
    <Link
      href={entity.href}
      className="block p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Category Icon */}
        <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">
          {icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {entity.name}
            </h3>
            {entity.riskScore != null && (
              <StatusBadge riskLevel={riskLevel} />
            )}
            <Badge>{entity.category}</Badge>
          </div>

          {entity.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
              {entity.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {entity.location && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {entity.location}
              </span>
            )}
            {entity.identifiers && entity.identifiers.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                {entity.identifiers.slice(0, 2).join(", ")}
              </span>
            )}
            {entity.riskScore != null && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Score: {entity.riskScore}/100
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-1"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}