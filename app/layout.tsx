import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrackFraud — Follow the Money",
  description:
    "Track financial fraud across America. Charity transparency, political spending, corporate malfeasance, and more. Data-driven accountability powered by public records.",
};

const NAV_LINKS = [
  { href: "/charities", label: "Charities" },
  { href: "/political", label: "Political" },
  { href: "/corporate", label: "Corporate" },
  { href: "/government", label: "Government" },
  { href: "/healthcare", label: "Healthcare" },
  { href: "/consumer", label: "Consumer" },
] as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col">
        <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center justify-between h-14">
              <Link
                href="/"
                className="flex items-center gap-2 text-lg font-bold tracking-tight"
              >
                <span className="text-red-600 dark:text-red-500">Track</span>
                <span className="text-gray-900 dark:text-white">Fraud</span>
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  href="/submit"
                  className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                >
                  Submit a Tip
                </Link>
                <Link
                  href="/about"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  About
                </Link>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto pb-2 -mb-px scrollbar-none">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors whitespace-nowrap"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
          {children}
        </main>
        <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
              <p>TrackFraud.com — Data-driven fraud accountability</p>
              <div className="flex gap-4">
                <Link href="/about" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                  About
                </Link>
                <Link href="/submit" className="hover:text-gray-900 dark:hover:text-white transition-colors">
                  Submit a Tip
                </Link>
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center sm:text-left">
              Information is sourced from public records and government databases.
              TrackFraud does not make accusations — we present data for public accountability.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
