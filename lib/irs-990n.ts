import { prisma } from "@/lib/db";

export const IRS_990N_SOURCE_SYSTEM_ID = "irs_990n";
export const IRS_990N_ZIP_URL =
  "https://apps.irs.gov/pub/epostcard/data-download-epostcard.zip";
export const IRS_990N_INFO_URL =
  "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads";

export interface Irs990NRow {
  ein: string;
  taxYear: number | null;
  organizationName: string;
  grossReceiptsUnder25K: boolean | null;
  principalOfficerName: string | null;
  websiteUrl: string | null;
  terminated: boolean | null;
  taxPeriodBeginDate: Date | null;
  taxPeriodEndDate: Date | null;
}

function cleanField(raw: string): string | null {
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function normalizeEin(raw: string): string {
  return raw.replace(/\D/g, "").padStart(9, "0");
}

function parseYN(raw: string): boolean | null {
  const v = raw.trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "1" || v === "TRUE") return true;
  if (v === "N" || v === "NO" || v === "0" || v === "FALSE") return false;
  return null;
}

function parseDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  // Try MM/DD/YYYY first (most common in IRS files)
  const mmddyyyy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const year = Number(mmddyyyy[3]);
    if (year >= 1900 && year <= 2100) {
      const d = new Date(year, Number(mmddyyyy[1]) - 1, Number(mmddyyyy[2]));
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }
  // Try YYYY-MM-DD
  const yyyymmdd = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    if (year >= 1900 && year <= 2100) {
      const d = new Date(year, Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3]));
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }
  return null;
}

/**
 * Parse a single pipe-delimited 990-N line.
 *
 * The IRS ePostcard bulk file has a header row and uses pipe delimiters.
 * Known column order (may vary by vintage):
 *   EIN | TAX_YEAR | ORGANIZATION_NAME | GROSS_RECEIPTS_UNDER_25K |
 *   PRINCIPAL_OFFICER_NAME | WEBSITE_URL | TERMINATED |
 *   TAX_PERIOD_BEGIN_DATE | TAX_PERIOD_END_DATE
 *
 * This parser is header-aware: if the first token is "EIN" (case-insensitive)
 * the line is treated as a header and null is returned.
 */
export function parseIrs990NLine(
  line: string,
  headerIndexes: Record<string, number> | null
): Irs990NRow | null {
  const parts = line.split("|");
  if (parts.length < 3) return null;

  const rawEin = parts[0]?.trim() ?? "";
  if (!rawEin || rawEin.toLowerCase() === "ein") return null; // header

  const ein = normalizeEin(rawEin);
  if (ein.length !== 9 || ein === "000000000") return null;

  // If we have a header map use it; otherwise fall back to positional defaults
  const idx = (name: string, fallback: number): string =>
    (headerIndexes ? parts[headerIndexes[name] ?? fallback] : parts[fallback])
      ?.trim() ?? "";

  const taxYearRaw = idx("TAX_YEAR", 1);
  const taxYear = taxYearRaw ? Number.parseInt(taxYearRaw, 10) || null : null;

  return {
    ein,
    taxYear,
    organizationName: idx("ORGANIZATION_NAME", 2) || idx("NAME", 2) || "",
    grossReceiptsUnder25K: parseYN(idx("GROSS_RECEIPTS_UNDER_25K", 3)),
    principalOfficerName: cleanField(idx("PRINCIPAL_OFFICER_NAME", 4)),
    websiteUrl: cleanField(idx("WEBSITE_URL", 5)),
    terminated: parseYN(idx("TERMINATED", 6)),
    taxPeriodBeginDate: parseDate(idx("TAX_PERIOD_BEGIN_DATE", 7)),
    taxPeriodEndDate: parseDate(idx("TAX_PERIOD_END_DATE", 8)),
  };
}

/**
 * Parse the header line and return a map of column name -> index.
 */
export function parseIrs990NHeader(
  line: string
): Record<string, number> | null {
  const parts = line.split("|");
  if (!parts[0]?.trim().toUpperCase().startsWith("EIN")) return null;
  const map: Record<string, number> = {};
  for (let i = 0; i < parts.length; i++) {
    map[parts[i].trim().toUpperCase()] = i;
  }
  return map;
}

export interface Epostcard990NPersistResult {
  inserted: number;
  updated: number;
}

/**
 * Upsert a batch of 990-N rows keyed by (ein, taxYear).
 */
export async function persistIrs990NBatch(
  rows: Irs990NRow[],
  sourcePublishedAt: Date | null
): Promise<Epostcard990NPersistResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const eins = [...new Set(rows.map((r) => r.ein))];

  // Check which (ein, taxYear) combos already exist
  const existing = await prisma.charityEpostcard990NRecord.findMany({
    where: { ein: { in: eins } },
    select: { ein: true, taxYear: true },
  });
  const existingKeys = new Set(
    existing.map((r) => `${r.ein}::${r.taxYear ?? "null"}`)
  );

  // Look up entityIds via CharityProfile
  const profiles = await prisma.charityProfile.findMany({
    where: { ein: { in: eins } },
    select: { ein: true, entityId: true },
  });
  const einToEntityId = new Map(profiles.map((p) => [p.ein, p.entityId]));

  let inserted = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const key = `${row.ein}::${row.taxYear ?? "null"}`;
        const isNew = !existingKeys.has(key);
        const entityId = einToEntityId.get(row.ein) ?? null;

        await tx.charityEpostcard990NRecord.upsert({
          where: { ein_taxYear: { ein: row.ein, taxYear: row.taxYear ?? 0 } },
          update: {
            organizationName: row.organizationName,
            grossReceiptsUnder25K: row.grossReceiptsUnder25K,
            principalOfficerName: row.principalOfficerName,
            websiteUrl: row.websiteUrl,
            terminated: row.terminated,
            taxPeriodBeginDate: row.taxPeriodBeginDate,
            taxPeriodEndDate: row.taxPeriodEndDate,
            sourcePublishedAt: sourcePublishedAt ?? undefined,
            entityId: entityId ?? undefined,
            updatedAt: new Date(),
          },
          create: {
            ein: row.ein,
            taxYear: row.taxYear ?? 0,
            sourceSystemId: IRS_990N_SOURCE_SYSTEM_ID,
            organizationName: row.organizationName,
            grossReceiptsUnder25K: row.grossReceiptsUnder25K,
            principalOfficerName: row.principalOfficerName,
            websiteUrl: row.websiteUrl,
            terminated: row.terminated,
            taxPeriodBeginDate: row.taxPeriodBeginDate,
            taxPeriodEndDate: row.taxPeriodEndDate,
            sourcePublishedAt: sourcePublishedAt ?? undefined,
            entityId: entityId ?? undefined,
          },
        });

        if (isNew) inserted++;
        else updated++;
      }
    },
    { timeout: 60_000 }
  );

  return { inserted, updated };
}
