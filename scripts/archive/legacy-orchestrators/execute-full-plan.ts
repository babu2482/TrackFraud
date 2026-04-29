#!/usr/bin/env -S tsx
/**
 * Execute Full Plan - Comprehensive Data Ingestion & Platform Setup
 *
 * This script executes ALL phases of the TrackFraud platform build:
 * Phase 1: HIGH PRIORITY (Charities, Politics, Sanctions)
 * Phase 2: MEDIUM PRIORITY (Healthcare, Corporate, Consumer)
 * Phase 3: LOW PRIORITY (Government Awards, Environmental)
 * Phase 4: Fraud Scoring Engine
 * Phase 5: Search Indexing
 * Phase 6: Frontend Wire-up Verification
 *
 * Usage:
 *   # Execute everything from start to finish
 *   npx tsx scripts/execute-full-plan.ts --full
 *
 *   # Execute specific phases only
 *   npx tsx scripts/execute-full-plan.ts --phases 1,2,3
 *
 *   # Dry run (preview what will execute)
 *   npx tsx scripts/execute-full-plan.ts --dry-run
 *
 *   # Skip already-completed steps
 *   npx tsx scripts/execute-full-plan.ts --skip-complete
 */

import "dotenv/config";
import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/db";

// ============================================
// Configuration & State Tracking
// ============================================

interface PhaseConfig {
  id: number;
  name: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  steps: StepConfig[];
}

interface StepConfig {
  id: string;
  name: string;
  command: () => Promise<void>;
  expectedDurationMinutes?: number;
  skipIfComplete?: (state: ExecutionState) => boolean;
}

interface ExecutionState {
  startTime: Date;
  completedSteps: Set<string>;
  failedSteps: Map<string, Error>;
  logs: string[];
  stats: {
    totalRecordsBefore: number;
    totalRecordsAfter: number;
    ingestionRunsCreated: number;
  };
}

// ============================================
// Utility Functions
// ============================================

function log(message: string, level: "info" | "warn" | "error" = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = level === "info" ? "ℹ️" : level === "warn" ? "⚠️" : "❌";
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function logSuccess(message: string) {
  console.log(`✅ [${new Date().toLocaleTimeString()}] ${message}`);
}

function logPhase(phaseName: string) {
  console.log("\n" + "─".repeat(80));
  console.log(`🚀 PHASE: ${phaseName}`);
  console.log("─".repeat(80) + "\n");
}

async function runCommand(command: string, options?: { timeout?: number }) {
  log(`Executing: ${command}`);

  return new Promise<void>((resolve, reject) => {
    const parts = command.split(" ");
    const executable = parts.shift() || "";
    const args = parts;

    const child = spawn(executable, args, {
      stdio: "inherit",
      shell: true,
    });

    const timeout = options?.timeout || 3600000; // Default 1 hour

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeout / 60000} minutes`));
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function getDatabaseRecordCount(): Promise<number> {
  const tables = [
    "charityProfile",
    "politicalCandidateProfile",
    "bill",
    "healthcarePaymentRecord",
    "corporateCompanyProfile",
    "consumerComplaintRecord",
  ];

  let totalCount = 0;

  for (const table of tables) {
    try {
      const countQuery = prisma.$queryRaw`SELECT COUNT(*) as count FROM "${table}"`;
      const result = await prisma.$executeRawUnsafe(
        `SELECT COUNT(*) as count FROM "${table}"`,
      );

      if (Array.isArray(result) && result[0]?.count) {
        totalCount += Number(result[0].count);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Warning: Could not count ${table}: ${message}`, "warn");
    }
  }

  return totalCount;
}

async function checkSourceSystemsSeeded(): Promise<boolean> {
  try {
    const count = await prisma.sourceSystem.count();
    return count > 0;
  } catch (error) {
    return false;
  }
}

// ============================================
// Phase Definitions
// ============================================

