"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { fipsToName, fipsToAbbr, abbrToName } from "@/lib/us-states";
import { formatMoney, formatPct } from "@/lib/format";
import type {
  ExternalCorroborationMatch,
  FraudMeter as FraudMeterModel,
  RiskSignal,
} from "@/lib/types";
import {
  FRAUD_MAP_CATEGORIES,
  categoryChoroplethFill,
  categoryChoroplethHover,
  getCategoriesForOrg,
  getFraudMapCategory,
  getPrimaryCategoryForOrg,
} from "@/lib/fraud-map-categories";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type CategoryFilterId = "all" | string;

interface OrgResult {
  ein: string;
  name: string;
  city?: string;
  state?: string;
  rank: number;
  latestRevenue?: number;
  programExpenseRatio?: number | null;
  riskSignals?: RiskSignal[];
  externalCorroboration?: ExternalCorroborationMatch[];
  fraudMeter?: FraudMeterModel;
}

interface StateData {
  total: number;
  flagged: number;
  orgs: OrgResult[];
}

interface TooltipInfo {
  name: string;
  total: number;
  flagged: number;
  filteredCount: number;
  breakdownLines: string[];
  x: number;
  y: number;
}

const STATE_COORDS: Record<string, [number, number]> = {
  AL: [-86.9, 32.8], AK: [-153.5, 64.3], AZ: [-111.1, 34.3],
  AR: [-92.4, 34.8], CA: [-119.7, 36.8], CO: [-105.8, 39.0],
  CT: [-72.8, 41.6], DE: [-75.5, 39.2], DC: [-77.0, 38.9],
  FL: [-81.5, 28.1], GA: [-83.5, 32.7], HI: [-155.5, 19.9],
  ID: [-114.7, 44.1], IL: [-89.4, 40.6], IN: [-86.1, 40.3],
  IA: [-93.1, 42.0], KS: [-98.5, 38.5], KY: [-84.3, 37.8],
  LA: [-92.0, 30.5], ME: [-69.4, 45.3], MD: [-76.6, 39.0],
  MA: [-71.5, 42.2], MI: [-84.5, 44.3], MN: [-94.7, 46.7],
  MS: [-89.7, 32.7], MO: [-91.8, 38.5], MT: [-109.6, 46.9],
  NE: [-99.9, 41.5], NV: [-116.4, 38.8], NH: [-71.6, 43.2],
  NJ: [-74.4, 40.1], NM: [-105.9, 34.5], NY: [-75.5, 43.0],
  NC: [-79.0, 35.6], ND: [-101.0, 47.5], OH: [-82.9, 40.4],
  OK: [-97.1, 35.5], OR: [-120.5, 44.0], PA: [-77.2, 41.2],
  RI: [-71.5, 41.7], SC: [-81.2, 34.0], SD: [-99.9, 44.3],
  TN: [-86.6, 35.5], TX: [-99.4, 31.5], UT: [-111.1, 39.3],
  VT: [-72.6, 44.0], VA: [-78.2, 37.5], WA: [-120.7, 47.8],
  WV: [-80.5, 38.6], WI: [-89.6, 43.8], WY: [-107.3, 43.1],
};

function colorScale(count: number, max: number): string {
  if (count === 0 || max === 0) return "#f3f4f6";
  const t = Math.min(count / max, 1);
  const r = Math.round(254 - t * 127);
  const g = Math.round(226 - t * 196);
  const b = Math.round(226 - t * 196);
  return `rgb(${r}, ${g}, ${b})`;
}

function darkColorScale(count: number, max: number): string {
  if (count === 0 || max === 0) return "#1f2937";
  const t = Math.min(count / max, 1);
  const r = Math.round(55 + t * 170);
  const g = Math.round(30 + t * 10);
  const b = Math.round(30 + t * 10);
  return `rgb(${r}, ${g}, ${b})`;
}

function orgMatchesFilter(org: OrgResult, filterId: CategoryFilterId): boolean {
  if (filterId === "all") return true;
  const cat = getFraudMapCategory(filterId);
  return cat ? cat.matches(org) : false;
}

/** Same records as the “Fraud Categories” grid (Prisma), for aligned labels. */
export interface FraudMapPlatformCategory {
  id: string;
  name: string;
  slug: string;
  status: string;
  icon: string;
}

const CHARITIES_PLATFORM_ID = "charities";

interface FraudMapProps {
  platformCategories: FraudMapPlatformCategory[];
}

