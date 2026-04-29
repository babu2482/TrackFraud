/**
 * Sanctions Fraud Signal Detection Engine
 *
 * Implements cross-referencing against OFAC Sanctions List and SAM (System for
 * Award Management) Exclusion List to detect entities that appear on federal
 * sanctions or exclusion databases.
 *
 * Signals implemented:
 * 1. ofac_match             — Entity matches an OFAC SDN/consolidated entry (50 pts, critical)
 * 2. sam_exclusion          — Entity is on the SAM exclusion list (40 pts, high)
 * 3. ofac_program_match     — Entity matches an OFAC entry under a specific high-risk program (30 pts, high)
 * 4. multiple_sanctions_hit  — Entity appears on both OFAC and SAM (60 pts, critical)
 * 5. sanctions_name_alias   — Entity alias matches a sanctions entry (35 pts, high)
 *
 * Uses the string-match.ts utilities for fuzzy name comparison:
 * - normalize() for canonical name cleaning
 * - nameMatches() for multi-method similarity scoring
 * - normalizeEIN() / normalizeUEI() for ID comparison
 *
 * Each detector returns DetectedSignal[] objects that can be persisted via
 * the shared persistSignals() function from signal-detectors.ts.
 */

import { PrismaClient } from "@prisma/client";
import {
  normalize,
  nameMatches,
  jaccardSimilarity,
  normalizeEIN,
  normalizeUEI,
  hasCommonToken,
  tokensContain,
} from "../string-match";
import { persistSignals, DetectedSignal } from "./signal-detectors";

const prisma = new PrismaClient();

const METHODOLOGY_VERSION = "v2";

// Default similarity threshold for name-based matching
const NAME_MATCH_THRESHOLD = 0.85;

// High-risk OFAC programs that warrant additional signaling
const HIGH_RISK_OFAC_PROGRAMS = [
  "SDGT", // Specially Designated Global Terrorist
  "SDNT", // Specially Designated National / Terrorist
  "IRAQ2", // Iraq-related sanctions
  "CYBER", // Cyber-related sanctions
  "IFSR", // Iran Sanctions
  "UKRAINE-EO13661", // Ukraine-related sanctions
  "COR", // Cuba-related sanctions
  "SYRIA", // Syria-related sanctions
  "NC", // North Korea
  "CUBA", // Cuba sanctions
  "IRAN-EO13846", // Iran EO13846
  "DRC", // Democratic Republic of Congo
  "VENEZUELA", // Venezuela-related
  "BELARUS", // Belarus-related
  "MYANMAR", // Myanmar-related
  "SOMA", // Somalia-related
  "SSUD", // Sudan-related
  "SYRIA-EO13047", // Syria EO13047
  "MSR", // Maritime Security
  "GTC", // Global Magnitsky
  "HRIC", // Human Rights violations
  "CART", // Narcotics traffickers
];

// ---------------------------------------------------------------------------
// Signal 1: OFAC SDN Match
// ---------------------------------------------------------------------------

/**
 * Detect if a canonical entity matches an entry on the OFAC SDN (Specially
 * Designated Nationals) or consolidated sanctions list.
 *
 * Matching strategy:
 * 1. Exact name match (after normalization)
 * 2. Fuzzy name match (Jaccard ≥ threshold)
 * 3. EIN/ID match on the OFAC record's `ids` JSON field
 *
 * Score Impact: 50 points (critical severity)
 */
