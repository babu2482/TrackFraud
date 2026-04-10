/**
 * Political Data Read Operations
 * 
 * Provides read access to political candidate and committee data from local database.
 */

import { prisma } from "@/lib/db";
import type {
  FECCandidate,
  FECCommittee,
  FECTotals,
} from "@/lib/fec";
import { buildPoliticalSignals } from "@/lib/political-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { assessPoliticalMirror } from "@/lib/mirror-readiness";
import { resolveMirrorFreshness } from "@/lib/mirror-metadata";
import { withMirrorMetadata } from "@/lib/warehouse";

const FEC_SOURCE_SYSTEM_ID = "fec_api";
const PAGE_SIZE = 20;

// Convert PoliticalCandidateProfile to FECCandidate format
function toCandidate(profile: {
  id: string;
  bioguideId: string;
  fullName: string;
  firstName?: string | null;
  lastName: string;
  party: string;
  office?: string | null;
  state: string;
  district?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FECCandidate {
  return {
    candidate_id: profile.bioguideId,
    name: profile.fullName,
    party_full: undefined,
    party: profile.party,
    office_full: undefined,
    office: profile.office ?? undefined,
    state: profile.state,
    district: profile.district ?? undefined,
    incumbent_challenge_full: undefined,
    candidate_status: undefined,
    election_years: [],
    federal_funds_flag: undefined,
    has_raised_funds: undefined,
    cycles: [],
  };
}

// Convert PoliticalCommitteeProfile to FECCommittee format
function toCommittee(profile: {
  id: string;
  entityId: string;
  committeeId: string;
  committeeTypeFull?: string | null;
  committeeType?: string | null;
  designationFull?: string | null;
  partyFull?: string | null;
  state?: string | null;
  treasurerName?: string | null;
  candidateIds: string[];
  cycles: number[];
  organizationTypeFull?: string | null;
  entity?: { displayName: string };
}): FECCommittee {
  return {
    committee_id: profile.committeeId,
    name: profile.entity?.displayName ?? `Committee ${profile.committeeId}`,
    committee_type_full: profile.committeeTypeFull ?? undefined,
    committee_type: profile.committeeType ?? undefined,
    designation_full: profile.designationFull ?? undefined,
    party_full: profile.partyFull ?? undefined,
    state: profile.state ?? undefined,
    treasurer_name: profile.treasurerName ?? undefined,
    candidate_ids: profile.candidateIds,
    cycles: profile.cycles,
    organization_type_full: profile.organizationTypeFull ?? undefined,
  };
}

// Convert PoliticalCycleSummary to FECTotals format
function toTotals(row: {
  cycle: number;
  receipts?: number | null;
  disbursements?: number | null;
  individualContributions?: number | null;
  otherPoliticalCommitteeContributions?: number | null;
  operatingExpenditures?: number | null;
  cashOnHandEndPeriod?: number | null;
  debtsOwedByCommittee?: number | null;
  contributions?: number | null;
  lastReportYear?: number | null;
}): FECTotals {
  return {
    cycle: row.cycle,
    receipts: row.receipts ?? undefined,
    disbursements: row.disbursements ?? undefined,
    individual_contributions: row.individualContributions ?? undefined,
    other_political_committee_contributions:
      row.otherPoliticalCommitteeContributions ?? undefined,
    operating_expenditures: row.operatingExpenditures ?? undefined,
    cash_on_hand_end_period: row.cashOnHandEndPeriod ?? undefined,
    debts_owed_by_committee: row.debtsOwedByCommittee ?? undefined,
    contributions: row.contributions ?? undefined,
    last_report_year: row.lastReportYear ?? undefined,
  };
}

async function currentPoliticalCoverage(): Promise<string> {
  return (await getLocalPoliticalMirrorStatus()).coverage;
}

export async function getLocalPoliticalMirrorStatus() {
  const [candidateCount, committeeCount, totalCount] = await Promise.all([
    prisma.politicalCandidateProfile.count(),
    prisma.politicalCommitteeProfile.count(),
    prisma.politicalCycleSummary.count(),
  ]);
  return assessPoliticalMirror({
    candidates: candidateCount,
    committees: committeeCount,
    cycleSummaries: totalCount,
  });
}

export async function hasLocalPoliticalMirror(): Promise<boolean> {
  return (await getLocalPoliticalMirrorStatus()).ready;
}

export async function searchStoredPoliticalEntities(params: {
  q: string;
  type: "candidates" | "committees";
  page?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const query = params.q;

  if (params.type === "committees") {
    const [results, total] = await Promise.all([
      prisma.politicalCommitteeProfile.findMany({
        where: {
          entity: {
            normalizedName: { contains: query.toLowerCase() },
          },
        },
        include: { entity: true },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.politicalCommitteeProfile.count({
        where: { entity: { normalizedName: { contains: query.toLowerCase() } } },
      }),
    ]);

    return withMirrorMetadata(
      {
        type: "committees" as const,
        results: results.map(toCommittee),
        pagination: {
          count: total,
          pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
          page,
          per_page: PAGE_SIZE,
        },
      },
      {
        dataSource: "local",
        sourceFreshnessAt: await resolveMirrorFreshness({
          sourceSystemId: FEC_SOURCE_SYSTEM_ID,
          observedDates: results.map((row) => row.updatedAt),
        }),
        mirrorCoverage: await currentPoliticalCoverage(),
      }
    );
  }

  // Search candidates by name fields (no entity relation on PoliticalCandidateProfile)
  const [results, total] = await Promise.all([
    prisma.politicalCandidateProfile.findMany({
      where: {
        OR: [
          { fullName: { contains: query } },
          { firstName: { contains: query } },
          { lastName: { contains: query } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.politicalCandidateProfile.count({
      where: {
        OR: [
          { fullName: { contains: query } },
          { firstName: { contains: query } },
          { lastName: { contains: query } },
        ],
      },
    }),
  ]);

  return withMirrorMetadata(
    {
      type: "candidates" as const,
      results: results.map(toCandidate),
      pagination: {
        count: total,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        page,
        per_page: PAGE_SIZE,
      },
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: FEC_SOURCE_SYSTEM_ID,
        observedDates: results.map((row) => row.updatedAt),
      }),
      mirrorCoverage: await currentPoliticalCoverage(),
    }
  );
}

export async function getStoredPoliticalCandidateDetail(bioguideId: string) {
  const profile = await prisma.politicalCandidateProfile.findUnique({
    where: { bioguideId },
  });
  if (!profile) return null;

  // Note: PoliticalCandidateProfile doesn't have direct cycle summary relation
  // Cycle summaries are linked via CanonicalEntity which is a many-to-many
  const totalsRows = await prisma.politicalCycleSummary.findMany({
    where: { ownerType: "candidate" },
    orderBy: { cycle: "desc" },
    take: 10,
  });
  const totals = totalsRows.map(toTotals);
  const latestTotals = totals[0];
  const riskSignals = latestTotals ? buildPoliticalSignals(latestTotals) : [];
  const riskScore = compositeScore(riskSignals);

  return withMirrorMetadata(
    {
      candidate: toCandidate(profile),
      totals,
      riskSignals,
      riskScore,
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: FEC_SOURCE_SYSTEM_ID,
        observedDates: totalsRows.map((row) => row.sourceRecordUpdatedAt),
      }),
      mirrorCoverage: await currentPoliticalCoverage(),
    }
  );
}

export async function getStoredPoliticalCommitteeDetail(committeeId: string) {
  const profile = await prisma.politicalCommitteeProfile.findUnique({
    where: { committeeId },
    include: { entity: true },
  });
  if (!profile) return null;

  const totalsRows = await prisma.politicalCycleSummary.findMany({
    where: { entityId: profile.entityId, ownerType: "committee" },
    orderBy: { cycle: "desc" },
  });
  const totals = totalsRows.map(toTotals);
  const latestTotals = totals[0];
  const riskSignals = latestTotals ? buildPoliticalSignals(latestTotals) : [];
  const riskScore = compositeScore(riskSignals);

  return withMirrorMetadata(
    {
      committee: toCommittee(profile),
      totals,
      riskSignals,
      riskScore,
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: FEC_SOURCE_SYSTEM_ID,
        observedDates: totalsRows.map((row) => row.sourceRecordUpdatedAt),
      }),
      mirrorCoverage: await currentPoliticalCoverage(),
    }
  );
}

export async function getStoredFlaggedPoliticalEntities() {
  const latestRows = await prisma.politicalCycleSummary.findMany({
    where: { ownerType: "committee" },
    orderBy: [{ cycle: "desc" }, { receipts: "desc" }],
    take: 50,
    include: { entity: { include: { politicalCommitteeProfile: true } } },
  });

  const results = latestRows
    .map((row) => {
      const riskSignals = buildPoliticalSignals(toTotals(row));
      const riskScore = compositeScore(riskSignals);
      const profile = row.entity.politicalCommitteeProfile;
      if (!profile || riskScore <= 0) return null;
      return {
        id: profile.committeeId,
        name: row.entity.displayName,
        type: profile.committeeTypeFull ?? undefined,
        party: profile.partyFull ?? undefined,
        state: profile.state ?? undefined,
        cycle: row.cycle,
        receipts: row.receipts ?? undefined,
        disbursements: row.disbursements ?? undefined,
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
        sourceSystemId: FEC_SOURCE_SYSTEM_ID,
        observedDates: latestRows.map((row) => row.sourceRecordUpdatedAt),
      }),
      mirrorCoverage: await currentPoliticalCoverage(),
    }
  );
}