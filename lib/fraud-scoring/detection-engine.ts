/**
 * Fraud Detection Engine
 *
 * Executes fraud signal detection queries, creates signal events,
 * calculates weighted scores, and generates fraud snapshots for entities.
 *
 * Usage:
 *   import { runFraudDetection } from './lib/fraud-scoring/detection-engine';
 *   await runFraudDetection({ category: 'charity' }); // Run for specific category
 *   await runFraudDetection(); // Run all categories
 */

import { PrismaClient } from "@prisma/client";
import {
  ALL_FRAUD_SIGNALS,
  getSignalsByCategory,
  FraudSignalDefinition,
  SignalSeverity,
} from "./signal-definitions";

const prisma = new PrismaClient();

export interface DetectionOptions {
  category?: "charity" | "healthcare" | "corporate" | "consumer" | "sanctions";
  batchSize?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface DetectionResult {
  totalSignals: number;
  signalsBySeverity: Record<SignalSeverity, number>;
  entitiesAffected: number;
  topRiskEntities: Array<{
    entityId: string;
    entityType: string;
    score: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    signalCount: number;
    topSignals: Array<{ id: string; name: string; severity: SignalSeverity }>;
  }>;
  executionTimeMs: number;
}

export interface FraudScore {
  entityId: string;
  entityType: string;
  score: number; // 0-100, higher = more risky
  riskLevel: "low" | "medium" | "high" | "critical";
  signalCount: number;
  topSignals: Array<{
    id: string;
    name: string;
    severity: SignalSeverity;
    weight: number;
  }>;
}

/**
 * Map application severity to string (database uses String type)
 */
function mapSeverity(severity: SignalSeverity): string {
  return severity;
}

/**
 * Execute a single fraud signal detection query and create events
 */
async function detectSignal(
  signal: FraudSignalDefinition,
  dryRun: boolean,
  verbose: boolean,
): Promise<number> {
  if (verbose) {
    console.log(`\n🔍 Detecting signal: ${signal.id}`);
    console.log(`   Name: ${signal.name}`);
    console.log(`   Severity: ${signal.severity} (weight: ${signal.weight})`);
  }

  try {
    // Execute detection query to get affected entity IDs
    const affectedEntityIds = await signal.detectionQuery(prisma);

    if (verbose) {
      console.log(`   ✓ Found ${affectedEntityIds.length} potential matches`);
    }

    if (dryRun || affectedEntityIds.length === 0) {
      return affectedEntityIds.length;
    }

    // Create fraud signal events for each affected entity
    const batchSize = 100;
    let createdCount = 0;

    for (let i = 0; i < affectedEntityIds.length; i += batchSize) {
      const batch = affectedEntityIds.slice(i, i + batchSize);

      const createPromises = batch.map((entityId) =>
        prisma.fraudSignalEvent.create({
          data: {
            entityId: String(entityId), // Ensure string type - references CanonicalEntity.id
            signalKey: signal.id,
            signalLabel: signal.name,
            severity: mapSeverity(signal.severity),
            detail: signal.description,
            methodologyVersion: "v1",
            status: "active",
          },
        }),
      );

      const results = await Promise.allSettled(createPromises);
      createdCount += results.filter((r) => r.status === "fulfilled").length;

      if (verbose && (i + batchSize) % 500 === 0) {
        console.log(
          `   → Created ${createdCount}/${affectedEntityIds.length} events...`,
        );
      }
    }

    return createdCount;
  } catch (error) {
    console.error(
      `❌ Error detecting signal ${signal.id}:`,
      error instanceof Error ? error.message : String(error),
    );
    return 0;
  }
}

/**
 * Determine entity type based on fraud category
 */
function getEntityTypeFromCategory(category: string): string {
  const mapping: Record<string, string> = {
    charity: "CharityProfile",
    healthcare: "HealthcareRecipientProfile",
    corporate: "CorporateCompanyProfile",
    consumer: "ConsumerCompanySummary",
    sanctions: "CanonicalEntity", // Generic for sanctions/exclusions
  };
  return mapping[category] || "Unknown";
}

/**
 * Calculate fraud scores for all entities with signals
 */
async function calculateFraudScores(
  dryRun: boolean,
  verbose: boolean,
): Promise<FraudScore[]> {
  if (verbose) {
    console.log("\n📊 Calculating fraud scores...");
  }

  // Get all fraud signals grouped by entity
  const signals = await prisma.fraudSignalEvent.findMany({
    select: {
      entityId: true,
      signalKey: true,
      signalLabel: true,
      severity: true,
      detail: true,
    },
  });

  // Group by entity (entityId is unique enough since it references CanonicalEntity.id)
  const signalsByEntity = new Map<string, typeof signals>();
  for (const signal of signals) {
    const key = signal.entityId;
    if (!signalsByEntity.has(key)) {
      signalsByEntity.set(key, []);
    }
    signalsByEntity.get(key)!.push(signal);
  }

  // Calculate scores for each entity
  const scores: FraudScore[] = [];

  // Severity multipliers for weighted scoring
  const severityMultipliers: Record<SignalSeverity, number> = {
    low: 0.5,
    medium: 1.0,
    high: 1.5,
    critical: 2.0,
  };

  for (const [entityId, entitySignals] of signalsByEntity.entries()) {
    // Get entity type from CanonicalEntity if needed
    const canonicalEntity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { entityType: true },
    });