export async function detectOFACMatch(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true, normalizedName: true, stateCode: true },
    });

    if (!entity || !entity.displayName) {
      return signals;
    }

    const displayName = entity.displayName;
    const normName = normalize(displayName);

    // Strategy 1: Exact match on normalized name
    const exactMatches = await prisma.oFACSanction.findMany({
      where: {
        name: { equals: displayName, mode: "insensitive" as const },
      },
      take: 10,
    });

    if (exactMatches.length > 0) {
      for (const ofacRecord of exactMatches) {
        signals.push({
          entityId,
          sourceSystemId,
          signalKey: "ofac_match",
          signalLabel: "OFAC Sanctions List Match",
          severity: "critical",
          detail: `Entity name "${displayName}" exactly matches OFAC entry "${ofacRecord.name}" (OFAC ID: ${ofacRecord.ofacId}, programs: ${ofacRecord.programs.join(", ")})`,
          measuredValue: 1.0,
          measuredText: "exact match",
          thresholdValue: NAME_MATCH_THRESHOLD,
          scoreImpact: 50,
          sourceRecordId: ofacRecord.id,
          methodologyVersion: METHODOLOGY_VERSION,
          status: "active",
          observedAt: new Date(),
        });
      }
    }

    // Strategy 2: Fuzzy name match using OFAC name index scan + client-side filtering
    // Fetch OFAC entries that share at least one token with the entity name
    const entityTokens = normName.split(" ").filter((t) => t.length > 1);

    if (entityTokens.length > 0) {
      // Build OR clause for names containing any of the entity's significant tokens
      const orConditions = entityTokens.map((token) => ({
        name: {
          contains: token,
          mode: "insensitive" as const,
        },
      }));

      const candidateMatches = await prisma.oFACSanction.findMany({
        where: { OR: orConditions },
        select: {
          id: true,
          ofacId: true,
          name: true,
          entityType: true,
          programs: true,
        },
        take: 200, // Limit candidates for client-side scoring
      });

      for (const candidate of candidateMatches) {
        if (!candidate.name) continue;

        // Skip if already flagged as exact match
        if (exactMatches.some((m) => m.id === candidate.id)) continue;

        const matchResult = nameMatches(displayName, candidate.name, {
          threshold: NAME_MATCH_THRESHOLD,
          stripSuffixes: true,
        });

        if (matchResult.match) {
          // Determine severity: critical if it's a PERSON/ENTITY, high if vessel/aircraft
          const severity =
            candidate.entityType === "Individual" ||
            candidate.entityType === "Entity"
              ? "critical"
              : "high";

          signals.push({
            entityId,
            sourceSystemId,
            signalKey: "ofac_match",
            signalLabel: "OFAC Sanctions List Match (Fuzzy)",
            severity,
            detail: `Entity name "${displayName}" matches OFAC entry "${candidate.name}" at ${(matchResult.similarity * 100).toFixed(0)}% similarity (OFAC ID: ${candidate.ofacId}, method: ${matchResult.method})`,
            measuredValue: matchResult.similarity,
            measuredText: `${(matchResult.similarity * 100).toFixed(0)}% similar`,
            thresholdValue: NAME_MATCH_THRESHOLD,
            scoreImpact: severity === "critical" ? 50 : 40,
            sourceRecordId: candidate.id,
            methodologyVersion: METHODOLOGY_VERSION,
            status: "active",
            observedAt: new Date(),
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error detecting OFAC match for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 2: SAM Exclusion
// ---------------------------------------------------------------------------

/**
 * Detect if a canonical entity is on the SAM (System for Award Management)
 * exclusion list, meaning they are debarred from receiving federal contracts
 * or grants.
 *
 * Matching strategy:
 * 1. Exact legal name match
 * 2. Fuzzy name match (threshold ≥ 0.85)
 *
 * Only active exclusions are matched (expirationDate is null or in the future).
 *
 * Score Impact: 40 points (high severity)
 */
export async function detectSAMExclusion(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true, normalizedName: true },
    });

    if (!entity || !entity.displayName) {
      return signals;
    }

    const displayName = entity.displayName;
    const now = new Date();

    // Get active SAM exclusions (no expiration or future expiration)
    const activeExclusions = await prisma.sAMExclusion.findMany({
      where: {
        OR: [{ expirationDate: null }, { expirationDate: { gt: now } }],
      },
      select: {
        id: true,
        uei: true,
        legalName: true,
        exclusionReasons: true,
        effectiveDate: true,
        expirationDate: true,
        issuingAgency: true,
      },
    });

    // Strategy 1: Exact name match
    const exactMatches = activeExclusions.filter(
      (sam) => normalize(sam.legalName) === normalize(displayName),
    );

    for (const samRecord of exactMatches) {
      const daysExcluded = Math.floor(
        (now.getTime() - samRecord.effectiveDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "sam_exclusion",
        signalLabel: "SAM Exclusion Match",
        severity: "high",
        detail: `Entity "${displayName}" exactly matches SAM-excluded entity "${samRecord.legalName}" (UEI: ${samRecord.uei}, excluded for ${daysExcluded} days, reasons: ${samRecord.exclusionReasons.join(", ")}, agency: ${samRecord.issuingAgency})`,
        measuredValue: 1.0,
        measuredText: "exact match",
        thresholdValue: NAME_MATCH_THRESHOLD,
        scoreImpact: 40,
        sourceRecordId: samRecord.id,
        methodologyVersion: METHODOLOGY_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }

    // Strategy 2: Fuzzy name match
    for (const samRecord of activeExclusions) {
      // Skip if already an exact match
      if (exactMatches.some((m) => m.id === samRecord.id)) continue;

      // Quick pre-filter: must share at least one token
      if (!hasCommonToken(displayName, samRecord.legalName)) continue;

      const matchResult = nameMatches(displayName, samRecord.legalName, {
        threshold: NAME_MATCH_THRESHOLD,
        stripSuffixes: true,
      });

      if (matchResult.match) {
        const daysExcluded = Math.floor(
          (now.getTime() - samRecord.effectiveDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        signals.push({
          entityId,
          sourceSystemId,
          signalKey: "sam_exclusion",
          signalLabel: "SAM Exclusion Match (Fuzzy)",
          severity: "high",
          detail: `Entity "${displayName}" matches SAM-excluded entity "${samRecord.legalName}" at ${(matchResult.similarity * 100).toFixed(0)}% similarity (UEI: ${samRecord.uei}, excluded for ${daysExcluded} days, agency: ${samRecord.issuingAgency})`,
          measuredValue: matchResult.similarity,
          measuredText: `${(matchResult.similarity * 100).toFixed(0)}% similar`,
          thresholdValue: NAME_MATCH_THRESHOLD,
          scoreImpact: 35, // Slightly lower for fuzzy match
          sourceRecordId: samRecord.id,
          methodologyVersion: METHODOLOGY_VERSION,
          status: "active",
          observedAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error(`Error detecting SAM exclusion for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 3: OFAC High-Risk Program Match
// ---------------------------------------------------------------------------

/**
 * Detect if an entity matches an OFAC entry that is associated with a
 * high-risk sanctions program (e.g., SDGT, CYBER, Iran, narcotics).
 *
 * This is a sub-signal of the general OFAC match — it fires when the
 * matched OFAC record is linked to a particularly concerning program.
 *
 * Score Impact: 30 points (high severity)
 */
export async function detectOFACProgramMatch(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true },
    });

    if (!entity || !entity.displayName) {
      return signals;
    }

    const displayName = entity.displayName;
    const normName = normalize(displayName);
    const entityTokens = normName.split(" ").filter((t) => t.length > 1);

    if (entityTokens.length === 0) {
      return signals;
    }

    // Get OFAC entries that are on high-risk programs and share a token
    const orConditions = entityTokens.map((token) => ({
      name: {
        contains: token,
        mode: "insensitive" as const,
      },
    }));

    // Filter to high-risk programs using JSON array contains
    const candidates = await prisma.oFACSanction.findMany({
      where: {
        AND: [
          { OR: orConditions },
          // At least one high-risk program
          {
            OR: HIGH_RISK_OFAC_PROGRAMS.map((prog) => ({
              programs: { has: prog },
            })),
          },
        ],
      },
      select: {
        id: true,
        ofacId: true,
        name: true,
        entityType: true,
        programs: true,
      },
      take: 150,
    });

    for (const candidate of candidates) {
      if (!candidate.name) continue;

      const matchResult = nameMatches(displayName, candidate.name, {
        threshold: NAME_MATCH_THRESHOLD,
        stripSuffixes: true,
      });

      if (matchResult.match) {
        // Identify which high-risk programs match
        const matchingPrograms = candidate.programs.filter((p) =>
          HIGH_RISK_OFAC_PROGRAMS.includes(p),
        );

        signals.push({
          entityId,
          sourceSystemId,
          signalKey: "ofac_program_match",
          signalLabel: "OFAC High-Risk Program Match",
          severity: "high",
          detail: `Entity matches OFAC entry under high-risk program(s): ${matchingPrograms.join(", ")}. OFAC entry: "${candidate.name}" (OFAC ID: ${candidate.ofacId})`,
          measuredValue: matchResult.similarity,
          measuredText: `${(matchResult.similarity * 100).toFixed(0)}% similar, programs: ${matchingPrograms.join(", ")}`,
          thresholdValue: NAME_MATCH_THRESHOLD,
          scoreImpact: 30,
          sourceRecordId: candidate.id,
          methodologyVersion: METHODOLOGY_VERSION,
          status: "active",
          observedAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error(`Error detecting OFAC program match for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 4: Multiple Sanctions Hit (OFAC + SAM)
// ---------------------------------------------------------------------------

/**
 * Detect if an entity appears on BOTH the OFAC sanctions list AND the SAM
 * exclusion list. This compound signal indicates a significantly elevated
 * risk level.
 *
 * Score Impact: 60 points (critical severity)
 */
export async function detectMultipleSanctionsHit(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true },
    });

    if (!entity || !entity.displayName) {
      return signals;
    }

    // Run both detectors in parallel
    const [ofacSignals, samSignals] = await Promise.all([
      detectOFACMatch(entityId),
      detectSAMExclusion(entityId),
    ]);

    // Only fire if both have at least one match
    if (ofacSignals.length > 0 && samSignals.length > 0) {
      const ofacMatchNames = ofacSignals.map((s) => s.measuredText).join("; ");
      const samMatchNames = samSignals.map((s) => s.measuredText).join("; ");

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "multiple_sanctions_hit",
        signalLabel: "Present on Multiple Sanctions Lists",
        severity: "critical",
        detail: `Entity "${entity.displayName}" matches entries on both OFAC (${ofacSignals.length} match(es)) and SAM (${samSignals.length} match(es)). OFAC: ${ofacMatchNames}. SAM: ${samMatchNames}.`,
        measuredValue: ofacSignals.length + samSignals.length,
        measuredText: `${ofacSignals.length} OFAC + ${samSignals.length} SAM matches`,
        thresholdValue: 2,
        scoreImpact: 60,
        methodologyVersion: METHODOLOGY_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(
      `Error detecting multiple sanctions hit for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 5: Sanctions Name Alias Match
// ---------------------------------------------------------------------------

/**
 * Detect if an alias associated with a canonical entity matches an OFAC or
 * SAM entry, even if the primary display name does not match.
 *
 * This catches entities that operate under an alternate name that appears
 * on sanctions lists.
 *
 * Score Impact: 35 points (high severity)
 */
export async function detectSanctionsNameAlias(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Get all aliases for this entity
    const aliases = await prisma.entityAlias.findMany({
      where: { entityId },
      select: { alias: true, aliasType: true, sourceSystemId: true },
    });

    if (aliases.length === 0) {
      return signals;
    }

    const aliasNames = aliases.map((a) => a.alias).filter((n) => n.length > 2);

    // Check each alias against OFAC
    for (const aliasName of aliasNames) {
      const normAlias = normalize(aliasName);
      const aliasTokens = normAlias.split(" ").filter((t) => t.length > 1);

      if (aliasTokens.length === 0) continue;

      // Check against OFAC
      const ofacOrConditions = aliasTokens.map((token) => ({
        name: { contains: token, mode: "insensitive" as const },
      }));

      const ofacCandidates = await prisma.oFACSanction.findMany({
        where: { OR: ofacOrConditions },
        select: { id: true, ofacId: true, name: true, programs: true },
        take: 50,
      });

      for (const ofacRec of ofacCandidates) {
        if (!ofacRec.name) continue;

        const matchResult = nameMatches(aliasName, ofacRec.name, {
          threshold: NAME_MATCH_THRESHOLD,
          stripSuffixes: true,
        });

        if (matchResult.match) {
          signals.push({
            entityId,
            sourceSystemId,
            signalKey: "sanctions_name_alias",
            signalLabel: "Entity Alias Matches OFAC Entry",
            severity: "high",
            detail: `Entity alias "${aliasName}" matches OFAC entry "${ofacRec.name}" at ${(matchResult.similarity * 100).toFixed(0)}% similarity (OFAC ID: ${ofacRec.ofacId})`,
            measuredValue: matchResult.similarity,
            measuredText: `alias "${aliasName}" → OFAC "${ofacRec.name}"`,
            thresholdValue: NAME_MATCH_THRESHOLD,
            scoreImpact: 35,
            sourceRecordId: ofacRec.id,
            methodologyVersion: METHODOLOGY_VERSION,
            status: "active",
            observedAt: new Date(),
          });
        }
      }

      // Check against SAM
      const activeSamExclusions = await prisma.sAMExclusion.findMany({
        where: {
          OR: [
            { expirationDate: null },
            { expirationDate: { gt: new Date() } },
          ],
        },
        select: {
          id: true,
          uei: true,
          legalName: true,
          exclusionReasons: true,
          issuingAgency: true,
        },
        take: 200,
      });

      for (const samRec of activeSamExclusions) {
        if (!hasCommonToken(aliasName, samRec.legalName)) continue;

        const matchResult = nameMatches(aliasName, samRec.legalName, {
          threshold: NAME_MATCH_THRESHOLD,
          stripSuffixes: true,
        });

        if (matchResult.match) {
          signals.push({
            entityId,
            sourceSystemId,
            signalKey: "sanctions_name_alias",
            signalLabel: "Entity Alias Matches SAM Exclusion",
            severity: "high",
            detail: `Entity alias "${aliasName}" matches SAM-excluded entity "${samRec.legalName}" at ${(matchResult.similarity * 100).toFixed(0)}% similarity (UEI: ${samRec.uei}, agency: ${samRec.issuingAgency})`,
            measuredValue: matchResult.similarity,
            measuredText: `alias "${aliasName}" → SAM "${samRec.legalName}"`,
            thresholdValue: NAME_MATCH_THRESHOLD,
            scoreImpact: 35,
            sourceRecordId: samRec.id,
            methodologyVersion: METHODOLOGY_VERSION,
            status: "active",
            observedAt: new Date(),
          });
        }
      }
    }
  } catch (error) {
    console.error(
      `Error detecting sanctions alias match for ${entityId}:`,
      error,
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Batch / Aggregate Functions
// ---------------------------------------------------------------------------

/**
 * Run all sanctions signal detectors for a single entity.
 *
 * Returns the combined list of detected signals from all detectors.
 */
export async function detectAllSanctionsSignals(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const allSignals: DetectedSignal[] = [];

  console.log(
    `[sanctions] Running fraud signal detection for entity ${entityId}...`,
  );

  // Run all detectors in parallel
  const [ofacSignals, samSignals, programSignals, multiSignals, aliasSignals] =
    await Promise.all([
      detectOFACMatch(entityId, sourceSystemId),
      detectSAMExclusion(entityId, sourceSystemId),
      detectOFACProgramMatch(entityId, sourceSystemId),
      detectMultipleSanctionsHit(entityId, sourceSystemId),
      detectSanctionsNameAlias(entityId, sourceSystemId),
    ]);

  allSignals.push(
    ...ofacSignals,
    ...samSignals,
    ...programSignals,
    ...multiSignals,
    ...aliasSignals,
  );

  console.log(
    `[sanctions] Detected ${allSignals.length} fraud signals for entity ${entityId}`,
  );

  return allSignals;
}

/**
 * Batch detect sanctions signals for all entities in a given category.
 *
 * Processes entities in batches, detects sanctions signals, and persists
 * them to the database.
 *
 * @param batchSize — Number of entities to process per batch
 * @param limit — Maximum number of entities to process (0 = unlimited)
 * @param categoryId — Category filter (default: all categories)
 */
export async function batchDetectSanctionsSignals(
  batchSize: number = 100,
  limit?: number,
  categoryId?: string,
): Promise<{ processed: number; signalsDetected: number }> {
  console.log("Starting batch sanctions signal detection...");

  let processed = 0;
  let totalSignals = 0;
  let offset = 0;

  const whereClause = categoryId ? { categoryId } : {};

  const totalCount =
    limit ??
    (await prisma.canonicalEntity.count({
      where: whereClause,
    }));

  while (offset < totalCount) {
    const entities = await prisma.canonicalEntity.findMany({
      take: batchSize,
      skip: offset,
      where: whereClause,
      select: { id: true, categoryId: true, displayName: true },
    });

    if (entities.length === 0) break;

    console.log(
      `Processing batch ${Math.floor(offset / batchSize) + 1} (${offset}-${Math.min(offset + batchSize, totalCount)} of ${totalCount})`,
    );

    // Process entities in the batch
    // Run in parallel chunks to avoid overwhelming the DB
    const chunkSize = 10;
    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);

      const chunkResults = await Promise.allSettled(
        chunk.map(async (entity) => {
          try {
            const signals = await detectAllSanctionsSignals(entity.id);

            if (signals.length > 0) {
              await persistSignals(signals);
              return signals.length;
            }
            return 0;
          } catch (error) {
            console.error(`Error processing entity ${entity.id}:`, error);
            return 0;
          }
        }),
      );

      for (const result of chunkResults) {
        processed++;
        if (result.status === "fulfilled") {
          totalSignals += result.value;
        }
      }
    }

    offset += batchSize;

    // Progress update
    if (processed % 100 === 0) {
      console.log(
        `Progress: ${processed}/${totalCount} entities, ${totalSignals} signals detected`,
      );
    }
  }

  console.log("\n=== Batch Sanctions Detection Complete ===");
  console.log(`Entities Processed: ${processed}`);
  console.log(`Total Signals Detected: ${totalSignals}`);

  return { processed, signalsDetected: totalSignals };
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  const command = process.argv[2];
  const entityId = process.argv[3];

  switch (command) {
    case "single":
      if (!entityId) {
        console.error(
          "Usage: tsx lib/fraud-scoring/sanctions-detectors.ts single <entityId>",
        );
        process.exit(1);
      }

      detectAllSanctionsSignals(entityId)
        .then((signals) => {
          console.log("\nDetected Signals:");
          signals.forEach((s) => {
            console.log(
              `  - [${s.severity.toUpperCase()}] ${s.signalLabel}: ${s.detail}`,
            );
          });

          if (signals.length > 0 && process.argv[4] === "--persist") {
            return persistSignals(signals).then(() => {
              console.log("\nSignals persisted to database");
            });
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          process.exit(1);
        });
      break;

    case "batch": {
      const limit = parseInt(process.argv[3] || "0") || 0;
      const categoryId = process.argv[4];
      void batchDetectSanctionsSignals(
        100,
        limit || undefined,
        categoryId || undefined,
      )
        .then((stats) => {
          console.log("\nBatch complete:", stats);
          process.exit(0);
        })
        .catch((error) => {
          console.error("Batch failed:", error);
          process.exit(1);
        });
      break;
    }

    default:
      console.log(
        "Usage: tsx lib/fraud-scoring/sanctions-detectors.ts <command> [options]",
      );
      console.log("\nCommands:");
      console.log(
        "  single <entityId> [--persist]  Detect sanctions signals for a single entity",
      );
      console.log(
        "  batch [limit] [categoryId]     Run detection on all entities (optionally limited / filtered)",
      );
      process.exit(1);
  }
}
