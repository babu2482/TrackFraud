/**
 * IRS Form 990 XML archive support.
 *
 * The IRS publishes yearly CSV index files plus one or more ZIP archives that
 * contain the actual XML filings. The index ingest is the first correctness
 * milestone because it gives us a complete filing manifest before we start
 * parsing tens of gigabytes of XML payloads.
 */

import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const IRS_990_XML_SOURCE_SYSTEM_ID = "irs_990_xml";
export const IRS_990_XML_BASE_URL =
  "https://apps.irs.gov/pub/epostcard/990/xml";
export const IRS_990_INDEX_INFO_URL =
  "https://www.irs.gov/charities-non-profits/form-990-series-downloads";

/**
 * Fallback years used if the IRS download page cannot be fetched or parsed.
 * We intentionally keep a conservative static range so the ingest still works
 * during transient IRS page outages.
 */
export const IRS_990_INDEX_YEARS = [
  2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
] as const;

export interface Irs990YearCatalog {
  filingYear: number;
  indexUrl: string;
  archiveUrls: string[];
}

export interface Irs990IndexRow {
  objectId: string;
  returnId: string | null;
  filingType: string | null;
  ein: string;
  taxpayerName: string | null;
  returnType: string | null;
  taxPeriod: string | null;
  subDate: string | null;
  dln: string | null;
  lastUpdated: string | null;
  filingYear: number;
  xmlBatchId: string | null;
  archiveFileName: string | null;
  archiveUrl: string | null;
  archiveEntryPath: string | null;
  xmlUrl: string | null;
  xmlFetchStatus: string;
}

