import { Badge } from "../ui/Badge";
import { StatusBadge } from "../ui/StatusBadge";
import { CategoryIcon } from "../ui/Icons";
import type { CategoryIconName } from "../ui/Icons";
import { getCategory } from "@/lib/categories";

interface EntityHeaderProps {
  name: string;
  category: string;
  riskScore?: number;
  identifiers?: { type: string; value: string }[];
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

function getRiskLevel(score?: number): "low" | "medium" | "high" | "critical" {
  if (score == null) return "low";
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// Map search entity types to category icon names
const SEARCH_TYPE_TO_ICON: Record<string, CategoryIconName> = {
  charity: "heart",
  corporation: "building",
  government_contractor: "landmark",
  healthcare_provider: "hospital",
  politician: "vote",
  consumer_entity: "shield",
  financial: "dollarSign",
  default: "shield",
};

export function EntityHeader({
  name,
  category,
  riskScore,
  identifiers,
  description,
  actionLabel,
  actionHref,
}: EntityHeaderProps) {
  const riskLevel = getRiskLevel(riskScore);
  // Try to find icon from category config, then fall back to search type map
  const catConfig = getCategory(category.toLowerCase());
  const iconName =
    (catConfig?.iconName as CategoryIconName) ??
    SEARCH_TYPE_TO_ICON[category.toLowerCase()] ??
    SEARCH_TYPE_TO_ICON.default;

  return (
    <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Left: Name + metadata */}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="text-red-500" aria-hidden="true">
              <CategoryIcon name={iconName} className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {name}
              </h1>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <StatusBadge riskLevel={riskLevel} />
                <Badge>{category}</Badge>
                {riskScore != null && <Badge>Score: {riskScore}/100</Badge>}
              </div>
            </div>
          </div>

          {/* Identifiers */}
          {identifiers && identifiers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {identifiers.map((id) => (
                <span
                  key={`${id.type}-${id.value}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  <span className="font-semibold text-gray-500 dark:text-gray-500">
                    {id.type}:
                  </span>
                  {id.value}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {description && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
              {description}
            </p>
          )}
        </div>

        {/* Right: Action button */}
        {actionLabel && actionHref && (
          <a
            href={actionHref}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors self-start"
          >
            {actionLabel}
          </a>
        )}
      </div>
    </div>
  );
}
