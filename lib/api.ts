/**
 * ProPublica Nonprofit Explorer API client.
 * Base URL: https://projects.propublica.org/nonprofits/api/v2
 */

const BASE = process.env.PROPUBLICA_API_BASE ?? "https://projects.propublica.org/nonprofits/api/v2";

export async function searchOrganizations(params: {
  q?: string;
  page?: number;
  state?: string;
  ntee?: number;
  c_code?: number;
  output?: "flat" | "noorg";
}): Promise<unknown> {
  const url = new URL(`${BASE}/search.json`);
  if (params.q) url.searchParams.set("q", params.q);
  if (params.page != null) url.searchParams.set("page", String(params.page));
  if (params.state) url.searchParams.set("state[id]", params.state);
  if (params.ntee != null) url.searchParams.set("ntee[id]", String(params.ntee));
  if (params.c_code != null)
    url.searchParams.set("c_code[id]", String(params.c_code));
  if (params.output) url.searchParams.set("output", params.output);

  const res = await fetch(url.toString(), {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    // ProPublica returns HTTP 404 for zero-result search responses.
    // Treat this as a valid empty search payload instead of an API error.
    if (res.status === 404) {
      try {
        const parsed = JSON.parse(text) as {
          organizations?: unknown;
          total_results?: unknown;
        };
        if (
          Array.isArray(parsed.organizations) &&
          typeof parsed.total_results === "number"
        ) {
          return parsed;
        }
      } catch {
        // fall through to normal error path
      }
    }
    throw new Error(
      `ProPublica search failed: ${res.status} ${text.slice(0, 200)}`
    );
  }
  return res.json();
}

export async function getOrganization(ein: string): Promise<unknown> {
  const numericEin = ein.replace(/\D/g, "");
  if (!numericEin) throw new Error("Invalid EIN");

  const url = `${BASE}/organizations/${numericEin}.json`;
  const res = await fetch(url, {
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Organization not found");
    const text = await res.text();
    throw new Error(`ProPublica org failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}
