#!/usr/bin/env node
/**
 * Background Worker Startup Script
 *
 * Starts BullMQ workers for all job queues.
 * Usage: npm run workers:start
 *
 * Workers run as a separate process from the Next.js server.
 * In production, run this via PM2, systemd, or Docker.
 */

import { QUEUE_NAMES, closeAllQueues } from "../lib/job-queues";
import {
  processFraudScore,
  processIngestion,
  processSearchReindex,
} from "../lib/job-processors";
import { logger } from "../lib/logger";
import { Worker } from "bullmq";

const module = "workers";

// ─── Worker Configuration ──────────────────────────────────────────────

interface WorkerConfig {
  queueName: string;
  concurrency: number;
  processor: (job: any, token: string) => Promise<any>;
  description: string;
}

const workerConfigs: WorkerConfig[] = [
  {
    queueName: QUEUE_NAMES.fraud,
    concurrency: 3,
    processor: async (job) => {
      const start = Date.now();
      logger.info(
        `Processing fraud score job: ${job.id}`,
        { jobId: job.id, data: job.data },
        "fraud-worker",
      );

      const result = await processFraudScore(job.data);

      const duration = Date.now() - start;
      logger.info(
        `Fraud score job completed: ${job.id} (${duration}ms)`,
        { jobId: job.id, duration, result },
        "fraud-worker",
      );

      return result;
    },
    description: "Fraud Scoring Worker (concurrency: 3)",
  },
  {
    queueName: QUEUE_NAMES.ingestion,
    concurrency: 2,
    processor: async (job) => {
      const start = Date.now();
      logger.info(
        `Processing ingestion job: ${job.id}`,
        { jobId: job.id, data: job.data },
        "ingestion-worker",
      );

      const result = await processIngestion(job.data);

      const duration = Date.now() - start;
      logger.info(
        `Ingestion job completed: ${job.id} (${duration}ms)`,
        { jobId: job.id, duration, result },
        "ingestion-worker",
      );

      return result;
    },
    description: "Ingestion Worker (concurrency: 2)",
  },
  {
    queueName: QUEUE_NAMES.search,
    concurrency: 1,
    processor: async (job) => {
      const start = Date.now();
      logger.info(
        `Processing search reindex job: ${job.id}`,
        { jobId: job.id, data: job.data },
        "search-worker",
      );

      const result = await processSearchReindex(job.data);

      const duration = Date.now() - start;
      logger.info(
        `Search reindex job completed: ${job.id} (${duration}ms)`,
        { jobId: job.id, duration, result },
        "search-worker",
      );

      return result;
    },
    description: "Search Reindex Worker (concurrency: 1)",
  },
];

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  logger.info("Starting TrackFraud background workers", {}, module);

  // Create workers
  const workers: Worker[] = [];

  for (const config of workerConfigs) {
    try {
      const worker = new Worker(config.queueName, config.processor, {
        connection: {
          url: process.env.REDIS_URL || "redis://localhost:6379",
          maxRetriesPerRequest: 3,
        },
        concurrency: config.concurrency,
        limiter:
          config.queueName === QUEUE_NAMES.fraud
            ? { max: 5, duration: 10000 }
            : undefined,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      });

      workers.push(worker);

      // Worker event handlers
      worker.on("completed", (job, result) => {
        logger.info(
          `Job ${job?.id} completed in queue ${config.queueName}`,
          { jobId: job?.id, result },
          module,
        );
      });

      worker.on("failed", (job, err) => {
        logger.error(
          `Job ${job?.id} failed in queue ${config.queueName}`,
          {
            jobId: job?.id,
            error: err.message,
            attempts: job?.attemptsMade,
          },
          module,
        );
      });

      worker.on("error", (err) => {
        logger.error(
          `Worker error in queue ${config.queueName}`,
          { error: err.message },
          module,
        );
      });

      logger.info(`Started ${config.description}`, {}, module);
    } catch (error) {
      logger.error(
        `Failed to start worker for queue ${config.queueName}`,
        { error: String(error) },
        module,
      );
    }
  }

  logger.info(
    `All workers started (${workers.length} workers running)`,
    { workerCount: workers.length },
    module,
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down workers...", {}, module);

    for (const worker of workers) {
      try {
        await worker.close();
      } catch {
        // Ignore
      }
    }

    await closeAllQueues();
    logger.info("Workers shut down cleanly", {}, module);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// ─── Entry Point ───────────────────────────────────────────────────────

main().catch((error) => {
  logger.error("Failed to start workers", { error: String(error) }, module);
  process.exit(1);
});
