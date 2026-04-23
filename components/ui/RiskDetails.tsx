"use client";

import {
  formatRiskValue,
  formatRiskThreshold,
  formatCorroborationCategory,
  formatTimestamp,
} from "@/lib/format";

interface RiskSignal {
  key: string;
  label: string;
  severity: "medium" | "high";
  detail: string;
  value?: number | null;
  threshold?: number;
}

interface CorroborationMatch {
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

interface RiskDetailsProps {
  entityId: string;
  riskSignals: RiskSignal[];
  corroboration: CorroborationMatch[];
}

export function RiskDetails({ entityId, riskSignals, corroboration }: RiskDetailsProps) {
  if (riskSignals.length === 0 && corroboration.length === 0) return null;

  return (
    <details className="rounded-md border border-gray-200 dark:border-gray-700 p-2 text-xs">
      <summary className="cursor-pointer text-gray-700 dark:text-gray-300 font-medium">
        Why flagged?
      </summary>
      <div className="mt-2 space-y-2">
        {riskSignals.length > 0 && (
          <div className="space-y-1">
            <p className="text-gray-500 dark:text-gray-400">Behavioral indicators</p>
            <ul className="space-y-1">
              {riskSignals.map((signal) => (
                <li
                  key={`${entityId}-why-${signal.key}`}
                  className="rounded border border-gray-200 dark:border-gray-700 p-2"
                >
                  <p className="font-medium text-gray-900 dark:text-white">
                    {signal.label}
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    Current value: {formatRiskValue(signal)}. Threshold:{" "}
                    {formatRiskThreshold(signal)}.
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">{signal.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {corroboration.length > 0 && (
          <div className="space-y-1">
            <p className="text-gray-500 dark:text-gray-400">External corroboration</p>
            <ul className="space-y-1">
              {corroboration.map((item, index) => (
                <li
                  key={`${entityId}-corr-${item.sourceId}-${index}`}
                  className="rounded border border-gray-200 dark:border-gray-700 p-2"
                >
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.sourceName} ({formatCorroborationCategory(item.category)})
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">
                    Severity: {item.severity}. Match: {item.matchedOn} = {item.matchValue}.
                  </p>
                  <p className="text-gray-600 dark:text-gray-400">{item.description}</p>
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
  );
}
