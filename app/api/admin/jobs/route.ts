import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getQueueHealth,
  allQueues,
  type QueueHealthStatus,
} from "@/lib/job-queues";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/jobs
 *
 * Returns job queue status, BullMQ queue health, and recent job history.
 * Provides real-time information about background job processing.
 */

interface IngestionJob {
  id: string;
  name: string;
  status: "running" | "completed" | "failed" | "pending" | "delayed";
  lastRun: string;
  recordsProcessed: number;
  progress?: number;
  sourceSystemId: string;
  queue?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeQueueHealth = searchParams.get("queues") === "true";

    // Fetch recent ingestion runs from database
    const ingestionRuns = await prisma.ingestionRun.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceSystemId: true,
        status: true,
        rowsRead: true,
        rowsInserted: true,
        rowsUpdated: true,
        rowsFailed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Map to job format
    const jobs: IngestionJob[] = ingestionRuns.map((run) => {
      const totalRecords =
        (run.rowsRead || 0) +
        (run.rowsInserted || 0) +
        (run.rowsUpdated || 0) +
        (run.rowsFailed || 0);

      let status: IngestionJob["status"];
      if (run.status === "running") status = "running";
      else if (run.status === "completed") status = "completed";
      else if (run.status === "failed" || run.status === "error")
        status = "failed";
      else status = "pending";

      let progress: number | undefined;
      if (status === "running" && run.rowsRead && run.rowsRead > 0) {
        const processed = (run.rowsInserted || 0) + (run.rowsUpdated || 0);
        progress = Math.min(100, Math.round((processed / run.rowsRead) * 100));
      }

      return {
        id: run.id,
        name: `${run.sourceSystemId} ingestion`,
        status,
        lastRun: new Date(run.createdAt).toISOString(),
        recordsProcessed: totalRecords,
        progress,
        sourceSystemId: run.sourceSystemId,
      };
    });

    // Optionally include BullMQ queue health
    let queueHealth: QueueHealthStatus[] | undefined;
    if (includeQueueHealth) {
      try {
        queueHealth = await getQueueHealth();
      } catch (error) {
        logger.warn(
          "Failed to get queue health (workers may not be running)",
          { error: String(error) },
          "admin-jobs",
        );
        queueHealth = [];
      }
    }

    // Return formatted response
    return NextResponse.json({
      jobs,
      queues: queueHealth,
      queueNames: allQueues.map((q) => q.name),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(
      "Error fetching admin jobs",
      { error: String(error) },
      "admin-jobs",
    );

    return NextResponse.json(
      {
        error: "Failed to fetch job status",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/jobs
 *
 * Submit a new job to a queue.
 *
 * Request body:
 * {
 *   queue: "fraud" | "ingestion" | "search",
 *   data: { ... queue-specific data ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queue, data } = body;

    if (!queue || !data) {
      return NextResponse.json(
        { error: "queue and data are required" },
        { status: 400 },
      );
    }

    let job;

    switch (queue) {
      case "fraud": {
        const { fraudQueue } = await import("@/lib/job-queues");
        job = await fraudQueue.add(data);
        break;
      }
      case "ingestion": {
        const { ingestionQueue } = await import("@/lib/job-queues");
        job = await ingestionQueue.add(data);
        break;
      }
      case "search": {
        const { searchQueue } = await import("@/lib/job-queues");
        job = await searchQueue.add(data);
        break;
      }
      default:
        return NextResponse.json(
          { error: `Unknown queue: ${queue}. Use: fraud, ingestion, search` },
          { status: 400 },
        );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        name: job.name,
        queue,
        createdAt: job.timestamp,
      },
    });
  } catch (error) {
    logger.error(
      "Error submitting job",
      { error: String(error) },
      "admin-jobs",
    );

    return NextResponse.json(
      {
        error: "Failed to submit job",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
