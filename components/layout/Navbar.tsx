"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { getActiveCategories } from "@/lib/categories";
import {
  IconSearch,
  IconMenu,
  IconX,
  IconChevronDown,
  IconSend,
} from "@/components/ui/Icons";

/* ---- Mobile Nav Overlay ---- */

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  const categories = getActiveCategories();

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute inset-y-0 left-0 w-80 max-w-full bg-gray-950 border-r border-gray-800 shadow-2xl animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <Link
            href="/"
            className="text-lg font-bold text-white"
            onClick={onClose}
          >
            <span className="text-red-500">Track</span>Fraud
          </Link>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Close menu"
          >
            <IconX />
          </button>
        </div>

        {/* Categories */}
        <nav className="px-3 py-4 space-y-1" aria-label="Mobile navigation">
          {categories.map((cat) => {
            const isActive =
              pathname === `/search?type=${cat.searchType}` ||
              pathname.startsWith(`/${cat.slug}`);

            return (
              <Link
                key={cat.slug}
                href={`/search?type=${cat.searchType || cat.slug}`}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-red-500/10 text-red-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                <span className="text-red-500/60 text-xs font-mono uppercase tracking-wider w-20 truncate">
                  {cat.navLabel || cat.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom CTA */}
        <div className="px-4 py-4 border-t border-gray-800">
          <Link
            href="/submit"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors"
          >
            <IconSend className="w-4 h-4" />
            Submit a Tip
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---- Category Nav Links ---- */

function CategoryNavLinks() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const categories = getActiveCategories();
  const primarySlugs = ["charities", "corporate", "government", "healthcare"];
  const primary = categories.filter((c) => primarySlugs.includes(c.slug));
  const more = categories.filter((c) => !primarySlugs.includes(c.slug));

  return (
    <>
      {primary.map((cat) => {
        const isActive =
          pathname === `/search?type=${cat.searchType}` ||
          pathname.startsWith(`/${cat.slug}`);

        return (
          <Link
            key={cat.slug}
            href={`/search?type=${cat.searchType || cat.slug}`}
            className={`shrink-0 px-3 py-1 rounded-md text-sm transition-colors ${
              isActive
                ? "text-white font-medium"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {cat.navLabel || cat.name}
          </Link>
        );
      })}

      {more.length > 0 && (
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((p) => !p)}
            className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-md text-sm text-gray-400 hover:text-white transition-colors"
          >
            More
            <IconChevronDown
              className={`w-3 h-3 transition-transform ${moreOpen ? "rotate-180" : ""}`}
            />
          </button>
          {moreOpen && (
            <div className="absolute left-0 mt-1 w-48 bg-gray-950 rounded-lg shadow-xl border border-gray-800 py-1 z-50 animate-fade-in">
              {more.map((cat) => {
                const isActive =
                  pathname === `/search?type=${cat.searchType}` ||
                  pathname.startsWith(`/${cat.slug}`);

                return (
                  <Link
                    key={cat.slug}
                    href={`/search?type=${cat.searchType || cat.slug}`}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-red-500/10 text-red-400"
                        : "text-gray-300 hover:bg-gray-800/50 hover:text-white"
                    }`}
                  >
                    {cat.navLabel || cat.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ---- Navbar ---- */

export function Navbar() {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Detect scroll for background opacity
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  // Is landing page?
  const isHome = pathname === "/";

  return (
    <>
      <header
        className={`sticky top-0 z-[var(--z-fixed)] transition-all duration-200 ${
          scrolled
            ? "bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/50"
            : isHome
              ? "bg-transparent border-b border-transparent"
              : "bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/50"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex h-10 items-center justify-between">
            {/* Left: Mobile hamburger + Logo */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
                aria-label="Open menu"
              >
                <IconMenu />
              </button>

              <Link
                href="/"
                className="flex items-center gap-1.5 text-lg font-bold text-white hover:opacity-80 transition-opacity"
              >
                <span className="text-red-500">Track</span>
                <span>Fraud</span>
              </Link>
            </div>

            {/* Center: Desktop category nav */}
            <nav
              className="hidden lg:flex items-center gap-1"
              aria-label="Categories"
            >
              <CategoryNavLinks />
            </nav>

            {/* Right: Search + CTA */}
            <div className="flex items-center gap-2">
              <Link
                href="/search"
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
                aria-label="Search"
              >
                <IconSearch />
              </Link>

              <Link
                href="/submit"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 text-white text-xs font-medium hover:bg-red-500 transition-colors"
              >
                <IconSend className="w-3.5 h-3.5" />
                Tip
              </Link>
            </div>
          </div>
        </div>
      </header>

      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
    </>
  );
}
