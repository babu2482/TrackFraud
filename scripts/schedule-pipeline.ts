#!/usr/bin/env tsx
/**
 * Pipeline Scheduler
 *
 * Orchestrates scheduled execution of the fraud analysis pipeline
 * across all categories. Designed to run as a long-lived process
 * or be triggered by external cron.
 *
 * Usage:
 *   npx tsx scripts/schedule-pipeline.ts              # Run once (all categories)
 *   npx tsx scripts/schedule-pipeline.ts --watch      # Run continuously (every 24h)
 *   npx tsx scripts/schedule-pipeline.ts --retry       # Retry failed runs
 *   npx tsx scripts/schedule-pipeline.ts --status      # Show recent run status
 */

import { prisma } from "../lib/db";
import { execSync } from "child_process";
import { spawn } from "child_process";

const CATEGORIES = ["charity", "healthcare", "consumer"] as const;
const DEFAULT_LIMIT = 500;
const SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CONCURRENT_RUNS = 1;

interface SchedulerArgs {
  watch?: boolean;
  retry?: boolean;
  status?: boolean;
  category?: string;
  limit?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): SchedulerArgs {
  const args = process.argv.slice(2);
  const result: SchedulerArgs = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--watch":
      case "-w":
        result.watch = true;
        break;
      case "--retry":
      case "-r":
        result.retry = true;
        break;
      case "--status":
      case "-s":
        result.status = true;
        break;
      case "--category":
      case "-c":
        result.category = args[++i];
        break;
      case "--limit":
      case "-l":
        result.limit = parseInt(args[++i]);
        break;
      case "--help":
      case "-h":
        console.log("\nPipeline Scheduler");
        console.log("\nUsage: npx tsx scripts/schedule-pipeline.ts [options]\n");
        console.log("Options:");
        console.log("  --watch, -w         Run continuously (default: every 24h)");
        console.log("  --retry, -r         Retry failed pipeline runs");
        console.log("  --status, -s        Show status of recent runs");
        console.log("  --category, -c <c>  Run only specific category");
        console.log("  --limit, -l <n>     Limit entities to process");
        console.log("  --help, -h          Show this help\n");
        process.exit(0);
    }
  }

  return result;
}

/**
 * Check if a run is already in progress for the given category
 */
async function isRunning(category: string | null): Promise<boolean> {
  const running = await prisma.pipelineRun.count({
    where: {
      status: "running",
      category,
    },
  });
  return running >= MAX_CONCURRENT_RUNS;
}

/**
 * Run the fraud analysis pipeline for a single category
 */
