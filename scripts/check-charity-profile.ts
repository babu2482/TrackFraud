#!/usr/bin/env -S tsx
/**
 * Quick check of CharityProfile data
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  try {
    // Get count
    const count = await prisma.charityProfile.count();
    console.log(`Total CharityProfiles: ${count}`);

    if (count > 0) {
      // Get a sample record
      const sample = await prisma.charityProfile.findFirst({
        include: { CanonicalEntity: true },
      });

      console.log("\nSample record:", JSON.stringify(sample, null, 2));
    }

    
    // Check existing canonical entities
    const entityCount = await prisma.canonicalEntity.count();
    console.log(`Total CanonicalEntities: ${entityCount}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