function cleanField(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeEin(raw: string): string {
  return raw.replace(/\D/g, "").padStart(9, "0");
}

function buildFallbackCatalog(): Irs990YearCatalog[] {
  return IRS_990_INDEX_YEARS.map((year) => ({
    filingYear: year,
    indexUrl: `${IRS_990_XML_BASE_URL}/${year}/index_${year}.csv`,
    archiveUrls: [],
  }));
}

/**
 * Discover the current IRS yearly index and archive URLs from the official
 * IRS download page. We fall back to a static catalog if the page shape
 * changes or is temporarily unavailable.
 */
export async function discoverIrs990XmlCatalog(): Promise<Irs990YearCatalog[]> {
  try {
    const response = await fetch(IRS_990_INDEX_INFO_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`IRS 990 downloads page returned ${response.status}`);
    }

    const html = await response.text();
    const regex =
      /https:\/\/apps\.irs\.gov\/pub\/epostcard\/990\/xml\/(20\d{2})\/([^"'\s<]+)/g;

    const byYear = new Map<
      number,
      { indexUrl: string | null; archiveUrls: Set<string> }
    >();

    for (const year of IRS_990_INDEX_YEARS) {
      byYear.set(year, { indexUrl: null, archiveUrls: new Set() });
    }

    for (const match of html.matchAll(regex)) {
      const filingYear = Number.parseInt(match[1] ?? "", 10);
      const fileName = match[2] ?? "";
      if (!Number.isFinite(filingYear)) {
        continue;
      }

      const fullUrl = `${IRS_990_XML_BASE_URL}/${filingYear}/${fileName}`;
      const yearEntry =
        byYear.get(filingYear) ??
        { indexUrl: null, archiveUrls: new Set<string>() };

      if (fileName === `index_${filingYear}.csv`) {
        yearEntry.indexUrl = fullUrl;
      } else if (fileName.toLowerCase().endsWith(".zip")) {
        yearEntry.archiveUrls.add(fullUrl);
      }

      byYear.set(filingYear, yearEntry);
    }

    const catalog = [...byYear.entries()]
      .filter(([, entry]) => entry.indexUrl)
      .map(([filingYear, entry]) => ({
        filingYear,
        indexUrl: entry.indexUrl!,
        archiveUrls: [...entry.archiveUrls].sort(),
      }))
      .sort((a, b) => a.filingYear - b.filingYear);

    return catalog.length > 0 ? catalog : buildFallbackCatalog();
  } catch {
    return buildFallbackCatalog();
  }
}

export function selectIrs990CatalogYears(
  catalog: Irs990YearCatalog[],
  requestedYears?: number[]
): Irs990YearCatalog[] {
  if (!requestedYears || requestedYears.length === 0) {
    return catalog;
  }

  const requested = new Set(requestedYears);
  return catalog.filter((entry) => requested.has(entry.filingYear));
}

function buildArchiveLocator(params: {
  filingYear: number;
  objectId: string;
  xmlBatchId: string | null;
  archiveUrls: string[];
}): {
  archiveFileName: string | null;
  archiveUrl: string | null;
  archiveEntryPath: string | null;
  xmlUrl: string | null;
  xmlFetchStatus: string;
} {
  const xmlEntryFileName = `${params.objectId}_public.xml`;

  if (params.xmlBatchId) {
    const expectedFileName = `${params.xmlBatchId}.zip`;
    const archiveUrl =
      params.archiveUrls.find((candidate) =>
        candidate.endsWith(`/${expectedFileName}`)
      ) ??
      `${IRS_990_XML_BASE_URL}/${params.filingYear}/${expectedFileName}`;
    const archiveEntryPath = `${params.xmlBatchId}/${xmlEntryFileName}`;

    return {
      archiveFileName: expectedFileName,
      archiveUrl,
      archiveEntryPath,
      xmlUrl: `${archiveUrl}#${archiveEntryPath}`,
      xmlFetchStatus: "pending",
    };
  }

  if (params.archiveUrls.length === 1) {
    const archiveUrl = params.archiveUrls[0];
    return {
      archiveFileName: path.posix.basename(archiveUrl),
      archiveUrl,
      archiveEntryPath: null,
      xmlUrl: null,
      xmlFetchStatus: "pending",
    };
  }

  return {
    archiveFileName: null,
    archiveUrl: null,
    archiveEntryPath: null,
    xmlUrl: null,
    xmlFetchStatus: "unresolved_archive",
  };
}

/**
 * Parse one CSV record from the IRS yearly filing index.
 *
 * The CSV schema changed over time:
 * - 2019 through 2023 omit XML_BATCH_ID
 * - 2024+ include XML_BATCH_ID, which gives the exact ZIP archive name
 */
export function parseIrs990IndexRecord(
  record: Record<string, string>,
  filingYear: number,
  archiveUrls: string[]
): Irs990IndexRow | null {
  const objectId = cleanField(record.OBJECT_ID);
  const rawEin = cleanField(record.EIN);

  if (!objectId || !rawEin) {
    return null;
  }

  const ein = normalizeEin(rawEin);
  if (ein.length !== 9 || ein === "000000000") {
    return null;
  }

  const xmlBatchId = cleanField(record.XML_BATCH_ID);
  const locator = buildArchiveLocator({
    filingYear,
    objectId,
    xmlBatchId,
    archiveUrls,
  });

  return {
    objectId,
    returnId: cleanField(record.RETURN_ID),
    filingType: cleanField(record.FILING_TYPE),
    ein,
    taxpayerName: cleanField(record.TAXPAYER_NAME),
    returnType: cleanField(record.RETURN_TYPE),
    taxPeriod: cleanField(record.TAX_PERIOD),
    subDate: cleanField(record.SUB_DATE),
    dln: cleanField(record.DLN),
    lastUpdated: cleanField(record.LAST_UPDATED),
    filingYear,
    xmlBatchId,
    archiveFileName: locator.archiveFileName,
    archiveUrl: locator.archiveUrl,
    archiveEntryPath: locator.archiveEntryPath,
    xmlUrl: locator.xmlUrl,
    xmlFetchStatus: locator.xmlFetchStatus,
  };
}

export interface Index990PersistResult {
  inserted: number;
  updated: number;
}

interface ExistingIrs990IndexRow {
  objectId: string;
  returnId: string | null;
  filingType: string | null;
  ein: string;
  taxpayerName: string | null;
  returnType: string | null;
  taxPeriod: string | null;
  subDate: string | null;
  dln: string | null;
  lastUpdated: string | null;
  filingYear: number | null;
  xmlBatchId: string | null;
  archiveFileName: string | null;
  archiveUrl: string | null;
  archiveEntryPath: string | null;
  xmlUrl: string | null;
  xmlFetchStatus: string;
}

function buildIndexPersistedRow(
  row: Irs990IndexRow,
  existingRow?: ExistingIrs990IndexRow
) {
  const preserveParseState =
    existingRow?.xmlFetchStatus != null &&
    ["parsed", "parse_error", "missing_archive_entry"].includes(
      existingRow.xmlFetchStatus
    );

  return {
    returnId: row.returnId,
    filingType: row.filingType,
    ein: row.ein,
    taxpayerName: row.taxpayerName,
    returnType: row.returnType,
    taxPeriod: row.taxPeriod,
    subDate: row.subDate,
    dln: row.dln,
    lastUpdated: row.lastUpdated,
    filingYear: row.filingYear,
    xmlBatchId: row.xmlBatchId,
    archiveFileName: row.archiveFileName ?? existingRow?.archiveFileName ?? null,
    archiveUrl: row.archiveUrl ?? existingRow?.archiveUrl ?? null,
    archiveEntryPath: preserveParseState
      ? existingRow?.archiveEntryPath ?? row.archiveEntryPath
      : row.archiveEntryPath,
    xmlUrl: preserveParseState ? existingRow?.xmlUrl ?? row.xmlUrl : row.xmlUrl,
    xmlFetchStatus: preserveParseState
      ? existingRow!.xmlFetchStatus
      : row.xmlFetchStatus,
  };
}

function hasIndexRowChanges(
  existingRow: ExistingIrs990IndexRow,
  nextRow: ReturnType<typeof buildIndexPersistedRow>
): boolean {
  return (
    existingRow.returnId !== nextRow.returnId ||
    existingRow.filingType !== nextRow.filingType ||
    existingRow.ein !== nextRow.ein ||
    existingRow.taxpayerName !== nextRow.taxpayerName ||
    existingRow.returnType !== nextRow.returnType ||
    existingRow.taxPeriod !== nextRow.taxPeriod ||
    existingRow.subDate !== nextRow.subDate ||
    existingRow.dln !== nextRow.dln ||
    existingRow.lastUpdated !== nextRow.lastUpdated ||
    existingRow.filingYear !== nextRow.filingYear ||
    existingRow.xmlBatchId !== nextRow.xmlBatchId ||
    existingRow.archiveFileName !== nextRow.archiveFileName ||
    existingRow.archiveUrl !== nextRow.archiveUrl ||
    existingRow.archiveEntryPath !== nextRow.archiveEntryPath ||
    existingRow.xmlUrl !== nextRow.xmlUrl ||
    existingRow.xmlFetchStatus !== nextRow.xmlFetchStatus
  );
}

export async function persistIrs990IndexBatch(
  rows: Irs990IndexRow[]
): Promise<Index990PersistResult> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const objectIds = rows.map((row) => row.objectId);
  const existing = await prisma.charityFiling990Index.findMany({
    where: { objectId: { in: objectIds } },
    select: {
      objectId: true,
      returnId: true,
      filingType: true,
      ein: true,
      taxpayerName: true,
      returnType: true,
      taxPeriod: true,
      subDate: true,
      dln: true,
      lastUpdated: true,
      filingYear: true,
      xmlBatchId: true,
      archiveFileName: true,
      archiveUrl: true,
      archiveEntryPath: true,
      xmlUrl: true,
      xmlFetchStatus: true,
    },
  });
  const existingByObjectId = new Map(
    existing.map((row) => [row.objectId, row] as const)
  );

  let inserted = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const existingRow = existingByObjectId.get(row.objectId);
        const isNew = existingRow == null;
        const nextRow = buildIndexPersistedRow(row, existingRow);

        if (isNew) {
          await tx.charityFiling990Index.create({
            data: {
              objectId: row.objectId,
              sourceSystemId: IRS_990_XML_SOURCE_SYSTEM_ID,
              ...nextRow,
            },
          });
          inserted++;
          continue;
        }

        if (!hasIndexRowChanges(existingRow, nextRow)) {
          continue;
        }

        await tx.charityFiling990Index.update({
          where: { objectId: row.objectId },
          data: {
            ...nextRow,
            updatedAt: new Date(),
          },
        });

        updated++;
      }
    },
    { timeout: 180_000 }
  );

  return { inserted, updated };
}

