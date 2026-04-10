#!/usr/bin/env -S tsx
/**
 * Simplified SEC EDGAR Ingestion Script (Quick Start)
 *
 * Fetches a small sample of company data from SEC EDGAR API for testing.
 * This is a lightweight version that doesn't download the full tickers file.
 *
 * Usage:
 *   npx tsx scripts/ingest-sec-edgar-simple.ts --limit 10
 */

import { prisma } from "../lib/db";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
} from "../lib/ingestion-utils";

const SEC_SOURCE_SYSTEM_ID = "sec_edgar_api";
const EDGAR_DATA = "https://data.sec.gov";

// Pre-selected well-known companies for quick testing
const SAMPLE_CIKS = [
  { cik: "0000320193", name: "Apple Inc.", ticker: "AAPL" },
  { cik: "0001018724", name: "Amazon.com, Inc.", ticker: "AMZN" },
  { cik: "0001652044", name: "Alphabet Inc.", ticker: "GOOGL" },
  { cik: "0000789019", name: "Microsoft Corporation", ticker: "MSFT" },
  { cik: "0001326801", name: "Meta Platforms, Inc.", ticker: "META" },
  { cik: "0001318605", name: "Tesla, Inc.", ticker: "TSLA" },
  { cik: "0000051143", name: "International Business Machines Corporation", ticker: "IBM" },
  { cik: "0000078003", name: "Pfizer Inc.", ticker: "PFE" },
  { cik: "0000019617", name: "JPMorgan Chase & Co.", ticker: "JPM" },
  { cik: "0000886982", name: "Bank of America Corporation", ticker: "BAC" },
];

interface ParsedArgs {
  limit: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { limit: 10 };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      const val = parseInt(argv[++i] ?? "10", 10);
      parsed.limit = Number.isFinite(val) && val > 0 ? val : 10;
    }
  }

  return parsed;
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TrackFraud/1.0",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      console.log(`  Retry ${attempt}/${retries} for ${url}...`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error("Should not reach here");
}

async function getCompanySubmissions(cik: string): Promise<any> {
  const paddedCik = cik.replace(/^0+/, "").padStart(10, "0");
  return fetchWithRetry(`${EDGAR_DATA}/submissions/CIK${paddedCik}.json`);
}

async function main(): Promise<void> {
  console.log("=== SEC EDGAR Simplified Ingestion ===");

  const args = parseArgs(process.argv.slice(2));
  const companiesToProcess = SAMPLE_CIKS.slice(0, args.limit);

  console.log(`Processing ${companiesToProcess.length} sample companies...`);

  // Get or create source system
  await prisma.sourceSystem.upsert({
    where: { id: SEC_SOURCE_SYSTEM_ID },
    update: {},
    create: {
      id: SEC_SOURCE_SYSTEM_ID,
      categoryId: "corporate",
      name: "SEC EDGAR API",
      slug: "sec-edgar-api",
      description: "U.S. Securities and Exchange Commission filings",
      ingestionMode: "api",
      baseUrl: EDGAR_DATA,
      refreshCadence: "daily",
    },
  });

  const { run } = await startIngestionRun({ sourceSystemId: SEC_SOURCE_SYSTEM_ID });
  const stats = createEmptyStats();

  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    for (const company of companiesToProcess) {
      console.log(`\nProcessing ${company.name} (${company.ticker})...`);

      try {
        const submissions = await getCompanySubmissions(company.cik);

        // Create or update corporate profile
        const profile = await prisma.corporateCompanyProfile.upsert({
          where: { cik: company.cik },
          update: {
            entityType: submissions.entityType || null,
            sic: submissions.sic || null,
            sicDescription: submissions.sicDescription || null,
            tickers: submissions.tickers || [company.ticker],
            exchanges: submissions.exchanges || [],
            stateOfIncorporation: submissions.stateOfIncorporation || null,
            fiscalYearEnd: submissions.fiscalYearEnd || null,
          },
          create: {
            sourceSystemId: SEC_SOURCE_SYSTEM_ID,
            entityId: `sec-${company.cik}`,
            cik: company.cik,
            entityType: submissions.entityType || "operating",
            sic: submissions.sic || null,
            sicDescription: submissions.sicDescription || null,
            tickers: submissions.tickers || [company.ticker],
            exchanges: submissions.exchanges || [],
            stateOfIncorporation: submissions.stateOfIncorporation || null,
            fiscalYearEnd: submissions.fiscalYearEnd || "1231",
          },
        });

        console.log(`  ✓ Profile ${profile.id}`);

        // Create canonical entity if it doesn't exist
        const canonicalEntity = await prisma.canonicalEntity.upsert({
          where: { id: profile.entityId },
          update: {
            displayName: company.name,
            normalizedName: company.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
            entityType: "corporation",
            homepageUrl: `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(company.name)}`,
          },
          create: {
            categoryId: "corporate",
            displayName: company.name,
            normalizedName: company.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
            entityType: "corporation",
            status: "active",
            homepageUrl: `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(company.name)}`,
          },
        });

        console.log(`  ✓ Canonical entity ${canonicalEntity.id}`);

        // Process recent filings (limit to last 10)
        const recentFilings = submissions.filings?.recent || {};
        const filingCount = Math.min(
          Object.keys(recentFilings).length > 0
            ? (recentFilings.accessionNumber?.length || 0)
            : 0,
          10
        );

        for (let i = 0; i < filingCount; i++) {
          const filing = await prisma.corporateFilingRecord.upsert({
            where: { accessionNumber: recentFilings.accessionNumber[i] },
            update: {},
            create: {
              sourceSystemId: SEC_SOURCE_SYSTEM_ID,
              entityId: canonicalEntity.id,
              accessionNumber: recentFilings.accessionNumber[i],
              filingDate: recentFilings.filingDate[i] ? new Date(recentFilings.filingDate[i]) : null,
              reportDate: recentFilings.reportDate[i] ? new Date(recentFilings.reportDate[i]) : null,
              form: recentFilings.form[i],
              primaryDocument: recentFilings.primaryDocument?.[i] || null,
              primaryDocDescription: recentFilings.primaryDocDescription?.[i] || null,
            },
          });

          stats.rowsInserted++;
        }

        console.log(`  ✓ ${filingCount} filings processed`);

        totalInserted++;
        stats.rowsRead++;

        // Rate limiting: SEC allows 10 requests/second
        await new Promise((r) => setTimeout(r, 150));

      } catch (error) {
        console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
        stats.rowsFailed++;
      }
    }

    console.log(`\n=== SEC EDGAR Ingestion Complete ===`);
    console.log(`Companies processed: ${totalInserted}/${companiesToProcess.length}`);
    console.log(`Filings ingested: ${stats.rowsInserted}`);
    console.log(`Errors: ${stats.rowsFailed}`);

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: SEC_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Ingestion failed:", message);

    await failIngestionRun({
      runId: run.id,
      sourceSystemId: SEC_SOURCE_SYSTEM_ID,
      stats,
      errorSummary: message,
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\nSEC EDGAR ingestion completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nSEC EDGAR ingestion failed:", error);
    try {
      prisma.$disconnect();
    } catch {}
    process.exit(1);
  });
