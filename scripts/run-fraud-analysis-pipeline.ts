/**
 * Fraud Analysis Pipeline Orchestrator
 *
 * Runs the complete fraud detection and scoring pipeline:
 * 1. Detects fraud signals for all entities
 * 2. Calculates weighted fraud scores
 * 3. Updates search indexes with new risk data
 * 4. Generates summary reports
 *
 * Usage:
 *   npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 1000
 */

import { batchDetectCharitySignals } from "../lib/fraud-scoring/signal-detectors";
import { batchScoreEntities } from "../lib/fraud-scoring/scorer";
import { indexNewEntities } from "../lib/search/indexer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface PipelineOptions {
  category: string;
  limit?: number;
  detectOnly?: boolean;
  scoreOnly?: boolean;
  reindex?: boolean;
}

async function runPipeline(options: PipelineOptions): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       TrackFraud Fraud Analysis Pipeline                  ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════╝\n",
  );

  const startTime = Date.now();

  // Phase 1: Signal Detection
  if (!options.scoreOnly) {
    console.log("📊 PHASE 1: Fraud Signal Detection");
    console.log("=".repeat(50));

    const detectionStart = Date.now();

    let detectionStats;
    if (options.category === "charity") {
      detectionStats = await batchDetectCharitySignals(100, options.limit);
    } else {
      console.log(
        `⚠️  Signal detection for category "${options.category}" not yet implemented`,
      );
      console.log('   Only "charity" category is currently supported\n');
      detectionStats = { processed: 0, signalsDetected: 0 };
    }

    const detectionTime = ((Date.now() - detectionStart) / 1000).toFixed(1);
    console.log(`\n✅ Signal Detection Complete (${detectionTime}s)`);
    console.log(`   Entities Processed: ${detectionStats.processed}`);
    console.log(`   Signals Detected: ${detectionStats.signalsDetected}\n`);

    if (options.detectOnly) {
      console.log("🛑 Stopping after detection phase (--detect-only flag)\n");
      return;
    }
  }

  // Phase 2: Fraud Scoring
  console.log("🎯 PHASE 2: Fraud Score Calculation");
  console.log("=".repeat(50));

  const scoringStart = Date.now();
  const scoringStats = await batchScoreEntities(100, options.category);
  const scoringTime = ((Date.now() - scoringStart) / 1000).toFixed(1);

  console.log(`\n✅ Fraud Scoring Complete (${scoringTime}s)`);
  console.log(`   Entities Scored: ${scoringStats.scored}`);
  console.log(`   Total Processed: ${scoringStats.processed}\n`);

  // Generate score distribution report
  console.log("📈 Score Distribution Report");
  console.log("-".repeat(50));

  const scoreDistribution = await prisma.$queryRawUnsafe<
    Array<{
      level: string;
      count: number;
    }>
  >(
    `
    SELECT
      "level",
      COUNT(*)::int as count
    FROM "FraudSnapshot"
    WHERE "isCurrent" = true
    GROUP BY "level"
    ORDER BY
      CASE "level"
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END
    `,
  );

  if (scoreDistribution.length > 0) {
    scoreDistribution.forEach((row) => {
      const barLength =
        scoringStats.scored > 0
          ? Math.round((row.count / scoringStats.scored) * 40)
          : 0;
      const bar = "█".repeat(barLength) + " ".repeat(40 - barLength);
      console.log(
        `  ${row.level.toUpperCase().padEnd(10)} |${bar.padEnd(40)}| ${row.count}`,
      );
    });
  }

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

  if (avgScoreResult[0] && avgScoreResult[0].avg !== null) {
    console.log(
      `\n  Average Score: ${Number(avgScoreResult[0].avg).toFixed(1)}/100`,
    );
  }

  // Phase 3: Search Index Update
  if (options.reindex) {
    console.log("\n🔍 PHASE 3: Search Index Update");
    console.log("=".repeat(50));

    const indexingStart = Date.now();

    // Index entities updated in last hour (when we ran detection/scoring)
    const sinceDate = new Date(Date.now() - 60 * 60 * 1000);
    const indexStats = await indexNewEntities(sinceDate, 100);

    const indexingTime = ((Date.now() - indexingStart) / 1000).toFixed(1);

    console.log(`\n✅ Search Index Update Complete (${indexingTime}s)`);
    console.log(`   Entities Indexed: ${indexStats.successfullyIndexed}`);
    console.log(`   Failed: ${indexStats.failed}\n`);
  }

  // Final Summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║              PIPELINE EXECUTION COMPLETE                  ║");
  console.log(
    "╚═══════════════════════════════════════════════════════════╝\n",
  );

  console.log(`Total Execution Time: ${totalTime}s`);
  console.log("\nNext Steps:");
  console.log("  1. Review high-risk entities in dashboard");
  console.log("  2. Investigate critical fraud signals");
  console.log("  3. Set up scheduled pipeline runs (recommended: daily)");
}

// Parse command line arguments
function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  const options: PipelineOptions = {
    category: "charity", // default
    limit: undefined,
    detectOnly: false,
    scoreOnly: false,
    reindex: true, // default to reindex
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
          "  --category, -c <cat>   Entity category (default: charity)",
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
        console.log("  --help, -h             Show this help message\n");
        console.log("Examples:\n");
        console.log("  # Run full pipeline on charities (limited to 1000)");
        console.log(
          "  npx tsx scripts/run-fraud-analysis-pipeline.ts --category charity --limit 1000\n",
        );

        console.log("  # Score only (signals already detected)");
        console.log(
          "  npx tsx scripts/run-fraud-analysis-pipeline.ts --score-only\n",
        );

        console.log("  # Detection only");
        console.log(
          "  npx tsx scripts/run-fraud-analysis-pipeline.ts --detect-only\n",
        );
        process.exit(0);
    }
  }

  return options;
}

// Main entry point
if (require.main === module) {
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
