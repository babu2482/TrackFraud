import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getExternalCorroboration } from "@/lib/external-corroboration";
import {
  buildFraudMeter,
  computeCharityFraudBaseScore,
} from "@/lib/fraud-meter";
import { NTEE_MAJOR_LABELS, nteeCodeToMajorId } from "@/lib/ntee";
import { buildLegalClassification } from "@/lib/signals";
import { isValidEin, normalizeEin } from "@/lib/charity-detail";
import {
  normalizeCharitySearchText,
  relevanceBoost,
  sortCharityResultsByRelevance,
} from "@/lib/charity-search";
import type {
  CharityDetail,
  CharityMetrics,
  CharitySearchResult,
  HottestCharityResult,
  RiskSignal,
} from "@/lib/types";

const SEARCH_PAGE_SIZE = 25;

interface SearchStoredCharitiesParams {
  q: string;
  page?: number;
  state?: string;
  ntee?: number;
  cCode?: number;
}

interface SearchStoredCharitiesResult {
  results: CharitySearchResult[];
  totalResults: number;
}

interface GetStoredHottestCharitiesParams {
  limit: number;
  cCode?: number;
}

interface GetStoredHottestCharitiesResult {
  totalResults: number;
  results: HottestCharityResult[];
}

function toNumber(value: bigint | null | undefined): number | undefined {
  if (value == null) return undefined;
  return Number(value);
}

