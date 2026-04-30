/**
 * Fraud Analysis Pipeline Orchestrator
 *
 * Runs the complete fraud detection and scoring pipeline:
 * 1. Detects fraud signals for all entities
 * 2. Calculates weighted fraud scores
 * 3. Updates search indexes with new risk data
 * 4. Generates summary reports
 * 5. Tracks execution in PipelineRun model
 *
 * Usage:
 *   npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 1000
 */

import { batchDetectCharitySignals } from "../lib/fraud-scoring/signal-detectors";
import { batchDetectHealthcareSignals } from "../lib/fraud-scoring/healthcare-detectors";
import { batchDetectConsumerSignals } from "../lib/fraud-scoring/consumer-detectors";
import { batchScoreEntities } from "../lib/fraud-scoring/scorer";
import { indexNewEntities } from "../lib/search/indexer";
import { prisma } from "../lib/db";

interface PipelineOptions {
  category: string;
  limit?: number;
  detectOnly?: boolean;
  scoreOnly?: boolean;
  reindex?: boolean;
  triggeredBy?: string;
}

/**
 * Create or update a PipelineRun record
 */
async function createPipelineRun(
  options: PipelineOptions,
  triggeredBy: string = "manual",
): Promise<string> {
  const dateStr = new Date().toISOString().split("T")[0];
  const name = `${options.category}-daily-${dateStr}`;

  const run = await prisma.pipelineRun.create({
    data: {
      name,
      category: options.category || null,
      status: "pending",
      triggeredBy,
      phaseDetection: options.scoreOnly ? "completed" : "pending",
      phaseScoring: "pending",
      phaseReindex: options.reindex ? "pending" : "completed",
    },
  });

  return run.id;
}

/**
 * Update a PipelineRun record with phase results
 */
async function updatePipelineRun(
  runId: string,
  updates: {
    status?: string;
    phaseDetection?: string;
    phaseScoring?: string;
    phaseReindex?: string;
    entitiesProcessed?: number;
    signalsDetected?: number;
    entitiesScored?: number;
    entitiesIndexed?: number;
    avgScore?: number;
    errorSummary?: string;
    errorDetails?: string;
  },
): Promise<void> {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      ...updates,
      updatedAt: new Date(),
      ...(updates.status === "completed" || updates.status === "failed"
        ? { completedAt: new Date() }
        : {}),
    },
  });
}

/**
 * Main pipeline execution with PipelineRun tracking
 */
