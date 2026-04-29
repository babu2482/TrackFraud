/**
 * Fraud Scoring Engine
 *
 * Calculates weighted fraud scores from detected signals and persists snapshots.
 * Delegates to fraud-meter.ts (the canonical scoring system) via score-adapter.ts.
 * Maintains backwards-compatible calculateFraudScore() for legacy code.
 */

import { PrismaClient } from "@prisma/client";
import { DetectedSignal } from "./signal-detectors";
import {
  unifiedScore,
  mapLevelToDb,
  detectedSignalsToRisk,
  categoryToDomain,
} from "./score-adapter";

const prisma = new PrismaClient();

export interface FraudScoreResult {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  bandLabel: string;
  baseScore: number;
  corroborationCount: number;
  activeSignalCount: number;
  explanation: string;
  signals: Array<{
    key: string;
    label: string;
    severity: string;
    impact: number;
    detail: string;
  }>;
}

/**
 * Calculate fraud score from detected signals
 */
/**
 * Calculate fraud score from detected signals using the unified fraud-meter engine.
 * Delegates to buildFraudMeter() via score-adapter for consistency with API routes.
 */
export function calculateFraudScore(
  signals: DetectedSignal[],
): FraudScoreResult {
  if (signals.length === 0) {
    return {
      score: 0,
      level: "low",
      bandLabel: "Low Risk",
      baseScore: 0,
      corroborationCount: 0,
      activeSignalCount: 0,
      explanation: "No fraud signals detected",
      signals: [],
    };
  }

  // Use unified scoring via fraud-meter (canonical engine)
  const result = unifiedScore({ signals, categoryId: "charities" });

  // Calculate base score from signal impacts for backwards compatibility
  let baseScore = signals.reduce((sum, s) => sum + (s.scoreImpact || 0), 0);
  baseScore = Math.min(baseScore, 85);

  // Generate explanation
  const criticalSignals = signals.filter((s) => s.severity === "critical");
  const highSignals = signals.filter((s) => s.severity === "high");

  let explanation = `Detected ${signals.length} fraud signal`;
  if (signals.length !== 1) explanation += "s";
  explanation += ".";

  if (criticalSignals.length > 0) {
    explanation += ` Includes ${criticalSignals.length} critical issue`;
    if (criticalSignals.length !== 1) explanation += "s";
    explanation +=
      ": " + criticalSignals.map((s) => s.signalLabel).join(", ") + ".";
  }

  if (highSignals.length > 0 && criticalSignals.length === 0) {
    explanation += ` Includes ${highSignals.length} high-severity signal`;
    if (highSignals.length !== 1) explanation += "s";
    explanation += ".";
  }

  // Build signal summary
  const signalSummary = signals.map((s) => ({
    key: s.signalKey,
    label: s.signalLabel,
    severity: s.severity,
    impact: s.scoreImpact || 0,
    detail: s.detail,
  }));

  // Map fraud-meter level back to legacy format for backwards compatibility
  const legacyLevel = result.level as "low" | "medium" | "high" | "critical";

  return {
    score: result.score,
    level: legacyLevel,
    bandLabel: result.bandLabel,
    baseScore,
    corroborationCount: result.corroborationCount,
    activeSignalCount: signals.length,
    explanation,
    signals: signalSummary,
  };
}

/**
 * Persist fraud score snapshot to database
 */
export async function persistFraudSnapshot(
  entityId: string,
  scoreResult: FraudScoreResult,
): Promise<void> {
  try {
    // Mark previous snapshots as not current
    await prisma.fraudSnapshot.updateMany({
      where: { entityId, isCurrent: true },
      data: { isCurrent: false },
    });

    // Create new snapshot
    await prisma.fraudSnapshot.create({
      data: {
        entityId,
        score: scoreResult.score,
        level: scoreResult.level,
        bandLabel: scoreResult.bandLabel,
        baseScore: scoreResult.baseScore,
        corroborationCount: scoreResult.corroborationCount,
        activeSignalCount: scoreResult.activeSignalCount,
        explanation: scoreResult.explanation,
        methodologyVersion: "v1",
        isCurrent: true,
        computedAt: new Date(),
      },
    });

    console.log(
      `Persisted fraud snapshot for ${entityId}: score=${scoreResult.score}, level=${scoreResult.level}`,
    );
  } catch (error) {
    console.error(`Error persisting fraud snapshot for ${entityId}:`, error);
    throw error;
  }
}

/**
 * Calculate and persist fraud score for a single entity
 */
export async function scoreEntity(
  entityId: string,
  signals?: DetectedSignal[],
): Promise<FraudScoreResult> {
  // Get active signals if not provided
  if (!signals) {
    const signalEvents = await prisma.fraudSignalEvent.findMany({
      where: {
        entityId,
        status: "active",
      },
      select: {
        signalKey: true,
        signalLabel: true,
        severity: true,
        scoreImpact: true,
        detail: true,
        observedAt: true,
      },
    });

    signals = signalEvents.map((e) => ({
      entityId,
      signalKey: e.signalKey,
      signalLabel: e.signalLabel,
      severity: e.severity as any,
      scoreImpact: e.scoreImpact ?? undefined,
      detail: e.detail,
      observedAt: e.observedAt,
      sourceSystemId: undefined,
      measuredValue: undefined,
      measuredText: undefined,
      thresholdValue: undefined,
      sourceRecordId: undefined,
      methodologyVersion: "v1",
      status: "active" as const,
    }));
  }

  // Calculate score
  const result = calculateFraudScore(signals);

  // Persist snapshot
  await persistFraudSnapshot(entityId, result);

  return result;
}

