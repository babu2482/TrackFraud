"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, SeverityBadge } from "@/components/ui/Badge";
import { FraudMeter } from "@/components/ui/FraudMeter";
import { StatGrid } from "@/components/ui/StatGrid";
import { RiskDetails } from "@/components/ui/RiskDetails";
import {
  formatMoney,
  formatPct,
  formatSubsection,
  formatTimestamp,
  formatCorroborationCategory,
} from "@/lib/format";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface LegalClassification {
  subsectionCode?: number;
  subsectionLabel?: string;
  formType?: number;
  formTypeLabel?: string;
  isPrivateFoundation?: boolean;
}

interface RiskSignal {
  key: string;
  label: string;
  severity: "medium" | "high";
  detail: string;
  value?: number | null;
  threshold?: number;
}

interface ExternalCorroborationMatch {
  sourceId: string;
  sourceName: string;
  category: "revocation" | "sanction" | "state_enforcement" | "watchdog";
  severity: "info" | "medium" | "high";
  matchedOn: "ein" | "name";
  matchValue: string;
  description: string;
  observedAt?: string;
  url?: string;
}

interface HottestResult {
  ein: string;
  name: string;
  city?: string;
  state?: string;
  ntee_code?: string;
  rank: number;
  latestRevenue?: number;
  programExpenseRatio?: number | null;
  fundraisingEfficiency?: number | null;
  compensationPct?: number | null;
  legalClassification?: LegalClassification;
  riskSignals?: RiskSignal[];
  externalCorroboration?: ExternalCorroborationMatch[];
  fraudMeter?: FraudMeterModel;
  rankingScore?: number;
}

interface HottestResponse {
  limit?: number;
  cCode?: number;
  totalResults?: number;
  generatedAt?: string;
  rankingBasis?: string;
  dataSource?: "stored" | "stored_fallback" | "live";
  results?: HottestResult[];
}

const HOT_LIMITS = [10, 50, 100] as const;
type HotLimit = (typeof HOT_LIMITS)[number];

interface HottestListProps {
  subsectionCode: number | null;
}

