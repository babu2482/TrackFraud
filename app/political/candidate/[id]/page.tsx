"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { FraudSummary } from "@/components/ui/FraudSummary";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface Candidate { candidate_id: string; name: string; party_full?: string; office_full?: string; state?: string; district?: string; incumbent_challenge_full?: string; candidate_status?: string; election_years?: number[]; }
interface Totals { cycle: number; receipts?: number; disbursements?: number; individual_contributions?: number; other_political_committee_contributions?: number; operating_expenditures?: number; cash_on_hand_end_period?: number; debts_owed_by_committee?: number; contributions?: number; }
interface RiskSignal { key: string; label: string; severity: "medium" | "high"; detail: string; value?: number | null; threshold?: number; }
interface DetailResponse {
  candidate?: Candidate;
  totals?: Totals[];
  riskSignals?: RiskSignal[];
  riskScore?: number;
  fraudMeter?: FraudMeterModel;
  error?: string;
}

export default function CandidateDetailPage() {
  const { id } = useParams() as { id: string };
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [totals, setTotals] = useState<Totals[]>([]);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [fraudMeter, setFraudMeter] = useState<FraudMeterModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/political/candidate/${id}`)
      .then((r) => r.json())
      .then((d: DetailResponse) => {
        if (d.error) throw new Error(d.error);
        setCandidate(d.candidate ?? null);
        setTotals(d.totals ?? []);
        setRiskSignals(d.riskSignals ?? []);
        setRiskScore(d.riskScore ?? 0);
        setFraudMeter(d.fraudMeter ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  if (error || !candidate) return (
    <div className="space-y-4">
      <Link href="/political" className="text-gray-600 dark:text-gray-400 hover:underline">← Back to search</Link>
      <p className="text-red-600 dark:text-red-400">{error ?? "Candidate not found."}</p>
    </div>
  );

  const latest = totals[0];

  return (
    <div className="space-y-8">
      <Link href="/political" className="text-gray-600 dark:text-gray-400 hover:underline inline-block">← Back to search</Link>

      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{candidate.name}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {candidate.party_full && <span className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">{candidate.party_full}</span>}
          {candidate.office_full && <span className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">{candidate.office_full}</span>}
          {candidate.state && <span className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">{candidate.state}{candidate.district ? `-${candidate.district}` : ""}</span>}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">FEC ID: {candidate.candidate_id}</p>
      </section>

      <FraudSummary
        signals={riskSignals}
        score={riskScore}
        entityId={candidate.candidate_id}
        fraudMeter={fraudMeter ?? undefined}
      />

      {latest && (
        <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Latest Cycle ({latest.cycle}) — Follow the Money</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total Raised", value: formatMoney(latest.receipts) },
              { label: "Total Spent", value: formatMoney(latest.disbursements) },
              { label: "From Individuals", value: formatMoney(latest.individual_contributions) },
              { label: "From PACs/Committees", value: formatMoney(latest.other_political_committee_contributions) },
              { label: "Operating Expenses", value: formatMoney(latest.operating_expenditures) },
              { label: "Cash on Hand", value: formatMoney(latest.cash_on_hand_end_period) },
              { label: "Debt", value: formatMoney(latest.debts_owed_by_committee) },
              { label: "Total Contributions", value: formatMoney(latest.contributions) },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="font-semibold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {totals.length > 1 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Historical Cycles</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-gray-200 dark:border-gray-600"><th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">Cycle</th><th className="text-right py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">Raised</th><th className="text-right py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">Spent</th><th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">Cash on Hand</th></tr></thead>
              <tbody>{totals.map((t) => (
                <tr key={t.cycle} className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-1.5 pr-4 text-gray-700 dark:text-gray-300">{t.cycle}</td><td className="py-1.5 pr-4 text-right font-mono text-gray-900 dark:text-gray-100">{formatMoney(t.receipts)}</td><td className="py-1.5 pr-4 text-right font-mono text-gray-900 dark:text-gray-100">{formatMoney(t.disbursements)}</td><td className="py-1.5 text-right font-mono text-gray-900 dark:text-gray-100">{formatMoney(t.cash_on_hand_end_period)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Report a concern</h2>
        <ul className="space-y-1 text-sm">
          <li><Link href={`/submit?category=political&entity=${encodeURIComponent(candidate.name)}&entityId=${candidate.candidate_id}`} className="text-red-600 dark:text-red-400 hover:underline font-medium">Submit a tip on TrackFraud</Link></li>
          <li><a href="https://www.fec.gov/legal-resources/enforcement/complaints-process/how-to-file-complaint-with-fec/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">FEC — File a Complaint</a></li>
        </ul>
      </section>
    </div>
  );
}
