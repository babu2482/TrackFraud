// CMS Open Payments data via data.cms.gov Socrata API
// Dataset: General Payment Data (latest program year)
const OPEN_PAYMENTS_ENDPOINT = "https://openpaymentsdata.cms.gov/api/1/datastore/query";
const GENERAL_PAYMENTS_2022 = "63c46c53-03cd-586b-84a3-96e08e76f3a5";

export interface CMSPayment {
  record_id?: string;
  physician_first_name?: string;
  physician_last_name?: string;
  physician_profile_id?: string;
  recipient_city?: string;
  recipient_state?: string;
  physician_specialty?: string;
  applicable_manufacturer_or_applicable_gpo_making_payment_name?: string;
  total_amount_of_payment_usdollars?: string;
  nature_of_payment_or_transfer_of_value?: string;
  date_of_payment?: string;
  program_year?: string;
}

export async function searchPaymentsByDoctor(lastName: string, firstName?: string): Promise<CMSPayment[]> {
  const conditions: { property: string; value: string; operator: string }[] = [
    { property: "physician_last_name", value: lastName.toUpperCase(), operator: "=" },
  ];
  if (firstName) {
    conditions.push({ property: "physician_first_name", value: firstName.toUpperCase(), operator: "=" });
  }

  const params = new URLSearchParams({ limit: "25", offset: "0" });
  conditions.forEach((c, i) => {
    params.set(`conditions[${i}][property]`, c.property);
    params.set(`conditions[${i}][value]`, c.value);
    params.set(`conditions[${i}][operator]`, c.operator);
  });

  const url = `${OPEN_PAYMENTS_ENDPOINT}/${GENERAL_PAYMENTS_2022}?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`CMS Open Payments ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (data.results ?? []) as CMSPayment[];
}

export async function searchPaymentsByCompany(companyName: string): Promise<CMSPayment[]> {
  const params = new URLSearchParams({
    limit: "25",
    offset: "0",
    "conditions[0][property]": "applicable_manufacturer_or_applicable_gpo_making_payment_name",
    "conditions[0][value]": `%${companyName.toUpperCase()}%`,
    "conditions[0][operator]": "LIKE",
    sort: "total_amount_of_payment_usdollars",
    "sort-order": "desc",
  });

  const url = `${OPEN_PAYMENTS_ENDPOINT}/${GENERAL_PAYMENTS_2022}?${params.toString()}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`CMS Open Payments ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (data.results ?? []) as CMSPayment[];
}