const PHASES: PhaseConfig[] = [
  {
    id: 1,
    name: "HIGH PRIORITY - Charities, Politics & Sanctions",
    description:
      "Ingest IRS nonprofit data, political candidate information, bills/votes, and OFAC sanctions",
    priority: "HIGH",
    steps: [
      {
        id: "1.1-irs-eo-bmf-ca",
        name: "IRS EO BMF - California (Sample)",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-irs-eo-bmf.ts --codes ca --max-rows 5000",
            { timeout: 600000 }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
      {
        id: "1.2-irs-auto-revocation",
        name: "IRS Auto-Revocation List",
        command: async () => {
          await runCommand("npx tsx scripts/ingest-irs-auto-revocation.ts", {
            timeout: 900000, // 15 minutes
          });
        },
        expectedDurationMinutes: 15,
      },
      {
        id: "1.3-irs-pub78",
        name: "IRS Publication 78 (NTEE Categories)",
        command: async () => {
          await runCommand("npx tsx scripts/ingest-irs-pub78.ts", {
            timeout: 900000, // 15 minutes
          });
        },
        expectedDurationMinutes: 15,
      },
      {
        id: "1.4-congress-members",
        name: "Congress.gov - Current Members",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-propublica-politicians.ts --chamber house,senate",
            { timeout: 600000 }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
      {
        id: "1.5-congress-bills",
        name: "Congress.gov - Current Bills",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-congress-api.ts --bills --max-rows 2000",
            { timeout: 900000 }, // 15 minutes
          );
        },
        expectedDurationMinutes: 15,
      },
      {
        id: "1.6-congress-votes",
        name: "Congress.gov - Recent Votes",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-congress-api.ts --votes --max-rows 500",
            { timeout: 600000 }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
      {
        id: "1.7-fec-summaries",
        name: "FEC Campaign Finance Summaries",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-fec-summaries.ts",
            {
              timeout: 600000,
            }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
      {
        id: "1.8-ofac-sanctions",
        name: "OFAC SDN Sanctions List",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-ofac-sanctions.ts",
            {
              timeout: 600000,
            }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
    ],
  },
  {
    id: 2,
    name: "MEDIUM PRIORITY - Healthcare, Corporate & Consumer",
    description:
      "Ingest CMS Open Payments, SEC EDGAR filings, and CFPB consumer complaints",
    priority: "MEDIUM",
    steps: [
      {
        id: "2.1-cms-open-payments",
        name: "CMS Open Payments (Pharmaceutical Payments to Physicians)",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-cms-open-payments.ts --max-rows 50000",
            { timeout: 1800000 }, // 30 minutes
          );
        },
        expectedDurationMinutes: 30,
      },
      {
        id: "2.2-sec-edgar-simple",
        name: "SEC EDGAR - Company Master File (Sample)",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-sec-edgar-simple.ts",
            {
              timeout: 900000,
            }, // 15 minutes
          );
        },
        expectedDurationMinutes: 15,
      },
      {
        id: "2.3-cfpb-complaints",
        name: "CFPB Consumer Complaints (Sample)",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-cfpb-complaints.ts --max-rows 10000",
            { timeout: 900000 }, // 15 minutes
          );
        },
        expectedDurationMinutes: 15,
      },
      {
        id: "2.4-ftc-data-breaches",
        name: "FTC Data Breach Notifications",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-ftc-data-breach.ts",
            {
              timeout: 600000,
            }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
    ],
  },
  {
    id: 3,
    name: "LOW PRIORITY - Government Awards & Environmental",
    description: "Ingest USAspending awards data and EPA enforcement actions",
    priority: "LOW",
    steps: [
      {
        id: "3.1-usaspending-awards-sample",
        name: "USAspending Awards (Sample - FY2023)",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-usaspending-awards.ts --fiscal-year 2023 --max-rows 5000",
            { timeout: 1800000 }, // 30 minutes
          );
        },
        expectedDurationMinutes: 30,
      },
      {
        id: "3.2-epa-enforcement",
        name: "EPA ECHO Enforcement Actions",
        command: async () => {
          await runCommand(
            "npx tsx scripts/ingest-epa-enforcement.ts",
            {
              timeout: 900000,
            }, // 15 minutes
          );
        },
        expectedDurationMinutes: 15,
      },
    ],
  },
  {
    id: 4,
    name: "FRAUD SCORING ENGINE",
    description: "Run fraud detection algorithms and populate signal events",
    priority: "HIGH",
    steps: [
      {
        id: "4.1-run-fraud-analysis",
        name: "Execute Fraud Analysis Pipeline",
        command: async () => {
          await runCommand(
            "npx tsx scripts/run-fraud-analysis-pipeline.ts --all-categories",
            { timeout: 600000 }, // 10 minutes
          );
        },
        expectedDurationMinutes: 10,
      },
    ],
  },
  {
    id: 5,
    name: "SEARCH INDEXING",
    description: "Build Meilisearch indexes for all ingested data",
    priority: "HIGH",
    steps: [
      {
        id: "5.1-reindex-all",
        name: "Rebuild All Search Indexes",
        command: async () => {
          await runCommand(
            "npx tsx scripts/reindex-all.ts --full",
            {
              timeout: 900000,
            }, // 15 minutes
          );
        },
        expectedDurationMinutes: 15,
      },
    ],
  },
];