export function HottestList({ subsectionCode }: HottestListProps) {
  const [hotLimit, setHotLimit] = useState<HotLimit>(10);
  const [hotResults, setHotResults] = useState<HottestResult[]>([]);
  const [hotTotalResults, setHotTotalResults] = useState(0);
  const [hotGeneratedAt, setHotGeneratedAt] = useState<string | null>(null);
  const [hotRankingBasis, setHotRankingBasis] = useState<string | null>(null);
  const [hotDataSource, setHotDataSource] = useState<
    "stored" | "stored_fallback" | "live"
  >("live");
  const [hotLoading, setHotLoading] = useState(false);
  const [hotError, setHotError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setHotLoading(true);
    setHotError(null);

    const params = new URLSearchParams({
      limit: String(hotLimit),
    });
    if (subsectionCode != null) {
      params.set("c_code", String(subsectionCode));
    }

    fetch(`/api/charities/hottest?${params.toString()}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(
        ({
          res,
          data,
        }: {
          res: Response;
          data: HottestResponse & { error?: string };
        }) => {
          if (!res.ok) throw new Error(data.error || "Failed to load hot list");
          if (isCancelled) return;
          setHotResults(Array.isArray(data.results) ? data.results : []);
          setHotTotalResults(
            typeof data.totalResults === "number" ? data.totalResults : 0
          );
          setHotGeneratedAt(
            typeof data.generatedAt === "string" ? data.generatedAt : null
          );
          setHotRankingBasis(
            typeof data.rankingBasis === "string" ? data.rankingBasis : null
          );
          setHotDataSource(
            data.dataSource === "stored" || data.dataSource === "stored_fallback"
              ? data.dataSource
              : "live"
          );
        }
      )
      .catch((err) => {
        if (isCancelled) return;
        setHotError(
          err instanceof Error ? err.message : "Failed to load hot list"
        );
        setHotResults([]);
      })
      .finally(() => {
        if (isCancelled) return;
        setHotLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [hotLimit, subsectionCode]);

  const sourceDescription =
    hotDataSource === "stored"
      ? "Ranked from mirrored charity filings stored in the local database."
      : hotDataSource === "stored_fallback"
        ? "Showing the stored charity mirror because the live source could not satisfy this request."
        : "Ranked from live upstream filings while the local charity mirror is still incomplete.";

  return (
    <section className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Hottest Charities Tracker
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sourceDescription}
            {subsectionCode == null
              ? " Showing all legal classifications."
              : ` Filtered to ${formatSubsection(subsectionCode) ?? `501(c)(${subsectionCode})`}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {HOT_LIMITS.map((limit) => (
            <button
              key={limit}
              type="button"
              onClick={() => setHotLimit(limit)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                hotLimit === limit
                  ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                  : "bg-white text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600"
              }`}
            >
              Top {limit}
            </button>
          ))}
        </div>
      </div>

      {hotLoading && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Loading charity tracker...
        </p>
      )}

      {hotError && (
        <p className="text-sm text-red-700 dark:text-red-300">{hotError}</p>
      )}

      {!hotLoading && !hotError && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {hotResults.length} of {hotTotalResults.toLocaleString()} total
            organizations.
            {hotGeneratedAt && ` Last refreshed: ${formatTimestamp(hotGeneratedAt)}.`}
          </p>
          {hotRankingBasis && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ranking method: {hotRankingBasis}
            </p>
          )}
          <ul className="space-y-2">
            {hotResults.map((org) => {
              const legal = org.legalClassification;
              const riskSignals = org.riskSignals ?? [];
              const corroboration = org.externalCorroboration ?? [];
              return (
                <li key={`hot-${org.ein}-${org.rank}`}>
                  <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge>#{org.rank}</Badge>
                        <Link
                          href={`/charities/${org.ein}`}
                          className="font-medium text-gray-900 dark:text-white hover:underline"
                        >
                          {org.name}
                        </Link>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {[org.city, org.state].filter(Boolean).join(", ")}
                          {[org.city, org.state].filter(Boolean).length > 0
                            ? " · "
                            : ""}
                          EIN {org.ein}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        {legal?.subsectionCode != null && (
                          <Badge>
                            {legal.subsectionLabel ?? formatSubsection(legal.subsectionCode)}
                          </Badge>
                        )}
                        {legal?.formTypeLabel && (
                          <Badge>Filing type: {legal.formTypeLabel}</Badge>
                        )}
                        {typeof legal?.isPrivateFoundation === "boolean" && (
                          <Badge>
                            Private foundation: {legal.isPrivateFoundation ? "Yes" : "No"}
                          </Badge>
                        )}
                        {org.ntee_code && (
                          <Badge>NTEE {org.ntee_code}</Badge>
                        )}
                      </div>

                      <StatGrid
                        stats={[
                          { label: "Latest revenue", value: formatMoney(org.latestRevenue) },
                          { label: "Program spending ratio", value: formatPct(org.programExpenseRatio) },
                          {
                            label: "Cost to raise $1",
                            value:
                              org.fundraisingEfficiency != null
                                ? `$${org.fundraisingEfficiency.toFixed(2)}`
                                : "—",
                          },
                          { label: "Officer compensation share", value: formatPct(org.compensationPct) },
                        ]}
                      />

                      {org.fraudMeter && <FraudMeter meter={org.fraudMeter} compact />}

                      {riskSignals.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {riskSignals.map((signal) => (
                            <SeverityBadge
                              key={`${org.ein}-${signal.key}`}
                              severity={signal.severity}
                              title={signal.detail}
                            >
                              {signal.severity === "high" ? "High risk" : "Watch"}:{" "}
                              {signal.label}
                            </SeverityBadge>
                          ))}
                        </div>
                      )}

                      {corroboration.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {corroboration.slice(0, 3).map((item, index) => (
                            <SeverityBadge
                              key={`${org.ein}-${item.sourceId}-${index}`}
                              severity={item.severity}
                            >
                              External: {formatCorroborationCategory(item.category)}
                            </SeverityBadge>
                          ))}
                        </div>
                      )}

                      <RiskDetails
                        entityId={org.ein}
                        riskSignals={riskSignals}
                        corroboration={corroboration}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
