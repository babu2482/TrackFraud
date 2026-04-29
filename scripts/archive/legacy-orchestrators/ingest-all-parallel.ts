#!/usr/bin/env tsx
/**
 * Master Ingestion Orchestrator - Runs all data sources in parallel
 * 
 * This script coordinates all ingestion jobs and runs them in parallel
 * with proper rate limiting and error handling.
 * 
 * Usage:
 *   npx tsx scripts/ingest-all-parallel.ts [--continue] [--max-concurrent=N]
 * 
 * Options:
 *   --continue      Continue from last successful run
 *   --max-concurrent=N  Maximum parallel jobs (default: 4)
 */

import { PrismaClient } from "@prisma/client";
import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

interface IngestionTask {
  id: string;
  name: string;
  script: string;
  category: string;
  priority: "high" | "medium" | "low";
  args?: string[];
  estimatedDuration?: number; // seconds
}

const INGESTION_TASKS: IngestionTask[] = [
  // HIGH PRIORITY - Core data
  {
    id: "cms-open-payments",
    name: "CMS Open Payments",
    script: "ingest-cms-open-payments.ts",
    category: "healthcare",
    priority: "high",
    args: ["--full"],
  },
  {
    id: "fec-summaries",
    name: "FEC Campaign Finance",
    script: "ingest-fec-summaries.ts",
    category: "political",
    priority: "high",
    args: ["--full"],
  },
  {
    id: "usaspending-awards",
    name: "USASpending Awards",
    script: "ingest-usaspending-bulk.ts",
    category: "government",
    priority: "high",
    args: ["--full"],
  },
  {
    id: "fda-warning-letters",
    name: "FDA Warning Letters",
    script: "ingest-fda-warning-letters.ts",
    category: "healthcare",
    priority: "high",
  },
  {
    id: "ftc-data-breach",
    name: "FTC Data Breaches",
    script: "ingest-ftc-data-breach.ts",
    category: "consumer",
    priority: "high",
  },
  {
    id: "congress-api",
    name: "Congress API (Bills/Votes)",
    script: "ingest-congress-api.ts",
    category: "political",
    priority: "high",
    args: ["--bills", "--votes", "--sponsors"],
  },
  {
    id: "epa-enforcement",
    name: "EPA Enforcement",
    script: "ingest-epa-enforcement.ts",
    category: "environment",
    priority: "medium",
  },
  {
    id: "hhs-oig-exclusions",
    name: "HHS OIG Exclusions",
    script: "ingest-hhs-oig-exclusions.ts",
    category: "healthcare",
    priority: "medium",
  },
  {
    id: "sam-exclusions",
    name: "SAM.gov Exclusions",
    script: "ingest-sam-exclusions.ts",
    category: "government",
    priority: "medium",
  },
  {
    id: "federal-register",
    name: "Federal Register",
    script: "ingest-federal-register.ts",
    category: "government",
    priority: "medium",
  },
  {
    id: "propublica-nonprofit",
    name: "ProPublica Nonprofit",
    script: "ingest-propublica-nonprofit.ts",
    category: "charities",
    priority: "medium",
  },
  {
    id: "ofac-sanctions",
    name: "OFAC Sanctions",
    script: "ingest-ofac-sanctions.ts",
    category: "sanctions",
    priority: "medium",
  },
  {
    id: "cabinet-members",
    name: "Cabinet Members",
    script: "ingest-cabinet-members.ts",
    category: "political",
    priority: "medium",
  },
  {
    id: "cms-program-safeguard",
    name: "CMS Program Safeguard Exclusions",
    script: "ingest-cms-program-safeguard.ts",
    category: "healthcare",
    priority: "high",
  },
];

class IngestionOrchestrator {
  private tasks: IngestionTask[];
  private maxConcurrent: number;
  private runningJobs: Map<string, { process: any; startTime: Date }> = new Map();
  private completedJobs: Set<string> = new Set();
  private failedJobs: Set<string> = new Set();

  constructor(tasks: IngestionTask[], maxConcurrent: number = 4) {
    this.tasks = tasks;
    this.maxConcurrent = maxConcurrent;
  }

  async checkExistingData() {
    console.log("📊 Checking existing data in database...\n");

    const checks = [
      { name: "Charity Profiles", query: prisma.charityProfile.count() },
      { name: "Corporate Profiles", query: prisma.corporateCompanyProfile.count() },
      { name: "SEC Filings", query: prisma.corporateFilingRecord.count() },
      { name: "Canonical Entities", query: prisma.canonicalEntity.count() },
      { name: "Healthcare Payments", query: prisma.healthcarePaymentRecord.count() },
      { name: "Consumer Complaints", query: prisma.consumerComplaintRecord.count() },
      { name: "Government Awards", query: prisma.governmentAwardRecord.count() },
      { name: "Political Candidates", query: prisma.politicalCandidateProfile.count() },
      { name: "Bills", query: prisma.bill.count() },
      { name: "OFAC Sanctions", query: prisma.oFACSanction.count() },
    ];

    const results = await Promise.all(checks.map(async (c) => ({
      name: c.name,
      count: await c.query,
    })));

    console.log("Current Database State:");
    console.log("=".repeat(50));
    results.forEach((r) => {
      const countStr = r.count > 1000000 
        ? `${(r.count / 1000000).toFixed(1)}M`
        : r.count > 1000 
          ? `${(r.count / 1000).toFixed(1)}K`
          : r.count.toString();
      console.log(`  ${r.name.padEnd(25)} ${countStr.padStart(10)}`);
    });
    console.log("=".repeat(50));
    console.log();
  }

