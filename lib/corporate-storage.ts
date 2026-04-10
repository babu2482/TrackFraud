import { prisma } from "@/lib/db";
import type {
  EDGARCompanyFacts,
  EDGARFiling,
  EDGARSubmissions,
  EDGARTickerEntry,
} from "@/lib/sec";
import { normalizeEntityName } from "@/lib/warehouse";

export const SEC_SOURCE_SYSTEM_ID = "sec_edgar";

async function ensureCorporateEntities(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  companies: Array<{ cik: string; name: string; ticker?: string }>
) {
  const ciks = companies.map((company) => company.cik);
  const existing = await tx.entityIdentifier.findMany({
    where: {
      identifierType: "sec_cik",
      identifierValue: { in: ciks },
      entity: { categoryId: "corporate" },
    },
    select: { identifierValue: true, entityId: true },
  });
  const cikToEntityId = new Map(
    existing.map((row) => [row.identifierValue, row.entityId] as const)
  );

  for (const company of companies) {
    if (cikToEntityId.has(company.cik)) continue;
    const entity = await tx.canonicalEntity.create({
      data: {
        categoryId: "corporate",
        displayName: company.name,
        normalizedName: normalizeEntityName(company.name),
        entityType: "company",
        status: "active",
        primaryJurisdiction: "US",
        countryCode: "US",
      },
      select: { id: true },
    });
    await tx.entityIdentifier.create({
      data: {
        entityId: entity.id,
        sourceSystemId: SEC_SOURCE_SYSTEM_ID,
        identifierType: "sec_cik",
        identifierValue: company.cik,
        isPrimary: true,
      },
    });
    if (company.ticker) {
      await tx.entityIdentifier.create({
        data: {
          entityId: entity.id,
          sourceSystemId: SEC_SOURCE_SYSTEM_ID,
          identifierType: "sec_ticker",
          identifierValue: company.ticker,
        },
      });
    }
    cikToEntityId.set(company.cik, entity.id);
  }

  return cikToEntityId;
}

export async function persistCorporateTickerUniverse(
  entries: EDGARTickerEntry[],
  sourceUpdatedAt: Date | null
) {
  if (entries.length === 0) return { inserted: 0, updated: 0 };

  return prisma.$transaction(async (tx) => {
    const companies = entries.map((entry) => ({
      cik: String(entry.cik_str).padStart(10, "0"),
      name: entry.title,
      ticker: entry.ticker,
    }));
    const entityMap = await ensureCorporateEntities(tx, companies);
    let inserted = 0;
    let updated = 0;

    for (const company of companies) {
      const entityId = entityMap.get(company.cik);
      if (!entityId) throw new Error(`Missing corporate entity ${company.cik}`);

      const existing = await tx.corporateCompanyProfile.findUnique({
        where: { cik: company.cik },
        select: { id: true },
      });

      await tx.canonicalEntity.update({
        where: { id: entityId },
        data: {
          displayName: company.name,
          normalizedName: normalizeEntityName(company.name),
          latestSourceUpdatedAt: sourceUpdatedAt ?? undefined,
          lastSeenAt: new Date(),
        },
      });

      await tx.corporateCompanyProfile.upsert({
        where: { cik: company.cik },
        update: {
          entityId,
          tickers: { set: company.ticker ? [company.ticker] : [] },
        },
        create: {
          sourceSystemId: SEC_SOURCE_SYSTEM_ID,
          entityId,
          cik: company.cik,
          tickers: company.ticker ? [company.ticker] : [],
          exchanges: [],
        },
      });

      if (existing) updated++;
      else inserted++;
    }

    return { inserted, updated };
  }, { timeout: 120_000 });
}