/**
 * Batch score all entities with active signals
 */
export async function batchScoreEntities(
  batchSize: number = 100,
  categoryId?: string,
): Promise<{ processed: number; scored: number }> {
  console.log("Starting batch fraud scoring...");

  let processed = 0;
  let scored = 0;
  let offset = 0;

  // Get entity IDs that have active fraud signals
  const signalEntityIds = await prisma.fraudSignalEvent.findMany({
    where: { status: "active" },
    select: { entityId: true },
    distinct: ["entityId"],
  });

  const uniqueEntityIds = [...new Set(signalEntityIds.map((s) => s.entityId))];
  const totalCount = uniqueEntityIds.length;

  console.log(`Found ${totalCount} entities with active signals to score`);

  // Process in batches
  for (let i = 0; i < totalCount; i += batchSize) {
    const batchEntityIds = uniqueEntityIds.slice(i, i + batchSize);

    if (batchEntityIds.length === 0) break;

    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1} (${i}-${Math.min(i + batchSize, totalCount)} of ${totalCount})`,
    );

    const entities = await prisma.canonicalEntity.findMany({
      where: { id: { in: batchEntityIds } },
      select: { id: true, categoryId: true },
    });

    if (entities.length === 0) break;

    console.log(
      `Processing batch ${Math.floor(offset / batchSize) + 1} (${offset}-${Math.min(offset + batchSize, totalCount)} of ${totalCount})`,
    );

    for (const entity of entities) {
      try {
        const signalEvents = await prisma.fraudSignalEvent.findMany({
          where: {
            entityId: entity.id,
            status: "active",
          },
          select: {
            signalKey: true,
            signalLabel: true,
            severity: true,
            scoreImpact: true,
            detail: true,
            observedAt: true,
          },
        });

        if (signalEvents.length > 0) {
          const signals = signalEvents.map((e) => ({
            entityId: entity.id,
            signalKey: e.signalKey,
            signalLabel: e.signalLabel,
            severity: e.severity as any,
            scoreImpact: e.scoreImpact ?? undefined,
            detail: e.detail,
            observedAt: e.observedAt,
            sourceSystemId: undefined,
            measuredValue: undefined,
            measuredText: undefined,
            thresholdValue: undefined,
            sourceRecordId: undefined,
            methodologyVersion: "v1",
            status: "active" as const,
          }));

          const result = calculateFraudScore(signals);
          await persistFraudSnapshot(entity.id, result);
          scored++;
        }

        processed++;
      } catch (error) {
        console.error(`Error scoring entity ${entity.id}:`, error);
        processed++;
      }
    }

    offset += batchSize;

    if (processed % 100 === 0) {
      console.log(
        `Progress: ${processed}/${totalCount} entities, ${scored} scored`,
      );
    }
  }

  console.log("\n=== Batch Scoring Complete ===");
  console.log(`Entities Processed: ${processed}`);
  console.log(`Entities Scored (with signals): ${scored}`);

  return { processed, scored };
}

// CLI entry point
if (require.main === module) {
  const command = process.argv[2];
  const entityId = process.argv[3];

  switch (command) {
    case "entity":
      if (!entityId) {
        console.error(
          "Usage: tsx lib/fraud-scoring/scorer.ts entity <entityId>",
        );
        process.exit(1);
      }

      scoreEntity(entityId)
        .then((result) => {
          console.log("\nFraud Score Result:");
          console.log(`  Score: ${result.score}/100`);
          console.log(
            `  Level: ${result.level.toUpperCase()} (${result.bandLabel})`,
          );
          console.log(`  Active Signals: ${result.activeSignalCount}`);
          console.log(`  Corroboration Count: ${result.corroborationCount}`);
          console.log(`  Explanation: ${result.explanation}`);

          if (result.signals.length > 0) {
            console.log("\nContributing Signals:");
            result.signals.forEach((s) => {
              console.log(
                `  - [${s.severity.toUpperCase()}] ${s.label} (+${s.impact})`,
              );
            });
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          process.exit(1);
        });
      break;

    case "batch":
      const categoryId = process.argv[3];
      batchScoreEntities(100, categoryId)
        .then((stats) => {
          console.log("\nBatch complete:", stats);
          process.exit(0);
        })
        .catch((error) => {
          console.error("Batch failed:", error);
          process.exit(1);
        });
      break;

    default:
      console.log("Usage: tsx lib/fraud-scoring/scorer.ts <command> [options]");
      console.log("\nCommands:");
      console.log(
        "  entity <entityId>     Calculate and persist score for a single entity",
      );
      console.log(
        "  batch [categoryId]    Score all entities with active signals (optionally filtered by category)",
      );
      process.exit(1);
  }
}
