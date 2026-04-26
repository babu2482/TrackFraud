"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { CATEGORIES, getActiveCategories, getCategoryColorClass } from "@/lib/categories";

/* ---- Mobile Sidebar Drawer ---- */

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const toggleExpand = (slug: string) => {
    setExpanded((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel - slide from left */}
      <div className="absolute inset-y-0 left-0 w-80 max-w-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Filters</span>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close filters">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Active filters */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              All Categories
              <button className="hover:text-blue-900 dark:hover:text-blue-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          </div>
          <button className="mt-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            Clear all filters
          </button>
        </div>

        {/* Categories */}
        <nav className="px-3 py-3 space-y-0.5" aria-label="Sidebar filters">
          {getActiveCategories().map((cat) => {
            const isActive =
              pathname === `/search?type=${cat.searchType}` ||
              pathname.startsWith(`/${cat.slug}`);
            const isExpanded = !!expanded[cat.slug];
            const hasChildren = !!cat.childLinks && cat.childLinks.length > 0;

            return (
              <div key={cat.slug}>
                <button
                  onClick={() => hasChildren && toggleExpand(cat.slug)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-medium"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span className="text-base flex-shrink-0">{cat.icon}</span>
                  <span className="flex-1 text-left truncate">{cat.navLabel || cat.name}</span>
                  {hasChildren && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-4 w-4 transition-transform flex-shrink-0 text-gray-400 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>

                {hasChildren && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-200 dark:border-gray-700 pl-3">
                    {cat.childLinks!.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="block rounded-md px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                          onClick={onClose}
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom: Filter options */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Risk Level
            </label>
            <select className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
              <option>All Levels</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              State
            </label>
            <select className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
              <option>All States</option>
              <option>Alabama</option>
              <option>Alaska</option>
              <option>Arizona</option>
              <option>California</option>
              <option>Colorado</option>
              <option>Connecticut</option>
              <option>Florida</option>
              <option>Georgia</option>
              <option>Illinois</option>
              <option>New York</option>
              <option>Texas</option>
              <option>Washington</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Desktop Sidebar ---- */

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (slug: string) => {
    setExpanded((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  return (
    <>
      {/* Mobile filter button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-[var(--z-overlay)] p-3 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 transition-colors"
        aria-label="Open filters"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}>
        {/* Header */}
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-4 py-3 border-b border-gray-200 dark:border-gray-800`}>
          {!collapsed && (
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Filters</span>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Active filters chips */}
        {!collapsed && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            <div className="flex flex-wrap gap-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                All
                <button className="hover:text-blue-900 dark:hover:text-blue-200">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            </div>
          </div>
        )}

        {/* Categories */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-2 py-2" : "px-3 py-3"} space-y-0.5 scrollbar-thin`} aria-label="Sidebar filters">
          {getActiveCategories().map((cat) => {
            const isActive =
              pathname === `/search?type=${cat.searchType}` ||
              pathname.startsWith(`/${cat.slug}`);
            const isExpanded = !!expanded[cat.slug];
            const hasChildren = !!cat.childLinks && cat.childLinks.length > 0;

            if (collapsed) {
              return (
                <Link
                  key={cat.slug}
                  href={`/search?type=${cat.searchType || cat.slug}`}
                  className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                    isActive
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                  }`}
                  title={cat.navLabel || cat.name}
                >
                  <span className="text-lg">{cat.icon}</span>
                </Link>
              );
            }

            return (
              <div key={cat.slug}>
                <button
                  onClick={() => hasChildren && toggleExpand(cat.slug)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-medium"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span className="text-base flex-shrink-0">{cat.icon}</span>
                  <span className="flex-1 text-left truncate">{cat.navLabel || cat.name}</span>
                  {hasChildren && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-4 w-4 transition-transform flex-shrink-0 text-gray-400 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>

                {hasChildren && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-200 dark:border-gray-700 pl-3">
                    {cat.childLinks!.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="block rounded-md px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom filter options */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Risk Level
              </label>
              <select className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
                <option>All Levels</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                State
              </label>
              <select className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
                <option>All States</option>
                <option>AL</option>
                <option>CA</option>
                <option>FL</option>
                <option>NY</option>
                <option>TX</option>
              </select>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile sidebar drawer */}
      <MobileSidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}