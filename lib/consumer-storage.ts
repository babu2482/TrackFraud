import { prisma } from "@/lib/db";
import { compactText, normalizeEntityName, parseOptionalDate } from "@/lib/warehouse";

export const CFPB_SOURCE_SYSTEM_ID = "cfpb_consumer_complaints";
export const CFPB_COMPLAINTS_CSV_ZIP_URL =
  "https://files.consumerfinance.gov/ccdb/complaints.csv.zip";
export const CFPB_COMPLAINTS_JSON_ZIP_URL =
  "https://files.consumerfinance.gov/ccdb/complaints.json.zip";
export const CFPB_COMPLAINTS_INFO_URL =
  "https://www.consumerfinance.gov/data-research/consumer-complaints/";

export interface ConsumerComplaintInput {
  complaintId: string;
  company: string;
  normalizedCompany: string;
  dateReceived: Date | null;
  product: string | null;
  subProduct: string | null;
  issue: string | null;
  subIssue: string | null;
  companyResponse: string | null;
  timely: string | null;
  consumerDisputed: string | null;
  complaintWhatHappened: string | null;
  dateSentToCompany: Date | null;
  companyPublicResponse: string | null;
  companyResponseToConsumer: string | null;
  submittedVia: string | null;
  state: string | null;
  zipCode: string | null;
  tags: string | null;
}

export interface PersistConsumerComplaintResult {
  inserted: number;
  updated: number;
}

type CsvLikeRecord = Record<string, string | undefined>;

function pick(record: CsvLikeRecord, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = record[alias];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeComplaintId(raw: string | null): string | null {
  if (!raw) return null;
  const compacted = raw.replace(/\D/g, "");
  return compacted.length > 0 ? compacted : null;
}

export function parseConsumerComplaintRecord(
  record: CsvLikeRecord
): ConsumerComplaintInput | null {
  const complaintId = normalizeComplaintId(
    pick(record, ["Complaint ID", "complaint_id"])
  );
  const company = compactText(pick(record, ["Company", "company"]));
  if (!complaintId || !company) return null;

  return {
    complaintId,
    company,
    normalizedCompany: normalizeEntityName(company),
    dateReceived: parseOptionalDate(
      pick(record, ["Date received", "date_received"])
    ),
    product: compactText(pick(record, ["Product", "product"])),
    subProduct: compactText(pick(record, ["Sub-product", "sub_product"])),
    issue: compactText(pick(record, ["Issue", "issue"])),
    subIssue: compactText(pick(record, ["Sub-issue", "sub_issue"])),
    companyResponse: compactText(
      pick(record, ["Company response", "company_response"])
    ),
    timely: compactText(pick(record, ["Timely response?", "timely"])),
    consumerDisputed: compactText(
      pick(record, ["Consumer disputed?", "consumer_disputed"])
    ),
    complaintWhatHappened: compactText(
      pick(record, [
        "Consumer complaint narrative",
        "Complaint what happened",
        "complaint_what_happened",
      ])
    ),
    dateSentToCompany: parseOptionalDate(
      pick(record, ["Date sent to company", "date_sent_to_company"])
    ),
    companyPublicResponse: compactText(
      pick(record, ["Company public response", "company_public_response"])
    ),
    companyResponseToConsumer: compactText(
      pick(record, [
        "Company response to consumer",
        "company_response_to_consumer",
      ])
    ),
    submittedVia: compactText(pick(record, ["Submitted via", "submitted_via"])),
    state: compactText(pick(record, ["State", "state"])),
    zipCode: compactText(pick(record, ["ZIP code", "zip_code"])),
    tags: compactText(pick(record, ["Tags", "tags"])),
  };
}

async function ensureConsumerEntities(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  rows: ConsumerComplaintInput[]
): Promise<Map<string, string>> {
  const companies = new Map<string, ConsumerComplaintInput>();
  for (const row of rows) {
    if (!companies.has(row.normalizedCompany)) {
      companies.set(row.normalizedCompany, row);
    }
  }

  const normalizedCompanies = [...companies.keys()];
  const identifiers = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "consumer_company_name",
      identifierValue: { in: normalizedCompanies },
      entity: { categoryId: "consumer" },
    },
    select: {
      identifierValue: true,
      entityId: true,
    },
  });
  const normalizedToEntityId = new Map(
    identifiers.map((row) => [row.identifierValue, row.entityId] as const)
  );

  for (const normalizedCompany of normalizedCompanies) {
    if (normalizedToEntityId.has(normalizedCompany)) continue;
    const sample = companies.get(normalizedCompany)!;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "consumer",
        displayName: sample.company,
        normalizedName: normalizedCompany,
        entityType: "company",
        status: "active",
        primaryJurisdiction: "US",
        stateCode: sample.state ?? undefined,
        countryCode: "US",
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });
    await tx.entityIdentifier.create({
      data: {
          id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        entityId: entity.id,
        sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
        identifierType: "consumer_company_name",
        identifierValue: normalizedCompany,
        isPrimary: true,
      },
    });
    normalizedToEntityId.set(normalizedCompany, entity.id);
  }

  return normalizedToEntityId;
}