export async function persistCorporateSubmissions(
  submissions: EDGARSubmissions,
  sourceUpdatedAt: Date | null
) {
  const cik = submissions.cik.replace(/^0+/, "").padStart(10, "0");
  return prisma.$transaction(async (tx) => {
    const entityMap = await ensureCorporateEntities(tx, [
      {
        cik,
        name: submissions.name,
        ticker: submissions.tickers?.[0],
      },
    ]);
    const entityId = entityMap.get(cik)!;

    await tx.corporateCompanyProfile.upsert({
      where: { cik },
      update: {
        entityId,
        entityType: submissions.entityType ?? undefined,
        sic: submissions.sic ?? undefined,
        sicDescription: submissions.sicDescription ?? undefined,
        tickers: { set: (submissions.tickers ?? []).filter((e): e is string => e != null) },
        exchanges: { set: (submissions.exchanges ?? []).filter((e): e is string => e != null) },
        stateOfIncorporation: submissions.stateOfIncorporation ?? undefined,
        fiscalYearEnd: submissions.fiscalYearEnd ?? undefined,
      },
      create: {
        sourceSystemId: SEC_SOURCE_SYSTEM_ID,
        entityId,
        cik,
        entityType: submissions.entityType ?? undefined,
        sic: submissions.sic ?? undefined,
        sicDescription: submissions.sicDescription ?? undefined,
        tickers: (submissions.tickers ?? []).filter((e): e is string => e != null),
        exchanges: (submissions.exchanges ?? []).filter((e): e is string => e != null),
        stateOfIncorporation: submissions.stateOfIncorporation ?? undefined,
        fiscalYearEnd: submissions.fiscalYearEnd ?? undefined,
      },
    });

    const filings: EDGARFiling[] = submissions.filings?.recent
      ? submissions.filings.recent.accessionNumber.map((accessionNumber, index) => ({
          accessionNumber,
          filingDate: submissions.filings!.recent!.filingDate[index],
          reportDate: submissions.filings!.recent!.reportDate[index],
          form: submissions.filings!.recent!.form[index],
          primaryDocument: submissions.filings!.recent!.primaryDocument[index],
          primaryDocDescription:
            submissions.filings!.recent!.primaryDocDescription[index],
        }))
      : [];

    let inserted = 0;
    let updated = 0;
    for (const filing of filings) {
      const existing = await tx.corporateFilingRecord.findUnique({
        where: { accessionNumber: filing.accessionNumber },
        select: { id: true },
      });
      await tx.corporateFilingRecord.upsert({
        where: { accessionNumber: filing.accessionNumber },
        update: {
          entityId,
          filingDate: filing.filingDate ? new Date(filing.filingDate) : undefined,
          reportDate: filing.reportDate ? new Date(filing.reportDate) : undefined,
          form: filing.form,
          primaryDocument: filing.primaryDocument ?? undefined,
          primaryDocDescription: filing.primaryDocDescription ?? undefined,
        },
        create: {
          sourceSystemId: SEC_SOURCE_SYSTEM_ID,
          entityId,
          accessionNumber: filing.accessionNumber,
          filingDate: filing.filingDate ? new Date(filing.filingDate) : undefined,
          reportDate: filing.reportDate ? new Date(filing.reportDate) : undefined,
          form: filing.form,
          primaryDocument: filing.primaryDocument ?? undefined,
          primaryDocDescription: filing.primaryDocDescription ?? undefined,
        },
      });
      if (existing) updated++;
      else inserted++;
    }

    await tx.canonicalEntity.update({
      where: { id: entityId },
      data: {
        displayName: submissions.name,
        normalizedName: normalizeEntityName(submissions.name),
        latestSourceUpdatedAt: sourceUpdatedAt ?? undefined,
        lastSeenAt: new Date(),
      },
    });

    return { entityId, inserted, updated };
  }, { timeout: 120_000 });
}

export async function persistCorporateCompanyFacts(
  cik: string,
  facts: EDGARCompanyFacts,
  sourceUpdatedAt: Date | null
) {
  const normalizedCik = cik.replace(/^0+/, "").padStart(10, "0");
  const identifier = await prisma.entityIdentifier.findFirst({
    where: {
      identifierType: "sec_cik",
      identifierValue: normalizedCik,
      entity: { categoryId: "corporate" },
    },
    select: { entityId: true },
  });
  if (!identifier) {
    throw new Error(`Missing corporate entity for CIK ${normalizedCik}`);
  }

  await prisma.corporateCompanyFactsSnapshot.upsert({
    where: { entityId: identifier.entityId },
    update: {
      factsJson: facts as unknown as object,
      sourceUpdatedAt: sourceUpdatedAt ?? undefined,
    },
    create: {
      sourceSystemId: SEC_SOURCE_SYSTEM_ID,
      entityId: identifier.entityId,
      factsJson: facts as unknown as object,
      sourceUpdatedAt: sourceUpdatedAt ?? undefined,
    },
  });
}
