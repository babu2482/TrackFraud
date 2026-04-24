#!/usr/bin/env -S tsx
/**
 * Quick Database Status Checker
 *
 * Shows current row counts for major tables to understand what's been ingested
 */

import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  console.log("🔍 Checking database status...\n");

  const tables = [
    // Charities
    {
      model: "charityProfile" as const,
      name: "Charity Profiles",
      category: "Charities",
    },
    {
      model: "charityForm990" as const,
      name: "Form 990 Filings",
      category: "Charities",
    },
    {
      model: "charityCompensation" as const,
      name: "Executive Compensation",
      category: "Charities",
    },

    // Politics
    {
      model: "politicalCandidateProfile" as const,
      name: "Political Candidates",
      category: "Politics",
    },
    {
      model: "politicianBiography" as const,
      name: "Politician Biographies",
      category: "Politics",
    },
    { model: "bill" as const, name: "Bills", category: "Politics" },
    { model: "billVote" as const, name: "Bill Votes", category: "Politics" },

    // Healthcare
    {
      model: "healthcarePaymentRecord" as const,
      name: "Healthcare Payments",
      category: "Healthcare",
    },
    {
      model: "physicianProfile" as const,
      name: "Physician Profiles",
      category: "Healthcare",
    },

    // Sanctions
    {
      model: "ofacSanction" as const,
      name: "OFAC Sanctions",
      category: "Sanctions",
    },
    {
      model: "samExclusion" as const,
      name: "SAM Exclusions",
      category: "Sanctions",
    },

    // Corporate
    {
      model: "corporateCompanyProfile" as const,
      name: "Corporate Profiles",
      category: "Corporate",
    },
    {
      model: "corporateFilingRecord" as const,
      name: "SEC Filings",
      category: "Corporate",
    },

    // Consumer
    {
      model: "consumerComplaintRecord" as const,
      name: "Consumer Complaints",
      category: "Consumer",
    },
    {
      model: "ftcDataBreach" as const,
      name: "FTC Data Breaches",
      category: "Consumer",
    },

    // Government
    {
      model: "governmentAward" as const,
      name: "Government Awards",
      category: "Government",
    },
  ];

  const results = [];

  for (const table of tables) {
    try {
      const count = await (prisma as any)[table.model].count();
      results.push({ ...table, count });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Error counting ${table.name}:`, errorMessage);
      results.push({ ...table, count: "ERROR" as any });
    }
  }

  // Group by category and display
  const categories = [...new Set(results.map((r) => r.category))];

  for (const category of categories) {
    console.log(`\n📊 ${category}`);
    console.log("─".repeat(80));

    const categoryResults = results.filter((r) => r.category === category);
    let totalCount = 0;

    for (const result of categoryResults) {
      if (typeof result.count === "number") {
        totalCount += result.count;
      }
      console.log(
        `  ${result.name.padEnd(35)}: ${(result.count as any).toLocaleString()}`,
      );
    }

    console.log(`  ──${"─".repeat(76)}─`);
    console.log(`  Total for ${category}: ${totalCount.toLocaleString()}\n`);
  }

  // Check ingestion history
  console.log("\n📈 Recent Ingestion Runs");
  console.log("─".repeat(80));

  try {
    const runs = await prisma.ingestionRun.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceSystemId: true,
        status: true,
        rowsRead: true,
        rowsInserted: true,
        rowsUpdated: true,
        createdAt: true,
      },
    });

    for (const run of runs) {
      const date = new Date(run.createdAt).toLocaleString();
      const totalRecords =
        (run.rowsRead || 0) + (run.rowsInserted || 0) + (run.rowsUpdated || 0);
      console.log(
        `  ${date.padEnd(25)} | ${run.sourceSystemId.padEnd(30)} | ${run.status.padEnd(10)} | ${totalRecords.toLocaleString()} records`,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("  Could not fetch ingestion history:", errorMessage);
  }

  // Summary
  const totalRecords = results.reduce(
    (sum, r) => sum + (typeof r.count === "number" ? r.count : 0),
    0,
  );

  console.log("\n" + "─".repeat(80));
  console.log(`🎯 TOTAL RECORDS IN DATABASE: ${totalRecords.toLocaleString()}`);
  console.log("─".repeat(80) + "\n");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
