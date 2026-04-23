/**
 * Human-readable labels for Form 990 / ProPublica API field names.
 * Used for maximum transparency: show every reported value from the filing.
 * Sources: IRS SOI extract docs, Form 990 instructions, ProPublica API.
 */

export const FILING_FIELD_LABELS: Record<string, string> = {
  // Identification / period
  tax_prd: "Tax period (YYYYMM)",
  tax_prd_yr: "Filing year",
  formtype: "Form type (0=990, 1=990-EZ, 2=990-PF)",
  subseccd: "Subsection code (501(c) type)",
  unrelbusinccd: "Unrelated business income reported (Y/N)",

  // Revenue
  totrevenue: "Total revenue",
  totcntrbgfts: "Contributions and grants",
  totprgmrevnue: "Program service revenue",
  invstmntinc: "Investment income",
  txexmptbndsproceeds: "Tax-exempt bond proceeds",
  royaltsinc: "Royalty income",
  grsrntsreal: "Gross rents (real property)",
  grsrntsprsnl: "Gross rents (personal property)",
  rntlexpnsreal: "Rent expenses (real)",
  rntlexpnsprsnl: "Rent expenses (personal)",
  rntlincreal: "Rental income (real)",
  rntlincprsnl: "Rental income (personal)",
  netrntlinc: "Net rental income",
  grsalesecur: "Gross sales of securities",
  grsalesothr: "Gross sales of other assets",
  cstbasisecur: "Cost basis (securities)",
  cstbasisothr: "Cost basis (other)",
  gnlsecur: "Gains/losses (securities)",
  gnlsothr: "Gains/losses (other)",
  netgnls: "Net gains/losses",
  grsincfndrsng: "Gross fundraising income",
  lessdirfndrsng: "Less: direct fundraising expenses",
  netincfndrsng: "Net fundraising income",
  grsincgaming: "Gross gaming income",
  lessdirgaming: "Less: direct gaming expenses",
  netincgaming: "Net gaming income",
  grsalesinvent: "Gross sales of inventory",
  lesscstofgoods: "Less: cost of goods sold",
  netincsales: "Net inventory sales",
  miscrevtot11e: "Other revenue (line 11e)",
  initiationfees: "Initiation fees",
  grsrcptspublicuse: "Gross receipts for public use",
  grsincmembers: "Gross income from members",
  grsincother: "Gross income from other sources",

  // Expenses (total and key components)
  totfuncexpns: "Total functional expenses",
  compnsatncurrofcr: "Compensation of current officers, directors, trustees",
  othrsalwages: "Other salaries and wages",
  payrolltx: "Payroll taxes",
  profndraising: "Professional fundraising fees",

  // Assets and liabilities
  totassetsend: "Total assets (end of year)",
  totliabend: "Total liabilities (end of year)",
  totnetassetend: "Total net assets (end of year)",
  txexmptbndsend: "Tax-exempt bond debt (end)",
  secrdmrtgsend: "Secured mortgages (end)",
  unsecurednotesend: "Unsecured notes (end)",
  retainedearnend: "Retained earnings (end)",

  // Ratios / percentages
  pct_compnsatncurrofcr: "Compensation of officers/directors (% of expenses)",

  // Schedule / other codes
  nonpfrea: "Non-PF reason code",
  gftgrntsrcvd170: "Gifts and grants received (170 related)",
  txrevnuelevied170: "Tax revenue levied (170)",
  srvcsval170: "Services value (170)",
  grsinc170: "Gross income (170)",
  grsrcptsrelated170: "Gross receipts (related 170)",
  totgftgrntrcvd509: "Total gifts/grants received (509)",
  grsrcptsadmissn509: "Gross receipts admissions (509)",
  txrevnuelevied509: "Tax revenue levied (509)",
  srvcsval509: "Services value (509)",
  subtotsuppinc509: "Subtotal support (509)",
  totsupp509: "Total support (509)",
};

/** Keys we skip when building "all fields" (internal or redundant). */
const SKIP_KEYS = new Set([
  "ein",
  "updated",
  "pdf_url",
  "tax_pd",
]);

function getLabel(key: string): string {
  return FILING_FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Format a raw value for display. */
function formatValue(key: string, raw: unknown): string | number {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw === "string") return raw;
  if (typeof raw !== "number" || Number.isNaN(raw)) return String(raw);
  // Percentage (typically 0–1)
  if (key === "pct_compnsatncurrofcr" || key.startsWith("pct_")) {
    return `${(raw * 100).toFixed(2)}%`;
  }
  // Dollar amounts (integer cents not used in this extract; values are whole dollars)
  return raw;
}

export interface FilingFieldDisplay {
  key: string;
  label: string;
  value: string | number;
  raw?: number; // for sorting/filtering; only set for numeric
}

/**
 * Build a list of every field from a filing for display.
 * Only includes keys whose value is present (non-null/undefined).
 */
export function buildAllFilingFields(filing: Record<string, unknown>): FilingFieldDisplay[] {
  const out: FilingFieldDisplay[] = [];
  for (const key of Object.keys(filing)) {
    if (SKIP_KEYS.has(key)) continue;
    const raw = filing[key];
    if (raw === null || raw === undefined) continue;
    const value = formatValue(key, raw);
    out.push({
      key,
      label: getLabel(key),
      value,
      raw: typeof raw === "number" ? raw : undefined,
    });
  }
  // Sort: put well-known important ones first, then alphabetically by label
  const priority = ["totrevenue", "totfuncexpns", "totcntrbgfts", "totprgmrevnue", "totassetsend", "totliabend", "totnetassetend", "compnsatncurrofcr", "othrsalwages", "profndraising", "pct_compnsatncurrofcr"];
  out.sort((a, b) => {
    const ai = priority.indexOf(a.key);
    const bi = priority.indexOf(b.key);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.label.localeCompare(b.label);
  });
  return out;
}
