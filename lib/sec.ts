const EDGAR_BASE = "https://efts.sec.gov/LATEST";
const EDGAR_DATA = "https://data.sec.gov";
const EDGAR_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const USER_AGENT = "TrackFraud/1.0 (trackfraud.com)";

async function edgarFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC EDGAR ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface EDGARCompanyMatch {
  cik: string;
  entity_name: string;
  ticker?: string;
  exchange?: string;
}

export interface EDGARFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  form: string;
  primaryDocument?: string;
  primaryDocDescription?: string;
}

export interface EDGARCompanyFacts {
  cik: number;
  entityName: string;
  facts?: {
    "us-gaap"?: Record<string, { label: string; units: Record<string, { val: number; fy: number; fp: string; end: string }[]> }>;
  };
}

export interface EDGARSubmissions {
  cik: string;
  entityType?: string;
  name: string;
  sic?: string;
  sicDescription?: string;
  tickers?: string[];
  exchanges?: string[];
  stateOfIncorporation?: string;
  fiscalYearEnd?: string;
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export interface EDGARTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

export async function getCompanyTickers(): Promise<Record<string, EDGARTickerEntry>> {
  return edgarFetch<Record<string, EDGARTickerEntry>>(EDGAR_TICKERS_URL);
}

export async function searchCompanies(q: string): Promise<EDGARCompanyMatch[]> {
  const url = `${EDGAR_BASE}/search-index?q=${encodeURIComponent(q)}&dateRange=custom&startdt=2020-01-01&forms=10-K,10-Q,8-K&from=0&size=20`;
  try {
    const data = await edgarFetch<{ hits?: { hits?: { _source: { entity_name: string; file_num: string; period_of_report: string; form_type: string } }[] } }>(url);
    const seen = new Map<string, EDGARCompanyMatch>();
    for (const hit of data.hits?.hits ?? []) {
      const name = hit._source.entity_name;
      if (!seen.has(name)) {
        seen.set(name, { cik: "", entity_name: name });
      }
    }
    return Array.from(seen.values());
  } catch {
    // Fallback to company tickers endpoint
    return searchCompanyTickers(q);
  }
}

async function searchCompanyTickers(q: string): Promise<EDGARCompanyMatch[]> {
  const data = await getCompanyTickers();
  const needle = q.toLowerCase();
  const results: EDGARCompanyMatch[] = [];
  for (const entry of Object.values(data)) {
    if (
      entry.title.toLowerCase().includes(needle) ||
      entry.ticker.toLowerCase().includes(needle)
    ) {
      results.push({
        cik: String(entry.cik_str).padStart(10, "0"),
        entity_name: entry.title,
        ticker: entry.ticker,
      });
      if (results.length >= 20) break;
    }
  }
  return results;
}

export async function getCompanySubmissions(cik: string): Promise<EDGARSubmissions> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  return edgarFetch<EDGARSubmissions>(`${EDGAR_DATA}/submissions/CIK${paddedCik}.json`);
}

export async function getCompanyFacts(cik: string): Promise<EDGARCompanyFacts> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  return edgarFetch<EDGARCompanyFacts>(
    `${EDGAR_DATA}/api/xbrl/companyfacts/CIK${paddedCik}.json`
  );
}

export function extractRecentFilings(submissions: EDGARSubmissions, limit = 20): EDGARFiling[] {
  const recent = submissions.filings?.recent;
  if (!recent) return [];
  const count = Math.min(recent.accessionNumber.length, limit);
  const filings: EDGARFiling[] = [];
  for (let i = 0; i < count; i++) {
    filings.push({
      accessionNumber: recent.accessionNumber[i],
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      form: recent.form[i],
      primaryDocument: recent.primaryDocument[i],
      primaryDocDescription: recent.primaryDocDescription[i],
    });
  }
  return filings;
}
