import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "TrackFraud Privacy Policy — how we handle your data.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <div>
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          ← Back to TrackFraud
        </Link>
        <h1 className="text-3xl font-bold text-white mt-4">Privacy Policy</h1>
        <p className="text-gray-400 mt-2">Last updated: January 2026</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">1. Data We Collect</h2>
        <p className="text-gray-300">
          TrackFraud collects minimal personal data. When you browse the platform,
          we may log standard server access logs (IP address, browser type, time of
          access) for security and analytics purposes. We do not use tracking
          cookies or third-party analytics.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">2. Tip Submissions</h2>
        <p className="text-gray-300">
          When you submit a fraud tip, you may optionally provide your name and
          email address. This information is:
        </p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Never displayed publicly</li>
          <li>Used only for follow-up if we need clarification</li>
          <li>Stored securely and not shared with third parties</li>
          <li>Deleted upon your request</li>
        </ul>
        <p className="text-gray-300">
          Tips can be submitted completely anonymously — no account required.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">3. Public Data</h2>
        <p className="text-gray-300">
          All entity data displayed on TrackFraud (charity names, corporate filings,
          government contracts, etc.) is obtained from public government records.
          We do not collect or store personal information about private individuals
          beyond what is already publicly available.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">4. Data Retention</h2>
        <p className="text-gray-300">
          Server logs are retained for 30 days for security purposes. Tip submission
          data is retained indefinitely unless you request deletion. Entity data from
          public records is retained as long as the source data remains available.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">5. Your Rights</h2>
        <p className="text-gray-300">
          You have the right to:
        </p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li>Request deletion of any personal data you've submitted</li>
          <li>Request export of your personal data</li>
          <li>Correct inaccurate information you've provided</li>
        </ul>
        <p className="text-gray-300">
          Contact us through our GitHub repository to exercise these rights.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">6. Third-Party Services</h2>
        <p className="text-gray-300">
          TrackFraud uses the following third-party services:
        </p>
        <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
          <li><strong>Sentry</strong> — Error tracking (anonymized)</li>
          <li><strong>Cloudflare</strong> — CDN and DDoS protection</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">7. Contact</h2>
        <p className="text-gray-300">
          For privacy-related inquiries, please contact us through our GitHub
          repository or submit a tip through the platform.
        </p>
      </section>
    </div>
  );
}
