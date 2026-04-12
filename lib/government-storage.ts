import { prisma } from "@/lib/db";
import type { AwardDetail, SpendingAward } from "@/lib/usaspending";
import { normalizeEntityName, parseOptionalDate } from "@/lib/warehouse";

export const USASPENDING_SOURCE_SYSTEM_ID = "usaspending_api";

async function ensureGovernmentRecipientEntities(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  awards: SpendingAward[]
) {
  const recipientMap = new Map<string, string>();
  for (const award of awards) {
    if (!award.Recipient_Name) continue;
    const normalized = normalizeEntityName(award.Recipient_Name);
    if (!recipientMap.has(normalized)) {
      recipientMap.set(normalized, award.Recipient_Name);
    }
  }

  const identifiers = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "usaspending_recipient_name",
      identifierValue: { in: [...recipientMap.keys()] },
      entity: { categoryId: "government" },
    },
    select: { identifierValue: true, entityId: true },
  });
  const normalizedToEntityId = new Map(
    identifiers.map((row) => [row.identifierValue, row.entityId] as const)
  );

  for (const [normalizedName, displayName] of recipientMap) {
    if (normalizedToEntityId.has(normalizedName)) continue;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "government",
        displayName,
        normalizedName,
        entityType: "recipient",
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
        sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
        identifierType: "usaspending_recipient_name",
        identifierValue: normalizedName,
        isPrimary: true,
      },
    });
    normalizedToEntityId.set(normalizedName, entity.id);
  }

  return normalizedToEntityId;
}

export async function persistGovernmentAwardSummaries(
  awards: SpendingAward[],
  sourceUpdatedAt: Date | null
) {
  if (awards.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(async (tx) => {
    const entityMap = await ensureGovernmentRecipientEntities(tx, awards);
    let inserted = 0;
    let updated = 0;

    for (const award of awards) {
      const recipientEntityId = award.Recipient_Name
        ? entityMap.get(normalizeEntityName(award.Recipient_Name))
        : null;
      const existing = await tx.governmentAwardRecord.findUnique({
        where: { generatedInternalId: award.generated_internal_id },
        select: { id: true },
      });

      await tx.governmentAwardRecord.upsert({
        where: { generatedInternalId: award.generated_internal_id },
        update: {
          internalId: award.internal_id,
          awardId: award.Award_ID ?? undefined,
          recipientEntityId: recipientEntityId ?? undefined,
          recipientName: award.Recipient_Name ?? undefined,
          awardingAgencyName: award.Awarding_Agency ?? undefined,
          awardAmount: award.Award_Amount ?? undefined,
          totalOutlays: award.Total_Outlays ?? undefined,
          description: award.Description ?? undefined,
          startDate: parseOptionalDate(award.Start_Date) ?? undefined,
          endDate: parseOptionalDate(award.End_Date) ?? undefined,
          awardType: award.Award_Type ?? undefined,
          sourceRecordUpdatedAt: sourceUpdatedAt ?? undefined,
        },
        create: {
          sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
          generatedInternalId: award.generated_internal_id,
          internalId: award.internal_id,
          awardId: award.Award_ID ?? undefined,
          recipientEntityId: recipientEntityId ?? undefined,
          recipientName: award.Recipient_Name ?? undefined,
          awardingAgencyName: award.Awarding_Agency ?? undefined,
          awardAmount: award.Award_Amount ?? undefined,
          totalOutlays: award.Total_Outlays ?? undefined,
          description: award.Description ?? undefined,
          startDate: parseOptionalDate(award.Start_Date) ?? undefined,
          endDate: parseOptionalDate(award.End_Date) ?? undefined,
          awardType: award.Award_Type ?? undefined,
          sourceRecordUpdatedAt: sourceUpdatedAt ?? undefined,
        },
      });

      if (existing) updated++;
      else inserted++;
    }

    return { inserted, updated };
  }, { timeout: 120_000 });
}

export async function persistGovernmentAwardDetail(
  generatedInternalId: string,
  award: AwardDetail
) {
  return prisma.governmentAwardRecord.upsert({
    where: { generatedInternalId },
    update: {
      internalId: award.id,
      generatedUniqueAwardId: award.generated_unique_award_id,
      typeDescription: award.type_description ?? undefined,
      description: award.description ?? undefined,
      totalObligation: award.total_obligation ?? undefined,
      baseAndAllOptionsValue: award.base_and_all_options_value ?? undefined,
      recipientName: award.recipient?.recipient_name ?? undefined,
      recipientUei: award.recipient?.recipient_uei ?? undefined,
      recipientBusinessCategories: award.recipient?.business_categories ?? [],
      awardingAgencyName:
        award.awarding_agency?.toptier_agency?.name ??
        award.awarding_agency?.subtier_agency?.name ??
        undefined,
      fundingAgencyName:
        award.funding_agency?.toptier_agency?.name ?? undefined,
      placeOfPerformanceCity: award.place_of_performance?.city_name ?? undefined,
      placeOfPerformanceStateCode:
        award.place_of_performance?.state_code ?? undefined,
      placeOfPerformanceCountry:
        award.place_of_performance?.country_name ?? undefined,
      naics: award.naics ?? undefined,
      naicsDescription: award.naics_description ?? undefined,
      pscCode: award.psc_code ?? undefined,
      contractPricingDescription:
        award.contract_data?.type_of_contract_pricing_description ?? undefined,
      extentCompetedDescription:
        award.contract_data?.extent_competed_description ?? undefined,
      numberOfOffersReceived:
        award.contract_data?.number_of_offers_received ?? undefined,
      sourceRecordUpdatedAt: new Date(),
    },
    create: {
      sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
      generatedInternalId,
      internalId: award.id,
      generatedUniqueAwardId: award.generated_unique_award_id,
      typeDescription: award.type_description ?? undefined,
      description: award.description ?? undefined,
      totalObligation: award.total_obligation ?? undefined,
      baseAndAllOptionsValue: award.base_and_all_options_value ?? undefined,
      recipientName: award.recipient?.recipient_name ?? undefined,
      recipientUei: award.recipient?.recipient_uei ?? undefined,
      recipientBusinessCategories: award.recipient?.business_categories ?? [],
      awardingAgencyName:
        award.awarding_agency?.toptier_agency?.name ??
        award.awarding_agency?.subtier_agency?.name ??
        undefined,
      fundingAgencyName:
        award.funding_agency?.toptier_agency?.name ?? undefined,
      placeOfPerformanceCity: award.place_of_performance?.city_name ?? undefined,
      placeOfPerformanceStateCode:
        award.place_of_performance?.state_code ?? undefined,
      placeOfPerformanceCountry:
        award.place_of_performance?.country_name ?? undefined,
      naics: award.naics ?? undefined,
      naicsDescription: award.naics_description ?? undefined,
      pscCode: award.psc_code ?? undefined,
      contractPricingDescription:
        award.contract_data?.type_of_contract_pricing_description ?? undefined,
      extentCompetedDescription:
        award.contract_data?.extent_competed_description ?? undefined,
      numberOfOffersReceived:
        award.contract_data?.number_of_offers_received ?? undefined,
      sourceRecordUpdatedAt: new Date(),
    },
  });
}