async function refreshConsumerCompanySummaries(params: {
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
  entityIds: string[];
  sourcePublishedAt: Date | null;
}) {
  const uniqueEntityIds = [...new Set(params.entityIds)];
  for (const entityId of uniqueEntityIds) {
    const complaints = await params.tx.consumerComplaintRecord.findMany({
      where: { entityId },
      select: {
        product: true,
        companyResponseToConsumer: true,
        companyResponse: true,
        consumerDisputed: true,
        timely: true,
        dateReceived: true,
      },
    });

    let withRelief = 0;
    let withoutRelief = 0;
    let disputedCount = 0;
    let untimelyCount = 0;
    let latestComplaintAt: Date | null = null;
    const productCounts = new Map<string, number>();

    for (const complaint of complaints) {
      const response = (
        complaint.companyResponseToConsumer ??
        complaint.companyResponse ??
        ""
      ).toLowerCase();
      if (response.includes("relief")) withRelief++;
      else if (response.includes("closed")) withoutRelief++;

      if ((complaint.consumerDisputed ?? "").toLowerCase() === "yes") {
        disputedCount++;
      }
      if ((complaint.timely ?? "").toLowerCase() === "no") {
        untimelyCount++;
      }
      if (complaint.product) {
        productCounts.set(
          complaint.product,
          (productCounts.get(complaint.product) ?? 0) + 1
        );
      }
      if (
        complaint.dateReceived &&
        (!latestComplaintAt ||
          complaint.dateReceived.getTime() > latestComplaintAt.getTime())
      ) {
        latestComplaintAt = complaint.dateReceived;
      }
    }

    let topProduct: string | null = null;
    let topProductCount = 0;
    for (const [product, count] of productCounts) {
      if (count > topProductCount) {
        topProduct = product;
        topProductCount = count;
      }
    }

    await params.tx.consumerCompanySummary.upsert({
      where: { entityId },
      update: {
        totalComplaints: complaints.length,
        withRelief,
        withoutRelief,
        disputedCount,
        untimelyCount,
        topProduct: topProduct ?? undefined,
        topProductCount: topProductCount || undefined,
        latestComplaintAt: latestComplaintAt ?? undefined,
        sourcePublishedAt: params.sourcePublishedAt ?? undefined,
      },
      create: {
        sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
        entityId,
        totalComplaints: complaints.length,
        withRelief,
        withoutRelief,
        disputedCount,
        untimelyCount,
        topProduct: topProduct ?? undefined,
        topProductCount: topProductCount || undefined,
        latestComplaintAt: latestComplaintAt ?? undefined,
        sourcePublishedAt: params.sourcePublishedAt ?? undefined,
      },
    });
  }
}

export async function persistConsumerComplaintBatch(
  rows: ConsumerComplaintInput[],
  sourcePublishedAt: Date | null
): Promise<PersistConsumerComplaintResult> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  return prisma.$transaction(
    async (tx) => {
      const complaintIds = rows.map((row) => row.complaintId);
      const existing = await tx.consumerComplaintRecord.findMany({
        where: {
          complaintId: { in: complaintIds },
        },
        select: { complaintId: true },
      });
      const existingIds = new Set(existing.map((row) => row.complaintId));
      const normalizedToEntityId = await ensureConsumerEntities(tx, rows);

      let inserted = 0;
      let updated = 0;
      const touchedEntityIds = new Set<string>();

      for (const row of rows) {
        const entityId = normalizedToEntityId.get(row.normalizedCompany);
        if (!entityId) {
          throw new Error(
            `Missing consumer entity mapping for ${row.normalizedCompany}`
          );
        }
        touchedEntityIds.add(entityId);

        await tx.consumerComplaintRecord.upsert({
          where: { complaintId: row.complaintId },
          update: {
            entityId,
            normalizedCompany: row.normalizedCompany,
            dateReceived: row.dateReceived ?? undefined,
            product: row.product ?? undefined,
            subProduct: row.subProduct ?? undefined,
            issue: row.issue ?? undefined,
            subIssue: row.subIssue ?? undefined,
            companyResponse: row.companyResponse ?? undefined,
            timely: row.timely ?? undefined,
            consumerDisputed: row.consumerDisputed ?? undefined,
            complaintWhatHappened: row.complaintWhatHappened ?? undefined,
            dateSentToCompany: row.dateSentToCompany ?? undefined,
            companyPublicResponse: row.companyPublicResponse ?? undefined,
            companyResponseToConsumer:
              row.companyResponseToConsumer ?? undefined,
            submittedVia: row.submittedVia ?? undefined,
            state: row.state ?? undefined,
            zipCode: row.zipCode ?? undefined,
            tags: row.tags ?? undefined,
            sourceRecordUpdatedAt: sourcePublishedAt ?? undefined,
          },
          create: {
            sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
            entityId,
            complaintId: row.complaintId,
            normalizedCompany: row.normalizedCompany,
            dateReceived: row.dateReceived ?? undefined,
            product: row.product ?? undefined,
            subProduct: row.subProduct ?? undefined,
            issue: row.issue ?? undefined,
            subIssue: row.subIssue ?? undefined,
            companyResponse: row.companyResponse ?? undefined,
            timely: row.timely ?? undefined,
            consumerDisputed: row.consumerDisputed ?? undefined,
            complaintWhatHappened: row.complaintWhatHappened ?? undefined,
            dateSentToCompany: row.dateSentToCompany ?? undefined,
            companyPublicResponse: row.companyPublicResponse ?? undefined,
            companyResponseToConsumer:
              row.companyResponseToConsumer ?? undefined,
            submittedVia: row.submittedVia ?? undefined,
            state: row.state ?? undefined,
            zipCode: row.zipCode ?? undefined,
            tags: row.tags ?? undefined,
            sourceRecordUpdatedAt: sourcePublishedAt ?? undefined,
          },
        });

        if (existingIds.has(row.complaintId)) updated++;
        else inserted++;
      }

      await refreshConsumerCompanySummaries({
        tx,
        entityIds: [...touchedEntityIds],
        sourcePublishedAt,
      });

      return { inserted, updated };
    },
    { timeout: 120_000 }
  );
}
