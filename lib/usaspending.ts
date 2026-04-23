import * as https from "node:https";

const BASE = "https://api.usaspending.gov/api/v2";

// Use node:https directly to avoid undici HTTP/2 issues with this server.
function usaHttps<T>(path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: "api.usaspending.gov",
        path: `/api/v2${path}`,
        method: payload ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CharityProject/1.0",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`USASpending ${res.statusCode}: ${text.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (e) {
            reject(new Error(`USASpending JSON parse error: ${text.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function usaFetch<T>(path: string, body?: unknown): Promise<T> {
  return usaHttps<T>(path, body);
}

export interface SpendingAward {
  internal_id: number;
  generated_internal_id: string;
  Award_ID?: string;
  Recipient_Name?: string;
  Awarding_Agency?: string;
  Award_Amount?: number;
  Total_Outlays?: number;
  Description?: string;
  Start_Date?: string;
  End_Date?: string;
  Award_Type?: string;
  def_codes?: string[];
  COVID_Spending?: boolean;
}

export interface SpendingSearchResponse {
  spending_level: string;
  results: SpendingAward[];
  page_metadata: { page: number; hasNext: boolean; total: number };
}

export interface AwardDetail {
  id: number;
  generated_unique_award_id: string;
  type_description?: string;
  description?: string;
  period_of_performance_start_date?: string;
  period_of_performance_current_end_date?: string;
  total_obligation?: number;
  base_and_all_options_value?: number;
  recipient?: { recipient_name?: string; recipient_uei?: string; business_categories?: string[] };
  awarding_agency?: { toptier_agency?: { name?: string }; subtier_agency?: { name?: string } };
  funding_agency?: { toptier_agency?: { name?: string } };
  place_of_performance?: { city_name?: string; state_code?: string; country_name?: string };
  naics?: string;
  naics_description?: string;
  psc_code?: string;
  contract_data?: {
    type_of_contract_pricing_description?: string;
    extent_competed_description?: string;
    number_of_offers_received?: number;
  };
}

function mapAwardRow(
  row: Record<string, unknown> & { internal_id: number; generated_internal_id: string }
): SpendingAward {
  return {
    internal_id: row.internal_id,
    generated_internal_id: row.generated_internal_id,
    Award_ID: typeof row["Award ID"] === "string" ? row["Award ID"] : undefined,
    Recipient_Name:
      typeof row["Recipient Name"] === "string"
        ? row["Recipient Name"]
        : undefined,
    Awarding_Agency:
      typeof row["Awarding Agency"] === "string"
        ? row["Awarding Agency"]
        : undefined,
    Award_Amount:
      typeof row["Award Amount"] === "number" ? row["Award Amount"] : undefined,
    Total_Outlays:
      typeof row["Total Outlays"] === "number" ? row["Total Outlays"] : undefined,
    Description:
      typeof row["Description"] === "string" ? row["Description"] : undefined,
    Start_Date:
      typeof row["Start Date"] === "string" ? row["Start Date"] : undefined,
    End_Date:
      typeof row["End Date"] === "string" ? row["End Date"] : undefined,
    Award_Type:
      typeof row["Award Type"] === "string" ? row["Award Type"] : undefined,
  };
}

export async function searchAwards(keyword: string, page = 1): Promise<SpendingSearchResponse> {
  const response = await usaFetch<{
    spending_level: string;
    results: Array<Record<string, unknown> & { internal_id: number; generated_internal_id: string }>;
    page_metadata: { page: number; hasNext: boolean; total: number };
  }>("/search/spending_by_award/", {
    filters: {
      ...(keyword ? { keywords: [keyword] } : {}),
      award_type_codes: ["A", "B", "C", "D"],
      time_period: [{ start_date: "2007-10-01", end_date: new Date().toISOString().slice(0, 10) }],
    },
    fields: ["Award ID", "Recipient Name", "Awarding Agency", "Award Amount", "Total Outlays", "Description", "Start Date", "End Date", "Award Type"],
    page,
    limit: 100,
    subawards: false,
    sort: "Award Amount",
    order: "desc",
  });

  return {
    spending_level: response.spending_level,
    results: response.results.map(mapAwardRow),
    page_metadata: response.page_metadata,
  };
}

export async function getAwardDetail(awardId: string): Promise<AwardDetail> {
  return usaFetch<AwardDetail>(`/awards/${encodeURIComponent(awardId)}/`);
}
