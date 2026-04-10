"use client";

import { FraudMeter } from "@/components/ui/FraudMeter";
import { SeverityBadge } from "@/components/ui/Badge";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface RiskSignal {
  key: string;
  label: string;
  severity: "medium" | "high";
  detail: string;
  value?: number | null;
  threshold?: number;
}

interface FraudSummaryProps {
  signals: RiskSignal[];
  score: number;
  entityId: string;
  fraudMeter?: FraudMeterModel;
}

export function FraudBadges({ signals }: { signals: RiskSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {signals.map((s) => (
        <SeverityBadge key={s.key} severity={s.severity} title={s.detail}>
          {s.severity === "high" ? "High risk" : "Watch"}: {s.label}
        </SeverityBadge>
      ))}
    </div>
  );
}

export function FraudSummary({
  signals,
  score,
  entityId,
  fraudMeter,
}: FraudSummaryProps) {
  if (signals.length === 0 && !fraudMeter) return null;

  return (
    <div className="space-y-3">
      {fraudMeter && <FraudMeter meter={fraudMeter} />}

      {signals.length > 0 && (
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-bold px-2 py-1 rounded ${
              score >= 5
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                : score >= 2
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            Risk Score: {score}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {signals.length} {signals.length === 1 ? "signal" : "signals"} detected
          </span>
        </div>
      )}

      <FraudBadges signals={signals} />

      {signals.length > 0 && (
        <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">
            Why flagged?
          </summary>
          <div className="mt-3 space-y-2">
            {signals.map((signal) => (
              <div
                key={`${entityId}-${signal.key}`}
                className="rounded border border-gray-200 dark:border-gray-700 p-3 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      signal.severity === "high"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}
                  >
                    {signal.severity === "high" ? "HIGH" : "WATCH"}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {signal.label}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">{signal.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            A flag is not an accusation. It means the data falls outside normal
            statistical ranges. Review the evidence and judge for yourself.
          </p>
        </details>
      )}
    </div>
  );
}
