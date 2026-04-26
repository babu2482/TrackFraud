"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CharityDetail } from "@/lib/types";
import { nteeCodeToMajorId } from "@/lib/ntee";
import { Badge, SeverityBadge } from "@/components/ui/Badge";
import { FraudMeter } from "@/components/ui/FraudMeter";
import { RiskDetails } from "@/components/ui/RiskDetails";
import {
  formatMoney,
  formatPct,
  formatTimestamp,
  formatFieldValue,
  formatCorroborationCategory,
  formatRiskValue,
  formatRiskThreshold,
} from "@/lib/format";

export default function CharityPage() {
  const params = useParams();
  const ein = (params?.ein as string) ?? "";
  const [detail, setDetail] = useState<CharityDetail | null>(null);
  const [peerMedian, setPeerMedian] = useState<number | null>(null);
  const [peerSampleSize, setPeerSampleSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ein) return;
    setLoading(true);
    setError(null);
    fetch(`/api/charities/org/${encodeURIComponent(ein)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDetail(data);
        const majorId = nteeCodeToMajorId(data.nteeCode);
        if (majorId != null) {
          return fetch(`/api/charities/peers?ntee=${majorId}`)
            .then((r) => r.json())
            .then((p: { medianProgramRatio?: number | null; sampleSize?: number }) => {
              setPeerMedian(p.medianProgramRatio ?? null);
              setPeerSampleSize(p.sampleSize ?? 0);
            })
            .catch((err) => console.error('[CharityDetail] Failed to fetch peer data:', err));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [ein]);

  if (loading && !detail) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link href="/charities" className="text-gray-600 dark:text-gray-400 hover:underline">
          ← Back to charities
        </Link>
        <p className="text-red-600 dark:text-red-400">
          {error ?? "Organization not found."}
        </p>
      </div>
    );
  }

  const m = detail.latest;
  const legal = detail.legalClassification;
  const riskSignals = detail.riskSignals ?? [];
  const corroboration = detail.externalCorroboration ?? [];
  const fraudMeter = detail.fraudMeter;
  const staleFiling = m && m.filingYear && new Date().getFullYear() - m.filingYear > 3;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/charities" className="text-gray-600 dark:text-gray-400 hover:underline mb-4 inline-block">
          ← Back to charities
        </Link>
      </div>

      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {detail.name}
        </h1>
        {detail.subName && (
          <p className="text-gray-600 dark:text-gray-400">{detail.subName}</p>
        )}
        <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
          EIN {detail.ein}
          {detail.nteeCategory && ` · ${detail.nteeCategory}`}
        </p>
        {(detail.address || detail.city) && (
          <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
            {[detail.address, detail.city, detail.state, detail.zipcode]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        <div className="flex flex-wrap gap-3 mt-3">
          {detail.guidestarUrl && (
            <a
              href={detail.guidestarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              GuideStar profile
            </a>
          )}
          {m?.pdfUrl && (
            <a
              href={m.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Form 990 PDF
            </a>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Data from IRS Form 990 via ProPublica Nonprofit Explorer.
          {m?.filingYear && ` Latest filing: FY ${m.filingYear}.`}
        </p>
        {(legal?.subsectionCode != null ||
          legal?.formTypeLabel ||
          typeof legal?.isPrivateFoundation === "boolean") && (
          <div className="flex flex-wrap gap-2 mt-3">
            {legal.subsectionCode != null && (
              <Badge>
                Legal section: {legal.subsectionLabel ?? `501(c)(${legal.subsectionCode})`}
              </Badge>
            )}
            {legal.formTypeLabel && (
              <Badge>Filing type: {legal.formTypeLabel}</Badge>
            )}
            {typeof legal.isPrivateFoundation === "boolean" && (
              <Badge>
                Private foundation: {legal.isPrivateFoundation ? "Yes" : "No"}
              </Badge>
            )}
          </div>
        )}
        {fraudMeter && (
          <div className="mt-4">
            <FraudMeter meter={fraudMeter} />
          </div>
        )}
        {riskSignals.length > 0 && (
          <div className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Behavioral risk indicators
            </h2>
            <div className="flex flex-wrap gap-2">
              {riskSignals.map((signal) => (
                <SeverityBadge
                  key={signal.key}
                  severity={signal.severity}
                  title={signal.detail}
                >
                  {signal.severity === "high" ? "High risk" : "Watch"}:{" "}
                  {signal.label}
                </SeverityBadge>
              ))}
            </div>
          </div>
        )}
        {corroboration.length > 0 && (
          <div className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              External corroboration
            </h2>
            <div className="flex flex-wrap gap-2">
              {corroboration.map((item, index) => (
                <SeverityBadge
                  key={`corr-${item.sourceId}-${index}`}
                  severity={item.severity}
                >
                  {formatCorroborationCategory(item.category)}: {item.sourceName}
                </SeverityBadge>
              ))}
            </div>
          </div>
        )}
        {(riskSignals.length > 0 || corroboration.length > 0) && (
          <details className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">
              Why flagged?
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              {riskSignals.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Behavioral indicators (computed from filing values)
                  </h3>
                  <ul className="space-y-2">
                    {riskSignals.map((signal) => (
                      <li
                        key={`why-${signal.key}`}
                        className="rounded border border-gray-200 dark:border-gray-700 p-2"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">
                          {signal.label}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Current value: {formatRiskValue(signal)}. Threshold:{" "}
                          {formatRiskThreshold(signal)}.
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          {signal.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {corroboration.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    External corroboration evidence
                  </h3>
                  <ul className="space-y-2">
                    {corroboration.map((item, index) => (
                      <li
                        key={`why-corr-${item.sourceId}-${index}`}
                        className="rounded border border-gray-200 dark:border-gray-700 p-2"
                      >
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.sourceName} ({formatCorroborationCategory(item.category)})
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          Severity: {item.severity}. Match: {item.matchedOn} ={" "}
                          {item.matchValue}.
                        </p>
                        <p className="text-gray-600 dark:text-gray-400">
                          {item.description}
                        </p>
                        {item.observedAt && (
                          <p className="text-gray-500 dark:text-gray-500">
                            Observed: {formatTimestamp(item.observedAt) ?? item.observedAt}
                          </p>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Source link
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}
      </section>

      {!m ? (
        <p className="text-gray-500 dark:text-gray-400">
          No financial data available for this organization.
        </p>
      ) : (
        <>
          <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Where your money goes
            </h2>
            {m.per100 ? (
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                Of every <strong>$100</strong> this org spent:{" "}
                <strong>${m.per100[0].toFixed(0)}</strong> to the cause,{" "}
                ${m.per100[1].toFixed(0)} admin, ${m.per100[2].toFixed(0)} fundraising.
              </p>
            ) : (
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Per-$100 breakdown: <strong>Not reported</strong> (IRS extract does not include functional expense breakdown for this filing).
              </p>
            )}
            <p className="text-gray-700 dark:text-gray-300">
              Took in <strong>{formatMoney(m.revenue.total)}</strong>
              {m.expenses.program > 0 ? (
                <>
                  {" "}
                  · Spent <strong>{formatMoney(m.expenses.program)}</strong> on
                  the cause
                  {m.programExpenseRatio != null && (
                    <> ({formatPct(m.programExpenseRatio)})</>
                  )}.
                </>
              ) : (
                <> · Spent on the cause: <strong>Not reported</strong> (no breakdown in extract).</>
              )}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Revenue:{" "}
              {m.revenue.contributions != null ? `Contributions ${formatMoney(m.revenue.contributions)}` : "Contributions —"}
              {m.revenue.programService != null ? ` · Program revenue ${formatMoney(m.revenue.programService)}` : " · Program revenue —"}
              {m.revenue.other != null && m.revenue.other > 0 ? ` · Other ${formatMoney(m.revenue.other)}` : ""}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Transparency & context (all metrics)
            </h2>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                Program expense ratio (to cause):{" "}
                {m.programExpenseRatio != null ? (
                  <strong>{formatPct(m.programExpenseRatio)}</strong>
                ) : (
                  <strong>Not reported</strong>
                )}
                {m.programExpenseRatio != null && m.programExpenseRatio < 0.65 && (
                  <span className="text-amber-700 dark:text-amber-400 text-sm ml-1">
                    (Many watchdogs flag under 65%.)
                  </span>
                )}
              </li>
              <li>
                Overhead ratio (admin + fundraising):{" "}
                {m.overheadRatio != null ? (
                  <strong>{formatPct(m.overheadRatio)}</strong>
                ) : (
                  <strong>Not reported</strong>
                )}
              </li>
              {peerMedian != null && peerSampleSize > 0 && (
                <li>
                  Median in this category
                  {detail.nteeCategory ? ` (${detail.nteeCategory})` : ""}:{" "}
                  <strong>{formatPct(peerMedian)}</strong> to the cause (sample of {peerSampleSize} orgs).
                </li>
              )}
              <li>
                Cost to raise $1 (fundraising / contributions):{" "}
                {m.fundraisingEfficiency != null ? (
                  <strong>${m.fundraisingEfficiency.toFixed(2)}</strong>
                ) : (
                  <strong>Not reported</strong>
                )}
              </li>
              <li>
                Compensation of officers/directors (% of expenses):{" "}
                {m.compensationPct != null && m.compensationPct > 0 ? (
                  <strong>{formatPct(m.compensationPct)}</strong>
                ) : (
                  <strong>{m.compensationPct === 0 ? "0%" : "Not reported"}</strong>
                )}
              </li>
              <li>Total expenses: <strong>{formatMoney(m.expenses.total)}</strong></li>
              <li>
                Total assets (end of year):{" "}
                {m.assets != null ? <strong>{formatMoney(m.assets)}</strong> : <strong>Not reported</strong>}
              </li>
              <li>
                Total liabilities (end of year):{" "}
                {m.liabilities != null ? <strong>{formatMoney(m.liabilities)}</strong> : <strong>Not reported</strong>}
              </li>
              <li>
                Last filing: <strong>FY {m.filingYear}</strong>.
                {staleFiling && (
                  <span className="text-amber-700 dark:text-amber-400 text-sm ml-1">
                    (Data may be outdated.)
                  </span>
                )}
              </li>
            </ul>
          </section>

          {detail.allFilingFields && detail.allFilingFields.length > 0 && (
            <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                All Form 990 data (FY {m.filingYear}) — maximum transparency
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Every value reported in the IRS extract for this filing. Source: ProPublica Nonprofit Explorer.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">Field</th>
                      <th className="text-right py-2 font-medium text-gray-700 dark:text-gray-300">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.allFilingFields.map((f) => (
                      <tr key={f.key} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-1.5 pr-4 text-gray-700 dark:text-gray-300">{f.label}</td>
                        <td className="py-1.5 text-right font-mono text-gray-900 dark:text-gray-100">
                          {formatFieldValue(f.value, f.key)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {detail.otherYears.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Other filing years
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {detail.otherYears.map((y) => y.year).join(", ")}
              </p>
            </section>
          )}
        </>
      )}

      <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Report a concern
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          To report suspected nonprofit fraud or misuse of funds:
        </p>
        <ul className="space-y-1 text-sm">
          <li>
            <Link
              href={`/submit?category=charities&entity=${encodeURIComponent(detail.name)}&entityId=${ein}`}
              className="text-red-600 dark:text-red-400 hover:underline font-medium"
            >
              Submit a tip on TrackFraud
            </Link>
          </li>
          <li>
            <a
              href="https://www.irs.gov/charities-non-profits/irs-complaint-process-tax-exempt-organizations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              IRS — Complaint process for tax-exempt organizations
            </a>
          </li>
          <li>
            <a
              href="https://www.nasconet.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              State charity officials (NASCO)
            </a>
            {" — "}
            Find your state attorney general or charity regulator.
          </li>
        </ul>
      </section>
    </div>
  );
}