// ─── Phase 2: XML financial field extraction ─────────────────────────────────

export interface Irs990FinancialFields {
  totalRevenue: bigint | null;
  contributionsRevenue: bigint | null;
  programServiceRevenue: bigint | null;
  otherRevenue: bigint | null;
  totalExpenses: bigint | null;
  programExpenses: bigint | null;
  managementExpenses: bigint | null;
  fundraisingExpenses: bigint | null;
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  formType: number | null;
}

export interface ParsedTaxPeriod {
  taxPeriod: number | null;
  filingYear: number | null;
}

function extractText(xml: string, ...tags: string[]): string | null {
  for (const tag of tags) {
    const match = xml.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+?)\\s*</${tag}>`, "i"));
    if (!match) {
      continue;
    }

    const value = cleanField(match[1]);
    if (value) {
      return value;
    }
  }

  return null;
}

function getBigInt(xml: string, ...tags: string[]): bigint | null {
  for (const tag of tags) {
    const match = xml.match(
      new RegExp(`<${tag}[^>]*>\\s*(-?\\d+)\\s*</${tag}>`, "i")
    );
    if (!match) {
      continue;
    }

    try {
      return BigInt(match[1]);
    } catch {
      continue;
    }
  }

  return null;
}

export function mapReturnTypeToFormType(returnType: string | null | undefined): number | null {
  const normalized = (returnType ?? "").toUpperCase();
  if (normalized.includes("990PF")) return 2;
  if (normalized.includes("990EZ")) return 1;
  if (normalized.includes("990")) return 0;
  return null;
}

function getFormType(xml: string, returnType?: string | null): number | null {
  if (xml.includes("IRS990EZ") || xml.includes("Return990EZ")) return 1;
  if (xml.includes("IRS990PF") || xml.includes("Return990PF")) return 2;
  if (xml.includes("<IRS990>") || xml.includes("<IRS990 ") || xml.includes("Return990")) {
    return 0;
  }
  return mapReturnTypeToFormType(returnType);
}

export function parseTaxPeriodIdentifier(value: string | null | undefined): ParsedTaxPeriod {
  const normalized = (value ?? "").replace(/\D/g, "");
  if (normalized.length < 6) {
    return { taxPeriod: null, filingYear: null };
  }

  const year = Number.parseInt(normalized.slice(0, 4), 10);
  const month = Number.parseInt(normalized.slice(4, 6), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { taxPeriod: null, filingYear: null };
  }

  return {
    taxPeriod: Number.parseInt(`${year}${String(month).padStart(2, "0")}`, 10),
    filingYear: year,
  };
}

export function extractReturnTimestamp(xml: string): Date | null {
  const raw = extractText(xml, "ReturnTs");
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractTaxPeriodIdentifierFromXml(xml: string): ParsedTaxPeriod {
  const rawDate = extractText(xml, "TaxPeriodEndDt");
  if (!rawDate) {
    return { taxPeriod: null, filingYear: null };
  }

  const normalized = rawDate.replace(/\D/g, "");
  if (normalized.length < 6) {
    return { taxPeriod: null, filingYear: null };
  }

  return parseTaxPeriodIdentifier(normalized.slice(0, 6));
}

export function deriveObjectIdFromArchiveEntry(entryName: string): string | null {
  const match = path.posix.basename(entryName).match(/^(\d+)_public\.xml$/i);
  return match?.[1] ?? null;
}

export function buildArchiveXmlReference(
  archiveUrl: string,
  archiveEntryPath: string
): string {
  return `${archiveUrl}#${archiveEntryPath}`;
}

