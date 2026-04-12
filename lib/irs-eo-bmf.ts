import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { isValidEin, normalizeEin } from "@/lib/charity-detail";

export const IRS_EO_BMF_SOURCE_SYSTEM_ID = "irs_eo_bmf";
export const IRS_EO_BMF_BASE_URL = "https://www.irs.gov/pub/irs-soi";
export const IRS_EO_BMF_PAGE_URL =
  "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf";

const STATE_FILE_CODES = [
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "dc",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
  "pr",
  "xx",
] as const;

export type IrsEoBmfFileCode = (typeof STATE_FILE_CODES)[number];

export interface IrsEoBmfFileTarget {
  code: IrsEoBmfFileCode;
  url: string;
  filename: string;
}

export interface IrsEoBmfRow {
  ein: string;
  name: string;
  careOfName: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  groupCode: string | null;
  subsectionCodeRaw: string | null;
  subsectionCode: number | null;
  affiliationCode: string | null;
  classificationCode: string | null;
  rulingDateRaw: string | null;
  deductibilityCode: string | null;
  foundationCodeRaw: string | null;
  foundationCode: number | null;
  activityCode: string | null;
  organizationCode: string | null;
  statusCode: string | null;
  taxPeriodRaw: string | null;
  assetCode: string | null;
  incomeCode: string | null;
  filingRequirementCode: string | null;
  pfFilingRequirementCode: string | null;
  accountingPeriod: string | null;
  assetAmount: bigint | null;
  incomeAmount: bigint | null;
  revenueAmount: bigint | null;
  nteeCode: string | null;
  sortName: string | null;
  sourceFileCode: IrsEoBmfFileCode;
  sourceFileUrl: string;
  sourcePublishedAt: Date | null;
}

export interface PersistIrsEoBmfBatchResult {
  inserted: number;
  updated: number;
}

export function listIrsEoBmfTargets(
  codes: readonly IrsEoBmfFileCode[] = STATE_FILE_CODES,
): IrsEoBmfFileTarget[] {
  return codes.map((code) => ({
    code,
    filename: `eo_${code}.csv`,
    url: `${IRS_EO_BMF_BASE_URL}/eo_${code}.csv`,
  }));
}

export function isValidIrsEoBmfCode(value: string): value is IrsEoBmfFileCode {
  return (STATE_FILE_CODES as readonly string[]).includes(value);
}

