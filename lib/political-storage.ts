import { prisma } from "@/lib/db";
import type { FECCandidate, FECCommittee, FECTotals } from "@/lib/fec";
import { normalizeEntityName, parseOptionalDate } from "@/lib/warehouse";

export const FEC_SOURCE_SYSTEM_ID = "fec_api";

function uniqueCycles(cycles?: number[]): number[] {
  return [...new Set((cycles ?? []).filter((value) => Number.isFinite(value)))].sort(
    (left, right) => left - right
  );
}

async function ensurePoliticalCandidateEntities(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  candidates: FECCandidate[]
) {
  const candidateIds = candidates.map((candidate) => candidate.candidate_id);
  const existing = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "fec_candidate_id",
      identifierValue: { in: candidateIds },
      entity: { categoryId: "political" },
    },
    select: { identifierValue: true, entityId: true },
  });
  const idMap = new Map(
    existing.map((row) => [row.identifierValue, row.entityId] as const)
  );

  for (const candidate of candidates) {
    if (idMap.has(candidate.candidate_id)) continue;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "political",
        displayName: candidate.name,
        normalizedName: normalizeEntityName(candidate.name),
        entityType: "candidate",
        status: "active",
        stateCode: candidate.state ?? undefined,
        countryCode: "US",
        primaryJurisdiction: "US",
      },
      select: { id: true },
    });
    await tx.entityIdentifier.create({
      data: {
          id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        entityId: entity.id,
        sourceSystemId: FEC_SOURCE_SYSTEM_ID,
        identifierType: "fec_candidate_id",
        identifierValue: candidate.candidate_id,
        isPrimary: true,
      },
    });
    idMap.set(candidate.candidate_id, entity.id);
  }

  return idMap;
}

