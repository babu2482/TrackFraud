#!/usr/bin/env -S tsx
/**
 * Political Data Synchronization Orchestration Script
 *
 * Orchestrates synchronization of all political data sources:
 * - Congress.gov (bills, votes)
 * - ProPublica Politicians API (politician profiles)
 * - Federal Register (rules, regulations, notices)
 * - FEC (campaign finance data)
 *
 * Usage:
 *   npx tsx scripts/sync-political-data.ts --all
 *   npx tsx scripts/sync-political-data.ts --bills --votes
 *   npx tsx scripts/sync-political-data.ts --politicians --federal-register
 *   npx tsx scripts/sync-political-data.ts --congress 118,117
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";

// ============================================================================
// Configuration
// ============================================================================

interface SyncConfig {
  name: string;
  script: string;
  description: string;
  args: string[];
  enabled: boolean;
}

const SYNC_CONFIGS: Record<string, SyncConfig> = {
  bills: {
    name: "Congress.gov Bills",
    script: "scripts/ingest-congress-api.ts",
    description: "Sync bills from Congress.gov API",
    args: ["--bills-only"],
    enabled: true,
  },
  votes: {
    name: "Congress.gov Votes",
    script: "scripts/ingest-congress-api.ts",
    description: "Sync votes from Congress.gov API",
    args: ["--votes-only"],
    enabled: true,
  },
  politicians: {
    name: "ProPublica Politicians",
    script: "scripts/ingest-propublica-politicians.ts",
    description: "Sync politician profiles from ProPublica API",
    args: ["--all"],
    enabled: true,
  },
  federalRegister: {
    name: "Federal Register",
    script: "scripts/ingest-federal-register.ts",
    description: "Sync rules and regulations from Federal Register",
    args: ["--type", "rules,notices"],
    enabled: true,
  },
  fec: {
    name: "FEC Campaign Finance",
    script: "scripts/ingest-fec-summaries.ts",
    description: "Sync campaign finance data from FEC",
    args: ["--all"],
    enabled: true,
  },
};

interface ParsedArgs {
  all: boolean;
  bills: boolean;
  votes: boolean;
  politicians: boolean;
  federalRegister: boolean;
  fec: boolean;
  congress?: number[];
  state?: string[];
  dateFrom?: string;
  agency?: string[];
  batchSize: number;
  parallel: boolean;
  skipFailed: boolean;
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    all: false,
    bills: false,
    votes: false,
    politicians: false,
    federalRegister: false,
    fec: false,
    congress: [],
    state: [],
    dateFrom: undefined,
    agency: [],
    batchSize: 100,
    parallel: false,
    skipFailed: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--all") {
      parsed.all = true;
      continue;
    }

    if (arg === "--bills") {
      parsed.bills = true;
      continue;
    }

    if (arg === "--votes") {
      parsed.votes = true;
      continue;
    }

    if (arg === "--politicians") {
      parsed.politicians = true;
      continue;
    }

    if (arg === "--federal-register" || arg === "--federalregister") {
      parsed.federalRegister = true;
      continue;
    }

    if (arg === "--fec") {
      parsed.fec = true;
      continue;
    }

    if (arg === "--congress") {
      const rawValue = argv[i + 1] ?? "";
      parsed.congress = rawValue
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => !Number.isNaN(value));
      i++;
      continue;
    }

    if (arg === "--state") {
      const rawValue = argv[i + 1] ?? "";
      parsed.state = rawValue.split(",").map((value) => value.trim().toUpperCase());
      i++;
      continue;
    }

    if (arg === "--date-from") {
      parsed.dateFrom = argv[i + 1];
      i++;
      continue;
    }

    if (arg === "--agency") {
      const rawValue = argv[i + 1] ?? "";
      parsed.agency = rawValue.split(",").map((value) => value.trim());
      i++;
      continue;
    }

    if (arg === "--batch-size") {
      const parsedSize = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(parsedSize) && parsedSize > 0) {
        parsed.batchSize = parsedSize;
      }
      i++;
      continue;
    }

    if (arg === "--parallel") {
      parsed.parallel = true;
      continue;
    }

    if (arg === "--no-skip-failed" || arg === "--fail-fast") {
      parsed.skipFailed = false;
      continue;
    }
  }

  return parsed;
}

// ============================================================================
// Sync Execution
// ============================================================================

interface SyncResult {
  name: string;
  success: boolean;
  durationMs: number;
  error?: string;
  output?: string;
}

async function runSync(
  config: SyncConfig,
  args: ParsedArgs,
): Promise<SyncResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔄 Starting: ${config.name}`);
  console.log(`${config.description}`);
  console.log("=".repeat(60));

  const startTime = Date.now();
  const scriptPath = path.resolve(config.script);

  // Build command arguments
  let cmdArgs = [...config.args];

  // Add congress filter if specified (for bills/votes)
  if (args.congress && args.congress.length > 0) {
    if (config.name.includes("Congress.gov")) {
      cmdArgs.push("--congress", args.congress.join(","));
    }
  }

  // Add state filter for politicians
  if (args.state && args.state.length > 0 && config.name.includes("Politicians")) {
    cmdArgs.push("--state", args.state.join(","));
  }

  // Add date/agency filters for Federal Register
  if (config.name.includes("Federal Register")) {
    if (args.dateFrom) {
      cmdArgs.push("--date-from", args.dateFrom);
    }
    if (args.agency && args.agency.length > 0) {
      cmdArgs.push("--agency", args.agency.join(","));
    }
  }

  // Add batch size
  cmdArgs.push("--batch-size", String(args.batchSize));

  console.log(`Command: npx tsx ${scriptPath} ${cmdArgs.join(" ")}`);
  console.log("-".repeat(60));

  try {
    const result = await new Promise<SyncResult>((resolve) => {
      const process = spawn("npx", ["tsx", scriptPath, ...cmdArgs], {
        stdio: ["inherit", "pipe", "pipe"],
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        const str = data.toString();
        stdout += str;
        console.log(str.trim()); // Real-time output
      });

      process.stderr.on("data", (data) => {
        const str = data.toString();
        stderr += str;
        console.error(str.trim()); // Real-time output
      });

      process.on("close", (code) => {
        resolve({
          name: config.name,
          success: code === 0,
          durationMs: Date.now() - startTime,
          error: code !== 0 ? `Exit code ${code}\n${stderr}` : undefined,
          output: stdout,
        });
      });

      process.on("error", (err) => {
        resolve({
          name: config.name,
          success: false,
          durationMs: Date.now() - startTime,
          error: `Spawn error: ${err.message}`,
        });
      });
    });

    const durationSec = result.durationMs / 1000;
    console.log("-".repeat(60));
    console.log(
      `${result.success ? "✅" : "❌"} ${config.name} completed in ${durationSec.toFixed(1)}s`,
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.log(`❌ ${config.name} failed: ${error}`);

    return {
      name: config.name,
      success: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Parallel Execution
// ============================================================================

async function runSyncsParallel(
  configs: SyncConfig[],
  args: ParsedArgs,
): Promise<SyncResult[]> {
  console.log(`\n🚀 Running ${configs.length} syncs in parallel...`);

  const results = await Promise.all(
    configs.map((config) => runSync(config, args)),
  );

  return results;
}

// ============================================================================
// Sequential Execution
// ============================================================================

async function runSyncsSequential(
  configs: SyncConfig[],
  args: ParsedArgs,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const config of configs) {
    const result = await runSync(config, args);
    results.push(result);

    if (!result.success && !args.skipFailed) {
      console.log(`\n⚠️  Stopping due to failure (--fail-fast mode)`);
      break;
    }
  }

  return results;
}

// ============================================================================
// Progress Tracking
// ============================================================================

async function updateSyncProgress(
  syncType: string,
  status: "started" | "completed" | "failed",
): Promise<void> {
  try {
    await prisma.politicalDataSync.upsert({
      where: { type: syncType },
      update: {
        lastRunAt: new Date(),
        lastStatus: status,
        consecutiveFailures: status === "failed" ? undefined : 0,
      },
      create: {
        type: syncType,
        lastRunAt: new Date(),
        lastStatus: status,
        consecutiveFailures: status === "failed" ? 1 : 0,
      },
    });
  } catch (error) {
    console.warn(`Failed to update sync progress for ${syncType}:`, error);
  }
}

// ============================================================================
// Summary Report
// ============================================================================

function printSummary(results: SyncResult[]): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 SYNCHRONIZATION SUMMARY");
  console.log("=".repeat(60));

  const total = results.length;
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`\nTotal syncs: ${total}`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(
    `⏱️  Total duration: ${(totalDurationMs / 1000).toFixed(1)}s`,
  );

  if (results.length > 0) {
    console.log("\n📋 Details:");
    console.log("-".repeat(60));

    for (const result of results) {
      const status = result.success ? "✅" : "❌";
      const duration = (result.durationMs / 1000).toFixed(1);
      console.log(`${status} ${result.name.padEnd(35)} (${duration}s)`);

      if (!result.success && result.error) {
        console.log(`   ⚠️  Error: ${result.error.split("\n")[0]}`);
      }
    }
  }

  console.log("=".repeat(60));
  console.log(
    `${successful === total ? "🎉 All syncs completed successfully!" : "⚠️  Some syncs failed. Check errors above."}`,
  );
  console.log("=".repeat(60) + "\n");
}

// ============================================================================
// Main Orchestration Logic
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("\n" + "█".repeat(60));
  console.log("█  🏛️  TRACKFRAUD - POLITICAL DATA SYNCHRONIZATION");
  console.log("█".repeat(60) + "\n");

  // Determine which syncs to run
  const selectedSyncs: string[] = [];

  if (args.all) {
    Object.keys(SYNC_CONFIGS).forEach((key) => {
      if (SYNC_CONFIGS[key].enabled) {
        selectedSyncs.push(key);
      }
    });
  } else {
    if (args.bills) selectedSyncs.push("bills");
    if (args.votes) selectedSyncs.push("votes");
    if (args.politicians) selectedSyncs.push("politicians");
    if (args.federalRegister) selectedSyncs.push("federalRegister");
    if (args.fec) selectedSyncs.push("fec");
  }

  // Default to all if nothing specified
  if (selectedSyncs.length === 0) {
    console.log("No sync type specified. Running all enabled syncs...\n");
    Object.keys(SYNC_CONFIGS).forEach((key) => {
      if (SYNC_CONFIGS[key].enabled) {
        selectedSyncs.push(key);
      }
    });
  }

  const configsToRun = selectedSyncs.map((key) => SYNC_CONFIGS[key]);

  console.log("📋 Sync Configuration:");
  console.log("-".repeat(60));
  console.log(`Mode: ${args.parallel ? "Parallel" : "Sequential"}`);
  console.log(`Fail-fast: ${!args.skipFailed}`);
  console.log(`Batch size: ${args.batchSize}`);
  if (args.congress && args.congress.length > 0) {
    console.log(`Congress sessions: ${args.congress.join(", ")}`);
  }
  if (args.state && args.state.length > 0) {
    console.log(`States: ${args.state.join(", ")}`);
  }
  console.log("-".repeat(60));

  console.log("\n🔄 Selected syncs:");
  for (const config of configsToRun) {
    console.log(`   • ${config.name}: ${config.description}`);
  }

  // Ensure logs directory exists
  const logsDir = path.resolve("logs/political-sync");
  fs.mkdirSync(logsDir, { recursive: true });

  // Run syncs
  let results: SyncResult[];

  if (args.parallel && configsToRun.length > 1) {
    results = await runSyncsParallel(configsToRun, args);
  } else {
    results = await runSyncsSequential(configsToRun, args);
  }

  // Update progress tracking in database
  for (const result of results) {
    const syncType = result.name.toLowerCase().replace(/\s+/g, "-");
    await updateSyncProgress(syncType, result.success ? "completed" : "failed");
  }

  // Print summary
  printSummary(results);

  // Exit with error code if any failed and not in skip mode
  const hasFailures = results.some((r) => !r.success);
  if (hasFailures && !args.skipFailed) {
    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main()
  .then(() => {
    console.log("✨ Political data synchronization orchestration complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Orchestration failed:", error);
    process.exit(1);
  });
