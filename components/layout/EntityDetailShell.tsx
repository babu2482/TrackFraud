"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ReactNode, useState } from "react";
import {
  getCategory,
  getCategoryColorClass,
  CATEGORIES,
} from "@/lib/categories";
import { CategoryIcon, IconShield } from "@/components/ui/Icons";
import type { CategoryIconName } from "@/components/ui/Icons";

interface EntityDetailShellProps {
  title: string;
  subtitle?: string;
  entityId?: string;
  entityLabel?: string;
  categorySlug?: string;
  riskScore?: number;
  children: ReactNode;
  tabs?: TabConfig[];
  actionButtons?: ReactNode;
  externalLinks?: ExternalLink[];
}

interface TabConfig {
  id: string;
  label: string;
  content: ReactNode;
}

interface ExternalLink {
  label: string;
  url: string;
  icon?: string;
}

export function EntityDetailShell({
  title,
  subtitle,
  entityId,
  entityLabel,
  categorySlug,
  riskScore,
  children,
  tabs,
  actionButtons,
  externalLinks,
}: EntityDetailShellProps) {
  const params = useParams();
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.id ?? "overview");

  const category = categorySlug ? getCategory(categorySlug) : undefined;
  const categoryColor = category
    ? getCategoryColorClass(category.color, "bg")
    : "bg-gray-100 dark:bg-gray-800";
  const categoryIconName = (category?.iconName as CategoryIconName) ?? "shield";
  const categoryNavLabel = category?.navLabel ?? entityLabel ?? "Entity";

  // Breadcrumb items
  const categorySearchType = category?.searchType;
  const breadcrumbItems = [
    { label: "Home", href: "/" },
    {
      label: categoryNavLabel,
      href: categorySlug
        ? `/search?type=${categorySearchType || categorySlug}`
        : undefined,
    },
    { label: title, href: undefined },
  ];

  const riskColor =
    riskScore != null
      ? riskScore >= 70
        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        : riskScore >= 40
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : "";

  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <li>
            <Link
              href="/"
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Home
            </Link>
          </li>
          {breadcrumbItems.slice(1).map((item, index) => (
            <li key={item.label} className="flex items-center gap-1">
              <span
                className="text-gray-300 dark:text-gray-600"
                aria-hidden="true"
              >
                /
              </span>
              {item.href ? (
                <Link
                  href={item.href}
                  className="hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="font-medium text-gray-900 dark:text-white"
                  aria-current="page"
                >
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Header */}
      <div
        className={`rounded-xl p-6 sm:p-8 ${categoryColor} bg-opacity-20 dark:bg-opacity-10 border border-gray-200 dark:border-gray-800`}
      >
        <div className="flex items-start gap-4">
          <div className="text-red-500 flex-shrink-0">
            <CategoryIcon name={categoryIconName} className="w-10 h-10" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 text-gray-600 dark:text-gray-400">
                    {subtitle}
                  </p>
                )}
                {entityId && (
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 font-mono">
                    ID: {entityId}
                  </p>
                )}
                {riskScore != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${riskColor}`}
                    >
                      Risk: {riskScore}/100
                    </span>
                  </div>
                )}
              </div>
              {actionButtons && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {actionButtons}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* External links */}
        {externalLinks && externalLinks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {externalLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {link.icon && <span>{link.icon}</span>}
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      {tabs && tabs.length > 1 && (
        <div className="border-b border-gray-200 dark:border-gray-800">
          <nav className="flex gap-4 -mb-px" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-red-600 text-red-600 dark:border-red-500 dark:text-red-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <div>
        {tabs
          ? (tabs.find((t) => t.id === activeTab)?.content ?? tabs[0]?.content)
          : children}
      </div>

      {/* Report a concern section */}
      <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Report a concern
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          To report suspected fraud or misuse of funds related to this entity:
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/submit?category=${categorySlug || "general"}&entity=${encodeURIComponent(title)}&entityId=${entityId || ""}`}
            className="inline-block px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Submit a tip on TrackFraud
          </Link>
          <a
            href="https://www.nasconet.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
          >
            Find your state regulator
          </a>
        </div>
      </div>
    </div>
  );
}
