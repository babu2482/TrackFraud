import { prisma } from "../lib/db";
import { getAllCategories } from "../lib/categories";
import {
  assessConsumerMirror,
  assessCorporateMirror,
  assessGovernmentMirror,
  assessHealthcareMirror,
  assessPoliticalMirror,
} from "../lib/mirror-readiness";

async function main() {
  // Categories from config (single source of truth: lib/categories.ts)
  const categories = getAllCategories().map((c) => ({
    id: c.slug,
    name: c.name,
  }));

  const [sourceSystems, counts] = await Promise.all([
    prisma.sourceSystem.findMany({
      orderBy: [{ categoryId: "asc" }, { name: "asc" }],
      select: {
        id: true,
        categoryId: true,
        name: true,
        lastAttemptedSyncAt: true,
        lastSuccessfulSyncAt: true,
        lastError: true,
      },
    }),
    Promise.all([
      prisma.consumerComplaintRecord.count(),
      prisma.consumerCompanySummary.count(),
      prisma.healthcarePaymentRecord.count(),
      prisma.healthcareRecipientProfile.count(),
      prisma.politicalCandidateProfile.count(),
      prisma.politicalCommitteeProfile.count(),
      prisma.politicalCycleSummary.count(),
      prisma.governmentAwardRecord.count(),
      prisma.corporateCompanyProfile.count(),
      prisma.corporateFilingRecord.count(),
      prisma.corporateCompanyFactsSnapshot.count(),
    ]),
  ]);

  const [
    consumerComplaints,
    consumerSummaries,
    healthcarePayments,
    healthcareRecipients,
    politicalCandidates,
    politicalCommittees,
    politicalSummaries,
    governmentAwards,
    corporateProfiles,
    corporateFilings,
    corporateFacts,
  ] = counts;

  const consumerMirror = assessConsumerMirror({
    complaints: consumerComplaints,
    companySummaries: consumerSummaries,
  });
  const healthcareMirror = assessHealthcareMirror({
    payments: healthcarePayments,
    recipients: healthcareRecipients,
  });
  const politicalMirror = assessPoliticalMirror({
    candidates: politicalCandidates,
    committees: politicalCommittees,
    cycleSummaries: politicalSummaries,
  });
  const governmentMirror = assessGovernmentMirror({
    awards: governmentAwards,
  });
  const corporateMirror = assessCorporateMirror({
    profiles: corporateProfiles,
    filings: corporateFilings,
    facts: corporateFacts,
  });

  const categoryStatus = {
    consumer: {
      recordCounts: {
        complaints: consumerComplaints,
        companySummaries: consumerSummaries,
      },
      mirrorCoverage: consumerMirror.coverage,
      safeToCutOver: consumerMirror.ready,
    },
    healthcare: {
      recordCounts: {
        payments: healthcarePayments,
        recipients: healthcareRecipients,
      },
      mirrorCoverage: healthcareMirror.coverage,
      safeToCutOver: healthcareMirror.ready,
    },
    political: {
      recordCounts: {
        candidates: politicalCandidates,
        committees: politicalCommittees,
        cycleSummaries: politicalSummaries,
      },
      mirrorCoverage: politicalMirror.coverage,
      safeToCutOver: politicalMirror.ready,
    },
    government: {
      recordCounts: {
        awards: governmentAwards,
      },
      mirrorCoverage: governmentMirror.coverage,
      safeToCutOver: governmentMirror.ready,
    },
    corporate: {
      recordCounts: {
        profiles: corporateProfiles,
        filings: corporateFilings,
        facts: corporateFacts,
      },
      mirrorCoverage: corporateMirror.coverage,
      safeToCutOver: corporateMirror.ready,
    },
  };

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        categories,
        categoryStatus,
        sourceSystems,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
