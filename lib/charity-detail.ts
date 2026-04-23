import { getOrganization } from "@/lib/api";
import { getCachedOrg, setCachedOrg } from "@/lib/cache";
import { getExternalCorroboration } from "@/lib/external-corroboration";
import { buildAllFilingFields } from "@/lib/filing-labels";
import {
  buildFraudMeter,
  computeCharityFraudBaseScore,
} from "@/lib/fraud-meter";
import {
  getExpenseBreakdown,
  getFundraisingEfficiency,
  getOverheadRatio,
  getPer100,
  getProgramExpenseRatio,
  getRevenueBreakdown,
} from "@/lib/metrics";
import { buildLegalClassification, buildRiskSignals } from "@/lib/signals";
import type {
  CharityDetail,
  CharityMetrics,
  ProPublicaFiling,
  ProPublicaOrganization,
} from "@/lib/types";

const PROPUBLICA_API_BASE =
  process.env.PROPUBLICA_API_BASE ??
  "https://projects.propublica.org/nonprofits/api/v2";

const NTEE_MAJOR: Record<string, string> = {
  "1": "Arts, Culture & Humanities",
  "2": "Education",
  "3": "Environment and Animals",
  "4": "Health",
  "5": "Human Services",
  "6": "International, Foreign Affairs",
  "7": "Public, Societal Benefit",
  "8": "Religion Related",
  "9": "Mutual/Membership Benefit",
  "10": "Unknown, Unclassified",
};

export interface ProPublicaOrgResponse {
  organization?: ProPublicaOrganization;
  filings_with_data?: ProPublicaFiling[];
  filings_without_data?: { tax_prd: number; tax_prd_yr: number }[];
}

export interface CharityComputationRecord {
  ein: string;
  organization: ProPublicaOrganization;
  filingsWithData: ProPublicaFiling[];
  latestFiling: ProPublicaFiling | null;
  detail: CharityDetail;
  sourceRecordUrl: string;
  sourceUpdatedAt: Date | null;
}

export function normalizeEin(ein: string): string {
  return ein.replace(/\D/g, "").padStart(9, "0");
}

