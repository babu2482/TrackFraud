const CFPB_BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1";

export interface CFPBComplaint {
  complaint_id: number;
  date_received: string;
  product: string;
  sub_product?: string;
  issue: string;
  sub_issue?: string;
  company: string;
  state?: string;
  zip_code?: string;
  company_response?: string;
  timely?: string;
  consumer_disputed?: string;
  complaint_what_happened?: string;
  date_sent_to_company?: string;
}

export interface CFPBAggregation {
  key: string;
  doc_count: number;
}

export interface CFPBSearchResponse {
  hits: { total: { value: number }; hits: { _source: CFPBComplaint }[] };
  aggregations?: Record<string, { buckets: CFPBAggregation[] }>;
}

export async function searchComplaints(
  company: string,
  page = 1,
  size = 20
): Promise<CFPBSearchResponse> {
  const from = (page - 1) * size;
  const params = new URLSearchParams({
    field: "all",
    search_term: company,
    size: String(size),
    frm: String(from),
    sort: "created_date_desc",
  });

  const res = await fetch(`${CFPB_BASE}/?${params.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`CFPB ${res.status}: ${res.statusText}`);
  return res.json() as Promise<CFPBSearchResponse>;
}

export async function getCompanyAggregations(company: string): Promise<CFPBSearchResponse> {
  const params = new URLSearchParams({
    field: "all",
    search_term: company,
    size: "0",
    sort: "created_date_desc",
  });

  const res = await fetch(`${CFPB_BASE}/?${params.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`CFPB ${res.status}: ${res.statusText}`);
  return res.json() as Promise<CFPBSearchResponse>;
}