export function FraudMap({ platformCategories }: FraudMapProps) {
  const [orgs, setOrgs] = useState<OrgResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [platformCategoryId, setPlatformCategoryId] = useState<string>(
    CHARITIES_PLATFORM_ID
  );
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilterId>("all");
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    fetch("/api/charities/hottest?limit=100")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.results)) {
          setOrgs(data.results);
        }
      })
      .catch((err) => console.error('[FraudMap] Failed to fetch map data:', err))
      .finally(() => setLoading(false));
  }, []);

  const charitiesMode = platformCategoryId === CHARITIES_PLATFORM_ID;

  // Filter to only show active categories prominently
  const activeCategories = useMemo(
    () => platformCategories.filter((c) => c.status === "active"),
    [platformCategories]
  );

  const selectedPlatform = useMemo(
    () => platformCategories.find((c) => c.id === platformCategoryId),
    [platformCategories, platformCategoryId]
  );

  const setPlatformTab = useCallback((id: string) => {
    setPlatformCategoryId(id);
    setSelectedState(null);
    if (id !== CHARITIES_PLATFORM_ID) {
      setCategoryFilter("all");
    }
  }, []);

  const stateMap = useMemo(() => {
    const map = new Map<string, StateData>();
    for (const org of orgs) {
      if (!org.state) continue;
      const abbr = org.state.toUpperCase();
      if (!map.has(abbr)) {
        map.set(abbr, { total: 0, flagged: 0, orgs: [] });
      }
      const entry = map.get(abbr)!;
      entry.total += 1;
      const isFlagged =
        org.fraudMeter?.isFlagged ??
        org.riskSignals?.some((s) => s.severity === "high") ??
        false;
      if (isFlagged || (org.externalCorroboration?.length ?? 0) > 0) entry.flagged += 1;
      entry.orgs.push(org);
    }
    return map;
  }, [orgs]);

  const categoryCountsByState = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const org of orgs) {
      if (!org.state) continue;
      const abbr = org.state.toUpperCase();
      if (!m.has(abbr)) m.set(abbr, {});
      const rec = m.get(abbr)!;
      for (const cat of getCategoriesForOrg(org)) {
        rec[cat.id] = (rec[cat.id] ?? 0) + 1;
      }
    }
    return m;
  }, [orgs]);

  const { filteredByState, maxFiltered } = useMemo(() => {
    if (categoryFilter === "all") {
      return { filteredByState: new Map<string, number>(), maxFiltered: 0 };
    }
    const cat = getFraudMapCategory(categoryFilter);
    if (!cat) {
      return { filteredByState: new Map<string, number>(), maxFiltered: 0 };
    }
    const m = new Map<string, number>();
    let max = 0;
    for (const org of orgs) {
      if (!org.state || !cat.matches(org)) continue;
      const abbr = org.state.toUpperCase();
      const n = (m.get(abbr) ?? 0) + 1;
      m.set(abbr, n);
      if (n > max) max = n;
    }
    return { filteredByState: m, maxFiltered: max };
  }, [orgs, categoryFilter]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const [, data] of stateMap) {
      if (data.total > max) max = data.total;
    }
    return max;
  }, [stateMap]);

  const activeFilterCategory =
    categoryFilter === "all" ? null : getFraudMapCategory(categoryFilter);

  const filterHasNoMatches =
    categoryFilter !== "all" && maxFiltered === 0 && orgs.length > 0;

  const selectedStateData = selectedState ? stateMap.get(selectedState) : null;

  const panelOrgs = useMemo(() => {
    if (!selectedStateData) return [];
    return selectedStateData.orgs
      .filter((o) => orgMatchesFilter(o, categoryFilter))
      .sort(
        (a, b) => (b.fraudMeter?.score ?? 0) - (a.fraudMeter?.score ?? 0)
      );
  }, [selectedStateData, categoryFilter]);

  const panelMatchingCount = panelOrgs.length;

  const buildTooltipBreakdown = useCallback(
    (abbr: string, data: StateData | undefined) => {
      const rec = categoryCountsByState.get(abbr) ?? {};
      const lines = Object.entries(rec)
        .map(([id, n]) => {
          const c = getFraudMapCategory(id);
          return c ? { n, label: c.label } : null;
        })
        .filter((x): x is { n: number; label: string } => x != null)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map(({ n, label }) => `${label}: ${n}`);
      return lines;
    },
    [categoryCountsByState]
  );

  const handleStateClick = useCallback((abbr: string) => {
    setSelectedState((prev) => (prev === abbr ? null : abbr));
  }, []);

  const handleMouseEnter = useCallback(
    (fips: string, event: React.MouseEvent) => {
      const abbr = fipsToAbbr(fips);
      const name = fipsToName(fips);
      if (!abbr || !name) return;
      const data = stateMap.get(abbr);
      const filteredCount =
        categoryFilter === "all"
          ? data?.total ?? 0
          : filteredByState.get(abbr) ?? 0;
      const breakdownLines =
        categoryFilter === "all" && (data?.total ?? 0) > 0
          ? buildTooltipBreakdown(abbr, data)
          : [];
      setTooltip({
        name,
        total: data?.total ?? 0,
        flagged: data?.flagged ?? 0,
        filteredCount,
        breakdownLines,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [stateMap, categoryFilter, filteredByState, buildTooltipBreakdown]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const getAllModeColor = isDark ? darkColorScale : colorScale;

  const stateFill = useCallback(
    (abbr: string | undefined, countAll: number, isSelected: boolean) => {
      if (!abbr) return isDark ? "#1f2937" : "#f3f4f6";
      if (categoryFilter === "all") {
        if (isSelected) return isDark ? "#dc2626" : "#ef4444";
        return getAllModeColor(countAll, maxCount);
      }
      const cat = activeFilterCategory;
      if (!cat) return isDark ? "#1f2937" : "#f3f4f6";
      const n = filteredByState.get(abbr) ?? 0;
      if (isSelected) {
        return categoryChoroplethFill(cat.accentHex, 1, isDark);
      }
      const t = maxFiltered > 0 ? n / maxFiltered : 0;
      return categoryChoroplethFill(cat.accentHex, t, isDark);
    },
    [
      categoryFilter,
      activeFilterCategory,
      filteredByState,
      maxFiltered,
      maxCount,
      isDark,
      getAllModeColor,
    ]
  );

  const stateHoverFill = useCallback(
    (abbr: string | undefined) => {
      if (categoryFilter === "all") {
        return isDark ? "#b91c1c" : "#fca5a5";
      }
      const cat = activeFilterCategory;
      if (!cat) return isDark ? "#b91c1c" : "#fca5a5";
      return categoryChoroplethHover(cat.accentHex, isDark);
    },
    [categoryFilter, activeFilterCategory, isDark]
  );

  const orgsForPins =
    selectedStateData?.orgs.filter((o) => orgMatchesFilter(o, categoryFilter)) ??
    [];

  const selectedFilterLabel = activeFilterCategory?.label ?? "All issues";

  return (
    <div className="relative">
      {loading && charitiesMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 rounded-xl">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Loading fraud map data...
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        {platformCategories.length > 0 && (
          <div className="border-b border-gray-200 dark:border-gray-700 px-3 py-3 sm:px-4 bg-gray-50/80 dark:bg-gray-800/40">
            <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-2">
              Fraud category
            </p>
            <div className="flex flex-wrap gap-1.5">
              {platformCategories.map((pc) => {
                const isSel = platformCategoryId === pc.id;
                return (
                  <button
                    key={pc.id}
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => setPlatformTab(pc.id)}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors text-left ${isSel
                        ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-gray-900 dark:text-white ring-1 ring-red-500/30"
                        : "border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
                      }`}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {pc.icon}
                    </span>
                    <span className="max-w-[140px] sm:max-w-[180px] truncate">
                      {pc.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
              Heatmap + colored filters:{" "}
              <span className="font-medium text-gray-600 dark:text-gray-300">
                Charities &amp; Nonprofits only
              </span>
              . Those filters are{" "}
              <span className="italic">issue signals</span> from Form 990 and
              external lists—not separate top-level fraud categories.
            </p>
          </div>
        )}

        {charitiesMode && (
          <div className="border-b border-gray-200 dark:border-gray-700 px-3 py-3 sm:px-4">
            <p className="text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
              Charity issue signals
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Refine the map by IRS 990 risk metrics and external matches (within
              Charities &amp; Nonprofits).
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={categoryFilter === "all"}
                onClick={() => setCategoryFilter("all")}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${categoryFilter === "all"
                    ? "bg-red-600 border-red-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
              >
                All
              </button>
              {FRAUD_MAP_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(c.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors max-w-[200px] truncate ${categoryFilter === c.id
                      ? "text-white border-transparent"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  style={
                    categoryFilter === c.id
                      ? { backgroundColor: c.accentHex, borderColor: c.accentHex }
                      : undefined
                  }
                  title={c.label}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {filterHasNoMatches && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                No organizations in this sample match “{selectedFilterLabel}.”
                Try another filter or All.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col lg:flex-row">
          {!charitiesMode ? (
            selectedPlatform ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[320px] sm:min-h-[400px] px-6 py-10 text-center border-b lg:border-b-0 border-gray-200 dark:border-gray-700">
                <span className="text-5xl mb-4" aria-hidden>
                  {selectedPlatform.icon}
                </span>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {selectedPlatform.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mb-6">
                  State-level heatmaps are only built for{" "}
                  <strong className="font-medium text-gray-800 dark:text-gray-200">
                    Charities &amp; Nonprofits
                  </strong>{" "}
                  right now. Explore this category in its dedicated area.
                </p>
                <Link
                  href={`/${selectedPlatform.slug}`}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                >
                  Open {selectedPlatform.name} →
                </Link>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] px-6 py-8 text-center text-sm text-gray-600 dark:text-gray-400">
                <p className="mb-3">This category is not available.</p>
                <button
                  type="button"
                  onClick={() => setPlatformTab(CHARITIES_PLATFORM_ID)}
                  className="text-red-600 dark:text-red-400 font-medium hover:underline"
                >
                  Back to Charities heatmap
                </button>
              </div>
            )
          ) : (
            <div className="flex-1 relative min-h-[350px] sm:min-h-[420px]">
              <ComposableMap
                projection="geoAlbersUsa"
                projectionConfig={{ scale: 1000 }}
                width={800}
                height={500}
                style={{ width: "100%", height: "auto" }}
              >
                <ZoomableGroup>
                  <Geographies geography={GEO_URL}>
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const fips = geo.id;
                        const abbr = fipsToAbbr(fips);
                        const data = abbr ? stateMap.get(abbr) : undefined;
                        const count = data?.total ?? 0;
                        const isSelected = abbr === selectedState;

                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            onClick={() => abbr && handleStateClick(abbr)}
                            onMouseEnter={(e) =>
                              handleMouseEnter(fips, e as unknown as React.MouseEvent)
                            }
                            onMouseLeave={handleMouseLeave}
                            style={{
                              default: {
                                fill: stateFill(abbr, count, isSelected),
                                stroke: isDark ? "#374151" : "#d1d5db",
                                strokeWidth: isSelected ? 1.5 : 0.5,
                                outline: "none",
                                cursor: "pointer",
                              },
                              hover: {
                                fill: stateHoverFill(abbr),
                                stroke: isDark ? "#6b7280" : "#9ca3af",
                                strokeWidth: 1,
                                outline: "none",
                                cursor: "pointer",
                              },
                              pressed: {
                                fill: stateFill(abbr, count, true),
                                outline: "none",
                              },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>

                  {selectedState &&
                    orgsForPins.map((org) => {
                      const coords = STATE_COORDS[org.state?.toUpperCase() ?? ""];
                      if (!coords) return null;
                      const primary = getPrimaryCategoryForOrg(org);
                      const fill =
                        primary?.accentHex ??
                        (org.fraudMeter?.isFlagged ||
                          org.riskSignals?.some((s) => s.severity === "high")
                          ? "#ef4444"
                          : "#f59e0b");
                      const einSeed = parseInt(org.ein.replace(/\D/g, ''), 10) || 0;
                      const jitterX = Math.sin(einSeed) * 1.5;
                      const jitterY = Math.cos(einSeed) * 1.2;
                      return (
                        <Marker
                          key={org.ein}
                          coordinates={[coords[0] + jitterX, coords[1] + jitterY]}
                        >
                          <circle
                            r={4}
                            fill={fill}
                            stroke="#fff"
                            strokeWidth={1}
                            style={{ cursor: "pointer" }}
                          />
                        </Marker>
                      );
                    })}
                </ZoomableGroup>
              </ComposableMap>

              {tooltip && (
                <div
                  className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs shadow-lg max-w-[240px]"
                  style={{
                    left: tooltip.x + 12,
                    top: tooltip.y - 10,
                  }}
                >
                  <p className="font-semibold">{tooltip.name}</p>
                  {categoryFilter === "all" ? (
                    tooltip.total > 0 ? (
                      <>
                        <p>
                          {tooltip.total} tracked · {tooltip.flagged} flagged
                        </p>
                        {tooltip.breakdownLines.length > 0 && (
                          <ul className="mt-1.5 pt-1.5 border-t border-gray-600 dark:border-gray-400 space-y-0.5 text-[10px] opacity-95">
                            {tooltip.breakdownLines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-400 dark:text-gray-500">
                        No data yet
                      </p>
                    )
                  ) : tooltip.filteredCount > 0 ? (
                    <p>
                      {tooltip.filteredCount} with {selectedFilterLabel}
                    </p>
                  ) : (
                    <p className="text-gray-400 dark:text-gray-500">
                      None in this sample
                    </p>
                  )}
                </div>
              )}

              <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 bg-white/90 dark:bg-gray-900/90 px-2 py-1 rounded max-w-[min(100%,280px)] flex-wrap">
                {categoryFilter === "all" ? (
                  <>
                    <span>Less</span>
                    <div className="flex gap-0.5">
                      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                        <div
                          key={t}
                          className="w-4 h-3 rounded-sm"
                          style={{
                            backgroundColor: getAllModeColor(
                              t * (maxCount || 1),
                              maxCount || 1
                            ),
                          }}
                        />
                      ))}
                    </div>
                    <span>More</span>
                  </>
                ) : activeFilterCategory ? (
                  <>
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: activeFilterCategory.accentHex }}
                    />
                    <span className="truncate">{activeFilterCategory.label}</span>
                    <span className="opacity-75">·</span>
                    <span>Less</span>
                    <div className="flex gap-0.5">
                      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                        <div
                          key={t}
                          className="w-4 h-3 rounded-sm"
                          style={{
                            backgroundColor: categoryChoroplethFill(
                              activeFilterCategory.accentHex,
                              t,
                              isDark
                            ),
                          }}
                        />
                      ))}
                    </div>
                    <span>More</span>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {charitiesMode && selectedState && (
            <div className="lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 overflow-y-auto max-h-[420px]">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {abbrToName(selectedState) ?? selectedState}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectedState(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Close
                  </button>
                </div>
                {selectedStateData ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {categoryFilter === "all"
                            ? selectedStateData.total
                            : panelMatchingCount}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {categoryFilter === "all" ? "Tracked" : "Matching"}
                        </p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">
                          {categoryFilter === "all"
                            ? selectedStateData.flagged
                            : panelOrgs.filter(
                              (o) =>
                                o.fraudMeter?.isFlagged ||
                                o.riskSignals?.some((s) => s.severity === "high") ||
                                (o.externalCorroboration?.length ?? 0) > 0
                            ).length}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Flagged
                        </p>
                      </div>
                    </div>
                    {categoryFilter !== "all" && panelMatchingCount === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No organizations in this state match the current filter.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {panelOrgs.map((org) => {
                          const cats = getCategoriesForOrg(org);
                          const visible = cats.slice(0, 3);
                          const extra = cats.length - visible.length;
                          const isFlagged = org.fraudMeter?.isFlagged;
                          return (
                            <li key={org.ein}>
                              <Link
                                href={`/charities/${org.ein}`}
                                className="block p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition text-sm"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium text-gray-900 dark:text-white text-xs leading-tight">
                                    {org.name}
                                  </span>
                                  {isFlagged && (
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
                                      Fraud {org.fraudMeter?.score ?? 0}
                                    </span>
                                  )}
                                </div>
                                {visible.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {visible.map((c) => (
                                      <span
                                        key={c.id}
                                        className="text-[9px] px-1.5 py-0.5 rounded text-white max-w-full truncate"
                                        style={{ backgroundColor: c.accentHex }}
                                        title={c.label}
                                      >
                                        {c.label}
                                      </span>
                                    ))}
                                    {extra > 0 && (
                                      <span className="text-[9px] text-gray-500 dark:text-gray-400">
                                        +{extra}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="flex gap-3 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                  <span>{formatMoney(org.latestRevenue)}</span>
                                  <span>
                                    {formatPct(org.programExpenseRatio)} to cause
                                  </span>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Link
                      href={`/charities?state=${selectedState}`}
                      className="block mt-3 text-center text-sm text-red-600 dark:text-red-400 hover:underline font-medium"
                    >
                      View all in {abbrToName(selectedState)} →
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No tracked organizations in this state yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!loading && orgs.length > 0 && charitiesMode && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
          Showing {orgs.length} organizations across {stateMap.size} states
          {categoryFilter === "all"
            ? " · Click a state to drill down"
            : ` · Signal filter: ${selectedFilterLabel}`}
        </p>
      )}
    </div>
  );
}