function nteeMajorId(nteeCode?: string | null): number | null {
  if (!nteeCode) return null;
  const first = nteeCode.charAt(0);
  if (!first) return null;
  if (/\d/.test(first)) {
    const numeric = parseInt(first, 10);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const alpha = first.toUpperCase().charCodeAt(0) - 64;
  return alpha >= 1 && alpha <= 10 ? alpha : null;
}

function matchesNteeMajor(
  nteeCode: string | null | undefined,
  ntee?: number,
): boolean {
  if (ntee == null) return true;
  return nteeMajorId(nteeCode) === ntee;
}

function buildStoredRiskSignals(
  signals: Array<{
    signalKey: string;
    signalLabel: string;
    severity: string;
    detail: string;
    measuredValue: number | null;
    thresholdValue: number | null;
  }>,
): RiskSignal[] {
  return signals
    .filter(
      (signal): signal is typeof signal & { severity: "medium" | "high" } =>
        signal.severity === "medium" || signal.severity === "high",
    )
    .map((signal) => ({
      key: signal.signalKey,
      label: signal.signalLabel,
      severity: signal.severity,
      detail: signal.detail,
      value: signal.measuredValue,
      threshold: signal.thresholdValue ?? undefined,
    }));
}

function nteeCategoryLabel(nteeCode?: string | null): string | undefined {
  const majorId = nteeCodeToMajorId(nteeCode ?? undefined);
  return majorId != null ? NTEE_MAJOR_LABELS[majorId] : undefined;
}

function buildStoredMetrics(filing: {
  filingYear: number;
  taxPeriod: number;
  totalRevenue: bigint | null;
  contributionsRevenue: bigint | null;
  programServiceRevenue: bigint | null;
  otherRevenue: bigint | null;
  totalExpenses: bigint | null;
  programExpenses: bigint | null;
  managementExpenses: bigint | null;
  fundraisingExpenses: bigint | null;
  programExpenseRatio: number | null;
  overheadRatio: number | null;
  fundraisingEfficiency: number | null;
  compensationPct: number | null;
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  pdfUrl: string | null;
}): CharityMetrics {
  return {
    filingYear: filing.filingYear,
    taxPeriod: filing.taxPeriod,
    revenue: {
      total: toNumber(filing.totalRevenue) ?? 0,
      contributions: toNumber(filing.contributionsRevenue),
      programService: toNumber(filing.programServiceRevenue),
      other: toNumber(filing.otherRevenue),
    },
    expenses: {
      total: toNumber(filing.totalExpenses) ?? 0,
      program: toNumber(filing.programExpenses) ?? 0,
      management: toNumber(filing.managementExpenses) ?? 0,
      fundraising: toNumber(filing.fundraisingExpenses) ?? 0,
    },
    programExpenseRatio: filing.programExpenseRatio,
    overheadRatio: filing.overheadRatio,
    per100:
      filing.totalExpenses != null &&
      toNumber(filing.totalExpenses) &&
      toNumber(filing.totalExpenses)! > 0
        ? [
            ((toNumber(filing.programExpenses) ?? 0) /
              toNumber(filing.totalExpenses)!) *
              100,
            ((toNumber(filing.managementExpenses) ?? 0) /
              toNumber(filing.totalExpenses)!) *
              100,
            ((toNumber(filing.fundraisingExpenses) ?? 0) /
              toNumber(filing.totalExpenses)!) *
              100,
          ]
        : null,
    fundraisingEfficiency: filing.fundraisingEfficiency,
    compensationPct: filing.compensationPct,
    assets: toNumber(filing.totalAssets),
    liabilities: toNumber(filing.totalLiabilities),
    pdfUrl: filing.pdfUrl,
  };
}

function compareNullableNumberDesc(
  a?: number | null,
  b?: number | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function compareNullableNumberAsc(
  a?: number | null,
  b?: number | null,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function buildRankingScore(params: {
  revenue: number;
  fraudMeterScore: number;
  highSignalCount: number;
  filingYear?: number;
}): number {
  const revenue = params.revenue > 0 ? params.revenue : 0;
  const currentYear = new Date().getFullYear();
  const recency =
    params.filingYear != null
      ? Math.max(0, 5 - (currentYear - params.filingYear))
      : 0;

  const revenuePoints = Math.log10(revenue + 1) * 10;
  const recencyPoints = recency * 4;
  const signalPoints = params.highSignalCount * 30;

  return (
    params.fraudMeterScore * 100 + signalPoints + revenuePoints + recencyPoints
  );
}

export async function searchStoredCharities(
  params: SearchStoredCharitiesParams,
): Promise<SearchStoredCharitiesResult> {
  const page = Math.max(0, params.page ?? 0);
  const rawQuery = params.q.trim();
  if (!rawQuery) {
    return { results: [], totalResults: 0 };
  }

  const normalizedQuery = normalizeCharitySearchText(rawQuery);
  const exactEin = normalizeEin(rawQuery);
  const hasExactEin = isValidEin(exactEin);
  if (!hasExactEin && !normalizedQuery) {
    return { results: [], totalResults: 0 };
  }

  const profileFilters: Prisma.CharityProfileWhereInput = {
    ...(params.state ? { state: params.state } : {}),
    ...(params.cCode != null ? { subsectionCode: params.cCode } : {}),
  };

  const queryFilters: Prisma.CanonicalEntityWhereInput[] = hasExactEin
    ? [
        {
          CharityProfile: {
            is: {
              ein: exactEin,
            },
          },
        },
        {
          EntityIdentifier: {
            some: {
              identifierType: "ein",
              identifierValue: exactEin,
            },
          },
        },
      ]
    : [
        {
          normalizedName: {
            contains: normalizedQuery,
          },
        },
        {
          EntityAlias: {
            some: {
              normalizedAlias: {
                contains: normalizedQuery,
              },
            },
          },
        },
        {
          CharityProfile: {
            is: {
              city: {
                contains: rawQuery,
              },
            },
          },
        },
      ];

  const where: Prisma.CanonicalEntityWhereInput = {
    categoryId: "charities",
    AND: [
      ...(Object.keys(profileFilters).length > 0
        ? [
            {
              CharityProfile: {
                is: profileFilters,
              },
            } satisfies Prisma.CanonicalEntityWhereInput,
          ]
        : []),
      {
        OR: queryFilters,
      },
    ],
  };

  const entities = await prisma.canonicalEntity.findMany({
    where,
    include: {
      CharityProfile: true,
      EntityAlias: {
        select: {
          alias: true,
        },
      },
    },
    orderBy: {
      latestSourceUpdatedAt: "desc",
    },
  });

  const filtered = entities
    .filter((entity) =>
      matchesNteeMajor(entity.CharityProfile?.nteeCode, params.ntee),
    )
    .map((entity) => {
      const profile = entity.CharityProfile;
      const aliasBoost = Math.max(
        0,
        ...entity.EntityAlias.map((alias) =>
          relevanceBoost(alias.alias, rawQuery),
        ),
      );
      const cityBoost =
        profile?.city &&
        normalizeCharitySearchText(profile.city).includes(normalizedQuery)
          ? 160
          : 0;
      const localScore =
        (hasExactEin && profile?.ein === exactEin ? 4000 : 0) +
        Math.max(relevanceBoost(entity.displayName, rawQuery), aliasBoost) +
        cityBoost;

      return {
        ein: profile?.ein ?? "",
        name: entity.displayName,
        city: profile?.city ?? undefined,
        state: profile?.state ?? undefined,
        ntee_code: profile?.nteeCode ?? undefined,
        subseccd: profile?.subsectionCode ?? undefined,
        score: localScore / 100,
      } satisfies CharitySearchResult;
    })
    .filter((result) => result.ein.length === 9);

  const ranked = sortCharityResultsByRelevance(filtered, rawQuery);
  const start = page * SEARCH_PAGE_SIZE;
  return {
    results: ranked.slice(start, start + SEARCH_PAGE_SIZE),
    totalResults: ranked.length,
  };
}

export async function getStoredHottestCharities(
  params: GetStoredHottestCharitiesParams,
): Promise<GetStoredHottestCharitiesResult> {
  const candidateCount = Math.min(
    Math.max(params.limit * 3, params.limit + 10),
    100,
  );

  // PostgreSQL has a limit of 32767 bind variables per query.
  // We chunk entity IDs to stay safely under this limit.
  const MAX_BIND_VARS = 30000;

  // Step 1: Get matching entity IDs
  const entities = await prisma.canonicalEntity.findMany({
    where: {
      categoryId: "charities",
      ...(params.cCode != null
        ? {
            CharityProfile: {
              is: {
                subsectionCode: params.cCode,
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  const entityIds = entities.map((e) => e.id);

  if (entityIds.length === 0) {
    return { totalResults: 0, results: [] };
  }

  // Step 2: Get snapshots for those entities (chunked to avoid bind variable limit)
  type SnapshotResult = {
    id: string;
    entityId: string;
    createdAt: Date;
    updatedAt: Date;
    isCurrent: boolean;
    methodologyVersion: string;
    score: number;
    level: string;
    bandLabel: string | null;
    baseScore: number | null;
    activeSignalCount: number | null;
    sourceFreshnessAt: Date | null;
    computedAt: Date;
    CanonicalEntity: {
      id: string;
      displayName: string;
      normalizedName: string;
      categoryId: string;
      CharityProfile: {
        ein: string;
        city: string | null;
        state: string | null;
        nteeCode: string | null;
        subsectionCode: number | null;
      } | null;
      CharityFiling: Array<{
        filingYear: number;
        taxPeriod: number;
        totalRevenue: bigint | null;
        totalExpenses: bigint | null;
        programExpenseRatio: number | null;
        fundraisingEfficiency: number | null;
        compensationPct: number | null;
        formType: number | null;
      }>;
      FraudSignalEvent: Array<{
        signalKey: string;
        signalLabel: string;
        severity: string;
        detail: string;
        measuredValue: number | null;
        thresholdValue: number | null;
      }>;
    };
  };
  const allSnapshots: SnapshotResult[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < entityIds.length; i += MAX_BIND_VARS) {
    chunks.push(entityIds.slice(i, i + MAX_BIND_VARS));
  }

  for (const chunk of chunks) {
    const chunkSnapshots = await prisma.fraudSnapshot.findMany({
      where: {
        isCurrent: true,
        entityId: { in: chunk },
      },
      include: {
        CanonicalEntity: {
          include: {
            CharityProfile: true,
            CharityFiling: {
              where: {
                isLatest: true,
              },
              take: 1,
              orderBy: { taxPeriod: "desc" as const },
            },
            FraudSignalEvent: {
              where: {
                status: "active",
              },
            },
          },
        },
      },
      orderBy: [
        { score: "desc" },
        { activeSignalCount: "desc" },
        { sourceFreshnessAt: "desc" },
      ],
      take: candidateCount,
    });
    allSnapshots.push(...chunkSnapshots);
  }

  // Deduplicate and re-sort all snapshots
  const seenEntityIds = new Set<string>();
  const uniqueSnapshots: SnapshotResult[] = allSnapshots.filter(
    (snapshot: SnapshotResult) => {
      if (seenEntityIds.has(snapshot.entityId)) return false;
      seenEntityIds.add(snapshot.entityId);
      return true;
    },
  );

  const sortedSnapshots: SnapshotResult[] = uniqueSnapshots
    .sort((a: SnapshotResult, b: SnapshotResult) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const activeA = a.activeSignalCount ?? 0;
      const activeB = b.activeSignalCount ?? 0;
      if (activeB !== activeA) return activeB - activeA;
      const freshnessA = a.sourceFreshnessAt ?? new Date(0);
      const freshnessB = b.sourceFreshnessAt ?? new Date(0);
      return freshnessB.getTime() - freshnessA.getTime();
    })
    .slice(0, candidateCount);

  const snapshots: SnapshotResult[] = sortedSnapshots;

  const totalResults = snapshots.length;

  if (totalResults === 0) {
    return { totalResults: 0, results: [] };
  }

  const enriched = await Promise.all(
    snapshots.map(async (snapshot): Promise<HottestCharityResult | null> => {
      const entity = snapshot.CanonicalEntity;
      const profile = entity.CharityProfile;
      const latestFiling = entity.CharityFiling[0];
      if (!profile || !latestFiling) return null;

      const riskSignals = buildStoredRiskSignals(entity.FraudSignalEvent);
      const latestRevenue = toNumber(latestFiling.totalRevenue) ?? 0;
      const latestExpenses = toNumber(latestFiling.totalExpenses);
      const filingYear = latestFiling.filingYear;
      const legalClassification = buildLegalClassification({
        subsectionCode: profile.subsectionCode ?? undefined,
        formType: latestFiling.formType ?? undefined,
      });

      const externalCorroboration = await getExternalCorroboration({
        ein: profile.ein,
        organizationName: entity.displayName,
      }).catch(() => []);

      const fraudMeter = buildFraudMeter({
        domain: "charities",
        riskSignals,
        externalCorroboration,
        baseScore:
          snapshot.baseScore ??
          computeCharityFraudBaseScore({
            programExpenseRatio: latestFiling.programExpenseRatio ?? null,
            fundraisingEfficiency: latestFiling.fundraisingEfficiency ?? null,
            compensationPct: latestFiling.compensationPct ?? null,
          }),
        baseSummary:
          "This organization shows rising fraud pressure from its spending mix, fundraising cost, and officer pay levels, even though the hard alert thresholds are not all crossed.",
      });

      return {
        rank: 0,
        ein: profile.ein,
        name: entity.displayName,
        city: profile.city ?? undefined,
        state: profile.state ?? undefined,
        ntee_code: profile.nteeCode ?? undefined,
        subseccd: profile.subsectionCode ?? undefined,
        latestFilingYear: filingYear,
        latestRevenue,
        latestExpenses,
        programExpenseRatio: latestFiling.programExpenseRatio,
        fundraisingEfficiency: latestFiling.fundraisingEfficiency,
        compensationPct: latestFiling.compensationPct,
        legalClassification,
        riskSignals,
        externalCorroboration,
        fraudMeter,
        rankingScore: buildRankingScore({
          revenue: latestRevenue,
          fraudMeterScore: fraudMeter.score,
          highSignalCount: fraudMeter.highSignalCount,
          filingYear,
        }),
      };
    }),
  );

  const ranked = enriched
    .filter((item): item is HottestCharityResult => item != null)
    .sort((a, b) => {
      const meterDiff = compareNullableNumberDesc(
        a.fraudMeter?.score,
        b.fraudMeter?.score,
      );
      if (meterDiff !== 0) return meterDiff;

      const rankDiff = compareNullableNumberDesc(
        a.rankingScore,
        b.rankingScore,
      );
      if (rankDiff !== 0) return rankDiff;

      const revenueDiff = compareNullableNumberDesc(
        a.latestRevenue,
        b.latestRevenue,
      );
      if (revenueDiff !== 0) return revenueDiff;

      const ratioDiff = compareNullableNumberDesc(
        a.programExpenseRatio,
        b.programExpenseRatio,
      );
      if (ratioDiff !== 0) return ratioDiff;

      const fundraisingDiff = compareNullableNumberAsc(
        a.fundraisingEfficiency,
        b.fundraisingEfficiency,
      );
      if (fundraisingDiff !== 0) return fundraisingDiff;

      return compareNullableNumberAsc(a.compensationPct, b.compensationPct);
    })
    .slice(0, params.limit)
    .map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));

  return {
    totalResults,
    results: ranked,
  };
}

export async function loadStoredCharityDetail(
  rawEin: string,
): Promise<CharityDetail | null> {
  const ein = normalizeEin(rawEin);
  if (!isValidEin(ein)) return null;

  const profile = await prisma.charityProfile.findUnique({
    where: { ein },
    include: {
      CanonicalEntity: {
        include: {
          CharityBusinessMasterRecord: true,
          CharityFiling: {
            orderBy: {
              taxPeriod: "desc",
            },
            take: 11,
          },
          FraudSignalEvent: {
            where: {
              status: "active",
            },
          },
          FraudSnapshot: {
            where: {
              isCurrent: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!profile) return null;

  const entity = profile.CanonicalEntity;
  const businessMaster = entity.CharityBusinessMasterRecord;
  const filings = entity.CharityFiling;
  const latestFiling = filings[0];
  const latest = latestFiling ? buildStoredMetrics(latestFiling) : null;
  const riskSignals = buildStoredRiskSignals(entity.FraudSignalEvent);
  const externalCorroboration = await getExternalCorroboration({
    ein: profile.ein,
    organizationName: entity.displayName,
  }).catch(() => []);

  const legalClassification = buildLegalClassification({
    subsectionCode: profile.subsectionCode ?? undefined,
    formType: latestFiling?.formType ?? undefined,
  });

  const currentSnapshot = entity.FraudSnapshot[0];
  const fraudMeter = buildFraudMeter({
    domain: "charities",
    riskSignals,
    externalCorroboration,
    baseScore:
      currentSnapshot?.baseScore ??
      (latest
        ? computeCharityFraudBaseScore({
            programExpenseRatio: latest.programExpenseRatio,
            fundraisingEfficiency: latest.fundraisingEfficiency,
            compensationPct: latest.compensationPct,
          })
        : 0),
    baseSummary:
      latest == null
        ? "This organization is present in the IRS exempt-organization directory, but no filing-level spending metrics are stored locally yet."
        : undefined,
  });

  return {
    ein: profile.ein,
    name: entity.displayName,
    subName: profile.subName ?? businessMaster?.careOfName ?? undefined,
    address: profile.address ?? businessMaster?.street ?? undefined,
    city: profile.city ?? businessMaster?.city ?? undefined,
    state: profile.state ?? businessMaster?.state ?? undefined,
    zipcode: profile.zipcode ?? businessMaster?.zip ?? undefined,
    nteeCode: profile.nteeCode ?? businessMaster?.nteeCode ?? undefined,
    nteeCategory: nteeCategoryLabel(
      profile.nteeCode ?? businessMaster?.nteeCode,
    ),
    guidestarUrl: profile.guidestarUrl ?? undefined,
    latest,
    otherYears: filings.slice(1).map((filing) => ({
      year: filing.filingYear,
      taxPeriod: filing.taxPeriod,
    })),
    legalClassification,
    riskSignals,
    externalCorroboration,
    fraudMeter,
  };
}
