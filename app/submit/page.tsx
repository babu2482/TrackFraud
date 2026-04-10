"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface FraudCategory {
  id: string;
  name: string;
  slug: string;
  status: string;
}

const ENTITY_ID_HELP: Record<string, string> = {
  charities: "EIN (Employer Identification Number), e.g. 13-1837418",
  political: "FEC Committee ID, e.g. C00431445",
  corporate: "SEC CIK number or stock ticker",
  government: "Contract number, DUNS, or agency name",
  healthcare: "NPI number or provider ID",
  consumer: "Company name or BBB ID",
};

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-gray-500">Loading…</div>}>
      <SubmitForm />
    </Suspense>
  );
}

function SubmitForm() {
  const searchParams = useSearchParams();

  const [categories, setCategories] = useState<FraudCategory[]>([]);
  const [categoryId, setCategoryId] = useState(searchParams.get("category") ?? "");
  const [entityName, setEntityName] = useState(searchParams.get("entity") ?? "");
  const [entityId, setEntityId] = useState(searchParams.get("entityId") ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [honeypot, setHoneypot] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          entityName,
          entityId,
          title,
          description,
          evidence,
          submitterEmail,
          submitterName,
          honeypot,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
        <div className="text-5xl">✓</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Tip Submitted
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Your tip has been received and is pending review. Thank you for
          helping track fraud and promote accountability.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium"
          >
            Back to Home
          </Link>
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setTitle("");
              setDescription("");
              setEvidence("");
              setEntityName("");
              setEntityId("");
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  const entityIdPlaceholder = ENTITY_ID_HELP[categoryId] ?? "Identifying number or code (optional)";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Submit a Fraud Tip
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Help track fraud across America. Your tip is anonymous by default — no
          account required. Provide an email only if you want follow-up.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Fraud Category *
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Select a category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
                {cat.status === "coming_soon" ? " (coming soon — tips welcome)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Entity / Organization Name *
          </label>
          <input
            type="text"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            required
            minLength={2}
            placeholder="Name of the organization, company, or person"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Entity ID
          </label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={entityIdPlaceholder}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={5}
            placeholder="Brief title for this tip"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={20}
            maxLength={5000}
            rows={5}
            placeholder="Describe the suspected fraud. Include dates, amounts, and specific behaviors if possible."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {description.length}/5000 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Evidence / Source URLs
          </label>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            rows={2}
            placeholder="Links to news articles, public records, documents, etc."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
          />
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Optional: Your contact info is never displayed publicly. Only used if
          we need to follow up on your tip.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="Anonymous"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Your Email
            </label>
            <input
              type="email"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              placeholder="For follow-up only"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
            />
          </div>
        </div>

        {/* Honeypot — hidden from real users, bots fill it */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Tip"}
        </button>

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          By submitting, you confirm this information is accurate to the best of
          your knowledge. TrackFraud is not law enforcement — tips are for
          public accountability purposes.
        </p>
      </form>
    </div>
  );
}
