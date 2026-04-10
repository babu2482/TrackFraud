import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getExternalCorroboration } from "@/lib/external-corroboration";
import {
  buildFraudMeter,
  computeCharityFraudBaseScore,
} from "@/lib/fraud-meter";
import { IRS_990_XML_SOURCE_SYSTEM_ID } from "@/lib/irs-990-xml";
import { buildRiskSignals } from "@/lib/signals";

const PROPUBLICA_SOURCE_SYSTEM_ID = "propublica_nonprofit_explorer";
const CHARITY_FILING_SIGNAL_SOURCE_SYSTEM_IDS = [
  PROPUBLICA_SOURCE_SYSTEM_ID,
  IRS_990_XML_SOURCE_SYSTEM_ID,
] as const;

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface EnsureCharityEntityParams {
  ein: string;
  displayName: string;
}

export async function ensureCharityEntity(
  params: EnsureCharityEntityParams
): Promise<{ entityId: string; created: boolean }> {
  const existingProfile = await prisma.charityProfile.findUnique({
    where: { ein: params.ein },
    select: { entityId: true },
  });
  if (existingProfile) {
    return { entityId: existingProfile.entityId, created: false };
  }

  const existingIdentifier = await prisma.entityIdentifier.findFirst({
    where: {
      identifierType: "ein",
      identifierValue: params.ein,
    },
    select: { entityId: true },
  });

  if (existingIdentifier) {
    await prisma.charityProfile.upsert({
      where: { entityId: existingIdentifier.entityId },
      update: { ein: params.ein },
      create: {
        entityId: existingIdentifier.entityId,
        ein: params.ein,
      },
    });

    return { entityId: existingIdentifier.entityId, created: false };
  }

  const now = new Date();
  try {
    return await prisma.$transaction(
      async (tx) => {
        const entity = await tx.canonicalEntity.create({
          data: {
            categoryId: "charities",
            displayName: params.displayName,
            normalizedName: normalizeName(params.displayName),
            entityType: "charity",
            status: "active",
            primaryJurisdiction: "US",
            countryCode: "US",
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true },
        });

        await tx.entityIdentifier.create({
          data: {
            entityId: entity.id,
            sourceSystemId: IRS_990_XML_SOURCE_SYSTEM_ID,
            identifierType: "ein",
            identifierValue: params.ein,
            isPrimary: true,
            observedAt: now,
          },
        });

        await tx.charityProfile.create({
          data: {
            entityId: entity.id,
            ein: params.ein,
          },
        });

        return { entityId: entity.id, created: true };
      },
      {
        maxWait: 30_000,
        timeout: 60_000,
      }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const profile = await prisma.charityProfile.findUnique({
        where: { ein: params.ein },
        select: { entityId: true },
      });
      if (profile) {
        return { entityId: profile.entityId, created: false };
      }
    }

    throw error;
  }
}

export interface RecomputeStoredCharityFraudResult {
  entityId: string;
  snapshotScore: number;
  signalCount: number;
}

export async function recomputeStoredCharityFraud(
  entityId: string,
  sourceSystemId: string = IRS_990_XML_SOURCE_SYSTEM_ID
): Promise<RecomputeStoredCharityFraudResult | null> {
  const entity = await prisma.canonicalEntity.findUnique({
    where: { id: entityId },
    include: {
      charityProfile: true,
      charityFilings: {
        orderBy: { taxPeriod: "desc" },
        take: 1,
      },
    },
  });

  if (!entity?.charityProfile) {
    return null;
  }

  const latestFiling = entity.charityFilings[0] ?? null;
  const riskSignals = latestFiling
    ? buildRiskSignals({
        programExpenseRatio: latestFiling.programExpenseRatio ?? null,
        fundraisingEfficiency: latestFiling.fundraisingEfficiency ?? null,
        compensationPct: latestFiling.compensationPct ?? null,
      })
    : [];

  const externalCorroboration = await getExternalCorroboration({
    ein: entity.charityProfile.ein,
    organizationName: entity.displayName,
  }).catch(() => []);

  const baseScore = latestFiling
    ? computeCharityFraudBaseScore({
        programExpenseRatio: latestFiling.programExpenseRatio ?? null,
        fundraisingEfficiency: latestFiling.fundraisingEfficiency ?? null,
        compensationPct: latestFiling.compensationPct ?? null,
      })
    : 0;

  const fraudMeter = buildFraudMeter({
    domain: "charities",
    riskSignals,
    externalCorroboration,
    baseScore,
    baseSummary:
      latestFiling == null
        ? "This organization is present locally, but no filing-level spending metrics are stored yet."
        : "This organization shows rising fraud pressure from its spending mix, fundraising cost, and officer pay levels, even though the hard alert thresholds are not all crossed.",
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.fraudSignalEvent.updateMany({
      where: {
        entityId,
        sourceSystemId: {
          in: [...CHARITY_FILING_SIGNAL_SOURCE_SYSTEM_IDS],
        },
        status: "active",
      },
      data: {
        status: "resolved",
        resolvedAt: now,
      },
    });

    if (riskSignals.length > 0) {
      await tx.fraudSignalEvent.createMany({
        data: riskSignals.map((signal) => ({
          entityId,
          sourceSystemId,
          signalKey: signal.key,
          signalLabel: signal.label,
          severity: signal.severity,
          detail: signal.detail,
          measuredValue: signal.value ?? null,
          thresholdValue: signal.threshold ?? null,
          methodologyVersion: "charity-v1",
          observedAt: latestFiling?.sourceUpdatedAt ?? now,
        })),
      });
    }

    await tx.fraudSnapshot.updateMany({
      where: {
        entityId,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    await tx.fraudSnapshot.create({
      data: {
        entityId,
        score: fraudMeter.score,
        level: fraudMeter.level,
        bandLabel: fraudMeter.label,
        baseScore,
        corroborationCount: externalCorroboration.length,
        activeSignalCount: riskSignals.length,
        explanation: fraudMeter.summary,
        methodologyVersion: "charity-v1",
        sourceFreshnessAt: latestFiling?.sourceUpdatedAt ?? undefined,
        isCurrent: true,
        computedAt: now,
      },
    });
  });

  return {
    entityId,
    snapshotScore: fraudMeter.score,
    signalCount: riskSignals.length,
  };
}
