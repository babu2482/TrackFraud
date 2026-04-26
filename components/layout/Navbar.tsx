"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { CATEGORIES, getActiveCategories, getCategoryColorClass } from "@/lib/categories";

/* ---- Dark mode toggle (shared hook) ---- */

function useDarkMode() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("trackfraud-theme");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (isDark: boolean) => {
      document.documentElement.classList.toggle("dark", isDark);
      setDark(isDark);
    };

    if (stored === "dark") apply(true);
    else if (stored === "light") apply(false);
    else apply(mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      if (!stored) apply(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("trackfraud-theme", next ? "dark" : "light");
    setDark(next);
  }, [dark]);

  return { dark, toggle };
}

/* ---- Command Palette ---- */

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Build search results from registry
  const results = CATEGORIES.filter(
    (c) =>
      c.status === "active" &&
      (c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 8);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if (!isOpen) setQuery("");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-24 px-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-gray-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories, entities..."
            className="flex-1 py-4 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none text-base"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2" ref={activeRef}>
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No results found
            </div>
          ) : (
            results.map((cat) => (
              <Link
                key={cat.slug}
                href={`/search?type=${cat.searchType || cat.slug}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                onClick={onClose}
              >
                <span className="text-xl flex-shrink-0">{cat.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {cat.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {cat.description}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">⌘K</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">↑↓</kbd>
              Navigate
            </span>
          </div>
          <span>Enter to open</span>
        </div>
      </div>
    </div>
  );
}

/* ---- Mobile Navigation ---- */

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel - slide from left */}
      <div className="absolute inset-y-0 left-0 w-80 max-w-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white" onClick={onClose}>
            <span className="text-red-600 dark:text-red-500">Track</span>Fraud
          </Link>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Close menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Link href="/search" onClick={onClose} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 text-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search entities...
          </Link>
        </div>

        {/* Categories */}
        <nav className="px-3 py-3" aria-label="Mobile navigation">
          {getActiveCategories().map((cat) => {
            const isActive =
              pathname === `/search?type=${cat.searchType}` ||
              pathname.startsWith(`/${cat.slug}`);
            return (
              <div key={cat.slug}>
                <Link
                  href={`/search?type=${cat.searchType || cat.slug}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  onClick={onClose}
                >
                  <span className="text-lg">{cat.icon}</span>
                  {cat.navLabel || cat.name}
                </Link>
                {cat.childLinks && (
                  <div className="ml-8 mt-0.5 space-y-0.5">
                    {cat.childLinks.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block px-3 py-1.5 rounded-md text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                        onClick={onClose}
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom links */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
          <Link href="/about" className="block px-3 py-2 rounded-md text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onClick={onClose}>
            About
          </Link>
          <Link href="/submit" className="block px-3 py-2 rounded-md text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium" onClick={onClose}>
            Submit a Tip
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---- Navbar ---- */

export function Navbar() {
  const pathname = usePathname();
  const { dark, toggle } = useDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  // Global keyboard shortcuts (consolidated: ⌘K + Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Only open if not already open — let CommandPalette handle its own close
        setCommandOpen((prev) => (prev ? prev : true));
      }
      if (e.key === "Escape") {
        setMobileNavOpen(false);
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (mobileNavOpen || commandOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen, commandOpen]);

  const activeCategories = getActiveCategories();

  return (
    <>
      <header className="sticky top-0 z-[var(--z-fixed)] border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-950/60">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Left: Mobile hamburger + Logo */}
            <div className="flex items-center gap-2">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Open menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white hover:opacity-80 transition-opacity">
                <span className="text-red-600 dark:text-red-500">Track</span>Fraud
              </Link>
            </div>

            {/* Center: Desktop category pills (hidden on mobile) */}
            <nav className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-thin flex-1 justify-center" aria-label="Entity categories">
              {activeCategories.map((cat) => {
                const isActive =
                  pathname === `/search?type=${cat.searchType}` ||
                  pathname.startsWith(`/${cat.slug}`);
                return (
                  <Link
                    key={cat.slug}
                    href={`/search?type=${cat.searchType || cat.slug}`}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <span className="text-sm">{cat.icon}</span>
                    <span className="hidden xl:inline">{cat.navLabel || cat.name}</span>
                    <span className="xl:hidden">{cat.navLabel || cat.name.split(" ")[0]}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right: Search bar + Command palette + Dark mode */}
            <div className="flex items-center gap-2">
              {/* Search bar (desktop) */}
              <button
                onClick={() => setCommandOpen(true)}
                aria-label="Open search"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 text-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors max-w-64"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="truncate">Search...</span>
                <kbd className="ml-2 hidden lg:inline-flex items-center px-1 py-0.5 text-[10px] font-medium text-gray-400 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                  ⌘K
                </kbd>
              </button>

              {/* Mobile search icon */}
              <Link
                href="/search"
                className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </Link>

              {/* Dark mode toggle */}
              <button
                onClick={toggle}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {dark ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Command palette */}
      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} />
    </>
  );
}