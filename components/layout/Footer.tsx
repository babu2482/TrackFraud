"use client";

import Link from "next/link";
import { IconGithub } from "@/components/ui/Icons";

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

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Submit Tip", href: "/submit" },
  { label: "Methods", href: "/about#methods" },
];

const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Takedown", href: "/contact/takedown" },
];

export function Footer() {
  return (
    <footer className="border-t border-gray-800/50 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Top: Logo + Tagline + Links */}
        <div className="flex flex-col items-center text-center gap-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xl font-bold text-white hover:opacity-80 transition-opacity"
          >
            <span className="text-red-500">Track</span>
            <span>Fraud</span>
          </Link>

          <p className="text-sm text-gray-500 max-w-sm">
            Follow the money. Track fraud across charities, corporations,
            government, and more.
          </p>

          {/* Nav links */}
          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/babu2482/TrackFraud"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <IconGithub className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Middle: Data sources */}
        <div className="mt-8 pt-6 border-t border-gray-800/50">
          <p className="text-center text-xs text-gray-600 mb-3">
            Data from public records
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-gray-500">
            {DATA_SOURCES.map((source, i) => (
              <span key={source} className="whitespace-nowrap">
                {source}
                {i < DATA_SOURCES.length - 1 && (
                  <span className="mx-2 text-gray-700">·</span>
                )}
              </span>
            ))}
            <span className="whitespace-nowrap text-gray-600">+ 32 more</span>
          </div>
        </div>

        {/* Bottom: Copyright + Legal + Disclaimer */}
        <div className="mt-8 pt-6 border-t border-gray-800/50 flex flex-col items-center gap-3">
          <p className="text-xs text-gray-600 max-w-lg text-center">
            Data sourced from public records. Not legal advice. Use at your own
            discretion. If you believe data about you is inaccurate, please use
            our{" "}
            <Link
              href="/contact/takedown"
              className="text-gray-400 hover:text-white underline"
            >
              takedown process
            </Link>
            .
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
            <p className="text-xs text-gray-600">
              &copy; {new Date().getFullYear()} TrackFraud. Built for public
              accountability.
            </p>
            <div className="flex items-center gap-4">
              {LEGAL_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
