import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { spawn } from "child_process";

/**
 * GET /api/admin/pipeline-runs
 *
 * Returns recent pipeline run history.
 * Query params:
 *   - limit: number of runs to return (default: 20)
 *   - status: filter by status (pending, running, completed, failed)
 *   - category: filter by category
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || undefined;
    const category = searchParams.get("category") || undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const runs = await prisma.pipelineRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: Math.min(limit, 100),
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        triggeredBy: true,
        phaseDetection: true,
        phaseScoring: true,
        phaseReindex: true,
        entitiesProcessed: true,
        signalsDetected: true,
        entitiesScored: true,
        entitiesIndexed: true,
        avgScore: true,
        attemptNumber: true,
        maxAttempts: true,
        errorSummary: true,
        startedAt: true,
        completedAt: true,
      },
    });

    // Get summary stats
    const totalRuns = await prisma.pipelineRun.count();
    const completedRuns = await prisma.pipelineRun.count({
      where: { status: "completed" },
    });
    const failedRuns = await prisma.pipelineRun.count({
      where: { status: "failed" },
    });
    const runningRuns = await prisma.pipelineRun.count({
      where: { status: "running" },
    });

    return NextResponse.json({
      runs,
      summary: {
        total: totalRuns,
        completed: completedRuns,
        failed: failedRuns,
        running: runningRuns,
      },
    });
  } catch (error) {
    console.error("Failed to fetch pipeline runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch pipeline runs" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/pipeline-runs
 *
 * Trigger a new pipeline run.
 * Body:
 *   - category: string (required)
 *   - limit?: number
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, limit } = body;

    if (!category) {
      return NextResponse.json(
        { error: "Category is required" },
        { status: 400 },
      );
    }

    // Check if already running
    const isRunning = await prisma.pipelineRun.count({
      where: { category, status: "running" },
    });

    if (isRunning > 0) {
      return NextResponse.json(
        { error: `Pipeline already running for category: ${category}` },
        { status: 409 },
      );
    }

    // Create the run record
    const dateStr = new Date().toISOString().split("T")[0];
    const run = await prisma.pipelineRun.create({
      data: {
        name: `${category}-api-${dateStr}`,
        category,
        status: "pending",
        triggeredBy: "api",
        phaseDetection: "pending",
        phaseScoring: "pending",
        phaseReindex: "pending",
      },
    });

    // Trigger the pipeline in the background
    // (In production, this would use a job queue like BullMQ)

    const args = [
      "tsx",
      "scripts/run-fraud-analysis-pipeline.ts",
      "--category",
      category,
      "--triggered-by",
      "api",
    ];

    if (limit) {
      args.push("--limit", String(limit));
    }

    const child = spawn("npx", args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
    });

    child.unref(); // Don't keep the parent process alive

    return NextResponse.json({
      message: "Pipeline run triggered",
      runId: run.id,
    });
  } catch (error) {
    console.error("Failed to trigger pipeline:", error);
    return NextResponse.json(
      { error: "Failed to trigger pipeline" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/pipeline-runs/retry
 *
 * Retry all failed pipeline runs.
 */
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("id");

    if (runId) {
      // Retry specific run
      const run = await prisma.pipelineRun.findUnique({
        where: { id: runId },
      });

      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }

      if (run.status !== "failed") {
        return NextResponse.json(
          { error: "Only failed runs can be retried" },
          { status: 400 },
        );
      }

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

      // Trigger retry in background
      const category = run.category || "charity";
      const child = spawn(
        "npx",
        [
          "tsx",
          "scripts/run-fraud-analysis-pipeline.ts",
          "--category",
          category,
          "--triggered-by",
          "retry",
        ],
        {
          detached: true,
          stdio: "ignore",
        },
      );
      child.unref();

      return NextResponse.json({
        message: "Retry triggered",
        retryRunId: retryRun.id,
      });
    }

    // Retry all failed runs
    const failedRuns = await prisma.pipelineRun.findMany({
      where: { status: "failed" },
      take: 10,
    });

    const retries: string[] = [];

    for (const run of failedRuns) {
      if (run.attemptNumber >= run.maxAttempts) continue;

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
      retries.push(retryRun.id);
    }

    return NextResponse.json({
      message: `Retried ${retries.length} failed runs`,
      retryRunIds: retries,
    });
  } catch (error) {
    console.error("Failed to retry pipeline:", error);
    return NextResponse.json(
      { error: "Failed to retry pipeline" },
      { status: 500 },
    );
  }
}
