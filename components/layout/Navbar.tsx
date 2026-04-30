"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { getActiveCategories } from "@/lib/categories";

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
  const activeRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      activeRef.current = 0;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = getActiveCategories()
    .filter(
      (c) =>
        !query ||
        (c.navLabel || c.name).toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeRef.current = Math.min(activeRef.current + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeRef.current = Math.max(activeRef.current - 1, 0);
    } else if (e.key === "Enter" && results[activeRef.current]) {
      e.preventDefault();
      const cat = results[activeRef.current];
      window.location.href = `/search?type=${cat.searchType || cat.slug}`;
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center pt-24 px-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-gray-200 dark:border-gray-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5 text-gray-400"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search entities..."
            className="flex-1 py-3 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none text-sm"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {query ? "No categories match" : "Start typing to search..."}
            </p>
          ) : (
            results.map((cat, i) => (
              <Link
                key={cat.slug}
                href={`/search?type=${cat.searchType || cat.slug}`}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  i === activeRef.current
                    ? "bg-gray-100 dark:bg-gray-800"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
              >
                <span className="text-lg">{cat.icon}</span>
                <span className="text-gray-900 dark:text-white">
                  {cat.navLabel || cat.name}
                </span>
              </Link>
            ))
          )}
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
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute inset-y-0 left-0 w-80 max-w-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-in-right overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"
            onClick={onClose}
          >
            <span className="text-red-600 dark:text-red-500">Track</span>Fraud
          </Link>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close menu"
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

        <nav className="px-3 py-3 space-y-0.5" aria-label="Mobile navigation">
          <Link
            href="/search"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={onClose}
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search
          </Link>
          <div className="pt-2 pb-1">
            <span className="px-3 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Categories
            </span>
          </div>
          {getActiveCategories().map((cat) => {
            const isActive =
              pathname === `/search?type=${cat.searchType}` ||
              pathname.startsWith(`/${cat.slug}`);
            return (
              <Link
                key={cat.slug}
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
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
          <Link
            href="/about"
            className="block px-3 py-2 rounded-md text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={onClose}
          >
            About
          </Link>
          <Link
            href="/submit"
            className="block px-3 py-2 rounded-md text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium"
            onClick={onClose}
          >
            Submit a Tip
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---- Category Dropdown for Desktop ---- */

function CategoryDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Primary categories shown directly in navbar
  const primarySlugs = ["charities", "corporate", "government"];
  const allCategories = getActiveCategories();
  const primary = allCategories.filter((c) => primarySlugs.includes(c.slug));
  const more = allCategories.filter((c) => !primarySlugs.includes(c.slug));

  return (
    <>
      {/* Primary categories */}
      {primary.map((cat) => {
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
          </Link>
        );
      })}

      {/* More dropdown */}
      {more.length > 0 && (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            More
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {open && (
            <div className="absolute left-0 mt-1 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50 animate-fade-in">
              {more.map((cat) => {
                const isActive =
                  pathname === `/search?type=${cat.searchType}` ||
                  pathname.startsWith(`/${cat.slug}`);
                return (
                  <Link
                    key={cat.slug}
                    href={`/search?type=${cat.searchType || cat.slug}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span className="text-base">{cat.icon}</span>
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
  const { dark, toggle } = useDarkMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
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

  useEffect(() => {
    if (mobileNavOpen || commandOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen, commandOpen]);

  return (
    <>
      <header className="sticky top-0 z-[var(--z-fixed)] border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-950/60">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-4">
            {/* Left: Mobile hamburger + Logo */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Open menu"
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
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <Link
                href="/"
                className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white hover:opacity-80 transition-opacity"
              >
                <span className="text-red-600 dark:text-red-500">Track</span>
                Fraud
              </Link>
            </div>

            {/* Center: Desktop categories (only primary + More dropdown) */}
            <nav
              className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-thin flex-1 justify-center"
              aria-label="Entity categories"
            >
              <CategoryDropdown />
            </nav>

            {/* Right: Search + Dark mode */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCommandOpen(true)}
                aria-label="Open search"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 text-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors max-w-64"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-4 h-4 flex-shrink-0"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="truncate">Search...</span>
                <kbd className="ml-2 hidden lg:inline-flex items-center px-1 py-0.5 text-[10px] font-medium text-gray-400 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                  ⌘K
                </kbd>
              </button>

              <Link
                href="/search"
                className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Search"
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
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </Link>

              <button
                onClick={toggle}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label={
                  dark ? "Switch to light mode" : "Switch to dark mode"
                }
              >
                {dark ? (
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
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <CommandPalette
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
      />
    </>
  );
}
