import { prisma } from "@/lib/db";
import {
  buildCorporateSignals,
  computeCorporateMetrics,
} from "@/lib/corporate-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { assessCorporateMirror } from "@/lib/mirror-readiness";
import { resolveMirrorFreshness } from "@/lib/mirror-metadata";
import { normalizeEntityName, withMirrorMetadata } from "@/lib/warehouse";

const SEC_SOURCE_SYSTEM_ID = "sec_edgar";

async function currentCorporateCoverage(): Promise<string> {
  return (await getLocalCorporateMirrorStatus()).coverage;
}

export async function getLocalCorporateMirrorStatus() {
  const [profiles, filings, facts] = await Promise.all([
    prisma.corporateCompanyProfile.count(),
    prisma.corporateFilingRecord.count(),
    prisma.corporateCompanyFactsSnapshot.count(),
  ]);
  return assessCorporateMirror({ profiles, filings, facts });
}

export async function hasLocalCorporateMirror(): Promise<boolean> {
  return (await getLocalCorporateMirrorStatus()).ready;
}

export async function searchStoredCorporateCompanies(q: string) {
  const normalizedQuery = normalizeEntityName(q);
  const results = await prisma.corporateCompanyProfile.findMany({
    where: {
      OR: [
        { CanonicalEntity: { normalizedName: { contains: normalizedQuery } } },
        { cik: { contains: q } },
        {
          CanonicalEntity: {
            EntityIdentifier: {
              some: {
                identifierType: "sec_ticker",
                identifierValue: { contains: q.toUpperCase() },
              },
            },
          },
        },
      ],
    },
    include: { CanonicalEntity: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return withMirrorMetadata(
    {
      results: results.map((row) => ({
        cik: row.cik,
        entity_name: row.CanonicalEntity.displayName,
        ticker: row.tickers[0],
      })),
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: SEC_SOURCE_SYSTEM_ID,
        observedDates: results.map((row) => row.updatedAt),
      }),
      mirrorCoverage: await currentCorporateCoverage(),
    }
  );
}

export async function getStoredCorporateCompanyDetail(cik: string) {
  const normalizedCik = cik.replace(/^0+/, "").padStart(10, "0");
  const profile = await prisma.corporateCompanyProfile.findUnique({
    where: { cik: normalizedCik },
    include: { CanonicalEntity: true },
  });
  if (!profile) return null;

  const facts = await prisma.corporateCompanyFactsSnapshot.findUnique({
    where: { entityId: profile.entityId },
    select: { sourceUpdatedAt: true },
  });

  const filingsRows = await prisma.corporateFilingRecord.findMany({
    where: { entityId: profile.entityId },
    orderBy: [{ filingDate: "desc" }, { accessionNumber: "desc" }],
    take: 30,
  });
  const filings = filingsRows.map((row) => ({
    accessionNumber: row.accessionNumber,
    filingDate: row.filingDate?.toISOString().slice(0, 10) ?? "",
    reportDate: row.reportDate?.toISOString().slice(0, 10) ?? undefined,
    form: row.form,
    primaryDocument: row.primaryDocument ?? undefined,
    primaryDocDescription: row.primaryDocDescription ?? undefined,
  }));
  const riskSignals = buildCorporateSignals(filings);
  const riskScore = compositeScore(riskSignals);

  return withMirrorMetadata(
    {
      company: {
        cik: profile.cik,
        name: profile.CanonicalEntity.displayName,
        entityType: profile.entityType ?? undefined,
        sic: profile.sic ?? undefined,
        sicDescription: profile.sicDescription ?? undefined,
        tickers: profile.tickers,
        exchanges: profile.exchanges,
        stateOfIncorporation: profile.stateOfIncorporation ?? undefined,
        fiscalYearEnd: profile.fiscalYearEnd ?? undefined,
      },
      filings,
      riskSignals,
      riskScore,
    },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: SEC_SOURCE_SYSTEM_ID,
        observedDates: [
          profile.updatedAt,
          facts?.sourceUpdatedAt,
          ...filingsRows.map((row) => row.updatedAt),
        ],
      }),
      mirrorCoverage: await currentCorporateCoverage(),
    }
  );
}

export async function getStoredFlaggedCorporateCompanies() {
  const profiles = await prisma.corporateCompanyProfile.findMany({
    include: { CanonicalEntity: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const results = [];
  const observedDates: Array<Date | null> = [];
  for (const profile of profiles) {
    const filingsRows = await prisma.corporateFilingRecord.findMany({
      where: { entityId: profile.entityId },
      orderBy: [{ filingDate: "desc" }, { accessionNumber: "desc" }],
      take: 30,
    });
    const filings = filingsRows.map((row) => ({
      accessionNumber: row.accessionNumber,
      filingDate: row.filingDate?.toISOString().slice(0, 10) ?? "",
      reportDate: row.reportDate?.toISOString().slice(0, 10) ?? undefined,
      form: row.form,
      primaryDocument: row.primaryDocument ?? undefined,
      primaryDocDescription: row.primaryDocDescription ?? undefined,
    }));
    const riskSignals = buildCorporateSignals(filings);
    const riskScore = compositeScore(riskSignals);
    if (riskScore <= 0) continue;
    observedDates.push(...filingsRows.map((row) => row.updatedAt));
    results.push({
      cik: profile.cik,
      name: profile.CanonicalEntity.displayName,
      tickers: profile.tickers,
      riskSignals,
      riskScore,
    });
  }

  results.sort((left, right) => right.riskScore - left.riskScore);
  return withMirrorMetadata(
    { results, generatedAt: new Date().toISOString() },
    {
      dataSource: "local",
      sourceFreshnessAt: await resolveMirrorFreshness({
        sourceSystemId: SEC_SOURCE_SYSTEM_ID,
        observedDates,
      }),
      mirrorCoverage: await currentCorporateCoverage(),
    }
  );
}
