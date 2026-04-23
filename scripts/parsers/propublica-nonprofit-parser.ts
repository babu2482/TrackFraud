#!/usr/bin/env -S tsx
/**
 * ProPublica Nonprofit Explorer Parser
 *
 * Parses data from the ProPublica Nonprofit Explorer API and inserts records
 * into CharityProfile, ProPublicaNonprofit, and related tables.
 *
 * Source: https://projects.propublica.org/nonprofits/api/
 * Rate Limit: ~100 requests per minute (no key required for basic access)
 *
 * Usage:
 *   npx tsx scripts/parsers/propublica-nonprofit-parser.ts --source-system-id <id> [--max-pages N]
 */

import "dotenv/config";
import { prisma } from "../../lib/db";

interface ProPublicaOrganization {
  ein: number;
  name: string;
  sub_name?: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  country?: string;
  ntee_code: string;
  ntee_major_group?: number;
  subsection_code?: number;
  foundation_code?: number | null;
  deduction_code?: number;
  income_amount?: number;
  asset_amount?: number;
  form_990_revenue?: number;
  form_990_expenses?: number;
  filing_requirement_code?: string;
  tax_period_end_month: number;
  updated: string;
}

interface ProPublicaFiling {
  ein: number;
  tax_prd: number; // YYYYMM format
  tax_prd_yr: number;
  formtype: number; // 0=990, 1=990-EZ, 2=990-PF
  pdf_url?: string;
  updated: string;
}

interface ProPublicaNonprofitData {
  organizations: ProPublicaOrganization[];
  filings_with_data: ProPublicaFiling[];
  filings_without_data: ProPublicaFiling[];
}

class ProPublicaParser {
  private sourceSystemId: string;
  private maxPages: number;
  private stats = {
    pagesFetched: 0,
    organizationsFound: 0,
    organizationsInserted: 0,
    organizationsUpdated: 0,
    errors: 0,
  };

  constructor(sourceSystemId: string, maxPages: number = 100) {
    this.sourceSystemId = sourceSystemId;
    this.maxPages = maxPages;
  }

  async parseAndInsert(): Promise<{
    organizationsInserted: number;
    organizationsUpdated: number;
    filingsProcessed: number;
    errors: number;
  }> {
    console.log("📥 Fetching ProPublica Nonprofit data...");

    for (let page = 0; page < this.maxPages; page++) {
      try {
        const url = `https://projects.propublica.org/nonprofits/api/v2/search.json?page=${page}`;
        console.log(`  Fetching page ${page + 1}/${this.maxPages}...`);

        const response = await fetch(url, {
          headers: {
            "User-Agent": "TrackFraud/1.0 (nonprofit tracking platform)",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as unknown;

        // Handle different API response structures
        let organizations: ProPublicaOrganization[] = [];
        if (data && typeof data === "object" && "organizations" in data) {
          organizations = (data as any).organizations || [];
        } else if (Array.isArray(data)) {
          organizations = data;
        }

        this.stats.pagesFetched++;

        if (organizations.length === 0) {
          console.log(`  ✅ No more organizations found on page ${page + 1}`);
          break;
        }

        console.log(
          `  Found ${organizations.length} organizations on page ${page + 1}`,
        );

        // Process each organization
        for (const org of organizations) {
          await this.processOrganization(org as ProPublicaOrganization);
        }

        // Rate limiting - wait between requests
        if (page < this.maxPages - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`  ❌ Error fetching page ${page + 1}:`, errorMessage);
        this.stats.errors++;

        // Don't stop on single page errors, continue to next page
        if (page < this.maxPages - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ ProPublica Nonprofit Parsing Complete");
    console.log("=".repeat(60));
    console.log(`Pages fetched: ${this.stats.pagesFetched}`);
    console.log(
      `Organizations found: ${this.stats.organizationsFound.toLocaleString()}`,
    );
    console.log(
      `Inserted: ${this.stats.organizationsInserted.toLocaleString()}`,
    );
    console.log(`Updated: ${this.stats.organizationsUpdated.toLocaleString()}`);
    console.log(`Errors: ${this.stats.errors}`);

    return {
      organizationsInserted: this.stats.organizationsInserted,
      organizationsUpdated: this.stats.organizationsUpdated,
      filingsProcessed: this.stats.filingsProcessed,
      errors: this.stats.errors,
    };
  }

  private async processOrganization(
    org: ProPublicaOrganization,
  ): Promise<void> {
    try {
      const ein = String(org.ein).padStart(9, "0");

      // Upsert into ProPublicaNonprofit table only
      await prisma.proPublicaNonprofit.upsert({
        where: { ein },
        update: {
          organizationName: org.name,
          city: org.city || null,
          state: org.state || null,
          zipCode: org.zipcode || null,
          subsectionCode: org.subsection_code?.toString() || null,
          foundationCode: org.foundation_code || null,
          nteeCodes: [org.ntee_code].filter(Boolean),
          assetAmount: org.asset_amount || null,
          incomeAmount: org.income_amount || null,
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          ein,
          sourceSystemId: this.sourceSystemId,
          organizationName: org.name,
          city: org.city || null,
          state: org.state || null,
          zipCode: org.zipcode || null,
          subsectionCode: org.subsection_code?.toString() || null,
          foundationCode: org.foundation_code || null,
          nteeCodes: [org.ntee_code].filter(Boolean),
          assetAmount: org.asset_amount || null,
          incomeAmount: org.income_amount || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.stats.organizationsFound++;
      this.stats.organizationsInserted++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`  ⚠️  Error processing EIN ${org.ein}:`, errorMessage);
      this.stats.errors++;
    }
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  let sourceSystemId = "";
  let maxPages: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source-system-id" || args[i] === "-s") {
      sourceSystemId = args[++i] || "";
    } else if (args[i] === "--max-pages" || args[i] === "-p") {
      maxPages = parseInt(args[++i] || "100", 10) || 100;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
ProPublica Nonprofit Parser

Usage:
  npx tsx scripts/parsers/propublica-nonprofit-parser.ts --source-system-id <id> [--max-pages N]

Options:
  -s, --source-system-id    Source system ID from database (e.g., propublica_nonprofit)
  -p, --max-pages           Maximum pages to fetch (default: 100 = ~2500 orgs)
  -h, --help                Show this help message

Example:
  npx tsx scripts/parsers/propublica-nonprofit-parser.ts -s propublica_nonprofit -p 10
`);
      process.exit(0);
    }
  }

  if (!sourceSystemId) {
    console.error("❌ Error: --source-system-id is required");
    process.exit(1);
  }

  try {
    const parser = new ProPublicaParser(sourceSystemId, maxPages || 100);

    await parser.parseAndInsert();

    const stats = parser.getStats();

    if (stats.errors > 0) {
      console.warn(`\n⚠️  ${stats.errors} error(s) occurred during processing`);
    }

    await prisma.$disconnect();
    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
