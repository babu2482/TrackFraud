"use client";

import { useState } from "react";
import Link from "next/link";

interface DataSource {
  name: string;
  description: string;
  url?: string;
}

interface ComingSoonProps {
  categoryId: string;
  categoryName: string;
  description: string;
  dataSources: DataSource[];
  reportingChannels?: { name: string; url: string }[];
}

export function ComingSoon({
  categoryId,
  categoryName,
  description,
  dataSources,
  reportingChannels,
}: ComingSoonProps) {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubLoading(true);
    setSubError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, categoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to subscribe");
      setSubscribed(true);
    } catch (err) {
      setSubError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setSubLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold mb-4">
          Coming Soon
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {categoryName}
        </h1>
        <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
          {description}
        </p>
      </section>

      <section className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Get notified when this launches
        </h2>
        {subscribed ? (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300">
            You're subscribed. We'll email you when {categoryName} tracking goes live.
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={subLoading}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-colors"
            >
              {subLoading ? "Subscribing…" : "Notify Me"}
            </button>
          </form>
        )}
        {subError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{subError}</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Planned Data Sources
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          We're building integrations with these public data sources to power {categoryName.toLowerCase()} tracking:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {dataSources.map((ds) => (
            <div
              key={ds.name}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <h3 className="font-medium text-gray-900 dark:text-white text-sm">
                {ds.url ? (
                  <a
                    href={ds.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-red-600 dark:hover:text-red-400"
                  >
                    {ds.name} →
                  </a>
                ) : (
                  ds.name
                )}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {ds.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Already have a tip?
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          We accept tips for all categories, even before official tracking launches.
          Community intelligence helps us prioritize which categories to build first.
        </p>
        <Link
          href={`/submit?category=${categoryId}`}
          className="inline-block px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm"
        >
          Submit a Tip about {categoryName}
        </Link>
      </section>

      {reportingChannels && reportingChannels.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Official Reporting Channels
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            If you suspect active fraud, report it directly to the appropriate authorities:
          </p>
          <ul className="space-y-1 text-sm">
            {reportingChannels.map((ch) => (
              <li key={ch.url}>
                <a
                  href={ch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {ch.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
