/**
 * Link Auto-Revocation Records to Canonical Entities
 *
 * Problem: 42K+ auto-revocation records are not linked to charity profiles
 * because IRS uses different EIN formatting (e.g., 123456789 vs 12-3456789).
 *
 * Solution: Normalize EINs and perform fuzzy matching by name + location.
 *
 * Usage:
 *   npx tsx scripts/link-auto-revocations.ts
 *   npx tsx scripts/link-auto-revocations.ts --dry-run
 *   npx tsx scripts/link-auto-revocations.ts --max-links 1000
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Normalize EIN to 9-digit zero-padded string
 */
function normalizeEIN(ein: string | null | undefined): string {
  if (!ein) return "";
  return ein.replace(/[-\s]/g, "").padStart(9, "0").slice(0, 9);
}

/**
 * Normalize a name for comparison: lowercase, strip punctuation/extra spaces
 */
function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.,&()/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple string similarity: Jaccard index on word sets
 */
function nameSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

interface LinkOptions {
  dryRun: boolean;
  maxLinks: number | undefined;
  einOnly: boolean;
}

async function linkAutoRevocations(options: LinkOptions): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Link Auto-Revocation Records to Canonical Entities      ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════╝\n",
  );

  const { dryRun, maxLinks, einOnly } = options;

  if (dryRun) {
    console.log("🔍 DRY RUN MODE — No database changes will be made\n");
  }

  // Step 1: Load unlinked auto-revocation records
  console.log("📥 Loading unlinked auto-revocation records...");
  const unlinked = await prisma.charityAutomaticRevocationRecord.findMany({
    where: { entityId: null },
    select: {
      id: true,
      ein: true,
      organizationName: true,
      sortName: true,
      city: true,
      state: true,
      zipCode: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`   Found ${unlinked.length} unlinked auto-revocation records\n`);

  if (unlinked.length === 0) {
    console.log("✅ All auto-revocation records are already linked.");
    return;
  }

  // Step 2: Build lookup indices from CanonicalEntity + related profiles
  console.log("📥 Building lookup indices from charity data...");

  // Index 1: By normalized EIN from CharityProfile
  const charityProfiles = await prisma.charityProfile.findMany({
    select: {
      ein: true,
      entityId: true,
      subName: true,
      city: true,
      state: true,
      zipcode: true,
    },
  });

  const einToEntity = new Map<string, (typeof charityProfiles)[0]>();
  for (const profile of charityProfiles) {
    const normEIN = normalizeEIN(profile.ein);
    if (normEIN) {
      einToEntity.set(normEIN, profile);
    }
  }

  // Index 2: By normalized name from CanonicalEntity
  const charityEntities = await prisma.canonicalEntity.findMany({
    where: { categoryId: "charities" },
    select: {
      id: true,
      normalizedName: true,
      stateCode: true,
    },
  });

  // Name → [entity] map for fuzzy matching fallback
  const nameIndex = new Map<string, string[]>();
  for (const entity of charityEntities) {
    const norm = entity.normalizedName.toLowerCase();
    if (!nameIndex.has(norm)) {
      nameIndex.set(norm, []);
    }
    nameIndex.get(norm)!.push(entity.id);
  }

  console.log(`   Indexed ${charityProfiles.length} charity profiles by EIN`);
  console.log(
    `   Indexed ${charityEntities.length} charity entities by name\n`,
  );

  // Step 3: Link records
  let linkedByEIN = 0;
  let linkedByName = 0;
  let failed = 0;
  let totalProcessed = 0;
  const updates: Array<{ revocationId: string; entityId: string }> = [];

  for (const record of unlinked) {
    if (maxLinks !== undefined && totalProcessed >= maxLinks) {
      break;
    }

    totalProcessed++;
    const normEIN = normalizeEIN(record.ein);
    let matchedEntityId: string | null = null;
    let matchMethod: string | null = null;

    // Method 1: Exact EIN match
    if (normEIN && einToEntity.has(normEIN)) {
      matchedEntityId = einToEntity.get(normEIN)!.entityId;
      matchMethod = "ein_exact";
      linkedByEIN++;
    }

    // Method 2: Fuzzy name + state match (only if EIN didn't work)
    if (!matchedEntityId && !einOnly) {
      const recName = normalizeName(record.sortName || record.organizationName);
      const recState = (record.state || "").toLowerCase();

      if (recName.length > 3) {
        let bestSimilarity = 0;
        let bestEntityId: string | null = null;

        // Search entities with similar names
        for (const [entityName, entityIds] of nameIndex.entries()) {
          const sim = nameSimilarity(recName, entityName);

          // Quick filter: must be > 70% similar
          if (sim < 0.7) continue;

          // Check if state matches for top candidates
          for (const entityId of entityIds) {
            const entity = charityEntities.find((e) => e.id === entityId);
            if (!entity) continue;

            // Boost similarity if state matches
            let adjustedSim = sim;
            if (recState && entity.stateCode) {
              if (entity.stateCode.toLowerCase() === recState) {
                adjustedSim = Math.min(1.0, sim + 0.2);
              } else {
                adjustedSim = sim * 0.8; // Penalize state mismatch
              }
            }

            if (adjustedSim > bestSimilarity) {
              bestSimilarity = adjustedSim;
              bestEntityId = entityId;
            }
          }
        }

        // Require strong similarity threshold
        if (bestSimilarity >= 0.85 && bestEntityId) {
          matchedEntityId = bestEntityId;
          matchMethod = `name_fuzzy (${(bestSimilarity * 100).toFixed(0)}%)`;
          linkedByName++;
        }
      }
    }

    // Record the result
    if (matchedEntityId) {
      updates.push({ revocationId: record.id, entityId: matchedEntityId });

      if (dryRun) {
        console.log(
          `   🔗 Would link ${record.organizationName} (EIN: ${record.ein}) → ${matchedEntityId} [${matchMethod}]`,
        );
      }
    } else {
      failed++;
    }

    // Progress logging
    if (totalProcessed % 5000 === 0) {
      console.log(
        `   Progress: ${totalProcessed}/${unlinked.length} records processed, ${updates.length} linked so far`,
      );
    }
  }

  // Step 4: Apply updates to database
  if (!dryRun && updates.length > 0) {
    console.log(`\n💾 Applying ${updates.length} links to database...`);

    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      const updatePromises = batch.map((update) =>
        prisma.charityAutomaticRevocationRecord.update({
          where: { id: update.revocationId },
          data: { entityId: update.entityId },
        }),
      );

      await Promise.allSettled(updatePromises);

      if ((i + batchSize) % 1000 === 0) {
        console.log(
          `   → Updated ${Math.min(i + batchSize, updates.length)}/${updates.length} records...`,
        );
      }
    }
  }

  // Summary
  console.log(
    "\n╔═══════════════════════════════════════════════════════════╗",
  );
  console.log("║           Auto-Revocation Linking Complete                 ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════╝\n",
  );

  console.log(`Records Processed: ${totalProcessed}`);
  console.log(`Linked by EIN:     ${linkedByEIN}`);
  console.log(`Linked by Name:    ${linkedByName}`);
  console.log(`Failed to Link:    ${failed}`);
  console.log(`Total Linked:      ${linkedByEIN + linkedByName}`);

  const linkRate =
    totalProcessed > 0
      ? (((linkedByEIN + linkedByName) / totalProcessed) * 100).toFixed(1)
      : "0.0";
  console.log(`Link Rate:         ${linkRate}%`);

  if (dryRun) {
    console.log(
      "\n⚠️  This was a dry run. Re-run without --dry-run to apply changes.",
    );
  }
}

// Parse CLI arguments
function parseArgs(): LinkOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
    maxLinks: args.find((a) => a.startsWith("--max-links"))?.slice(12)
      ? parseInt(args.find((a) => a.startsWith("--max-links"))!.slice(12))
      : undefined,
    einOnly: args.includes("--ein-only"),
  };
}

// Main
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  const options = parseArgs();

  linkAutoRevocations(options)
    .then(() => {
      console.log("\n✅ Script completed successfully");
      prisma.$disconnect();
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Script failed:", error);
      prisma.$disconnect();
      process.exit(1);
    });
}

export { linkAutoRevocations, normalizeEIN, normalizeName, nameSimilarity };