async function ensurePoliticalCommitteeEntities(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  committees: FECCommittee[]
) {
  const committeeIds = committees.map((committee) => committee.committee_id);
  const existing = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "fec_committee_id",
      identifierValue: { in: committeeIds },
      entity: { categoryId: "political" },
    },
    select: { identifierValue: true, entityId: true },
  });
  const idMap = new Map(
    existing.map((row) => [row.identifierValue, row.entityId] as const)
  );

  for (const committee of committees) {
    if (idMap.has(committee.committee_id)) continue;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "political",
        displayName: committee.name,
        normalizedName: normalizeEntityName(committee.name),
        entityType: "committee",
        status: "active",
        stateCode: committee.state ?? undefined,
        countryCode: "US",
        primaryJurisdiction: "US",
      },
      select: { id: true },
    });
    await tx.entityIdentifier.create({
      data: {
          id: `eid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        entityId: entity.id,
        sourceSystemId: FEC_SOURCE_SYSTEM_ID,
        identifierType: "fec_committee_id",
        identifierValue: committee.committee_id,
        isPrimary: true,
      },
    });
    idMap.set(committee.committee_id, entity.id);
  }

  return idMap;
}

export async function persistPoliticalCandidateBatch(
  candidates: FECCandidate[],
  sourceUpdatedAt: Date | null
) {
  if (candidates.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(async (tx) => {
    const entityMap = await ensurePoliticalCandidateEntities(tx, candidates);
    let inserted = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const entityId = entityMap.get(candidate.candidate_id);
      if (!entityId) throw new Error(`Missing candidate entity ${candidate.candidate_id}`);

      // Use bioguideId as the unique identifier for PoliticalCandidateProfile
      const existing = await tx.politicalCandidateProfile.findUnique({
        where: { bioguideId: candidate.candidate_id },
        select: { id: true },
      });

      await tx.canonicalEntity.update({
        where: { id: entityId },
        data: {
          displayName: candidate.name,
          normalizedName: normalizeEntityName(candidate.name),
          stateCode: candidate.state ?? undefined,
          latestSourceUpdatedAt: sourceUpdatedAt ?? undefined,
          lastSeenAt: new Date(),
        },
      });

      const nameParts = candidate.name.split(" ");
      const lastName = nameParts.pop() ?? "";
      const firstName = nameParts.join(" ") || "Unknown";

      await tx.politicalCandidateProfile.upsert({
        where: { bioguideId: candidate.candidate_id },
        update: {
          party: candidate.party ?? "Unknown",
          office: candidate.office ?? undefined,
          state: candidate.state ?? "XX",
          district: candidate.district ?? undefined,
          fullName: candidate.name,
          lastName,
          firstName,
        },
        create: {
          sourceSystemId: FEC_SOURCE_SYSTEM_ID,
          bioguideId: candidate.candidate_id,
          party: candidate.party ?? "Unknown",
          office: candidate.office ?? undefined,
          state: candidate.state ?? "XX",
          district: candidate.district ?? undefined,
          fullName: candidate.name,
          lastName,
          firstName,
        },
      });

      if (existing) updated++;
      else inserted++;
    }

    return { inserted, updated };
  }, { timeout: 120_000 });
}

export async function persistPoliticalCommitteeBatch(
  committees: FECCommittee[],
  sourceUpdatedAt: Date | null
) {
  if (committees.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(async (tx) => {
    const entityMap = await ensurePoliticalCommitteeEntities(tx, committees);
    let inserted = 0;
    let updated = 0;

    for (const committee of committees) {
      const entityId = entityMap.get(committee.committee_id);
      if (!entityId) throw new Error(`Missing committee entity ${committee.committee_id}`);

      const existing = await tx.politicalCommitteeProfile.findUnique({
        where: { committeeId: committee.committee_id },
        select: { id: true },
      });

      await tx.canonicalEntity.update({
        where: { id: entityId },
        data: {
          displayName: committee.name,
          normalizedName: normalizeEntityName(committee.name),
          stateCode: committee.state ?? undefined,
          latestSourceUpdatedAt: sourceUpdatedAt ?? undefined,
          lastSeenAt: new Date(),
        },
      });

      await tx.politicalCommitteeProfile.upsert({
        where: { committeeId: committee.committee_id },
        update: {
          entityId,
          committeeTypeFull: committee.committee_type_full ?? undefined,
          committeeType: committee.committee_type ?? undefined,
          designationFull: committee.designation_full ?? undefined,
          partyFull: committee.party_full ?? undefined,
          state: committee.state ?? undefined,
          treasurerName: committee.treasurer_name ?? undefined,
          candidateIds: committee.candidate_ids ?? [],
          cycles: uniqueCycles(committee.cycles),
          organizationTypeFull: committee.organization_type_full ?? undefined,
        },
        create: {
          sourceSystemId: FEC_SOURCE_SYSTEM_ID,
          entityId,
          committeeId: committee.committee_id,
          committeeTypeFull: committee.committee_type_full ?? undefined,
          committeeType: committee.committee_type ?? undefined,
          designationFull: committee.designation_full ?? undefined,
          partyFull: committee.party_full ?? undefined,
          state: committee.state ?? undefined,
          treasurerName: committee.treasurer_name ?? undefined,
          candidateIds: committee.candidate_ids ?? [],
          cycles: uniqueCycles(committee.cycles),
          organizationTypeFull: committee.organization_type_full ?? undefined,
        },
      });

      if (existing) updated++;
      else inserted++;
    }

    return { inserted, updated };
  }, { timeout: 120_000 });
}

export async function persistPoliticalTotals(params: {
  entityId: string;
  ownerType: "candidate" | "committee";
  totals: FECTotals[];
  sourceUpdatedAt?: Date | null;
}) {
  if (params.totals.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(async (tx) => {
    let inserted = 0;
    let updated = 0;

    for (const totals of params.totals) {
      const sourceRecordKey = `${params.ownerType}:${params.entityId}:${totals.cycle}`;
      const existing = await tx.politicalCycleSummary.findUnique({
        where: { sourceRecordKey },
        select: { id: true },
      });

      await tx.politicalCycleSummary.upsert({
        where: { sourceRecordKey },
        update: {
          entityId: params.entityId,
          ownerType: params.ownerType,
          cycle: totals.cycle,
          receipts: totals.receipts ?? undefined,
          disbursements: totals.disbursements ?? undefined,
          individualContributions: totals.individual_contributions ?? undefined,
          otherPoliticalCommitteeContributions:
            totals.other_political_committee_contributions ?? undefined,
          operatingExpenditures: totals.operating_expenditures ?? undefined,
          cashOnHandEndPeriod: totals.cash_on_hand_end_period ?? undefined,
          debtsOwedByCommittee: totals.debts_owed_by_committee ?? undefined,
          contributions: totals.contributions ?? undefined,
          lastReportYear: totals.last_report_year ?? undefined,
          sourceRecordUpdatedAt: params.sourceUpdatedAt ?? undefined,
        },
        create: {
          sourceSystemId: FEC_SOURCE_SYSTEM_ID,
          entityId: params.entityId,
          ownerType: params.ownerType,
          cycle: totals.cycle,
          sourceRecordKey,
          receipts: totals.receipts ?? undefined,
          disbursements: totals.disbursements ?? undefined,
          individualContributions: totals.individual_contributions ?? undefined,
          otherPoliticalCommitteeContributions:
            totals.other_political_committee_contributions ?? undefined,
          operatingExpenditures: totals.operating_expenditures ?? undefined,
          cashOnHandEndPeriod: totals.cash_on_hand_end_period ?? undefined,
          debtsOwedByCommittee: totals.debts_owed_by_committee ?? undefined,
          contributions: totals.contributions ?? undefined,
          lastReportYear: totals.last_report_year ?? undefined,
          sourceRecordUpdatedAt: params.sourceUpdatedAt ?? undefined,
        },
      });

      if (existing) updated++;
      else inserted++;
    }

    return { inserted, updated };
  }, { timeout: 120_000 });
}

export async function persistPoliticalTotalsBatch(params: {
  rows: Array<{
    identifierType: "fec_candidate_id" | "fec_committee_id";
    identifierValue: string;
    ownerType: "candidate" | "committee";
    totals: FECTotals;
  }>;
  sourceUpdatedAt?: Date | null;
}) {
  if (params.rows.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const identifierGroups = new Map<
    "fec_candidate_id" | "fec_committee_id",
    Set<string>
  >();
  for (const row of params.rows) {
    const existing = identifierGroups.get(row.identifierType) ?? new Set<string>();
    existing.add(row.identifierValue);
    identifierGroups.set(row.identifierType, existing);
  }

  const [candidateIdentifiers, committeeIdentifiers] = await Promise.all([
    identifierGroups.has("fec_candidate_id")
      ? prisma.entityIdentifier.findMany({
        where: {
          identifierType: "fec_candidate_id",
          identifierValue: {
            in: Array.from(identifierGroups.get("fec_candidate_id") ?? []),
          },
          entity: { categoryId: "political" },
        },
        select: { identifierValue: true, entityId: true },
      })
      : Promise.resolve([]),
    identifierGroups.has("fec_committee_id")
      ? prisma.entityIdentifier.findMany({
        where: {
          identifierType: "fec_committee_id",
          identifierValue: {
            in: Array.from(identifierGroups.get("fec_committee_id") ?? []),
          },
          entity: { categoryId: "political" },
        },
        select: { identifierValue: true, entityId: true },
      })
      : Promise.resolve([]),
  ]);

  const entityIds = new Map<string, string>();
  for (const row of candidateIdentifiers) {
    entityIds.set(`fec_candidate_id:${row.identifierValue}`, row.entityId);
  }
  for (const row of committeeIdentifiers) {
    entityIds.set(`fec_committee_id:${row.identifierValue}`, row.entityId);
  }

  return prisma.$transaction(async (tx) => {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of params.rows) {
      const entityId = entityIds.get(
        `${row.identifierType}:${row.identifierValue}`
      );
      if (!entityId) {
        skipped++;
        continue;
      }

      const sourceRecordKey = `${row.ownerType}:${entityId}:${row.totals.cycle}`;
      const existing = await tx.politicalCycleSummary.findUnique({
        where: { sourceRecordKey },
        select: { id: true },
      });

      await tx.politicalCycleSummary.upsert({
        where: { sourceRecordKey },
        update: {
          entityId,
          ownerType: row.ownerType,
          cycle: row.totals.cycle,
          receipts: row.totals.receipts ?? undefined,
          disbursements: row.totals.disbursements ?? undefined,
          individualContributions: row.totals.individual_contributions ?? undefined,
          otherPoliticalCommitteeContributions:
            row.totals.other_political_committee_contributions ?? undefined,
          operatingExpenditures: row.totals.operating_expenditures ?? undefined,
          cashOnHandEndPeriod: row.totals.cash_on_hand_end_period ?? undefined,
          debtsOwedByCommittee: row.totals.debts_owed_by_committee ?? undefined,
          contributions: row.totals.contributions ?? undefined,
          lastReportYear: row.totals.last_report_year ?? undefined,
          sourceRecordUpdatedAt: params.sourceUpdatedAt ?? undefined,
        },
        create: {
          sourceSystemId: FEC_SOURCE_SYSTEM_ID,
          entityId,
          ownerType: row.ownerType,
          cycle: row.totals.cycle,
          sourceRecordKey,
          receipts: row.totals.receipts ?? undefined,
          disbursements: row.totals.disbursements ?? undefined,
          individualContributions: row.totals.individual_contributions ?? undefined,
          otherPoliticalCommitteeContributions:
            row.totals.other_political_committee_contributions ?? undefined,
          operatingExpenditures: row.totals.operating_expenditures ?? undefined,
          cashOnHandEndPeriod: row.totals.cash_on_hand_end_period ?? undefined,
          debtsOwedByCommittee: row.totals.debts_owed_by_committee ?? undefined,
          contributions: row.totals.contributions ?? undefined,
          lastReportYear: row.totals.last_report_year ?? undefined,
          sourceRecordUpdatedAt: params.sourceUpdatedAt ?? undefined,
        },
      });

      if (existing) updated++;
      else inserted++;
    }

    return { inserted, updated, skipped };
  }, { timeout: 120_000 });
}

export function parsePoliticalSourceUpdatedAt(value?: string | null): Date | null {
  return parseOptionalDate(value ?? null);
}
