"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { getActiveCategories } from "@/lib/categories";

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
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 left-0 w-80 max-w-full bg-gray-950 border-r border-gray-800 shadow-2xl animate-slide-in-right overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">Filters</span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Close filters"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

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
                      ? "bg-red-500/10 text-red-400 font-medium"
                      : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500/40 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">
                    {cat.navLabel || cat.name}
                  </span>
                  {hasChildren && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-4 w-4 transition-transform flex-shrink-0 text-gray-500 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>

                {hasChildren && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-800 pl-3">
                    {cat.childLinks!.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="block rounded-md px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
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
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-[var(--z-overlay)] p-3 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-500 transition-colors"
        aria-label="Open filters"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </button>

      <aside
        className={`hidden lg:flex flex-col border-r border-gray-800 bg-gray-950 transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}
      >
        <div
          className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-4 py-3 border-b border-gray-800`}
        >
          {!collapsed && (
            <span className="text-sm font-semibold text-white">Filters</span>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
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

        {!collapsed && (
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="flex flex-wrap gap-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-blue-500/20 text-blue-400">
                All
                <button className="hover:text-blue-200">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3 h-3"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            </div>
          </div>
        )}

        <nav
          className={`flex-1 overflow-y-auto ${collapsed ? "px-2 py-2" : "px-3 py-3"} space-y-0.5 scrollbar-thin`}
          aria-label="Sidebar filters"
        >
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
                      ? "bg-red-500/10 text-red-400"
                      : "text-gray-500 hover:bg-gray-800/50 hover:text-gray-300"
                  }`}
                  title={cat.navLabel || cat.name}
                >
                  <span className="w-2 h-2 rounded-full bg-current" />
                </Link>
              );
            }

            return (
              <div key={cat.slug}>
                <button
                  onClick={() => hasChildren && toggleExpand(cat.slug)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-red-500/10 text-red-400 font-medium"
                      : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500/40 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">
                    {cat.navLabel || cat.name}
                  </span>
                  {hasChildren && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`h-4 w-4 transition-transform flex-shrink-0 text-gray-500 ${isExpanded ? "rotate-90" : ""}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>

                {hasChildren && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-800 pl-3">
                    {cat.childLinks!.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className="block rounded-md px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
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
      </aside>

      <MobileSidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
