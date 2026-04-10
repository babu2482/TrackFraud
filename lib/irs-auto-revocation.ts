import { prisma } from "@/lib/db";
import { normalizeEin } from "@/lib/charity-detail";

export const IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID = "irs_auto_revocation";
export const IRS_AUTO_REVOCATION_ZIP_URL =
  "https://apps.irs.gov/pub/epostcard/data-download-revocation.zip";
export const IRS_AUTO_REVOCATION_INFO_URL =
  "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export interface IrsAutoRevocationRow {
  ein: string;
  organizationName: string;
  sortName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  countryCode: string | null;
  subsectionCodeRaw: string | null;
  revocationDateRaw: string | null;
  revocationDate: Date | null;
  revocationPostingDateRaw: string | null;
  revocationPostingDate: Date | null;
  exemptionReinstatementDateRaw: string | null;
  exemptionReinstatementDate: Date | null;
  sourcePublishedAt: Date | null;
}

export interface PersistIrsAutoRevocationBatchResult {
  inserted: number;
  updated: number;
}

function cleanValue(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFlexibleDate(value: string | null): Date | null {
  if (!value) return null;

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number.parseInt(slash[1], 10) - 1;
    const day = Number.parseInt(slash[2], 10);
    const year = Number.parseInt(slash[3], 10);
    const parsed = new Date(Date.UTC(year, month, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dash = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dash) {
    const day = Number.parseInt(dash[1], 10);
    const month = MONTHS[dash[2].toLowerCase()];
    const year = Number.parseInt(dash[3], 10);
    if (month == null) return null;
    const parsed = new Date(Date.UTC(year, month, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function parseIrsAutoRevocationLine(
  line: string,
  sourcePublishedAt: Date | null
): IrsAutoRevocationRow {
  const columns = line.split("|");
  if (columns.length < 11) {
    throw new Error(`Unexpected revocation row with ${columns.length} columns`);
  }

  const ein = normalizeEin(columns[0] ?? "");
  if (!/^\d{9}$/.test(ein)) {
    throw new Error(`Invalid EIN: ${columns[0] ?? ""}`);
  }

  const organizationName = cleanValue(columns[1]);
  if (!organizationName) {
    throw new Error(`Missing organization name for EIN ${ein}`);
  }

  const revocationDateRaw = cleanValue(columns[9]);
  const revocationPostingDateRaw = cleanValue(columns[10]);
  const exemptionReinstatementDateRaw = cleanValue(columns[11]);

  return {
    ein,
    organizationName,
    sortName: cleanValue(columns[2]),
    address: cleanValue(columns[3]),
    city: cleanValue(columns[4]),
    state: cleanValue(columns[5]),
    zipCode: cleanValue(columns[6]),
    countryCode: cleanValue(columns[7]),
    subsectionCodeRaw: cleanValue(columns[8]),
    revocationDateRaw,
    revocationDate: parseFlexibleDate(revocationDateRaw),
    revocationPostingDateRaw,
    revocationPostingDate: parseFlexibleDate(revocationPostingDateRaw),
    exemptionReinstatementDateRaw,
    exemptionReinstatementDate: parseFlexibleDate(exemptionReinstatementDateRaw),
    sourcePublishedAt,
  };
}

export async function persistIrsAutoRevocationBatch(
  rows: IrsAutoRevocationRow[]
): Promise<PersistIrsAutoRevocationBatchResult> {
  const dedupedRows = Array.from(new Map(rows.map((row) => [row.ein, row])).values());
  if (dedupedRows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const eins = dedupedRows.map((row) => row.ein);

  return prisma.$transaction(
    async (tx) => {
      const [existingRecords, profileHits, identifierHits] = await Promise.all([
        tx.charityAutomaticRevocationRecord.findMany({
          where: { ein: { in: eins } },
          select: { ein: true },
        }),
        tx.charityProfile.findMany({
          where: { ein: { in: eins } },
          select: { ein: true, entityId: true },
        }),
        tx.entityIdentifier.findMany({
          where: {
            identifierType: "ein",
            identifierValue: { in: eins },
          },
          select: {
            identifierValue: true,
            entityId: true,
          },
        }),
      ]);

      const existingByEin = new Set(existingRecords.map((row) => row.ein));
      const entityIdByEin = new Map(profileHits.map((row) => [row.ein, row.entityId]));
      for (const hit of identifierHits) {
        if (!entityIdByEin.has(hit.identifierValue)) {
          entityIdByEin.set(hit.identifierValue, hit.entityId);
        }
      }

      const newRows = dedupedRows.filter((row) => !existingByEin.has(row.ein));
      const existingRows = dedupedRows.filter((row) => existingByEin.has(row.ein));

      if (newRows.length > 0) {
        await tx.charityAutomaticRevocationRecord.createMany({
          data: newRows.map((row) => ({
            ein: row.ein,
            entityId: entityIdByEin.get(row.ein),
            sourceSystemId: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID,
            organizationName: row.organizationName,
            sortName: row.sortName,
            address: row.address,
            city: row.city,
            state: row.state,
            zipCode: row.zipCode,
            countryCode: row.countryCode,
            subsectionCodeRaw: row.subsectionCodeRaw,
            revocationDateRaw: row.revocationDateRaw,
            revocationDate: row.revocationDate ?? undefined,
            revocationPostingDateRaw: row.revocationPostingDateRaw,
            revocationPostingDate: row.revocationPostingDate ?? undefined,
            exemptionReinstatementDateRaw: row.exemptionReinstatementDateRaw,
            exemptionReinstatementDate:
              row.exemptionReinstatementDate ?? undefined,
            sourcePublishedAt: row.sourcePublishedAt ?? undefined,
          })),
        });
      }

      for (const row of existingRows) {
        await tx.charityAutomaticRevocationRecord.update({
          where: { ein: row.ein },
          data: {
            entityId: entityIdByEin.get(row.ein),
            sourceSystemId: IRS_AUTO_REVOCATION_SOURCE_SYSTEM_ID,
            organizationName: row.organizationName,
            sortName: row.sortName,
            address: row.address,
            city: row.city,
            state: row.state,
            zipCode: row.zipCode,
            countryCode: row.countryCode,
            subsectionCodeRaw: row.subsectionCodeRaw,
            revocationDateRaw: row.revocationDateRaw,
            revocationDate: row.revocationDate ?? undefined,
            revocationPostingDateRaw: row.revocationPostingDateRaw,
            revocationPostingDate: row.revocationPostingDate ?? undefined,
            exemptionReinstatementDateRaw: row.exemptionReinstatementDateRaw,
            exemptionReinstatementDate:
              row.exemptionReinstatementDate ?? undefined,
            sourcePublishedAt: row.sourcePublishedAt ?? undefined,
          },
        });
      }

      return {
        inserted: newRows.length,
        updated: existingRows.length,
      };
    },
    {
      maxWait: 20_000,
      timeout: 120_000,
    }
  );
}