export function isValidEin(ein: string): boolean {
  return /^\d{9}$/.test(ein) && !/^0{9}$/.test(ein);
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeLatestSourceUpdatedAt(
  organization: ProPublicaOrganization,
  latestFiling: ProPublicaFiling | null
): Date | null {
  const candidates = [parseDate(organization.updated), parseDate(latestFiling?.updated)].filter(
    (value): value is Date => value != null
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

function getNteeCategory(nteeCode?: string): string | undefined {
  const nteeMajor = nteeCode ? nteeCode.charAt(0) : "";
  const nteeMajorNum = nteeMajor.match(/\d/)
    ? parseInt(nteeMajor, 10)
    : nteeMajor.toUpperCase().charCodeAt(0) - 64;
  return nteeMajorNum >= 1 && nteeMajorNum <= 10
    ? NTEE_MAJOR[String(nteeMajorNum)]
    : NTEE_MAJOR[nteeCode?.slice(0, 1) ?? ""] ?? undefined;
}

export function buildCharityMetrics(filing: ProPublicaFiling): CharityMetrics {
  const revenue = getRevenueBreakdown(filing);
  const expenses = getExpenseBreakdown(filing);
  const programRatio = getProgramExpenseRatio(filing);
  const overheadRatio = getOverheadRatio(filing);
  const per100 = getPer100(filing);
  const fundraisingEff = getFundraisingEfficiency(filing);
  const compPct = filing.pct_compnsatncurrofcr ?? null;

  return {
    filingYear: filing.tax_prd_yr,
    taxPeriod: filing.tax_prd,
    revenue,
    expenses,
    programExpenseRatio: programRatio,
    overheadRatio,
    per100,
    fundraisingEfficiency: fundraisingEff,
    compensationPct: compPct,
    assets: filing.totassetsend ?? undefined,
    liabilities: filing.totliabend ?? undefined,
    pdfUrl: filing.pdf_url,
    guidestarUrl: undefined,
  };
}

export async function loadCharityComputation(
  rawEin: string
): Promise<CharityComputationRecord> {
  const ein = normalizeEin(rawEin);
  if (!isValidEin(ein)) {
    throw new Error("Invalid EIN");
  }

  let data = getCachedOrg(ein) as ProPublicaOrgResponse | null;
  if (!data) {
    data = (await getOrganization(ein)) as ProPublicaOrgResponse;
    setCachedOrg(ein, data);
  }

  const organization = data.organization;
  if (!organization || organization.ein === 0) {
    throw new Error("Organization not found");
  }

  const filingsWithData = data.filings_with_data ?? [];
  const filingsWithoutData = data.filings_without_data ?? [];
  const sorted = [...filingsWithData].sort(
    (a, b) => (b.tax_prd ?? 0) - (a.tax_prd ?? 0)
  );
  const latestFiling = sorted[0] ?? null;
  const latest = latestFiling ? buildCharityMetrics(latestFiling) : null;

  const subsectionCode =
    typeof organization.subseccd === "number"
      ? organization.subseccd
      : typeof organization.subsection_code === "number"
        ? organization.subsection_code
        : undefined;

  const legalClassification = buildLegalClassification({
    subsectionCode,
    formType:
      typeof latestFiling?.formtype === "number"
        ? latestFiling.formtype
        : undefined,
  });

  const riskSignals = latest
    ? buildRiskSignals({
        programExpenseRatio: latest.programExpenseRatio,
        fundraisingEfficiency: latest.fundraisingEfficiency,
        compensationPct: latest.compensationPct,
      })
    : [];

  const externalCorroboration = await getExternalCorroboration({
    ein,
    organizationName: organization.name,
  }).catch(() => []);

  const charityBaseScore = latest
    ? computeCharityFraudBaseScore({
        programExpenseRatio: latest.programExpenseRatio,
        fundraisingEfficiency: latest.fundraisingEfficiency,
        compensationPct: latest.compensationPct,
      })
    : 0;

  const fraudMeter = buildFraudMeter({
    domain: "charities",
    riskSignals,
    externalCorroboration,
    baseScore: charityBaseScore,
    baseSummary:
      charityBaseScore > 0
        ? "This organization shows rising fraud pressure from its spending mix, fundraising cost, and officer pay levels, even though the hard alert thresholds are not all crossed."
        : undefined,
  });

  const guidestarUrl = organization.guidestar_url;
  if (latest) {
    latest.guidestarUrl = guidestarUrl;
  }

  const otherYears = sorted.slice(1).map((filing) => ({
    year: filing.tax_prd_yr,
    taxPeriod: filing.tax_prd,
  }));

  for (const filing of filingsWithoutData) {
    if (filing.tax_prd_yr && filing.tax_prd) {
      otherYears.push({ year: filing.tax_prd_yr, taxPeriod: filing.tax_prd });
    }
  }
  otherYears.sort((a, b) => b.taxPeriod - a.taxPeriod);

  const detail: CharityDetail = {
    ein: organization.strein ?? String(organization.ein).padStart(9, "0"),
    name: organization.name ?? "Unknown",
    subName: organization.sub_name,
    address: organization.address,
    city: organization.city,
    state: organization.state,
    zipcode: organization.zipcode,
    nteeCode: organization.ntee_code,
    nteeCategory: getNteeCategory(organization.ntee_code),
    guidestarUrl,
    latest,
    otherYears: otherYears.slice(0, 10),
    allFilingFields: latestFiling
      ? buildAllFilingFields(latestFiling as Record<string, unknown>)
      : undefined,
    legalClassification,
    riskSignals,
    externalCorroboration,
    fraudMeter,
  };

  return {
    ein,
    organization,
    filingsWithData: sorted,
    latestFiling,
    detail,
    sourceRecordUrl: `${PROPUBLICA_API_BASE}/organizations/${ein}.json`,
    sourceUpdatedAt: computeLatestSourceUpdatedAt(organization, latestFiling),
  };
}