    const entityType = canonicalEntity?.entityType || "unknown";

    // Calculate weighted score
    let weightedScore = 0;
    const signalDetails: Array<{
      id: string;
      name: string;
      severity: SignalSeverity;
      weight: number;
    }> = [];

    for (const signal of entitySignals) {
      // Find signal definition to get weight
      const definition = ALL_FRAUD_SIGNALS.find(
        (s) => s.id === signal.signalKey,
      );

      if (definition) {
        const severityMultiplier =
          severityMultipliers[signal.severity as SignalSeverity];
        weightedScore += definition.weight * severityMultiplier;

        signalDetails.push({
          id: signal.signalKey,
          name: signal.signalLabel,
          severity: definition.severity as SignalSeverity,
          weight: definition.weight,
        });
      }
    }

    // Normalize score to 0-100 range
    const normalizedScore = Math.min(100, weightedScore * 20); // Scale factor

    // Determine risk level
    let riskLevel: "low" | "medium" | "high" | "critical";
    if (normalizedScore >= 80) {
      riskLevel = "critical";
    } else if (normalizedScore >= 60) {
      riskLevel = "high";
    } else if (normalizedScore >= 40) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    // Sort signals by weight and take top 5
    signalDetails.sort((a, b) => b.weight - a.weight);
    const topSignals = signalDetails.slice(0, 5);

    scores.push({
      entityId,
      entityType: entityType as any, // Cast to match FraudScore interface
      score: normalizedScore,
      riskLevel,
      signalCount: entitySignals.length,
      topSignals,
    });
  }

  // Store snapshots in database (unless dry run)
  if (!dryRun && scores.length > 0) {
    if (verbose) {
      console.log(`   → Creating ${scores.length} fraud snapshots...`);
    }

    const batchSize = 100;
    for (let i = 0; i < scores.length; i += batchSize) {
      const batch = scores.slice(i, i + batchSize);

      // Find existing snapshots for this batch
      const existingSnapshots = await prisma.fraudSnapshot.findMany({
        where: {
          entityId: { in: batch.map((s) => s.entityId) },
          isCurrent: true,
        },
        select: { id: true, entityId: true },
      });

      const existingMap = new Map(
        existingSnapshots.map((s) => [s.entityId, s.id]),
      );

      await Promise.all(
        batch.map(async (score) => {
          if (existingMap.has(score.entityId)) {
            // Update existing snapshot
            await prisma.fraudSnapshot.update({
              where: { id: existingMap.get(score.entityId) },
              data: {
                score: Math.round(score.score),
                level: score.riskLevel,
                activeSignalCount: score.signalCount,
                corroborationCount:
                  score.signalCount > 1 ? score.signalCount - 1 : 0,
                explanation: `Top signals: ${score.topSignals.map((s) => s.name).join(", ")}`,
                computedAt: new Date(),
              },
            });
          } else {
            // Create new snapshot
            await prisma.fraudSnapshot.create({
              data: {
                entityId: score.entityId,
                score: Math.round(score.score),
                level: score.riskLevel,
                activeSignalCount: score.signalCount,
                corroborationCount:
                  score.signalCount > 1 ? score.signalCount - 1 : 0,
                explanation: `Top signals: ${score.topSignals.map((s) => s.name).join(", ")}`,
              },
            });
          }
        }),
      );
    }

    if (verbose) {
      console.log(`   ✓ Created/updated ${scores.length} snapshots`);
    }
  }

  // Sort by score descending and return top results
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

/**
 * Main fraud detection execution function
 */