async function runCategoryPipeline(
  category: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ success: boolean; runId: string }> {
  if (await isRunning(category)) {
    console.log(`  ⏭️  Skipping ${category} — run already in progress`);
    return { success: false, runId: "" };
  }

  console.log(`\n🚀 Starting pipeline: ${category} (limit: ${limit})`);
  const startTime = Date.now();

  try {
    const cmd = "npx";
    const args = [
      "tsx",
      "scripts/run-fraud-analysis-pipeline.ts",
      "--category",
      category,
      "--limit",
      String(limit),
      "--triggered-by",
      "cron",
    ];

    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
    });

    await new Promise<void>((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Process exited with code ${code}`));
      });
      child.on("error", reject);
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ ${category} completed in ${duration}s`);

    // Get the latest run ID for this category
    const latestRun = await prisma.pipelineRun.findFirst({
      where: { category, status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });

    return { success: true, runId: latestRun?.id || "" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ ${category} failed: ${msg}`);
    return { success: false, runId: "" };
  }
}

/**
 * Run pipelines for all categories
 */
async function runAllPipelines(
  limit: number = DEFAULT_LIMIT,
  category?: string,
): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       TrackFraud Pipeline Scheduler                       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`\n📅 ${new Date().toISOString()}`);

  const categories = category
    ? [category]
    : (CATEGORIES as readonly string[]);

  const results: Array<{
    category: string;
    success: boolean;
    runId: string;
  }> = [];

  // Run sequentially to avoid overwhelming the database
  for (const cat of categories) {
    const result = await runCategoryPipeline(cat, limit);
    results.push({ category: cat, ...result });
  }

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("\n" + "─".repeat(55));
  console.log(
    `Scheduler Summary: ${succeeded} succeeded, ${failed} failed`,
  );
  console.log("─".repeat(55));
}

/**
 * Retry failed pipeline runs
 */
async function retryFailedRuns(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       TrackFraud Pipeline — Retry Failed Runs             ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Find failed runs that haven't exceeded max attempts
  const failedRuns = await prisma.pipelineRun.findMany({
    where: {
      status: "failed",
    },
    orderBy: { startedAt: "asc" },
    take: 10,
  });

  if (failedRuns.length === 0) {
    console.log("No failed runs to retry.\n");
    return;
  }

  console.log(`Found ${failedRuns.length} failed run(s) to retry:\n`);

  for (const run of failedRuns) {
    console.log(`  Run: ${run.name}`);
    console.log(`    Category: ${run.category || "all"}`);
    console.log(`    Error: ${run.errorSummary || "Unknown"}`);
    console.log(`    Attempt: ${run.attemptNumber}/${run.maxAttempts}`);

    if (run.attemptNumber >= run.maxAttempts) {
      console.log("    ⏭️  Max attempts reached, skipping\n");
      continue;
    }

    // Create a retry run
    const retryRun = await prisma.pipelineRun.create({
      data: {
        name: `${run.name}-retry-${run.attemptNumber + 1}`,
        category: run.category,
        status: "pending",
        triggeredBy: "retry",
        attemptNumber: run.attemptNumber + 1,
        maxAttempts: run.maxAttempts,
        parentRunId: run.id,
        phaseDetection: "pending",
        phaseScoring: "pending",
        phaseReindex: "pending",
      },
    });

    console.log(`    🔄 Creating retry run: ${retryRun.id}\n`);

    // Run the retry
    const category = run.category || "charity";
    await runCategoryPipeline(category);
  }
}

/**
 * Show status of recent pipeline runs
 */
async function showStatus(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║       TrackFraud Pipeline — Recent Runs                   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const runs = await prisma.pipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      triggeredBy: true,
      entitiesProcessed: true,
      entitiesScored: true,
      avgScore: true,
      errorSummary: true,
      startedAt: true,
      completedAt: true,
    },
  });

  if (runs.length === 0) {
    console.log("No pipeline runs found.\n");
    return;
  }

  console.log(
    `${"Name".padEnd(35)} ${"Status".padEnd(16)} ${"Category".padEnd(12)} ${"Scored".padEnd(8)} ${"Avg"}`,
  );
  console.log("─".repeat(85));

  for (const run of runs) {
    const name = run.name.substring(0, 33);
    const status = run.status.padEnd(16);
    const category = (run.category || "all").padEnd(12);
    const scored = String(run.entitiesScored).padEnd(8);
    const avg = run.avgScore ? run.avgScore.toFixed(1) : "-";

    console.log(`${name} ${status} ${category} ${scored} ${avg}`);

    if (run.errorSummary) {
      console.log(`  ⚠️  ${run.errorSummary}`);
    }
  }

  console.log(`\nShowing ${runs.length} most recent runs.\n`);
}

/**
 * Main scheduler loop
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.status) {
    await showStatus();
    return;
  }

  if (args.retry) {
    await retryFailedRuns();
    return;
  }

  if (args.watch) {
    console.log("🔄 Scheduler running in watch mode (24h interval)");
    console.log("Press Ctrl+C to stop.\n");

    // Run immediately on start
    await runAllPipelines(args.limit, args.category);

    // Schedule recurring runs
    const interval = setInterval(async () => {
      console.log(`\n\n⏰ Scheduled run triggered at ${new Date().toISOString()}`);
      try {
        await runAllPipelines(args.limit, args.category);
      } catch (error) {
        console.error("Scheduler error:", error);
      }
    }, SCHEDULE_INTERVAL_MS);

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n\n🛑 Stopping scheduler...");
      clearInterval(interval);
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n\n🛑 Stopping scheduler...");
      clearInterval(interval);
      process.exit(0);
    });
  } else {
    // Single run
    await runAllPipelines(args.limit, args.category);
  }
}

main().catch((error) => {
  console.error("Scheduler fatal error:", error);
  process.exit(1);
});
