"use client";

import Link from "next/link";

interface ComingSoonProps {
  categoryName: string;
  categorySlug: string;
  description?: string;
}

export function ComingSoon({ categoryName, categorySlug, description }: ComingSoonProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <div className="text-6xl mb-6">🚧</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          {categoryName} Coming Soon
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          {description || "We're working on bringing you comprehensive fraud tracking for this category. Stay tuned!"}
        </p>
        
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Link
            href="/charities"
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 transition-colors"
          >
            <div className="text-3xl mb-2">❤️</div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Charities</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">2M+ nonprofits tracked</p>
          </Link>
          <Link
            href="/political"
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 transition-colors"
          >
            <div className="text-3xl mb-2">🏛️</div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Political</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Campaign finance data</p>
          </Link>
          <Link
            href="/corporate"
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 transition-colors"
          >
            <div className="text-3xl mb-2">🏢</div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Corporate</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">SEC filings & disclosures</p>
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
          >
            Back to Home
          </Link>
          <Link
            href="/search"
            className="px-6 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Search All Categories
          </Link>
        </div>

        <div className="mt-12 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-left">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">📧 Get notified when this launches</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            We'll send you an email when {categoryName} tracking is live.
          </p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); alert("Thanks for subscribing!"); }}>
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}