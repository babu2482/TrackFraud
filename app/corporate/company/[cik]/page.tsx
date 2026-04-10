"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FraudSummary } from "@/components/ui/FraudSummary";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface Company { cik: string; name: string; entityType?: string; sic?: string; sicDescription?: string; tickers?: string[]; exchanges?: string[]; stateOfIncorporation?: string; fiscalYearEnd?: string; }
interface Filing { accessionNumber: string; filingDate: string; reportDate?: string; form: string; primaryDocument?: string; primaryDocDescription?: string; }
interface RiskSignal { key: string; label: string; severity: "medium" | "high"; detail: string; value?: number | null; threshold?: number; }
interface DetailResponse {
  company?: Company;
  filings?: Filing[];
  riskSignals?: RiskSignal[];
  riskScore?: number;
  fraudMeter?: FraudMeterModel;
  error?: string;
}

const FORM_COLORS: Record<string, string> = {
  "10-K": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "10-Q": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "8-K": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function filingUrl(cik: string, accession: string, doc?: string): string {
  const clean = accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, "")}/${clean}`;
  return doc ? `${base}/${doc}` : base;
}

function formColor(form: string): string {
  if (form.startsWith("NT")) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  if (form.includes("/A")) return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
  return FORM_COLORS[form] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

export default function CompanyDetailPage() {
  const { cik } = useParams() as { cik: string };
  const [company, setCompany] = useState<Company | null>(null);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [fraudMeter, setFraudMeter] = useState<FraudMeterModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/corporate/company/${cik}`)
      .then((r) => r.json())
      .then((d: DetailResponse) => {
        if (d.error) throw new Error(d.error);
        setCompany(d.company ?? null);
        setFilings(d.filings ?? []);
        setRiskSignals(d.riskSignals ?? []);
        setRiskScore(d.riskScore ?? 0);
        setFraudMeter(d.fraudMeter ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [cik]);

  if (loading) return <div className="py-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  if (error || !company) return (
    <div className="space-y-4">
      <Link href="/corporate" className="text-gray-600 dark:text-gray-400 hover:underline">← Back to search</Link>
      <p className="text-red-600 dark:text-red-400">{error ?? "Company not found."}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <Link href="/corporate" className="text-gray-600 dark:text-gray-400 hover:underline inline-block">← Back to search</Link>

      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{company.name}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          {company.tickers?.map((t) => <span key={t} className="text-xs px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-mono">{t}</span>)}
          {company.sicDescription && <span className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">{company.sicDescription}</span>}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">CIK: {company.cik}</p>
      </section>

      <FraudSummary
        signals={riskSignals}
        score={riskScore}
        entityId={company.cik}
        fraudMeter={fraudMeter ?? undefined}
      />

      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Recent SEC Filings</h2>
        <div className="space-y-2">
          {filings.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No filings found.</p>
          ) : filings.map((f) => (
            <a
              key={f.accessionNumber}
              href={filingUrl(company.cik, f.accessionNumber, f.primaryDocument)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
            >
              <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded ${formColor(f.form)}`}>
                {f.form}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{f.primaryDocDescription || f.form}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Filed {f.filingDate}{f.reportDate ? ` · Report date ${f.reportDate}` : ""}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Report a concern</h2>
        <ul className="space-y-1 text-sm">
          <li><Link href={`/submit?category=corporate&entity=${encodeURIComponent(company.name)}&entityId=${company.cik}`} className="text-red-600 dark:text-red-400 hover:underline font-medium">Submit a tip on TrackFraud</Link></li>
          <li><a href="https://www.sec.gov/tcr" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">SEC — Report Fraud or Wrongdoing</a></li>
        </ul>
      </section>
    </div>
  );
}
