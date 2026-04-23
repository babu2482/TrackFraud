import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import {
  compactText,
  normalizeEntityName,
  parseOptionalDate,
  parseOptionalNumber,
} from "@/lib/warehouse";

export const CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID = "cms_open_payments";
export const CMS_OPEN_PAYMENTS_CATALOG_URL =
  "file:///Volumes/MacBackup/TrackFraudProject/data/healthcare/catalog/local-catalog.json";

function isLocalFileUrl(url: string): boolean {
  return url.startsWith("file://");
}

function resolveLocalCatalog(url: string): Promise<CmsOpenPaymentsDataset[]> {
  const filePath = url.replace(/^file:\/\//, "");
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  const content = fs.readFileSync(absolutePath, "utf-8");
  const datasets = JSON.parse(content) as Array<{
    identifier?: string;
    title?: string;
    modified?: string;
    distribution?: Array<{ downloadURL?: string }>;
  }>;

  return Promise.resolve(
    datasets
      .map((dataset) => {
        const title = dataset.title ?? "";
        const kind = extractDatasetKind(title);
        const downloadUrl = dataset.distribution?.[0]?.downloadURL;
        if (!kind || !downloadUrl || !dataset.identifier) return null;
        return {
          datasetId: dataset.identifier,
          title,
          kind,
          programYear: extractProgramYear(title),
          downloadUrl,
          modifiedAt: parseOptionalDate(dataset.modified ?? null),
        } satisfies CmsOpenPaymentsDataset;
      })
      .filter((dataset): dataset is CmsOpenPaymentsDataset => dataset != null)
      .sort((left, right) => {
        if (left.kind === "supplement" && right.kind !== "supplement") return 1;
        if (right.kind === "supplement" && left.kind !== "supplement")
          return -1;
        return (right.programYear ?? 0) - (left.programYear ?? 0);
      }),
  );
}

export type CmsOpenPaymentsDatasetKind =
  | "general"
  | "research"
  | "ownership"
  | "supplement";

export interface CmsOpenPaymentsDataset {
  datasetId: string;
  title: string;
  kind: CmsOpenPaymentsDatasetKind;
  programYear: number | null;
  downloadUrl: string;
  modifiedAt: Date | null;
}

export interface HealthcarePaymentInput {
  recordId: string;
  paymentType: CmsOpenPaymentsDatasetKind;
  programYear: number | null;
  recipientKey: string;
  recipientDisplayName: string;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  physicianProfileId: string | null;
  recipientNpi: string | null;
  recipientCity: string | null;
  recipientState: string | null;
  recipientCountry: string | null;
  specialty: string | null;
  companyKey: string;
  companyName: string;
  amountUsd: number | null;
  natureOfPayment: string | null;
  dateOfPayment: Date | null;
}

export interface HealthcareRecipientSupplementInput {
  recipientKey: string;
  profileId: string | null;
  recipientType: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  specialty: string | null;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  npi: string | null;
}

function pick(
  record: Record<string, string | undefined>,
  aliases: string[],
): string | null {
  for (const alias of aliases) {
    const value = record[alias];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeIdentifierValue(value: string | null): string | null {
  const compacted = compactText(value);
  return compacted ? compacted.replace(/\s+/g, "") : null;
}

function buildRecipientKey(params: {
  physicianProfileId?: string | null;
  npi?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  const profileId = normalizeIdentifierValue(params.physicianProfileId ?? null);
  if (profileId) return `profile:${profileId}`;
  const npi = normalizeIdentifierValue(params.npi ?? null);
  if (npi) return `npi:${npi}`;

  const firstName = compactText(params.firstName ?? null);
  const lastName = compactText(params.lastName ?? null);
  if (!lastName) return null;

  const namePart = normalizeEntityName(
    [firstName, lastName].filter(Boolean).join(" "),
  );
  const locality = normalizeEntityName(
    [params.city ?? null, params.state ?? null].filter(Boolean).join(" "),
  );
  return `name:${namePart}|${locality}`;
}

function buildRecipientDisplayName(params: {
  firstName?: string | null;
  lastName?: string | null;
  fallback?: string | null;
}): string | null {
  const name = [params.firstName, params.lastName]
    .map((value) => compactText(value ?? null))
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return compactText((name || params.fallback) ?? null);
}

function extractDatasetKind(title: string): CmsOpenPaymentsDatasetKind | null {
  if (/general payment data/i.test(title)) return "general";
  if (/research payment data/i.test(title)) return "research";
  if (/ownership payment data/i.test(title)) return "ownership";
  if (/covered recipient profile supplement/i.test(title)) return "supplement";
  return null;
}

function extractProgramYear(title: string): number | null {
  const match = title.match(/\b(20\d{2})\b/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchCmsOpenPaymentsDatasets(): Promise<
  CmsOpenPaymentsDataset[]
> {
  if (isLocalFileUrl(CMS_OPEN_PAYMENTS_CATALOG_URL)) {
    return resolveLocalCatalog(CMS_OPEN_PAYMENTS_CATALOG_URL);
  }

  const response = await fetch(CMS_OPEN_PAYMENTS_CATALOG_URL, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `CMS Open Payments catalog fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const datasets = (await response.json()) as Array<{
    identifier?: string;
    title?: string;
    modified?: string;
    distribution?: Array<{ downloadURL?: string }>;
  }>;

  return datasets
    .map((dataset) => {
      const title = dataset.title ?? "";
      const kind = extractDatasetKind(title);
      const downloadUrl = dataset.distribution?.[0]?.downloadURL;
      if (!kind || !downloadUrl || !dataset.identifier) return null;
      return {
        datasetId: dataset.identifier,
        title,
        kind,
        programYear: extractProgramYear(title),
        downloadUrl,
        modifiedAt: parseOptionalDate(dataset.modified ?? null),
      } satisfies CmsOpenPaymentsDataset;
    })
    .filter((dataset): dataset is CmsOpenPaymentsDataset => dataset != null)
    .sort((left, right) => {
      if (left.kind === "supplement" && right.kind !== "supplement") return 1;
      if (right.kind === "supplement" && left.kind !== "supplement") return -1;
      return (right.programYear ?? 0) - (left.programYear ?? 0);
    });
}

export function parseHealthcarePaymentRecord(params: {
  record: Record<string, string | undefined>;
  kind: CmsOpenPaymentsDatasetKind;
  fallbackProgramYear: number | null;
}): HealthcarePaymentInput | null {
  const recordId = compactText(pick(params.record, ["Record_ID", "record_id"]));
  const firstName = compactText(
    pick(params.record, [
      "Covered_Recipient_First_Name",
      "Physician_First_Name",
      "Covered_Recipient_Profile_First_Name",
    ]),
  );
  const lastName = compactText(
    pick(params.record, [
      "Covered_Recipient_Last_Name",
      "Physician_Last_Name",
      "Covered_Recipient_Profile_Last_Name",
    ]),
  );
  const recipientDisplayName = buildRecipientDisplayName({
    firstName,
    lastName,
    fallback: pick(params.record, ["Teaching_Hospital_Name"]),
  });
  const physicianProfileId = compactText(
    pick(params.record, [
      "Covered_Recipient_Profile_ID",
      "Physician_Profile_ID",
    ]),
  );
  const recipientNpi = compactText(
    pick(params.record, ["Covered_Recipient_NPI", "Physician_NPI"]),
  );
  const city = compactText(
    pick(params.record, ["Recipient_City", "Covered_Recipient_Profile_City"]),
  );
  const state = compactText(
    pick(params.record, ["Recipient_State", "Covered_Recipient_Profile_State"]),
  );
  const country = compactText(
    pick(params.record, [
      "Recipient_Country",
      "Covered_Recipient_Profile_Country_Name",
    ]),
  );
  const specialty = compactText(
    pick(params.record, [
      "Covered_Recipient_Specialty_1",
      "Physician_Specialty",
      "Covered_Recipient_Profile_Primary_Specialty",
    ]),
  );
  const recipientKey = buildRecipientKey({
    physicianProfileId,
    npi: recipientNpi,
    firstName,
    lastName,
    city,
    state,
  });
  const companyName = compactText(
    pick(params.record, [
      "Applicable_Manufacturer_or_Applicable_GPO_Making_Payment_Name",
      "Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name",
    ]),
  );

  if (!recordId || !recipientKey || !recipientDisplayName || !companyName) {
    return null;
  }

  const companyKey = normalizeEntityName(companyName);
  const programYear =
    parseOptionalNumber(
      pick(params.record, ["Program_Year", "program_year"]),
    ) ?? params.fallbackProgramYear;

  return {
    recordId,
    paymentType: params.kind,
    programYear: programYear != null ? Math.trunc(programYear) : null,
    recipientKey,
    recipientDisplayName,
    recipientFirstName: firstName,
    recipientLastName: lastName,
    physicianProfileId,
    recipientNpi,
    recipientCity: city,
    recipientState: state,
    recipientCountry: country,
    specialty,
    companyKey,
    companyName,
    amountUsd: parseOptionalNumber(
      pick(params.record, [
        "Total_Amount_of_Payment_USDollars",
        "Total_Amount_of_Payment_USDollars_",
      ]),
    ),
    natureOfPayment: compactText(
      pick(params.record, [
        "Nature_of_Payment_or_Transfer_of_Value",
        "Nature_of_Payment",
      ]),
    ),
    dateOfPayment: parseOptionalDate(
      pick(params.record, ["Date_of_Payment", "Payment_Publication_Date"]),
    ),
  };
}

export function parseHealthcareRecipientSupplementRecord(
  record: Record<string, string | undefined>,
): HealthcareRecipientSupplementInput | null {
  const firstName = compactText(
    pick(record, ["Covered_Recipient_Profile_First_Name"]),
  );
  const lastName = compactText(
    pick(record, ["Covered_Recipient_Profile_Last_Name"]),
  );
  const profileId = compactText(pick(record, ["Covered_Recipient_Profile_ID"]));
  const npi = compactText(pick(record, ["Covered_Recipient_NPI"]));
  const recipientKey = buildRecipientKey({
    physicianProfileId: profileId,
    npi,
    firstName,
    lastName,
    city: pick(record, ["Covered_Recipient_Profile_City"]),
    state: pick(record, ["Covered_Recipient_Profile_State"]),
  });
  if (!recipientKey) return null;

  return {
    recipientKey,
    profileId,
    recipientType: compactText(
      pick(record, ["Covered_Recipient_Profile_Type"]),
    ),
    firstName,
    middleName: compactText(
      pick(record, ["Covered_Recipient_Profile_Middle_Name"]),
    ),
    lastName,
    specialty: compactText(
      pick(record, ["Covered_Recipient_Profile_Primary_Specialty"]),
    ),
    city: compactText(pick(record, ["Covered_Recipient_Profile_City"])),
    state: compactText(pick(record, ["Covered_Recipient_Profile_State"])),
    countryCode: compactText(
      pick(record, ["Covered_Recipient_Profile_Country_Name"]),
    ),
    npi,
  };
}

async function ensureHealthcareRecipientEntities(
  tx: Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  rows: HealthcarePaymentInput[],
): Promise<Map<string, string>> {
  const recipientMap = new Map<string, HealthcarePaymentInput>();
  for (const row of rows) {
    if (!recipientMap.has(row.recipientKey)) {
      recipientMap.set(row.recipientKey, row);
    }
  }
  const keys = [...recipientMap.keys()];
  const existing = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "cms_recipient_key",
      identifierValue: { in: keys },
      CanonicalEntity: { categoryId: "healthcare" },
    },
    select: { identifierValue: true, entityId: true },
  });
  const keyToEntityId = new Map(
    existing.map((row) => [row.identifierValue, row.entityId] as const),
  );

  for (const key of keys) {
    if (keyToEntityId.has(key)) continue;
    const row = recipientMap.get(key)!;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "healthcare",
        displayName: row.recipientDisplayName,
        normalizedName: normalizeEntityName(row.recipientDisplayName),
        entityType: "recipient",
        status: "active",
        primaryJurisdiction: "US",
        stateCode: row.recipientState ?? undefined,
        countryCode: row.recipientCountry ?? "US",
      },
      select: { id: true },
    });
    await tx.entityIdentifier.create({
      data: {
        id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        entityId: entity.id,
        sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
        identifierType: "cms_recipient_key",
        identifierValue: key,
        isPrimary: true,
      },
    });
    if (row.physicianProfileId) {
      await tx.entityIdentifier.create({
        data: {
          id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          entityId: entity.id,
          sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
          identifierType: "cms_recipient_profile_id",
          identifierValue: row.physicianProfileId,
        },
      });
    }
    if (row.recipientNpi) {
      await tx.entityIdentifier.create({
        data: {
          id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          entityId: entity.id,
          sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
          identifierType: "cms_recipient_npi",
          identifierValue: row.recipientNpi,
        },
      });
    }
    keyToEntityId.set(key, entity.id);
  }

  return keyToEntityId;
}

async function ensureHealthcareCompanyEntities(
  tx: Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  rows: HealthcarePaymentInput[],
): Promise<Map<string, string>> {
  const companies = new Map<string, HealthcarePaymentInput>();
  for (const row of rows) {
    if (!companies.has(row.companyKey)) {
      companies.set(row.companyKey, row);
    }
  }

  const keys = [...companies.keys()];
  const existing = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "cms_payer_name",
      identifierValue: { in: keys },
      CanonicalEntity: { categoryId: "healthcare" },
    },
    select: { identifierValue: true, entityId: true },
  });
  const keyToEntityId = new Map(
    existing.map((row) => [row.identifierValue, row.entityId] as const),
  );

  for (const key of keys) {
    if (keyToEntityId.has(key)) continue;
    const row = companies.get(key)!;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "healthcare",
        displayName: row.companyName,
        normalizedName: key,
        entityType: "payer",
        status: "active",
        primaryJurisdiction: "US",
        countryCode: "US",
      },
      select: { id: true },
    });
    await tx.entityIdentifier.create({
      data: {
        id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        entityId: entity.id,
        sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
        identifierType: "cms_payer_name",
        identifierValue: key,
        isPrimary: true,
      },
    });
    keyToEntityId.set(key, entity.id);
  }

  return keyToEntityId;
}

export async function persistHealthcarePaymentBatch(params: {
  rows: HealthcarePaymentInput[];
  sourcePublishedAt: Date | null;
}) {
  if (params.rows.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.healthcarePaymentRecord.findMany({
        where: { recordId: { in: params.rows.map((row) => row.recordId) } },
        select: { recordId: true },
      });
      const existingIds = new Set(existing.map((row) => row.recordId));

      const recipientMap = await ensureHealthcareRecipientEntities(
        tx,
        params.rows,
      );
      const companyMap = await ensureHealthcareCompanyEntities(tx, params.rows);
      let inserted = 0;
      let updated = 0;

      for (const row of params.rows) {
        const recipientEntityId = recipientMap.get(row.recipientKey);
        const companyEntityId = companyMap.get(row.companyKey);
        if (!recipientEntityId || !companyEntityId) {
          throw new Error(
            `Missing healthcare entity mapping for ${row.recordId}`,
          );
        }

        await tx.healthcareRecipientProfile.upsert({
          where: { entityId: recipientEntityId },
          update: {
            sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
            recipientType: "physician",
            physicianProfileId: row.physicianProfileId ?? undefined,
            firstName: row.recipientFirstName ?? undefined,
            lastName: row.recipientLastName ?? undefined,
            specialty: row.specialty ?? undefined,
            city: row.recipientCity ?? undefined,
            state: row.recipientState ?? undefined,
            countryCode: row.recipientCountry ?? undefined,
          },
          create: {
            sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
            entityId: recipientEntityId,
            recipientType: "physician",
            physicianProfileId: row.physicianProfileId ?? undefined,
            firstName: row.recipientFirstName ?? undefined,
            lastName: row.recipientLastName ?? undefined,
            specialty: row.specialty ?? undefined,
            city: row.recipientCity ?? undefined,
            state: row.recipientState ?? undefined,
            countryCode: row.recipientCountry ?? undefined,
          },
        });

        await tx.healthcarePaymentRecord.upsert({
          where: { recordId: row.recordId },
          update: {
            paymentType: row.paymentType,
            programYear: row.programYear ?? undefined,
            recipientEntityId,
            companyEntityId,
            recipientCity: row.recipientCity ?? undefined,
            recipientState: row.recipientState ?? undefined,
            physicianFirstName: row.recipientFirstName ?? undefined,
            physicianLastName: row.recipientLastName ?? undefined,
            physicianSpecialty: row.specialty ?? undefined,
            manufacturerName: row.companyName,
            amountUsd: row.amountUsd ?? undefined,
            natureOfPayment: row.natureOfPayment ?? undefined,
            dateOfPayment: row.dateOfPayment ?? undefined,
            sourceRecordUpdatedAt: params.sourcePublishedAt ?? undefined,
          },
          create: {
            sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
            recordId: row.recordId,
            paymentType: row.paymentType,
            programYear: row.programYear ?? undefined,
            recipientEntityId,
            companyEntityId,
            recipientCity: row.recipientCity ?? undefined,
            recipientState: row.recipientState ?? undefined,
            physicianFirstName: row.recipientFirstName ?? undefined,
            physicianLastName: row.recipientLastName ?? undefined,
            physicianSpecialty: row.specialty ?? undefined,
            manufacturerName: row.companyName,
            amountUsd: row.amountUsd ?? undefined,
            natureOfPayment: row.natureOfPayment ?? undefined,
            dateOfPayment: row.dateOfPayment ?? undefined,
            sourceRecordUpdatedAt: params.sourcePublishedAt ?? undefined,
          },
        });

        if (existingIds.has(row.recordId)) updated++;
        else inserted++;
      }

      return { inserted, updated };
    },
    { timeout: 120_000 },
  );
}

export async function persistHealthcareRecipientSupplementBatch(params: {
  rows: HealthcareRecipientSupplementInput[];
  sourcePublishedAt: Date | null;
}) {
  if (params.rows.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(
    async (tx) => {
      const keys = params.rows.map((row) => row.recipientKey);
      const identifiers = await tx.entityIdentifier.findMany({
        where: {
          identifierType: "cms_recipient_key",
          identifierValue: { in: keys },
          CanonicalEntity: { categoryId: "healthcare" },
        },
        select: { identifierValue: true, entityId: true },
      });
      const keyToEntityId = new Map(
        identifiers.map((row) => [row.identifierValue, row.entityId] as const),
      );

      let inserted = 0;
      let updated = 0;
      for (const row of params.rows) {
        const entityId = keyToEntityId.get(row.recipientKey);
        if (!entityId) continue;

        const existing = await tx.healthcareRecipientProfile.findUnique({
          where: { entityId },
          select: { id: true },
        });
        await tx.healthcareRecipientProfile.upsert({
          where: { entityId },
          update: {
            sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
            recipientType: row.recipientType ?? "physician",
            physicianProfileId: row.profileId ?? undefined,
            firstName: row.firstName ?? undefined,
            middleName: row.middleName ?? undefined,
            lastName: row.lastName ?? undefined,
            specialty: row.specialty ?? undefined,
            city: row.city ?? undefined,
            state: row.state ?? undefined,
            countryCode: row.countryCode ?? undefined,
          },
          create: {
            sourceSystemId: CMS_OPEN_PAYMENTS_SOURCE_SYSTEM_ID,
            entityId,
            recipientType: row.recipientType ?? "physician",
            physicianProfileId: row.profileId ?? undefined,
            firstName: row.firstName ?? undefined,
            middleName: row.middleName ?? undefined,
            lastName: row.lastName ?? undefined,
            specialty: row.specialty ?? undefined,
            city: row.city ?? undefined,
            state: row.state ?? undefined,
            countryCode: row.countryCode ?? undefined,
          },
        });
        if (existing) updated++;
        else inserted++;
      }

      return { inserted, updated };
    },
    { timeout: 120_000 },
  );
}