export async function runFraudDetection(
  options: DetectionOptions = {},
): Promise<DetectionResult> {
  const startTime = Date.now();
  const { category, batchSize = 100, dryRun = false, verbose = true } = options;

  if (verbose) {
    console.log("\n" + "=".repeat(70));
    console.log("🚨 FRAUD DETECTION ENGINE");
    console.log("=".repeat(70));
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
    console.log(`Category: ${category || "ALL"}`);
    console.log("-".repeat(70));
  }

  // Select signals to run based on category filter
  const signalsToRun = category
    ? getSignalsByCategory(category)
    : ALL_FRAUD_SIGNALS;

  if (verbose && category) {
    console.log(
      `\n📋 Running ${signalsToRun.length} signals for ${category} category`,
    );
  }

  // Track results
  const totalSignalsCreated = await prisma.fraudSignalEvent.count();
  const signalsBySeverity: Record<SignalSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  // Execute detection for each signal
  for (const signal of signalsToRun) {
    const count = await detectSignal(signal, dryRun, verbose);

    if (count > 0 && !dryRun) {
      signalsBySeverity[signal.severity] += count;
    }
  }

  // Calculate fraud scores and generate snapshots
  const scores = await calculateFraudScores(dryRun, verbose);

  // Get unique entities affected
  const entitiesAffected = new Set(scores.map((s) => s.entityId)).size;

  // Prepare top risk entities (top 100 by score)
  const topRiskEntities = scores.slice(0, 100).map((score) => ({
    entityId: score.entityId,
    entityType: score.entityType,
    score: Math.round(score.score * 100) / 100, // Round to 2 decimals
    riskLevel: score.riskLevel,
    signalCount: score.signalCount,
    topSignals: score.topSignals.map((s) => ({
      id: s.id,
      name: s.name,
      severity: s.severity,
    })),
  }));

  const executionTimeMs = Date.now() - startTime;

  // Print summary
  if (verbose) {
    console.log("\n" + "=".repeat(70));
    console.log("✅ FRAUD DETECTION COMPLETE");
    console.log("=".repeat(70));
    console.log(
      `Execution time: ${(executionTimeMs / 1000).toFixed(1)} seconds`,
    );
    console.log(
      `Total signals detected: ${signalsBySeverity.critical + signalsBySeverity.high + signalsBySeverity.medium + signalsBySeverity.low}`,
    );
    console.log(`  - Critical: ${signalsBySeverity.critical}`);
    console.log(`  - High: ${signalsBySeverity.high}`);
    console.log(`  - Medium: ${signalsBySeverity.medium}`);
    console.log(`  - Low: ${signalsBySeverity.low}`);
    console.log(`Unique entities affected: ${entitiesAffected}`);
    console.log(`Fraud snapshots created/updated: ${scores.length}`);

    if (topRiskEntities.length > 0) {
      console.log("\n🎯 TOP 10 HIGHEST RISK ENTITIES:");
      console.log("-".repeat(70));
      topRiskEntities.slice(0, 10).forEach((entity, index) => {
        console.log(`${index + 1}. ${entity.entityId} (${entity.entityType})`);
        console.log(
          `   Score: ${entity.score.toFixed(1)} | Risk: ${entity.riskLevel.toUpperCase()} | Signals: ${entity.signalCount}`,
        );
        if (entity.topSignals.length > 0) {
          console.log(
            `   Top signal: ${entity.topSignals[0].name} (${entity.topSignals[0].severity})`,
          );
        }
      });
    }
  }

  return {
    totalSignals:
      signalsBySeverity.critical +
      signalsBySeverity.high +
      signalsBySeverity.medium +
      signalsBySeverity.low,
    signalsBySeverity,
    entitiesAffected,
    topRiskEntities,
    executionTimeMs,
  };
}

/**
 * Run fraud detection for a single entity (on-demand)
 */
export async function detectEntityFraud(
  entityId: string,
  entityType: string,
): Promise<FraudScore | null> {
  // Get existing snapshot if available
  const snapshot = await prisma.fraudSnapshot.findFirst({
    where: {
      entityId,
      isCurrent: true,
    },
    orderBy: {
      computedAt: "desc",
    },
  });

  if (snapshot) {
    return {
      entityId: snapshot.entityId,
      entityType: "unknown",
      score: snapshot.score,
      riskLevel: snapshot.level as "low" | "medium" | "high" | "critical",
      signalCount: snapshot.activeSignalCount,
      topSignals: [],
    };
  }

  // No snapshot exists - return null or trigger detection
  return null;
}

/**
 * Get fraud signals for a specific entity
 */
export async function getEntityFraudSignals(
  entityId: string,
  entityType: string,
): Promise<
  Array<{
    id: string;
    signalType: string;
    severity: SignalSeverity;
    description: string;
    createdAt: Date;
  }>
> {
  const signals = await prisma.fraudSignalEvent.findMany({
    where: {
      entityId,
    },
    select: {
      id: true,
      signalKey: true,
      severity: true,
      detail: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return signals.map((s) => ({
    id: s.id,
    signalType: s.signalKey,
    severity: s.severity as SignalSeverity,
    description: s.detail || "",
    createdAt: s.createdAt,
  }));
}

// Export for CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const categoryArg = args.find((a) => a.startsWith("--category="));
  const dryRun = args.includes("--dry-run");
  const verbose = !args.includes("--quiet");

  const category = categoryArg ? categoryArg.split("=")[1] : undefined;

  runFraudDetection({
    category: category as any,
    dryRun,
    verbose,
  })
    .then((result) => {
      console.log("\n✅ Detection completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Detection failed:", error);
      process.exit(1);
    });
}

export default runFraudDetection;