async function runPipeline(options: PipelineOptions): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       TrackFraud Fraud Analysis Pipeline                  ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════╝\n",
  );

  const startTime = Date.now();
  const runId = await createPipelineRun(
    options,
    options.triggeredBy || "manual",
  );
  console.log(`Pipeline Run ID: ${runId}\n`);

  try {
    // Mark as running
    await updatePipelineRun(runId, { status: "running" });

    // Phase 1: Signal Detection
    if (!options.scoreOnly) {
      console.log("📊 PHASE 1: Fraud Signal Detection");
      console.log("=".repeat(50));
      await updatePipelineRun(runId, { phaseDetection: "running" });

      const detectionStart = Date.now();
      let detectionStats: { processed: number; signalsDetected: number };

      try {
        switch (options.category) {
          case "charity":
            detectionStats = await batchDetectCharitySignals(
              100,
              options.limit,
            );
            break;
          case "healthcare":
            detectionStats = await batchDetectHealthcareSignals(
              100,
              options.limit,
            );
            break;
          case "consumer":
            detectionStats = await batchDetectConsumerSignals(
              100,
              options.limit,
            );
            break;
          default:
            console.log(
              `⚠️  Signal detection for category "${options.category}" not yet implemented`,
            );
            console.log(
              "   Supported categories: charity, healthcare, consumer\n",
            );
            detectionStats = { processed: 0, signalsDetected: 0 };
        }

        const detectionTime = ((Date.now() - detectionStart) / 1000).toFixed(1);
        console.log(`\n✅ Signal Detection Complete (${detectionTime}s)`);
        console.log(`   Entities Processed: ${detectionStats.processed}`);
        console.log(`   Signals Detected: ${detectionStats.signalsDetected}\n`);

        await updatePipelineRun(runId, {
          phaseDetection: "completed",
          entitiesProcessed: detectionStats.processed,
          signalsDetected: detectionStats.signalsDetected,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Signal Detection Failed: ${msg}\n`);
        await updatePipelineRun(runId, {
          phaseDetection: "failed",
          status: "failed",
          errorSummary: `Signal detection failed: ${msg}`,
        });
        throw error;
      }

      if (options.detectOnly) {
        console.log("🛑 Stopping after detection phase (--detect-only flag)\n");
        await updatePipelineRun(runId, {
          status: "completed",
          phaseScoring: "completed",
        });
        return;
      }
    }

    // Phase 2: Fraud Scoring
    console.log("🎯 PHASE 2: Fraud Score Calculation");
    console.log("=".repeat(50));
    await updatePipelineRun(runId, { phaseScoring: "running" });

    const scoringStart = Date.now();
    let scoringStats: { processed: number; scored: number };

    try {
      scoringStats = await batchScoreEntities(100, options.category);
      const scoringTime = ((Date.now() - scoringStart) / 1000).toFixed(1);

      console.log(`\n✅ Fraud Scoring Complete (${scoringTime}s)`);
      console.log(`   Entities Scored: ${scoringStats.scored}`);
      console.log(`   Total Processed: ${scoringStats.processed}\n`);

      // Get average score
      const avgScoreResult = await prisma.$queryRawUnsafe<
        Array<{ avg: number | null }>
      >(
        `
        SELECT COALESCE(AVG(score::float), 0) as avg
        FROM "FraudSnapshot"
        WHERE "isCurrent" = true
        `,
      );

      const avgScore =
        avgScoreResult[0]?.avg !== null ? Number(avgScoreResult[0].avg) : 0;

      await updatePipelineRun(runId, {
        phaseScoring: "completed",
        entitiesScored: scoringStats.scored,
        avgScore,
      });

      // Score distribution report
      console.log("📈 Score Distribution Report");
      console.log("-".repeat(50));

      const scoreDistribution = await prisma.$queryRawUnsafe<
        Array<{ level: string; count: number }>
      >(
        `
        SELECT "level", COUNT(*)::int as count
        FROM "FraudSnapshot"
        WHERE "isCurrent" = true
        GROUP BY "level"
        ORDER BY CASE "level"
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
        `,
      );

      if (scoreDistribution.length > 0 && scoringStats.scored > 0) {
        scoreDistribution.forEach((row) => {
          const barLength = Math.round((row.count / scoringStats.scored) * 40);
          const bar = "█".repeat(barLength) + " ".repeat(40 - barLength);
          console.log(
            `  ${row.level.toUpperCase().padEnd(10)} |${bar.padEnd(40)}| ${row.count}`,
          );
        });
      }

      if (avgScore > 0) {
        console.log(`\n  Average Score: ${avgScore.toFixed(1)}/100`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Fraud Scoring Failed: ${msg}\n`);
      await updatePipelineRun(runId, {
        phaseScoring: "failed",
        status: "failed",
        errorSummary: `Fraud scoring failed: ${msg}`,
      });
      throw error;
    }

    // Phase 3: Search Index Update
    if (options.reindex) {
      console.log("\n🔍 PHASE 3: Search Index Update");
      console.log("=".repeat(50));
      await updatePipelineRun(runId, { phaseReindex: "running" });

      const indexingStart = Date.now();

      try {
        const sinceDate = new Date(Date.now() - 60 * 60 * 1000);
        const indexStats = await indexNewEntities(sinceDate, 100);
        const indexingTime = ((Date.now() - indexingStart) / 1000).toFixed(1);

        console.log(`\n✅ Search Index Update Complete (${indexingTime}s)`);
        console.log(`   Entities Indexed: ${indexStats.successfullyIndexed}`);
        console.log(`   Failed: ${indexStats.failed}\n`);

        await updatePipelineRun(runId, {
          phaseReindex: "completed",
          entitiesIndexed: indexStats.successfullyIndexed,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`\n⚠️ Search Index Update Failed: ${msg}\n`);
        await updatePipelineRun(runId, {
          phaseReindex: "failed",
          errorSummary: `Search indexing failed: ${msg}`,
        });
        // Don't throw - indexing failure shouldn't fail the whole pipeline
      }
    }

    // Final Summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    await updatePipelineRun(runId, { status: "completed" });

    console.log(
      "╔═══════════════════════════════════════════════════════════╗",
    );
    console.log(
      "║              PIPELINE EXECUTION COMPLETE                  ║",
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════╝\n",
    );
    console.log(`Total Execution Time: ${totalTime}s`);
    console.log(`Pipeline Run ID: ${runId}`);
    console.log("\nNext Steps:");
    console.log("  1. Review high-risk entities in dashboard");
    console.log("  2. Investigate critical fraud signals");
    console.log("  3. Set up scheduled pipeline runs (recommended: daily)");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Pipeline failed: ${msg}`);
    throw error;
  }
}

// Parse command line arguments
function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    category: "charity",
    limit: undefined,
    detectOnly: false,
    scoreOnly: false,
    reindex: true,
    triggeredBy: "manual",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--category":
      case "-c":
        options.category = args[++i];
        break;
      case "--limit":
      case "-l":
        options.limit = parseInt(args[++i]);
        break;
      case "--detect-only":
        options.detectOnly = true;
        break;
      case "--score-only":
        options.scoreOnly = true;
        break;
      case "--no-reindex":
        options.reindex = false;
        break;
      case "--triggered-by":
        options.triggeredBy = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(
          "\nFraud Analysis Pipeline - Complete fraud detection workflow\n",
        );
        console.log(
          "Usage: npx tsx scripts/run-fraud-analysis-pipeline.ts [options]\n",
        );
        console.log("Options:");
        console.log(
          "  --category, -c <cat>   Entity category (charity|healthcare|consumer; default: charity)",
        );
        console.log(
          "  --limit, -l <num>      Limit number of entities to process",
        );
        console.log(
          "  --detect-only          Run signal detection only, skip scoring",
        );
        console.log(
          "  --score-only           Skip detection, run scoring on existing signals",
        );
        console.log(
          "  --no-reindex           Skip search index update after scoring",
        );
        console.log(
          "  --triggered-by <src>   Source of trigger (manual|cron|api|retry)",
        );
        console.log("  --help, -h             Show this help message\n");
        process.exit(0);
    }
  }

  return options;
}

// Main entry point
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

if (isMainModule) {
  const options = parseArgs();

  runPipeline(options)
    .then(() => {
      console.log("\n✅ Pipeline completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Pipeline failed:", error);
      process.exit(1);
    });
}

export { runPipeline, parseArgs };
