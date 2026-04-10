#!/usr/bin/env -S tsx
/**
 * FDA Warning Letters Ingestor (Placeholder)
 *
 * This script is designed to fetch FDA warning letters and enforcement actions.
 * Currently a placeholder - requires FDA_API_KEY environment variable to function.
 *
 * Usage:
 *   export FDA_API_KEY="your-api-key"
 *   npx tsx scripts/ingest-fda-warning-letters.ts
 */

import { prisma } from "../lib/db";

const FDA_API_KEY = process.env.FDA_API_KEY || "";
const FDA_SOURCE_SYSTEM_ID = "fda_warning_letters";

async function main(): Promise<void> {
  console.log("=== FDA Warning Letters Ingestion ===");

  if (!FDA_API_KEY) {
    console.warn("⚠️  FDA_API_KEY not set. Skipping ingestion.");
    console.log("Set FDA_API_KEY environment variable to enable this script.");
    return;
  }

  // Get or create source system
  const sourceSystem = await prisma.sourceSystem.upsert({
    where: { id: FDA_SOURCE_SYSTEM_ID },
    update: {},
    create: {
      id: FDA_SOURCE_SYSTEM_ID,
      categoryId: "healthcare",
      name: "FDA Warning Letters API",
      slug: "fda-warning-letters",
      description: "FDA Warning Letters and Enforcement Reports",
      ingestionMode: "api",
      refreshCadence: "weekly",
    },
  });

  console.log(`Source system ready: ${sourceSystem.id}`);
  console.log("TODO: Implement FDA Warning Letters API integration");
}

main()
  .then(() => {
    console.log("FDA warning letters ingestion completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("FDA warning letters ingestion failed:", error);
    process.exit(1);
  });