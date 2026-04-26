"use client";

import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

function formatLabel(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        {/* Home */}
        <li>
          <Link
            href="/"
            className="hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Home
          </Link>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1">
              <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">
                /
              </span>
              {isLast || !item.href ? (
                <span className="font-medium text-gray-900 dark:text-white" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Auto-generates breadcrumbs from the current pathname.
 * Use this helper in server components that don't pass explicit items.
 */
export function getBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    return {
      label: formatLabel(segment),
      href: index < segments.length - 1 ? href : undefined, // last item has no href (current page)
    };
  });
}