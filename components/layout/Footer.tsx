"use client";

import Link from "next/link";
import { getActiveCategories } from "@/lib/categories";

export interface FooterProps {
  variant?: "full" | "minimal";
  className?: string;
}

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Submit a Tip", href: "/submit" },
  { label: "API Docs", href: "/api" },
  { label: "Methods", href: "/about#methods" },
];

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Cookie Policy", href: "/cookies" },
];

const DATA_SOURCES = [
  "IRS",
  "SEC",
  "FEC",
  "CFPB",
  "CMS",
  "OFAC",
  "EPA",
  "FDA",
  "HHS",
  "SAM.gov",
  "Congress.gov",
  "USASpending.gov",
  "ProPublica",
];

export function Footer({ variant = "full", className = "" }: FooterProps) {
  if (variant === "minimal") {
    return (
      <footer
        className={`border-t border-gray-200 dark:border-gray-800 py-4 px-4 ${className}`}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} TrackFraud · Built for public
            accountability
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            {DATA_SOURCES.slice(0, 6).join(" · ")} · and more
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Main footer content */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-4 lg:mb-0">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white hover:opacity-80 transition-opacity"
            >
              <span className="text-red-600 dark:text-red-500">Track</span>Fraud
            </Link>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              Follow the money. Track fraud across charities, corporations,
              government, and more.
            </p>
            {/* Social / links */}
            <div className="mt-4 flex items-center gap-3">
              <a
                href="https://github.com/babu2482/TrackFraud"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="GitHub"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Explore categories */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Explore
            </h3>
            <ul className="space-y-2">
              {getActiveCategories().map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/search?type=${cat.searchType || cat.slug}`}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {cat.navLabel || cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data Sources */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Data Sources
            </h3>
            <ul className="space-y-2">
              {DATA_SOURCES.map((source) => (
                <li key={source}>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {source}
                  </span>
                </li>
              ))}
              <li>
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  + 17 more
                </span>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Resources
            </h3>
            <ul className="space-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/submit"
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors font-medium"
                >
                  Submit a Tip
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center sm:text-left">
            © {new Date().getFullYear()} TrackFraud · Data from{" "}
            {DATA_SOURCES.join(", ")}, and other public records.
            <span className="block mt-1">
              Built for public accountability. Not legal advice.
            </span>
          </p>
          <div className="flex items-center gap-4">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
