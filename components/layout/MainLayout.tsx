"use client";

import { Breadcrumbs, getBreadcrumbsFromPath } from "./Breadcrumbs";
import { Sidebar } from "./Sidebar";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface MainLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  hideSidebar?: boolean;
  hideBreadcrumbs?: boolean;
  className?: string;
  contentMaxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "7xl" | "full";
}

const CONTENT_MAX_WIDTH: Record<string, string> = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
  "2xl": "max-w-7xl",
  "7xl": "max-w-7xl",
  full: "max-w-full",
};

export function MainLayout({
  children,
  breadcrumbs,
  hideSidebar = false,
  hideBreadcrumbs = false,
  className = "",
  contentMaxWidth = "7xl",
}: MainLayoutProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pageKey, setPageKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate breadcrumbs from pathname if not provided
  const items = breadcrumbs ?? getBreadcrumbsFromPath(pathname);

  // Reset animation on pathname change
  useEffect(() => {
    setPageKey((prev) => prev + 1);
  }, [pathname]);

  const contentWidth = CONTENT_MAX_WIDTH[contentMaxWidth] || "max-w-7xl";

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Sidebar */}
      {!hideSidebar && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />
      )}

      {/* Main content area */}
      <div
        className={`flex-1 transition-all duration-200 ${
          !hideSidebar && !sidebarCollapsed ? "lg:ml-64" : ""
        } ${!hideSidebar && sidebarCollapsed ? "lg:ml-16" : ""}`}
      >
        <div className={`mx-auto w-full ${contentWidth} ${className}`}>
          {/* Breadcrumbs */}
          {!hideBreadcrumbs && items && items.length > 0 && (
            <div className="px-4 pt-4 sm:px-6 lg:px-8">
              <Breadcrumbs items={items} />
            </div>
          )}

          {/* Page content with fade-in animation */}
          <main
            ref={containerRef}
            key={pageKey}
            className={`px-4 pt-4 pb-12 sm:px-6 lg:px-8 animate-fade-in ${
              !hideBreadcrumbs && items && items.length > 0 ? "pt-2" : ""
            }`}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
