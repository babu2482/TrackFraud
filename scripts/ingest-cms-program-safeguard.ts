#!/usr/bin/env tsx
/**
 * Ingest CMS Program Safeguard Exclusions
 *
 * This script loads CMS Program Safeguard exclusions from the CMS Open Data API.
 * These are providers excluded from Medicare/Medicaid programs due to fraud,
 * abuse, or other program safeguard violations.
 *
 * Source: https://data.cms.gov/dataset/program-safeguard-exclusions
 *
 * Usage:
 *   npx tsx scripts/ingest-cms-program-safeguard.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CMS_API_BASE = "https://api.data.cms.gov";
const CMS_API_KEY = (globalThis as any).process?.env?.CMS_API_KEY || "";

interface CMSExclusion {
  cms_id: string;
  last_name: string;
  first_name: string;
  organization_name: string;
  exclusion_type: string;
  effective_date: string;
  termination_date: string;
  state: string;
}

async function fetchExclusions(): Promise<CMSExclusion[]> {
  console.log("📡 Fetching CMS Program Safeguard exclusions...");

  // CMS Open Data API endpoint for Program Safeguard Exclusions
  // Using the public CSV endpoint
  const csvUrl =
    "https://data.cms.gov/api/views/78i6-9pqr/rows.csv?accessType=DOWNLOAD";

  try {
    // Node.js 18+ has native fetch
    const response: any = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error(
        `CMS API returned ${response.status}: ${response.statusText}`,
      );
    }

    const csvData: string = await response.text();

    // Parse CSV
    const lines: string[] = csvData
      .split("\n")
      .filter((line: string) => line.trim());
    const csvHeaders: string[] = lines[0]
      .split(",")
      .map((h: string) => h.trim().toLowerCase());

    const exclusions: CMSExclusion[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values: string[] = lines[i]
        .split(",")
        .map((v: string) => (v ? v.trim().replace(/^"|"$/g, "") : ""));

      const exclusion: CMSExclusion = {
        cms_id: values[csvHeaders.indexOf("cms_id")] || `cms_${i}`,
        last_name: values[csvHeaders.indexOf("last_name")],
        first_name: values[csvHeaders.indexOf("first_name")],
        organization_name: values[csvHeaders.indexOf("organization_name")],
        exclusion_type:
          values[csvHeaders.indexOf("exclusion_type")] || "unknown",
        effective_date: values[csvHeaders.indexOf("effective_date")],
        termination_date: values[csvHeaders.indexOf("termination_date")],
        state: values[csvHeaders.indexOf("state")],
      };

      if (exclusion.cms_id) {
        exclusions.push(exclusion);
      }
    }

    console.log(`✅ Fetched ${exclusions.length} exclusions from CMS`);
    return exclusions;
  } catch (error) {
    console.error("❌ Failed to fetch CMS exclusions:", error);
    return [];
  }
}

async function main() {
  console.log("🚀 Starting CMS Program Safeguard Exclusions ingestion...");

  const startTime = Date.now();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // Get or create the source system
    let sourceSystem = await prisma.sourceSystem.findFirst({
      where: { slug: "cms-program-safeguard" },
    });

    if (!sourceSystem) {
      // categoryId is a plain slug string (source of truth: lib/categories.ts)
      const categoryId = "healthcare";

      sourceSystem = await prisma.sourceSystem.create({
        data: {
          categoryId,
          name: "CMS Program Safeguard Exclusions",
          slug: "cms-program-safeguard",
          description:
            "Medicare/Medicaid program safeguard exclusions from CMS",
          baseUrl: "https://data.cms.gov/dataset/program-safeguard-exclusions",
          ingestionMode: "api",
          refreshCadence: "daily",
          freshnessSlaHours: 24,
          supportsIncremental: true,
        },
      });
      console.log(`✅ Created source system: ${sourceSystem.name}`);
    }

    // Start ingestion run
    const ingestionRun = await prisma.ingestionRun.create({
      data: {
        sourceSystemId: sourceSystem.id,
        status: "running",
        runType: "full",
      },
    });

    // Fetch exclusions
    const exclusions = await fetchExclusions();

    if (exclusions.length === 0) {
      console.log(
        "⚠️ No exclusions found or API unavailable. Skipping ingestion.",
      );

      await prisma.ingestionRun.update({
        where: { id: ingestionRun.id },
        data: {
          status: "completed",
          rowsSkipped: 0,
          completedAt: new Date(),
        },
      });
      return;
    }

    console.log(`📥 Processing ${exclusions.length} exclusions...`);

    // Process in batches for efficiency
    const batchSize = 100;

    for (let i = 0; i < exclusions.length; i += batchSize) {
      const batch = exclusions.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (exclusion) => {
          try {
            const existing =
              await prisma.cMSProgramSafeguardExclusion.findUnique({
                where: { cmsId: exclusion.cms_id },
              });

            if (existing) {
              await prisma.cMSProgramSafeguardExclusion.update({
                where: { cmsId: exclusion.cms_id },
                data: {
                  lastName: exclusion.last_name || existing.lastName,
                  firstName: exclusion.first_name || existing.firstName,
                  organizationName:
                    exclusion.organization_name || existing.organizationName,
                  exclusionType: exclusion.exclusion_type,
                  effectiveDate: exclusion.effective_date
                    ? new Date(exclusion.effective_date)
                    : existing.effectiveDate,
                  terminationDate: exclusion.termination_date
                    ? new Date(exclusion.termination_date)
                    : existing.terminationDate,
                  state: exclusion.state || existing.state,
                },
              });
              updated++;
            } else {
              await prisma.cMSProgramSafeguardExclusion.create({
                data: {
                  sourceSystemId: sourceSystem.id,
                  cmsId: exclusion.cms_id,
                  lastName: exclusion.last_name,
                  firstName: exclusion.first_name,
                  organizationName: exclusion.organization_name,
                  exclusionType: exclusion.exclusion_type,
                  effectiveDate: exclusion.effective_date
                    ? new Date(exclusion.effective_date)
                    : new Date(),
                  terminationDate: exclusion.termination_date
                    ? new Date(exclusion.termination_date)
                    : null,
                  state: exclusion.state,
                },
              });
              inserted++;
            }
          } catch (err) {
            console.error(`❌ Error processing ${exclusion.cms_id}:`, err);
            skipped++;
          }
        }),
      );

      console.log(
        `   Processed ${Math.min(i + batchSize, exclusions.length)} / ${exclusions.length}`,
      );
    }

    // Update source system last sync
    await prisma.sourceSystem.update({
      where: { id: sourceSystem.id },
      data: {
        lastSuccessfulSyncAt: new Date(),
        lastAttemptedSyncAt: new Date(),
        lastError: null,
      },
    });

    // Complete ingestion run
    await prisma.ingestionRun.update({
      where: { id: ingestionRun.id },
      data: {
        status: "completed",
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsSkipped: skipped,
        rowsRead: exclusions.length,
        completedAt: new Date(),
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n✅ CMS Program Safeguard Exclusions ingestion complete!");
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Duration: ${duration}s`);
  } catch (error) {
    console.error("❌ Ingestion failed:", error);

    // Update source system with error
    try {
      const sourceSystem = await prisma.sourceSystem.findFirst({
        where: { slug: "cms-program-safeguard" },
      });
      if (sourceSystem) {
        await prisma.sourceSystem.update({
          where: { id: sourceSystem.id },
          data: {
            lastAttemptedSyncAt: new Date(),
            lastError: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    } catch (err) {
      // Ignore errors in error handling
    }

    return;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
});