// ============================================
// Main Execution Logic
// ============================================

async function executePhase(
  phase: PhaseConfig,
  state: ExecutionState,
): Promise<void> {
  logPhase(phase.name);
  log(`Description: ${phase.description}`);
  log(`Priority: ${phase.priority}`);
  log(`Steps: ${phase.steps.length}`);

  for (const step of phase.steps) {
    // Check if we should skip this step
    if (step.skipIfComplete && step.skipIfComplete(state)) {
      log(`Skipping ${step.name} (already complete)`, "warn");
      state.completedSteps.add(step.id);
      continue;
    }

    // Check if already completed in previous run
    if (state.completedSteps.has(step.id)) {
      log(`Skipping ${step.name} (completed previously)`, "warn");
      continue;
    }

    log(
      `📌 Step: ${step.name}${step.expectedDurationMinutes ? ` (~${step.expectedDurationMinutes} min)` : ""}`,
    );

    try {
      await step.command();
      state.completedSteps.add(step.id);
      logSuccess(`✅ ${step.name}`);

      // Save progress after each successful step
      saveProgress(state);
    } catch (error) {
      state.failedSteps.set(step.id, error as Error);
      log(`❌ FAILED: ${step.name} - ${(error as Error).message}`, "error");

      // Don't stop on failure - continue to next step
    }

    console.log("");
  }
}

function saveProgress(state: ExecutionState) {
  const progressFile = join(__dirname, "..", ".execution-progress.json");

  writeFileSync(
    progressFile,
    JSON.stringify(
      {
        startTime: state.startTime.toISOString(),
        completedSteps: Array.from(state.completedSteps),
        failedSteps: Array.from(state.failedSteps.entries()).map(
          ([id, err]) => ({
            id,
            error: err.message,
          }),
        ),
        stats: state.stats,
      },
      null,
      2,
    ),
  );
}

function loadProgress(): ExecutionState | null {
  const progressFile = join(__dirname, "..", ".execution-progress.json");

  if (!existsSync(progressFile)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(progressFile, "utf-8"));

    return {
      startTime: new Date(data.startTime),
      completedSteps: new Set(data.completedSteps || []),
      failedSteps: new Map(
        (data.failedSteps || []).map((f: any) => [f.id, new Error(f.error)]),
      ),
      logs: [],
      stats: data.stats || {
        totalRecordsBefore: 0,
        totalRecordsAfter: 0,
        ingestionRunsCreated: 0,
      },
    };
  } catch (error) {
    log(`Failed to load progress file: ${error}`, "warn");
    return null;
  }
}

function parseArgs(): {
  full?: boolean;
  phases?: number[];
  dryRun?: boolean;
  skipComplete?: boolean;
} {
  const args = process.argv.slice(2);
  const result: any = {};

  for (const arg of args) {
    if (arg === "--full") {
      result.full = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--skip-complete") {
      result.skipComplete = true;
    } else if (arg.startsWith("--phases=")) {
      const phasesStr = arg.split("=")[1];
      result.phases = phasesStr.split(",").map((p: string) => parseInt(p, 10));
    }
  }

  return result;
}

