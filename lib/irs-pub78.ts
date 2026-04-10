import { prisma } from "@/lib/db";

export const IRS_PUB78_SOURCE_SYSTEM_ID = "irs_pub78";
export const IRS_PUB78_ZIP_URL =
  "https://apps.irs.gov/pub/epostcard/data-download-pub78.zip";
export const IRS_PUB78_INFO_URL =
  "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data-downloads";

export interface IrsPub78Row {
  ein: string;
  organizationName: string;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  deductibilityCode: string | null;
}

function cleanField(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEin(raw: string): string {
  return raw.replace(/\D/g, "").padStart(9, "0");
}

/**
 * Parse a single pipe-delimited Publication 78 line.
 * Format: EIN|Name|City|State|Country|Deductibility Code
 */
export function parseIrsPub78Line(line: string): IrsPub78Row | null {
  const parts = line.split("|");
  // Minimum: EIN and name
  if (parts.length < 2) return null;

  const rawEin = parts[0]?.trim() ?? "";
  if (!rawEin || rawEin.toLowerCase() === "ein") return null; // skip header

  const ein = normalizeEin(rawEin);
  if (ein.length !== 9 || ein === "000000000") return null;

  return {
    ein,
    organizationName: parts[1]?.trim() ?? "",
    city: cleanField(parts[2] ?? ""),
    state: cleanField(parts[3] ?? ""),
    countryCode: cleanField(parts[4] ?? ""),
    deductibilityCode: cleanField(parts[5] ?? ""),
  };
}

export interface Pub78PersistResult {
  inserted: number;
  updated: number;
}

/**
 * Upsert a batch of Pub78 rows.
 * Links to CanonicalEntity via CharityProfile.ein when available.
 */
export async function persistIrsPub78Batch(
  rows: IrsPub78Row[],
  sourcePublishedAt: Date | null
): Promise<Pub78PersistResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const eins = rows.map((r) => r.ein);

  // Look up existing records to distinguish insert vs update
  const existing = await prisma.charityPublication78Record.findMany({
    where: { ein: { in: eins } },
    select: { ein: true },
  });
  const existingEins = new Set(existing.map((r) => r.ein));

  // Look up CanonicalEntity entityIds via CharityProfile
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
        const entityId = einToEntityId.get(row.ein) ?? null;
        const isNew = !existingEins.has(row.ein);

        await tx.charityPublication78Record.upsert({
          where: { ein: row.ein },
          update: {
            organizationName: row.organizationName,
            city: row.city,
            state: row.state,
            countryCode: row.countryCode,
            deductibilityCode: row.deductibilityCode,
            sourcePublishedAt: sourcePublishedAt ?? undefined,
            entityId: entityId ?? undefined,
            updatedAt: new Date(),
          },
          create: {
            ein: row.ein,
            sourceSystemId: IRS_PUB78_SOURCE_SYSTEM_ID,
            organizationName: row.organizationName,
            city: row.city,
            state: row.state,
            countryCode: row.countryCode,
            deductibilityCode: row.deductibilityCode,
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
