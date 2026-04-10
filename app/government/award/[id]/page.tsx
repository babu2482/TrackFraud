"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { FraudSummary } from "@/components/ui/FraudSummary";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface RiskSignal { key: string; label: string; severity: "medium" | "high"; detail: string; value?: number | null; threshold?: number; }
interface Award { id: number; generated_unique_award_id: string; type_description?: string; description?: string; period_of_performance_start_date?: string; period_of_performance_current_end_date?: string; total_obligation?: number; base_and_all_options_value?: number; recipient?: { recipient_name?: string; recipient_uei?: string; business_categories?: string[] }; awarding_agency?: { toptier_agency?: { name?: string }; subtier_agency?: { name?: string } }; funding_agency?: { toptier_agency?: { name?: string } }; place_of_performance?: { city_name?: string; state_code?: string; country_name?: string }; naics_description?: string; contract_data?: { type_of_contract_pricing_description?: string; extent_competed_description?: string; number_of_offers_received?: number }; riskSignals?: RiskSignal[]; riskScore?: number; fraudMeter?: FraudMeterModel; }

export default function AwardDetailPage() {
  const { id } = useParams() as { id: string };
  const [award, setAward] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/government/award/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setAward(d); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  if (error || !award) return (
    <div className="space-y-4">
      <Link href="/government" className="text-gray-600 dark:text-gray-400 hover:underline">← Back to search</Link>
      <p className="text-red-600 dark:text-red-400">{error ?? "Award not found."}</p>
    </div>
  );

  const pop = award.place_of_performance;
  const cd = award.contract_data;

  return (
    <div className="space-y-8">
      <Link href="/government" className="text-gray-600 dark:text-gray-400 hover:underline inline-block">← Back to search</Link>

      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{award.recipient?.recipient_name ?? "Unknown Recipient"}</h1>
        {award.type_description && <span className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 mt-2 inline-block">{award.type_description}</span>}
        {award.description && <p className="text-gray-600 dark:text-gray-400 mt-3">{award.description}</p>}
      </section>

      <FraudSummary
        signals={award.riskSignals ?? []}
        score={award.riskScore ?? 0}
        entityId={String(award.id)}
        fraudMeter={award.fraudMeter}
      />

      <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Award Details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Total Obligation", value: formatMoney(award.total_obligation) },
            { label: "Potential Value", value: formatMoney(award.base_and_all_options_value) },
            { label: "Awarding Agency", value: award.awarding_agency?.toptier_agency?.name ?? "—" },
            { label: "Sub-Agency", value: award.awarding_agency?.subtier_agency?.name ?? "—" },
            { label: "Competition", value: cd?.extent_competed_description ?? "—" },
            { label: "Offers Received", value: cd?.number_of_offers_received != null ? String(cd.number_of_offers_received) : "—" },
            { label: "Pricing Type", value: cd?.type_of_contract_pricing_description ?? "—" },
            { label: "Start Date", value: award.period_of_performance_start_date ?? "—" },
            { label: "Location", value: [pop?.city_name, pop?.state_code, pop?.country_name].filter(Boolean).join(", ") || "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Report a concern</h2>
        <ul className="space-y-1 text-sm">
          <li><Link href={`/submit?category=government&entity=${encodeURIComponent(award.recipient?.recipient_name ?? "")}`} className="text-red-600 dark:text-red-400 hover:underline font-medium">Submit a tip on TrackFraud</Link></li>
          <li><a href="https://www.gao.gov/about/what-gao-does/fraudnet" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">GAO FraudNet — Report Fraud, Waste & Abuse</a></li>
        </ul>
      </section>
    </div>
  );
}