function cleanValue(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCodeInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBigIntValue(value: string | null): bigint | null {
  if (!value || !/^-?\d+$/.test(value)) return null;
  return BigInt(value);
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEntitySummary(row: IrsEoBmfRow): string | null {
  const parts = [
    row.nteeCode ? `NTEE ${row.nteeCode}` : null,
    row.city,
    row.state,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" | ") : null;
}

function countryCodeForRow(row: IrsEoBmfRow): string | null {
  if (row.sourceFileCode === "xx" && !row.state) {
    return null;
  }
  return "US";
}

function aliasDiffersFromName(row: IrsEoBmfRow): boolean {
  if (!row.sortName) return false;
  return normalizeName(row.sortName) !== normalizeName(row.name);
}

export function parseIrsEoBmfCsvRow(
  record: Record<string, string>,
  context: {
    sourceFileCode: IrsEoBmfFileCode;
    sourceFileUrl: string;
    sourcePublishedAt: Date | null;
  },
): IrsEoBmfRow {
  const ein = normalizeEin(record.EIN ?? "");
  if (!isValidEin(ein)) {
    throw new Error(`Invalid EIN: ${record.EIN ?? ""}`);
  }

  const name = cleanValue(record.NAME);
  if (!name) {
    throw new Error(`Missing organization name for EIN ${ein}`);
  }

  const subsectionCodeRaw = cleanValue(record.SUBSECTION);
  const foundationCodeRaw = cleanValue(record.FOUNDATION);

  return {
    ein,
    name,
    careOfName: cleanValue(record.ICO),
    street: cleanValue(record.STREET),
    city: cleanValue(record.CITY),
    state: cleanValue(record.STATE),
    zip: cleanValue(record.ZIP),
    groupCode: cleanValue(record.GROUP),
    subsectionCodeRaw,
    subsectionCode: parseCodeInt(subsectionCodeRaw),
    affiliationCode: cleanValue(record.AFFILIATION),
    classificationCode: cleanValue(record.CLASSIFICATION),
    rulingDateRaw: cleanValue(record.RULING),
    deductibilityCode: cleanValue(record.DEDUCTIBILITY),
    foundationCodeRaw,
    foundationCode: parseCodeInt(foundationCodeRaw),
    activityCode: cleanValue(record.ACTIVITY),
    organizationCode: cleanValue(record.ORGANIZATION),
    statusCode: cleanValue(record.STATUS),
    taxPeriodRaw: cleanValue(record.TAX_PERIOD),
    assetCode: cleanValue(record.ASSET_CD),
    incomeCode: cleanValue(record.INCOME_CD),
    filingRequirementCode: cleanValue(record.FILING_REQ_CD),
    pfFilingRequirementCode: cleanValue(record.PF_FILING_REQ_CD),
    accountingPeriod: cleanValue(record.ACCT_PD),
    assetAmount: parseBigIntValue(cleanValue(record.ASSET_AMT)),
    incomeAmount: parseBigIntValue(cleanValue(record.INCOME_AMT)),
    revenueAmount: parseBigIntValue(cleanValue(record.REVENUE_AMT)),
    nteeCode: cleanValue(record.NTEE_CD),
    sortName: cleanValue(record.SORT_NAME),
    sourceFileCode: context.sourceFileCode,
    sourceFileUrl: context.sourceFileUrl,
    sourcePublishedAt: context.sourcePublishedAt,
  };
}

export async function fetchOfficialIrsEoBmfRecordCount(): Promise<
  number | null
> {
  const response = await fetch(IRS_EO_BMF_PAGE_URL, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`EO BMF page request failed: ${response.status}`);
  }

  const html = await response.text();
  const match = html.match(/Record Count:\s*<strong>([\d,]+)<\/strong>/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function persistIrsEoBmfBatch(
  rows: IrsEoBmfRow[],
): Promise<PersistIrsEoBmfBatchResult> {
  const dedupedRows = Array.from(
    new Map(rows.map((row) => [row.ein, row])).values(),
  );
  if (dedupedRows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const now = new Date();
  const eins = dedupedRows.map((row) => row.ein);

  return prisma.$transaction(
    async (tx) => {
      const profileHits = await tx.charityProfile.findMany({
        where: {
          ein: { in: eins },
        },
        select: {
          ein: true,
          entityId: true,
        },
      });

      const entityIdByEin = new Map(
        profileHits.map((hit) => [hit.ein, hit.entityId]),
      );
      const unresolvedEins = eins.filter((ein) => !entityIdByEin.has(ein));

      if (unresolvedEins.length > 0) {
        const identifierHits = await tx.entityIdentifier.findMany({
          where: {
            identifierType: "ein",
            identifierValue: {
              in: unresolvedEins,
            },
          },
          select: {
            identifierValue: true,
            entityId: true,
          },
        });

        for (const hit of identifierHits) {
          entityIdByEin.set(hit.identifierValue, hit.entityId);
        }
      }

      const newRows = dedupedRows.filter((row) => !entityIdByEin.has(row.ein));
      const existingRows = dedupedRows.filter((row) =>
        entityIdByEin.has(row.ein),
      );
      const createdEntityIds = new Map<string, string>();

      if (newRows.length > 0) {
        await tx.canonicalEntity.createMany({
          data: newRows.map((row) => {
            const entityId = randomUUID();
            createdEntityIds.set(row.ein, entityId);
            return {
              id: entityId,
              categoryId: "charities",
              displayName: row.name,
              normalizedName: normalizeName(row.name),
              entityType: "charity",
              status: "active",
              primaryJurisdiction: "US",
              stateCode: row.state,
              countryCode: countryCodeForRow(row),
              summary: buildEntitySummary(row),
              latestSourceUpdatedAt: row.sourcePublishedAt ?? undefined,
              firstSeenAt: now,
              lastSeenAt: now,
            };
          }),
        });

        await tx.entityIdentifier.createMany({
          data: newRows.map((row) => ({
            id: `eid_${Date.now()}_${row.ein}`,
            entityId: createdEntityIds.get(row.ein)!,
            sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
            identifierType: "ein",
            identifierValue: row.ein,
            isPrimary: true,
            observedAt: row.sourcePublishedAt ?? now,
            updatedAt: now,
          })),
        });

        await tx.charityProfile.createMany({
          data: newRows.map((row) => ({
            entityId: createdEntityIds.get(row.ein)!,
            ein: row.ein,
            subName: row.careOfName,
            address: row.street,
            city: row.city,
            state: row.state,
            zipcode: row.zip,
            subsectionCode: row.subsectionCode,
            foundationCode: row.foundationCode,
            nteeCode: row.nteeCode,
          })),
        });

        await tx.charityBusinessMasterRecord.createMany({
          data: newRows.map((row) => ({
            entityId: createdEntityIds.get(row.ein)!,
            sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
            sourceFileCode: row.sourceFileCode,
            sourceFileUrl: row.sourceFileUrl,
            careOfName: row.careOfName,
            street: row.street,
            city: row.city,
            state: row.state,
            zip: row.zip,
            groupCode: row.groupCode,
            subsectionCodeRaw: row.subsectionCodeRaw,
            affiliationCode: row.affiliationCode,
            classificationCode: row.classificationCode,
            rulingDateRaw: row.rulingDateRaw,
            deductibilityCode: row.deductibilityCode,
            foundationCodeRaw: row.foundationCodeRaw,
            activityCode: row.activityCode,
            organizationCode: row.organizationCode,
            statusCode: row.statusCode,
            taxPeriodRaw: row.taxPeriodRaw,
            assetCode: row.assetCode,
            incomeCode: row.incomeCode,
            filingRequirementCode: row.filingRequirementCode,
            pfFilingRequirementCode: row.pfFilingRequirementCode,
            accountingPeriod: row.accountingPeriod,
            assetAmount: row.assetAmount,
            incomeAmount: row.incomeAmount,
            revenueAmount: row.revenueAmount,
            nteeCode: row.nteeCode,
            sortName: row.sortName,
            sourcePublishedAt: row.sourcePublishedAt ?? undefined,
          })),
        });

        const aliasCreates = newRows
          .filter(aliasDiffersFromName)
          .map((row) => ({
            entityId: createdEntityIds.get(row.ein)!,
            sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
            alias: row.sortName!,
            normalizedAlias: normalizeName(row.sortName!),
            aliasType: "sort_name",
            isPrimary: false,
            observedAt: row.sourcePublishedAt ?? now,
          }));
        if (aliasCreates.length > 0) {
          await tx.entityAlias.createMany({
            data: aliasCreates,
          });
        }
      }

      for (const row of existingRows) {
        const entityId = entityIdByEin.get(row.ein);
        if (!entityId) continue;

        await tx.canonicalEntity.update({
          where: { id: entityId },
          data: {
            displayName: row.name,
            normalizedName: normalizeName(row.name),
            stateCode: row.state,
            countryCode: countryCodeForRow(row),
            summary: buildEntitySummary(row),
            latestSourceUpdatedAt: row.sourcePublishedAt ?? undefined,
            lastSeenAt: now,
          },
        });

        await tx.charityProfile.upsert({
          where: { entityId },
          update: {
            ein: row.ein,
            subName: row.careOfName,
            address: row.street,
            city: row.city,
            state: row.state,
            zipcode: row.zip,
            subsectionCode: row.subsectionCode,
            foundationCode: row.foundationCode,
            nteeCode: row.nteeCode,
          },
          create: {
            entityId,
            ein: row.ein,
            subName: row.careOfName,
            address: row.street,
            city: row.city,
            state: row.state,
            zipcode: row.zip,
            subsectionCode: row.subsectionCode,
            foundationCode: row.foundationCode,
            nteeCode: row.nteeCode,
          },
        });

        await tx.charityBusinessMasterRecord.upsert({
          where: { entityId },
          update: {
            sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
            sourceFileCode: row.sourceFileCode,
            sourceFileUrl: row.sourceFileUrl,
            careOfName: row.careOfName,
            street: row.street,
            city: row.city,
            state: row.state,
            zip: row.zip,
            groupCode: row.groupCode,
            subsectionCodeRaw: row.subsectionCodeRaw,
            affiliationCode: row.affiliationCode,
            classificationCode: row.classificationCode,
            rulingDateRaw: row.rulingDateRaw,
            deductibilityCode: row.deductibilityCode,
            foundationCodeRaw: row.foundationCodeRaw,
            activityCode: row.activityCode,
            organizationCode: row.organizationCode,
            statusCode: row.statusCode,
            taxPeriodRaw: row.taxPeriodRaw,
            assetCode: row.assetCode,
            incomeCode: row.incomeCode,
            filingRequirementCode: row.filingRequirementCode,
            pfFilingRequirementCode: row.pfFilingRequirementCode,
            accountingPeriod: row.accountingPeriod,
            assetAmount: row.assetAmount,
            incomeAmount: row.incomeAmount,
            revenueAmount: row.revenueAmount,
            nteeCode: row.nteeCode,
            sortName: row.sortName,
            sourcePublishedAt: row.sourcePublishedAt ?? undefined,
          },
          create: {
            entityId,
            sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
            sourceFileCode: row.sourceFileCode,
            sourceFileUrl: row.sourceFileUrl,
            careOfName: row.careOfName,
            street: row.street,
            city: row.city,
            state: row.state,
            zip: row.zip,
            groupCode: row.groupCode,
            subsectionCodeRaw: row.subsectionCodeRaw,
            affiliationCode: row.affiliationCode,
            classificationCode: row.classificationCode,
            rulingDateRaw: row.rulingDateRaw,
            deductibilityCode: row.deductibilityCode,
            foundationCodeRaw: row.foundationCodeRaw,
            activityCode: row.activityCode,
            organizationCode: row.organizationCode,
            statusCode: row.statusCode,
            taxPeriodRaw: row.taxPeriodRaw,
            assetCode: row.assetCode,
            incomeCode: row.incomeCode,
            filingRequirementCode: row.filingRequirementCode,
            pfFilingRequirementCode: row.pfFilingRequirementCode,
            accountingPeriod: row.accountingPeriod,
            assetAmount: row.assetAmount,
            incomeAmount: row.incomeAmount,
            revenueAmount: row.revenueAmount,
            nteeCode: row.nteeCode,
            sortName: row.sortName,
            sourcePublishedAt: row.sourcePublishedAt ?? undefined,
          },
        });

        if (aliasDiffersFromName(row)) {
          await tx.entityAlias.upsert({
            where: {
              entityId_normalizedAlias_aliasType: {
                entityId,
                normalizedAlias: normalizeName(row.sortName!),
                aliasType: "sort_name",
              },
            },
            update: {
              sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
              alias: row.sortName!,
              observedAt: row.sourcePublishedAt ?? now,
            },
            create: {
              entityId,
              sourceSystemId: IRS_EO_BMF_SOURCE_SYSTEM_ID,
              alias: row.sortName!,
              normalizedAlias: normalizeName(row.sortName!),
              aliasType: "sort_name",
              isPrimary: false,
              observedAt: row.sourcePublishedAt ?? now,
            },
          });
        }
      }

      return {
        inserted: newRows.length,
        updated: existingRows.length,
      };
    },
    {
      // The initial EO BMF backfill processes large batches and can exceed Prisma's
      // default 5-second interactive transaction timeout even when the database is healthy.
      maxWait: 20_000,
      timeout: 120_000,
    },
  );
}
