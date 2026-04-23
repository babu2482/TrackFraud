import { prisma } from "@/lib/db";
import {
  buildConsumerSignals,
  computeConsumerMetrics,
} from "@/lib/consumer-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { assessConsumerMirror } from "@/lib/mirror-readiness";
import { getSourceSystemFreshness, resolveMirrorFreshness } from "@/lib/mirror-metadata";
import type { CFPBComplaint } from "@/lib/cfpb";
import { normalizeEntityName, withMirrorMetadata } from "@/lib/warehouse";

const CFPB_SOURCE_SYSTEM_ID = "cfpb_consumer_complaints";
const PAGE_SIZE = 20;

export const CONSUMER_PROBE_COMPANIES = [
  "Wells Fargo",
  "Bank of America",
  "JPMorgan Chase",
  "Citibank",
  "Capital One",
  "Navient",
  "Equifax",
  "Experian",
  "TransUnion",
];

type ConsumerComplaintRow = {
  complaintId: string;
  dateReceived: Date | null;
  product: string | null;
  subProduct: string | null;
  issue: string | null;
  subIssue: string | null;
  state: string | null;
  zipCode: string | null;
  companyResponse: string | null;
  companyResponseToConsumer: string | null;
  timely: string | null;
  consumerDisputed: string | null;
  complaintWhatHappened: string | null;
  dateSentToCompany: Date | null;
  entity?: { displayName: string } | null;
};

function toComplaint(row: ConsumerComplaintRow): CFPBComplaint {
  return {
    complaint_id: Number.parseInt(row.complaintId, 10),
    date_received: row.dateReceived?.toISOString().slice(0, 10) ?? "",
    product: row.product ?? "",
    sub_product: row.subProduct ?? undefined,
    issue: row.issue ?? "",
    sub_issue: row.subIssue ?? undefined,
    company: row.entity?.displayName ?? "",
    state: row.state ?? undefined,
    zip_code: row.zipCode ?? undefined,
    company_response:
      row.companyResponseToConsumer ?? row.companyResponse ?? undefined,
    timely: row.timely ?? undefined,
    consumer_disputed: row.consumerDisputed ?? undefined,
    complaint_what_happened: row.complaintWhatHappened ?? undefined,
    date_sent_to_company:
      row.dateSentToCompany?.toISOString().slice(0, 10) ?? undefined,
  };
}

export async function hasLocalConsumerMirror(): Promise<boolean> {
  return (await getLocalConsumerMirrorStatus()).ready;
}

export async function getLocalConsumerMirrorStatus() {
  const [complaints, companySummaries] = await Promise.all([
    prisma.consumerComplaintRecord.count(),
    prisma.consumerCompanySummary.count(),
  ]);
  return assessConsumerMirror({ complaints, companySummaries });
}

async function currentConsumerMirrorCoverage(): Promise<string> {
  return (await getLocalConsumerMirrorStatus()).coverage;
}

