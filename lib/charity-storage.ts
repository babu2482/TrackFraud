import { computeCharityFraudBaseScore } from "@/lib/fraud-meter";
import { prisma } from "@/lib/db";
import {
  buildCharityMetrics,
  type CharityComputationRecord,
} from "@/lib/charity-detail";

const CHARITY_SOURCE_SYSTEM_ID = "propublica_nonprofit_explorer";

export interface PersistCharityOptions {
  ingestionRunId?: string;
}

export interface PersistCharityResult {
  entityId: string;
  createdEntity: boolean;
  filingCount: number;
  signalCount: number;
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toBigInt(value: number | undefined): bigint | null {
  return typeof value === "number" && Number.isFinite(value)
    ? BigInt(Math.round(value))
    : null;
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildProPublicaSourceFilingKey(
  entityId: string,
  filing: CharityComputationRecord["filingsWithData"][number]
): string {
  const formType =
    typeof filing.formtype === "number" ? String(filing.formtype) : "unknown";
  return `propublica:${entityId}:${filing.tax_prd}:${formType}`;
}

function buildEntitySummary(record: CharityComputationRecord): string | null {
  const parts = [record.detail.nteeCategory, record.detail.city, record.detail.state].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return parts.length > 0 ? parts.join(" | ") : null;
}

export async function persistCharityComputation(
  record: CharityComputationRecord,
  options: PersistCharityOptions = {}
): Promise<PersistCharityResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existingIdentifier = await tx.entityIdentifier.findFirst({
      where: {
        identifierType: "ein",
        identifierValue: record.ein,
      },
      select: { entityId: true },
    });

    const existingEntity = existingIdentifier
      ? await tx.canonicalEntity.findUnique({
          where: { id: existingIdentifier.entityId },
          select: {
            id: true,
            latestSourceUpdatedAt: true,
          },
        })
      : null;

    const sourceVersionUnchanged =
      existingEntity?.latestSourceUpdatedAt?.getTime() ===
      record.sourceUpdatedAt?.getTime();

    const entity =
      existingEntity == null
        ? await tx.canonicalEntity.create({
            data: {
              categoryId: "charities",
              displayName: record.detail.name,
              normalizedName: normalizeName(record.detail.name),
              entityType: "charity",
              status: "active",
              primaryJurisdiction: "US",
              stateCode: record.detail.state,
              countryCode: "US",
              summary: buildEntitySummary(record),
              homepageUrl: record.detail.guidestarUrl,
              latestSourceUpdatedAt: record.sourceUpdatedAt ?? undefined,
              firstSeenAt: now,
              lastSeenAt: now,
            },
            select: { id: true },
          })
        : await tx.canonicalEntity.update({
            where: { id: existingEntity.id },
            data: {
              displayName: record.detail.name,
              normalizedName: normalizeName(record.detail.name),
              stateCode: record.detail.state,
              summary: buildEntitySummary(record),
              homepageUrl: record.detail.guidestarUrl,
              latestSourceUpdatedAt: record.sourceUpdatedAt ?? undefined,
              lastSeenAt: now,
            },
            select: { id: true },
          });

    await tx.entityIdentifier.upsert({
      where: {
        entityId_identifierType_identifierValue: {
          entityId: entity.id,
          identifierType: "ein",
          identifierValue: record.ein,
        },
      },
      update: {
        sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
        isPrimary: true,
        observedAt: now,
          updatedAt: new Date(),
      },
      create: {
        entityId: entity.id,
        sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
        identifierType: "ein",
        identifierValue: record.ein,
        isPrimary: true,
        observedAt: now,
      },
    });

    await tx.charityProfile.upsert({
      where: { entityId: entity.id },
      update: {
        ein: record.ein,
        subName: record.detail.subName,
        address: record.detail.address,
        city: record.detail.city,
        state: record.detail.state,
        zipcode: record.detail.zipcode,
        subsectionCode: record.detail.legalClassification?.subsectionCode,
        foundationCode:
          typeof record.organization.foundation_code === "number"
            ? record.organization.foundation_code
            : null,
        nteeCode: record.detail.nteeCode,
        guidestarUrl: record.detail.guidestarUrl,
        nccsUrl:
          typeof record.organization.nccs_url === "string"
            ? record.organization.nccs_url
            : null,
      },
      create: {
        entityId: entity.id,
        ein: record.ein,
        subName: record.detail.subName,
        address: record.detail.address,
        city: record.detail.city,
        state: record.detail.state,
        zipcode: record.detail.zipcode,
        subsectionCode: record.detail.legalClassification?.subsectionCode,
        foundationCode:
          typeof record.organization.foundation_code === "number"
            ? record.organization.foundation_code
            : null,
        nteeCode: record.detail.nteeCode,
        guidestarUrl: record.detail.guidestarUrl,
        nccsUrl:
          typeof record.organization.nccs_url === "string"
            ? record.organization.nccs_url
            : null,
      },
    });

    if (record.detail.subName && record.detail.subName.trim().length > 0) {
      await tx.entityAlias.upsert({
        where: {
          entityId_normalizedAlias_aliasType: {
            entityId: entity.id,
            normalizedAlias: normalizeName(record.detail.subName),
            aliasType: "sub_name",
          },
        },
        update: {
          sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
          alias: record.detail.subName,
          isPrimary: false,
          observedAt: now,
        },
        create: {
          entityId: entity.id,
          sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
          alias: record.detail.subName,
          normalizedAlias: normalizeName(record.detail.subName),
          aliasType: "sub_name",
          isPrimary: false,
          observedAt: now,
        },
      });
    }

    await tx.charityFiling.updateMany({
      where: { entityId: entity.id },
      data: { isLatest: false },
    });

    for (const filing of record.filingsWithData) {
      const metrics = buildCharityMetrics(filing);
      const sourceFilingKey = buildProPublicaSourceFilingKey(entity.id, filing);
      const otherRevenue =
        typeof metrics.revenue.other === "number" && Number.isFinite(metrics.revenue.other)
          ? Math.round(metrics.revenue.other)
          : null;

      await tx.charityFiling.upsert({
        where: {
          sourceFilingKey,
        },
        update: {
          sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
          sourceFilingKey,
          filingYear: filing.tax_prd_yr,
          formType: typeof filing.formtype === "number" ? filing.formtype : null,
          isLatest: record.latestFiling?.tax_prd === filing.tax_prd,
          sourceUpdatedAt:
            parseOptionalDate(filing.updated),
          totalRevenue: toBigInt(metrics.revenue.total),
          contributionsRevenue: toBigInt(metrics.revenue.contributions),
          programServiceRevenue: toBigInt(metrics.revenue.programService),
          otherRevenue: otherRevenue != null ? BigInt(otherRevenue) : null,
          totalExpenses: toBigInt(metrics.expenses.total),
          programExpenses: toBigInt(metrics.expenses.program),
          managementExpenses: toBigInt(metrics.expenses.management),
          fundraisingExpenses: toBigInt(metrics.expenses.fundraising),
          programExpenseRatio: metrics.programExpenseRatio,
          overheadRatio: metrics.overheadRatio,
          fundraisingEfficiency: metrics.fundraisingEfficiency,
          compensationPct: metrics.compensationPct,
          totalAssets: toBigInt(metrics.assets),
          totalLiabilities: toBigInt(metrics.liabilities),
          pdfUrl: metrics.pdfUrl,
          rawSourceUrl: record.sourceRecordUrl,
        },
        create: {
          entityId: entity.id,
          sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
          sourceFilingKey,
          taxPeriod: filing.tax_prd,
          filingYear: filing.tax_prd_yr,
          formType: typeof filing.formtype === "number" ? filing.formtype : null,
          isLatest: record.latestFiling?.tax_prd === filing.tax_prd,
          sourceUpdatedAt:
            parseOptionalDate(filing.updated),
          totalRevenue: toBigInt(metrics.revenue.total),
          contributionsRevenue: toBigInt(metrics.revenue.contributions),
          programServiceRevenue: toBigInt(metrics.revenue.programService),
          otherRevenue: otherRevenue != null ? BigInt(otherRevenue) : null,
          totalExpenses: toBigInt(metrics.expenses.total),
          programExpenses: toBigInt(metrics.expenses.program),
          managementExpenses: toBigInt(metrics.expenses.management),
          fundraisingExpenses: toBigInt(metrics.expenses.fundraising),
          programExpenseRatio: metrics.programExpenseRatio,
          overheadRatio: metrics.overheadRatio,
          fundraisingEfficiency: metrics.fundraisingEfficiency,
          compensationPct: metrics.compensationPct,
          totalAssets: toBigInt(metrics.assets),
          totalLiabilities: toBigInt(metrics.liabilities),
          pdfUrl: metrics.pdfUrl,
          rawSourceUrl: record.sourceRecordUrl,
        },
      });
    }

    await tx.rawArtifact.upsert({
      where: {
        storageKey: `remote:propublica:organization:${record.ein}`,
      },
      update: {
        ingestionRunId: options.ingestionRunId,
        entityId: entity.id,
        originalUrl: record.sourceRecordUrl,
        sourcePublishedAt: record.sourceUpdatedAt ?? undefined,
        fetchedAt: now,
        parsedAt: now,
        parserVersion: "charity-v1",
        status: "parsed",
      },
      create: {
        sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
        ingestionRunId: options.ingestionRunId,
        entityId: entity.id,
        artifactType: "organization_json_reference",
        storageProvider: "remote",
        storageKey: `remote:propublica:organization:${record.ein}`,
        originalUrl: record.sourceRecordUrl,
        contentType: "application/json",
        sourcePublishedAt: record.sourceUpdatedAt ?? undefined,
        fetchedAt: now,
        parsedAt: now,
        parserVersion: "charity-v1",
        status: "parsed",
      },
    });

    if (record.detail.latest?.pdfUrl) {
      await tx.rawArtifact.upsert({
        where: {
          storageKey: `remote:propublica:latest-pdf:${record.ein}`,
        },
        update: {
          ingestionRunId: options.ingestionRunId,
          entityId: entity.id,
          originalUrl: record.detail.latest.pdfUrl,
          sourcePublishedAt: record.sourceUpdatedAt ?? undefined,
          fetchedAt: now,
          status: "referenced",
        },
        create: {
          sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
          ingestionRunId: options.ingestionRunId,
          entityId: entity.id,
          artifactType: "filing_pdf_reference",
          storageProvider: "remote",
          storageKey: `remote:propublica:latest-pdf:${record.ein}`,
          originalUrl: record.detail.latest.pdfUrl,
          contentType: "application/pdf",
          sourcePublishedAt: record.sourceUpdatedAt ?? undefined,
          fetchedAt: now,
          status: "referenced",
        },
      });
    }

    const hasCurrentSnapshot = await tx.fraudSnapshot.count({
      where: { entityId: entity.id, isCurrent: true },
    });

    if (!sourceVersionUnchanged || hasCurrentSnapshot === 0) {
      await tx.fraudSignalEvent.updateMany({
        where: {
          entityId: entity.id,
          sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
          status: "active",
        },
        data: {
          status: "resolved",
          resolvedAt: now,
        },
      });

      if ((record.detail.riskSignals ?? []).length > 0) {
        await tx.fraudSignalEvent.createMany({
          data: (record.detail.riskSignals ?? []).map((signal) => ({
            entityId: entity.id,
            sourceSystemId: CHARITY_SOURCE_SYSTEM_ID,
            signalKey: signal.key,
            signalLabel: signal.label,
            severity: signal.severity,
            detail: signal.detail,
            measuredValue: signal.value ?? null,
            thresholdValue: signal.threshold ?? null,
            methodologyVersion: "charity-v1",
            observedAt: record.sourceUpdatedAt ?? now,
          })),
        });
      }

      await tx.fraudSnapshot.updateMany({
        where: {
          entityId: entity.id,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });

      const baseScore = record.detail.latest
        ? computeCharityFraudBaseScore({
            programExpenseRatio: record.detail.latest.programExpenseRatio,
            fundraisingEfficiency: record.detail.latest.fundraisingEfficiency,
            compensationPct: record.detail.latest.compensationPct,
          })
        : 0;

      await tx.fraudSnapshot.create({
        data: {
          entityId: entity.id,
          score: record.detail.fraudMeter?.score ?? 0,
          level: record.detail.fraudMeter?.level ?? "low",
          bandLabel: record.detail.fraudMeter?.label,
          baseScore,
          corroborationCount: record.detail.externalCorroboration?.length ?? 0,
          activeSignalCount: record.detail.riskSignals?.length ?? 0,
          explanation: record.detail.fraudMeter?.summary,
          methodologyVersion: "charity-v1",
          sourceFreshnessAt: record.sourceUpdatedAt ?? undefined,
          isCurrent: true,
          computedAt: now,
        },
      });
    }

    return {
      entityId: entity.id,
      createdEntity: existingEntity == null,
      filingCount: record.filingsWithData.length,
      signalCount: record.detail.riskSignals?.length ?? 0,
    };
  });
}
