import { prisma } from "@/lib/db";
import { buildGovernmentSignals } from "@/lib/government-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { assessGovernmentMirror } from "@/lib/mirror-readiness";
import { resolveMirrorFreshness } from "@/lib/mirror-metadata";
import { normalizeEntityName, withMirrorMetadata } from "@/lib/warehouse";

const USASPENDING_SOURCE_SYSTEM_ID = "usaspending_api";
const PAGE_SIZE = 20;

async function currentGovernmentCoverage(): Promise<string> {
  return (await getLocalGovernmentMirrorStatus()).coverage;
}

export async function getLocalGovernmentMirrorStatus() {
  const awards = await prisma.governmentAwardRecord.count();
  return assessGovernmentMirror({ awards });
}

export async function hasLocalGovernmentMirror(): Promise<boolean> {
  return (await getLocalGovernmentMirrorStatus()).ready;
}

export async function searchStoredGovernmentAwards(params: {
  q: string;
  page?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const normalized = normalizeEntityName(params.q);
  const rows = await prisma.governmentAwardRecord.findMany({
    where: {
      OR: [
        { awardId: { contains: params.q, mode: "insensitive" } },
        { recipientName: { contains: params.q, mode: "insensitive" } },
        { awardingAgencyName: { contains: params.q, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ awardAmount: "desc" }, { updatedAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const total = await prisma.governmentAwardRecord.count({
    where: {
      OR: [
        { awardId: { contains: params.q, mode: "insensitive" } },
        { recipientName: { contains: params.q, mode: "insensitive" } },
        { awardingAgencyName: { contains: params.q, mode: "insensitive" } },
        { description: { contains: params.q, mode: "insensitive" } },
      ],
    },
  });

  return withMirrorMetadata(
    {
      spending_level: "awards",
      results: rows.map((row) => ({
        internal_id: row.internalId ?? 0,
        generated_internal_id: row.generatedInternalId,
        Award_ID: row.awardId ?? undefined,
        Recipient_Name: row.recipientName ?? undefined,
        Awarding_Agency: row.awardingAgencyName ?? undefined,
        Award_Amount: row.awardAmount ?? undefined,
        Total_Outlays: row.totalOutlays ?? undefined,
        Description: row.description ?? undefined,
        Start_Date: row.startDate?.toISOString().slice(0, 10) ?? undefined,
        End_Date: row.endDate?.toISOString().slice(0, 10) ?? undefined,
        Award_Type: row.awardType ?? undefined,
      })),
      page_metadata: {
        page,
        hasNext: page * PAGE_SIZE < total,
        total,
      },
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
        observedDates: rows.map((row) => row.sourceRecordUpdatedAt),
      }),
      mirrorCoverage: await currentGovernmentCoverage(),
    }
  );
}

export async function getStoredGovernmentAwardDetail(generatedInternalId: string) {
  const row = await prisma.governmentAwardRecord.findUnique({
    where: { generatedInternalId },
  });
  if (!row) return null;

  const riskSignals = buildGovernmentSignals({
    total_obligation: row.totalObligation ?? undefined,
    base_and_all_options_value: row.baseAndAllOptionsValue ?? undefined,
    contract_data: {
      type_of_contract_pricing_description:
        row.contractPricingDescription ?? undefined,
      extent_competed_description: row.extentCompetedDescription ?? undefined,
      number_of_offers_received: row.numberOfOffersReceived ?? undefined,
    },
  });
  const riskScore = compositeScore(riskSignals);

  return withMirrorMetadata(
    {
      id: row.internalId ?? undefined,
      generated_unique_award_id: row.generatedUniqueAwardId ?? row.generatedInternalId,
      type_description: row.typeDescription ?? undefined,
      description: row.description ?? undefined,
      total_obligation: row.totalObligation ?? undefined,
      base_and_all_options_value: row.baseAndAllOptionsValue ?? undefined,
      recipient: {
        recipient_name: row.recipientName ?? undefined,
        recipient_uei: row.recipientUei ?? undefined,
        business_categories: row.recipientBusinessCategories,
      },
      awarding_agency: {
        toptier_agency: { name: row.awardingAgencyName ?? undefined },
      },
      funding_agency: {
        toptier_agency: { name: row.fundingAgencyName ?? undefined },
      },
      place_of_performance: {
        city_name: row.placeOfPerformanceCity ?? undefined,
        state_code: row.placeOfPerformanceStateCode ?? undefined,
        country_name: row.placeOfPerformanceCountry ?? undefined,
      },
      naics: row.naics ?? undefined,
      naics_description: row.naicsDescription ?? undefined,
      psc_code: row.pscCode ?? undefined,
      contract_data: {
        type_of_contract_pricing_description:
          row.contractPricingDescription ?? undefined,
        extent_competed_description: row.extentCompetedDescription ?? undefined,
        number_of_offers_received: row.numberOfOffersReceived ?? undefined,
      },
      riskSignals,
      riskScore,
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
        observedDates: [row.sourceRecordUpdatedAt],
      }),
      mirrorCoverage: await currentGovernmentCoverage(),
    }
  );
}

export async function getStoredFlaggedGovernmentAwards() {
  const rows = await prisma.governmentAwardRecord.findMany({
    orderBy: [{ awardAmount: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });

  const results = rows
    .map((row) => {
      const riskSignals = buildGovernmentSignals({
        total_obligation: row.totalObligation ?? row.awardAmount ?? undefined,
        base_and_all_options_value: row.baseAndAllOptionsValue ?? undefined,
        contract_data: {
          type_of_contract_pricing_description:
            row.contractPricingDescription ?? undefined,
          extent_competed_description: row.extentCompetedDescription ?? undefined,
          number_of_offers_received: row.numberOfOffersReceived ?? undefined,
        },
      });
      const riskScore = compositeScore(riskSignals);
      if (riskScore <= 0) return null;
      return {
        id: row.generatedInternalId,
        awardId: row.awardId ?? undefined,
        recipient: row.recipientName ?? undefined,
        agency: row.awardingAgencyName ?? undefined,
        amount: row.awardAmount ?? undefined,
        description: row.description ?? undefined,
        riskSignals,
        riskScore,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((left, right) => right.riskScore - left.riskScore);

  return withMirrorMetadata(
    { results, generatedAt: new Date().toISOString() },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: USASPENDING_SOURCE_SYSTEM_ID,
        observedDates: rows.map((row) => row.sourceRecordUpdatedAt),
      }),
      mirrorCoverage: await currentGovernmentCoverage(),
    }
  );
}