export async function searchStoredConsumerComplaints(params: {
  q: string;
  page?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const normalizedQuery = normalizeEntityName(params.q);
  if (!normalizedQuery) {
    return withMirrorMetadata(
      {
        complaints: [] as CFPBComplaint[],
        total: 0,
        metrics: computeConsumerMetrics([]),
        riskSignals: [],
        riskScore: 0,
        page,
      },
      {
        dataSource: "local",
        sourceFreshnessAt: await getSourceSystemFreshness(CFPB_SOURCE_SYSTEM_ID),
        mirrorCoverage: await currentConsumerMirrorCoverage(),
      }
    );
  }

  const matchingEntities = await prisma.canonicalEntity.findMany({
    where: {
      categoryId: "consumer",
      OR: [
        { normalizedName: { contains: normalizedQuery } },
        {
          EntityIdentifier: {
            some: {
              identifierType: "consumer_company_name",
              identifierValue: { contains: normalizedQuery },
            },
          },
        },
      ],
    },
    select: { id: true },
    take: 50,
  });
  const entityIds = matchingEntities.map((entity) => entity.id);
  if (entityIds.length === 0) {
    return withMirrorMetadata(
      {
        complaints: [] as CFPBComplaint[],
        total: 0,
        metrics: computeConsumerMetrics([]),
        riskSignals: [],
        riskScore: 0,
        page,
      },
      {
        dataSource: "local",
        sourceFreshnessAt: await getSourceSystemFreshness(CFPB_SOURCE_SYSTEM_ID),
        mirrorCoverage: await currentConsumerMirrorCoverage(),
      }
    );
  }

  const where = { entityId: { in: entityIds } };
  const [rows, total, summaryMax, pageRows] = await Promise.all([
    prisma.consumerComplaintRecord.findMany({
      where,
      orderBy: [{ dateReceived: "desc" }, { complaintId: "desc" }],
      include: { CanonicalEntity: { select: { displayName: true } } },
    }),
    prisma.consumerComplaintRecord.count({ where }),
    prisma.consumerCompanySummary.findMany({
      where: { entityId: { in: entityIds } },
      select: { sourcePublishedAt: true, latestComplaintAt: true },
    }),
    prisma.consumerComplaintRecord.findMany({
      where,
      orderBy: [{ dateReceived: "desc" }, { complaintId: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { CanonicalEntity: { select: { displayName: true } } },
    }),
  ]);

  const allComplaints = rows.map(toComplaint);
  const complaints = pageRows.map(toComplaint);
  const metrics = computeConsumerMetrics(allComplaints);
  const riskSignals = buildConsumerSignals(allComplaints);
  const riskScore = compositeScore(riskSignals);

  return withMirrorMetadata(
    {
      complaints,
      total,
      metrics,
      riskSignals,
      riskScore,
      page,
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: CFPB_SOURCE_SYSTEM_ID,
        observedDates: summaryMax.flatMap((row) => [
          row.sourcePublishedAt,
          row.latestComplaintAt,
        ]),
      }),
      mirrorCoverage: await currentConsumerMirrorCoverage(),
    }
  );
}

export async function getStoredFlaggedConsumerCompanies() {
  const normalizedProbeNames = CONSUMER_PROBE_COMPANIES.map((name) =>
    normalizeEntityName(name)
  );
  const entities = await prisma.canonicalEntity.findMany({
    where: {
      categoryId: "consumer",
      EntityIdentifier: {
        some: {
          identifierType: "consumer_company_name",
          identifierValue: { in: normalizedProbeNames },
        },
      },
    },
    select: { id: true, displayName: true, normalizedName: true },
  });

  const results = [];
  let freshest: Date | null = await getSourceSystemFreshness(CFPB_SOURCE_SYSTEM_ID);
  for (const entity of entities) {
    const rows = await prisma.consumerComplaintRecord.findMany({
      where: { entityId: entity.id },
      orderBy: [{ dateReceived: "desc" }, { complaintId: "desc" }],
      take: 25,
      include: { CanonicalEntity: { select: { displayName: true } } },
    });
    const complaints = rows.map(toComplaint);
    const metrics = computeConsumerMetrics(complaints);
    const riskSignals = buildConsumerSignals(complaints);
    const riskScore = compositeScore(riskSignals);
    if (riskScore <= 0) continue;
    if (rows[0]?.dateReceived && (!freshest || rows[0].dateReceived > freshest)) {
      freshest = rows[0].dateReceived;
    }
    results.push({
      company: entity.displayName,
      total: complaints.length,
      metrics,
      riskSignals,
      riskScore,
    });
  }

  results.sort((left, right) => right.riskScore - left.riskScore);
  return withMirrorMetadata(
    {
      results,
      generatedAt: new Date().toISOString(),
    },
    {
      dataSource: "local",
      sourceFreshnessAt: freshest,
      mirrorCoverage: await currentConsumerMirrorCoverage(),
    }
  );
}
