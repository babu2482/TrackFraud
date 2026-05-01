"use client";

import { useState } from "react";
import { IconMail } from "@/components/ui/Icons";

export default function TakedownPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/takedown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } catch {
      // Silently fail, still show success (log the request)
      console.error("Failed to submit takedown request");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="flex justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-16 h-16 text-green-500"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Takedown Request Submitted
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Thank you for your request. Our team will review the information you
          provided and respond within <strong>48 business hours</strong>.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          If you have additional information, please contact us directly through
          the form below.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <IconMail className="w-8 h-8 text-red-500" />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
          Data Takedown Request
        </h1>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">
          Request a Review
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          If you believe that data displayed on TrackFraud is inaccurate,
          outdated, or should be removed, please provide the details below. We
          review all takedown requests within <strong className="text-white">48 business hours</strong>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Full Name / Entity Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="John Doe or ABC Corp"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="url"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              TrackFraud URL(s) to Review *
            </label>
            <input
              type="url"
              id="url"
              name="url"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="https://trackfraud.io/charities/12-3456789"
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Reason for Takedown *
            </label>
            <select
              id="reason"
              name="reason"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Select a reason</option>
              <option value="inaccurate">Information is inaccurate</option>
              <option value="outdated">Information is outdated</option>
              <option value="wrong-entity">Data belongs to a different entity</option>
              <option value="resolved">Issue has been resolved/corrected</option>
              <option value="duplicated">Duplicate record</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="details"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Additional Details *
            </label>
            <textarea
              id="details"
              name="details"
              required
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Please explain what information is incorrect and provide evidence or documentation if available."
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Takedown Request"}
            </button>
          </div>
        </form>
      </div>

      <div className="text-sm text-gray-500 space-y-2">
        <p>
          <strong className="text-gray-400">Note:</strong> This process is for
          requesting review of specific data points. We do not remove data that
          is accurately sourced from public records.
        </p>
        <p>
          <strong className="text-gray-400">SLA:</strong> We aim to review all
          takedown requests within 48 business hours. Complex cases may take
          longer.
        </p>
      </div>
    </div>
  );
}