async function main() {
  console.log(
    "╔═══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║     TRACKFRAUD - COMPREHENSIVE PLATFORM BUILD EXECUTOR        ║",
  );
  console.log(
    "╚═══════════════════════════════════════════════════════════════╝\n",
  );

  const args = parseArgs();

  // Initialize execution state
  let state: ExecutionState;

  if (args.skipComplete && loadProgress()) {
    log("Loading previous progress...");
    state = loadProgress()!;
  } else {
    console.log("\n📊 Starting fresh execution...\n");

    const initialCount = await getDatabaseRecordCount();
    log(`Current database records: ${initialCount.toLocaleString()}`);

    state = {
      startTime: new Date(),
      completedSteps: new Set(),
      failedSteps: new Map(),
      logs: [],
      stats: {
        totalRecordsBefore: initialCount,
        totalRecordsAfter: 0,
        ingestionRunsCreated: 0,
      },
    };
  }

  // Check prerequisites
  log("Checking prerequisites...");

  if (!(await checkSourceSystemsSeeded())) {
    log("⚠️ Source systems not seeded. Running seed...", "warn");

    try {
      await runCommand("npm run db:seed");
      logSuccess("✅ Source systems seeded");
    } catch (error) {
      log(
        "❌ Failed to seed source systems. Please run 'npm run db:seed' manually.",
        "error",
      );
      process.exit(1);
    }
  }

  // Dry run mode
  if (args.dryRun) {
    console.log("\n📋 DRY RUN MODE - No execution will occur\n");

    const phasesToExecute = args.phases
      ? PHASES.filter((p) => args.phases!.includes(p.id))
      : PHASES;

    for (const phase of phasesToExecute) {
      logPhase(phase.name);

      for (const step of phase.steps) {
        const status = state.completedSteps.has(step.id)
          ? "✅ COMPLETED"
          : "⏳ PENDING";
        console.log(`  ${status}: ${step.name}`);
      }
    }

    log("\nDry run complete. Use --full to actually execute.\n");
    await prisma.$disconnect();
    return;
  }

  // Execute phases
  const phasesToExecute = args.phases
    ? PHASES.filter((p) => args.phases!.includes(p.id))
    : PHASES;

  log(`Executing ${phasesToExecute.length} phase(s)...`);

  for (const phase of phasesToExecute) {
    await executePhase(phase, state);
  }

  // Final summary
  const finalCount = await getDatabaseRecordCount();
  state.stats.totalRecordsAfter = finalCount;

  console.log("\n" + "═".repeat(80));
  console.log("🏁 EXECUTION COMPLETE");
  console.log("═".repeat(80) + "\n");

  console.log(
    `⏱️  Total Duration: ${((Date.now() - state.startTime.getTime()) / 60000).toFixed(1)} minutes`,
  );
  console.log(
    `✅ Completed Steps: ${state.completedSteps.size}/${phasesToExecute.reduce((sum, p) => sum + p.steps.length, 0)}`,
  );
  console.log(`❌ Failed Steps: ${state.failedSteps.size}`);

  if (state.stats.totalRecordsBefore > 0 || state.stats.totalRecordsAfter > 0) {
    console.log(
      `📊 Records Added: ${(finalCount - state.stats.totalRecordsBefore).toLocaleString()}`,
    );
    console.log(`📈 Final Record Count: ${finalCount.toLocaleString()}`);
  }

  if (state.failedSteps.size > 0) {
    console.log("\n⚠️ Failed Steps:");

    for (const [stepId, error] of state.failedSteps.entries()) {
      console.log(`  - ${stepId}: ${error.message}`);
    }
  }

  console.log("\n📖 Next Steps:");
  console.log("  1. Verify data quality: npx tsx scripts/check-db-status.ts");
  console.log("  2. Check search indexes: curl http://localhost:7700/indexes");
  console.log(
    "  3. Test frontend: npm run dev (Next.js) + check category pages",
  );
  console.log(
    "  4. Set up background worker: npx tsx scripts/ingest-worker.ts --background\n",
  );

  await prisma.$disconnect();
}

// Run main function
main().catch((error) => {
  console.error("\n❌ FATAL ERROR:", error);
  process.exit(1);
});