  async getCompletedTasks() {
    // Check which tasks have already been completed recently (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRuns = await prisma.ingestionRun.findMany({
      where: {
        startedAt: { gte: sevenDaysAgo },
        status: "completed",
      },
      include: {
        SourceSystem: { select: { slug: true } },
      },
    });

    const completedSlugs = new Set(
      recentRuns.map((r) => r.SourceSystem?.slug).filter(Boolean) as string[]
    );

    return this.tasks.filter((t) => completedSlugs.has(t.id));
  }

  async runTask(task: IngestionTask): Promise<void> {
    const scriptPath = join(__dirname, task.script);
    
    if (!existsSync(scriptPath)) {
      console.log(`⚠️  Script not found: ${task.script} - skipping`);
      this.failedJobs.add(task.id);
      return;
    }

    console.log(
      `▶️  Starting ${task.name} (${task.priority} priority)...`
    );

    const process = spawn("npx", ["tsx", scriptPath, ...(task.args || [])], {
      stdio: "inherit",
      shell: true,
    });

    this.runningJobs.set(task.id, {
      process,
      startTime: new Date(),
    });

    return new Promise((resolve) => {
      process.on("close", async (code: number) => {
        const jobInfo = this.runningJobs.get(task.id);
        this.runningJobs.delete(task.id);

        const duration =
          (Date.now() - (jobInfo?.startTime?.getTime() || Date.now())) /
          1000;

        if (code === 0) {
          console.log(
            `✅ ${task.name} completed successfully (${duration.toFixed(1)}s)`
          );
          this.completedJobs.add(task.id);

          // Record in database
          try {
            const sourceSystem = await prisma.sourceSystem.findFirst({
              where: { slug: task.id },
            });

            if (sourceSystem) {
              await prisma.ingestionRun.create({
                data: {
                  sourceSystemId: sourceSystem.id,
                  status: "completed",
                  startedAt: new Date(),
                  completedAt: new Date(),
                  rowsInserted: 0, // Will be updated by the script
                },
              });
            }
          } catch (err) {
            console.error(`Error recording ${task.id} in database:`, err);
          }
        } else {
          console.log(
            `❌ ${task.name} failed with code ${code} (${duration.toFixed(1)}s)`
          );
          this.failedJobs.add(task.id);
        }

        resolve();
      });

      process.on("error", (err: Error) => {
        console.error(`❌ ${task.name} error:`, err.message);
        this.runningJobs.delete(task.id);
        this.failedJobs.add(task.id);
        resolve();
      });
    });
  }

  async run(): Promise<void> {
    console.log("🚀 TrackFraud Data Ingestion Orchestrator");
    console.log("=".repeat(50));
    console.log();

    await this.checkExistingData();

    // Get already completed tasks
    const completedTasks = await this.getCompletedTasks();
    if (completedTasks.length > 0) {
      console.log(
        `ℹ️  ${completedTasks.length} tasks completed in last 7 days, skipping...`
      );
      this.tasks = this.tasks.filter(
        (t) => !completedTasks.find((c) => c.id === t.id)
      );
    }

    console.log(`📋 Total tasks to run: ${this.tasks.length}`);
    console.log(
      `⚡ Max concurrent jobs: ${this.maxConcurrent}`
    );
    console.log();

    // Sort by priority
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    this.tasks.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    // Process tasks with concurrency limit
    const queue = [...this.tasks];

    while (queue.length > 0 || this.runningJobs.size > 0) {
      // Start new jobs up to maxConcurrent
      while (
        this.runningJobs.size < this.maxConcurrent &&
        queue.length > 0
      ) {
        const task = queue.shift()!;
        this.runTask(task).catch((err) => {
          console.error(`Task ${task.id} error:`, err);
          this.failedJobs.add(task.id);
        });
      }

      // Wait for at least one job to complete
      if (this.runningJobs.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Print summary
    console.log();
    console.log("=".repeat(50));
    console.log("📊 Ingestion Summary");
    console.log("=".repeat(50));
    console.log(
      `✅ Completed: ${this.completedJobs.size} / ${this.tasks.length}`
    );
    console.log(`❌ Failed: ${this.failedJobs.size} / ${this.tasks.length}`);

    if (this.failedJobs.size > 0) {
      console.log("\nFailed tasks:");
      this.failedJobs.forEach((id) => {
        const task = this.tasks.find((t) => t.id === id);
        console.log(`  - ${task?.name || id}`);
      });
    }

    console.log();
    console.log("🎉 Ingestion orchestration complete!");
  }
}

// Main execution
async function main() {
  const args: string[] = process.argv.slice(2);
  const maxConcurrent = parseInt(
    (args.find((a: string) => a.startsWith("--max-concurrent="))?.split("=")[1] || "4"),
    10
  );

  const orchestrator = new IngestionOrchestrator(INGESTION_TASKS, maxConcurrent);
  await orchestrator.run();
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
