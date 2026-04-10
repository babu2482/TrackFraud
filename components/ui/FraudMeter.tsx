"use client";

import { Badge, SeverityBadge } from "@/components/ui/Badge";
import { fraudMeterAccent, fraudMeterTone } from "@/lib/fraud-meter";
import type { FraudMeter as FraudMeterModel } from "@/lib/types";

interface FraudMeterProps {
  meter: FraudMeterModel;
  compact?: boolean;
}

export function FraudMeter({ meter, compact = false }: FraudMeterProps) {
  const accent = fraudMeterAccent(meter.level);
  const tone = fraudMeterTone(meter.level);

  return (
    <section
      className={`rounded-lg border border-gray-200 dark:border-gray-700 ${
        compact ? "p-3" : "p-4"
      } bg-white dark:bg-gray-900/60 space-y-3`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            {meter.title}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={tone}>{meter.label}</SeverityBadge>
            <Badge>{meter.score}/100</Badge>
            {meter.isFlagged && <Badge variant="red">Surfaced in fraud views</Badge>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {meter.score}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Fraud score</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${meter.score}%`, backgroundColor: accent }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <span>Low</span>
          <span className="opacity-40">/</span>
          <span>Guarded</span>
          <span className="opacity-40">/</span>
          <span>Elevated</span>
          <span className="opacity-40">/</span>
          <span>High</span>
          <span className="opacity-40">/</span>
          <span>Severe</span>
        </div>
      </div>

      <p className="text-sm text-gray-700 dark:text-gray-300">{meter.summary}</p>

      {!compact && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Evidence basis</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {meter.evidenceBasis}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">High-severity signals</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {meter.highSignalCount}
              </p>
            </div>
            <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">External sources</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {meter.corroborationCount}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Fraud definition for this category: {meter.definition}
          </p>
        </>
      )}
    </section>
  );
}