export function parseLooseIrsDate(value: string | null | undefined): Date | null {
  const raw = cleanField(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractFinancialFields(
  xml: string,
  returnType?: string | null
): Irs990FinancialFields {
  return {
    formType: getFormType(xml, returnType),
    totalRevenue: getBigInt(
      xml,
      "CYTotalRevenueAmt",
      "TotalRevenueAmt",
      "TotalRevenue",
      "cy_total_revenue",
      "total_revenue"
    ),
    contributionsRevenue: getBigInt(
      xml,
      "CYContributionsGrantsAmt",
      "ContributionsGrantsAmt",
      "TotalContributions",
      "cy_contributions_grants_amt"
    ),
    programServiceRevenue: getBigInt(
      xml,
      "CYProgramServiceRevenueAmt",
      "ProgramServiceRevenueAmt",
      "ProgramServiceRevenue",
      "cy_program_service_revenue_amt"
    ),
    otherRevenue: getBigInt(
      xml,
      "CYOtherRevenueAmt",
      "OtherRevenueAmt",
      "OtherRevenue",
      "cy_other_revenue_amt"
    ),
    totalExpenses: getBigInt(
      xml,
      "CYTotalExpensesAmt",
      "TotalExpensesAmt",
      "TotalFunctionalExpenses",
      "cy_total_expenses_amt"
    ),
    programExpenses: getBigInt(
      xml,
      "CYProgramServiceExpensesAmt",
      "TotalProgramServiceExpensesAmt",
      "ProgramServicesAmt",
      "cy_program_service_expenses_amt"
    ),
    managementExpenses: getBigInt(
      xml,
      "CYManagementAndGeneralExpensesAmt",
      "ManagementAndGeneralAmt",
      "cy_management_and_general_expenses_amt"
    ),
    fundraisingExpenses: getBigInt(
      xml,
      "CYFundraisingExpensesAmt",
      "FundraisingAmt",
      "cy_fundraising_expenses_amt"
    ),
    totalAssets: getBigInt(
      xml,
      "TotalAssetsEOYAmt",
      "TotalAssetsEOY",
      "EOYTotalAssetsAmt",
      "total_assets_eoy_amt"
    ),
    totalLiabilities: getBigInt(
      xml,
      "TotalLiabilitiesEOYAmt",
      "TotalLiabilitiesEOY",
      "EOYTotalLiabilitiesAmt",
      "total_liabilities_eoy_amt"
    ),
  };
}

function computeRatios(fields: Irs990FinancialFields): {
  programExpenseRatio: number | null;
  overheadRatio: number | null;
  fundraisingEfficiency: number | null;
  compensationPct: number | null;
} {
  const total =
    fields.totalExpenses != null ? Number(fields.totalExpenses) : null;
  const program =
    fields.programExpenses != null ? Number(fields.programExpenses) : null;
  const fundraising =
    fields.fundraisingExpenses != null
      ? Number(fields.fundraisingExpenses)
      : null;
  const management =
    fields.managementExpenses != null ? Number(fields.managementExpenses) : null;
  const contributions =
    fields.contributionsRevenue != null
      ? Number(fields.contributionsRevenue)
      : null;

  return {
    programExpenseRatio:
      total && total > 0 && program != null ? program / total : null,
    overheadRatio:
      total && total > 0 && management != null && fundraising != null
        ? (management + fundraising) / total
        : null,
    fundraisingEfficiency:
      contributions && contributions > 0 && fundraising != null
        ? fundraising / contributions
        : null,
    compensationPct: null,
  };
}

export async function upsertCharityFiling(params: {
  entityId: string;
  sourceFilingKey: string;
  taxPeriod: number;
  filingYear: number;
  fields: Irs990FinancialFields;
  sourceUpdatedAt: Date | null;
  pdfUrl?: string | null;
  rawSourceUrl?: string | null;
}): Promise<{ action: "inserted" | "updated"; filingId: string }> {
  const ratios = computeRatios(params.fields);

  const existing = await prisma.charityFiling.findUnique({
    where: {
      sourceFilingKey: params.sourceFilingKey,
    },
    select: { id: true },
  });

  const data = {
    filingYear: params.filingYear,
    formType: params.fields.formType,
    sourceUpdatedAt: params.sourceUpdatedAt,
    totalRevenue: params.fields.totalRevenue,
    contributionsRevenue: params.fields.contributionsRevenue,
    programServiceRevenue: params.fields.programServiceRevenue,
    otherRevenue: params.fields.otherRevenue,
    totalExpenses: params.fields.totalExpenses,
    programExpenses: params.fields.programExpenses,
    managementExpenses: params.fields.managementExpenses,
    fundraisingExpenses: params.fields.fundraisingExpenses,
    totalAssets: params.fields.totalAssets,
    totalLiabilities: params.fields.totalLiabilities,
    programExpenseRatio: ratios.programExpenseRatio,
    overheadRatio: ratios.overheadRatio,
    fundraisingEfficiency: ratios.fundraisingEfficiency,
    compensationPct: ratios.compensationPct,
    pdfUrl: params.pdfUrl ?? null,
    rawSourceUrl: params.rawSourceUrl ?? null,
    sourceSystemId: IRS_990_XML_SOURCE_SYSTEM_ID,
    sourceFilingKey: params.sourceFilingKey,
  };

  if (existing) {
    const updated = await prisma.charityFiling.update({
      where: { id: existing.id },
      data,
    });
    return { action: "updated", filingId: updated.id };
  }

  try {
    const created = await prisma.charityFiling.create({
      data: {
        entityId: params.entityId,
        taxPeriod: params.taxPeriod,
        ...data,
      },
    });
    return { action: "inserted", filingId: created.id };
  } catch (error) {
    // Concurrent archive workers can race on the same entity/tax period pair.
    // If another worker wins the insert first, fall back to an update so the
    // ingest remains idempotent and the yearly parse can continue safely.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const updated = await prisma.charityFiling.update({
        where: {
          sourceFilingKey: params.sourceFilingKey,
        },
        data,
      });
      return { action: "updated", filingId: updated.id };
    }

    throw error;
  }
}

export async function markLatestFilings(entityIds: string[]): Promise<void> {
  for (const entityId of entityIds) {
    const filings = await prisma.charityFiling.findMany({
      where: { entityId },
      orderBy: [
        { taxPeriod: "desc" },
        { sourceUpdatedAt: "desc" },
        { createdAt: "desc" },
      ],
      select: { id: true },
    });
    if (filings.length === 0) {
      continue;
    }

    await prisma.charityFiling.updateMany({
      where: { entityId },
      data: { isLatest: false },
    });
    await prisma.charityFiling.update({
      where: { id: filings[0].id },
      data: { isLatest: true },
    });
  }
}
