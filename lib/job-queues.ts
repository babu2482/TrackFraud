/**
 * Job Queue Infrastructure — BullMQ-backed with Redis.
 *
 * Provides asynchronous processing for:
 * - Fraud scoring (signal detection + scoring)
 * - Data ingestion (bulk imports, source syncs)
 * - Search reindexing (Meilisearch index updates)
 *
 * All queues share a single Redis connection. Workers are started via
 * `npm run workers:start` (scripts/start-workers.ts).
 */

import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { logger } from "./logger";

// ─── Redis Connection ──────────────────────────────────────────────────

let bgRedis: Redis | null = null;

function getBackgroundRedis(): Redis {
  if (bgRedis && bgRedis.status === "ready") {
    return bgRedis;
  }

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  bgRedis = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 5) {
        logger.error(
          "Background Redis connection failed after 5 retries",
          {},
          "job-queues",
        );
        return null;
      }
      return Math.min(times * 500, 5000);
    },
  });

  bgRedis.on("connect", () => {
    logger.info("Background Redis connected", {}, "job-queues");
  });

  bgRedis.on("error", (err) => {
    logger.error(
      "Background Redis error",
      { error: err.message },
      "job-queues",
    );
  });

  bgRedis.connect().catch((err) => {
    logger.error(
      "Failed to connect to Background Redis",
      { error: err.message },
      "job-queues",
    );
  });

  return bgRedis;
}

// ─── Queue Names ───────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  fraud: "tf-fraud-scoring",
  ingestion: "tf-ingestion",
  search: "tf-search-reindex",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Queue Instances (singletons) ──────────────────────────────────────

const queues = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    const redis = getBackgroundRedis();
    queues.set(
      name,
      new Queue(name, {
        connection: redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      }),
    );
  }
  return queues.get(name)!;
}

// ─── Queue Proxy Interface ─────────────────────────────────────────────

interface QueueProxy {
  name: QueueName;
  add: (
    data: any,
    options?: { jobId?: string; priority?: number; delay?: number },
  ) => Promise<any>;
  getJob: (jobId: string) => Promise<any>;
  getJobCounts: () => Promise<Record<string, number>>;
}

/** The fraud scoring queue — processes signal detection and scoring. */
export const fraudQueue: QueueProxy = {
  name: QUEUE_NAMES.fraud,
  add: async (data, options) => {
    const queue = getQueue(QUEUE_NAMES.fraud);
    return queue.add("score", data, {
      jobId: options?.jobId || `score:${data.entityId}`,
      priority: options?.priority || 1,
      delay: options?.delay,
      removeOnComplete: 100,
      removeOnFail: 50,
    });
  },
  getJob: (jobId) => getQueue(QUEUE_NAMES.fraud).getJob(jobId),
  getJobCounts: () => getQueue(QUEUE_NAMES.fraud).getJobCounts(),
};

/** The ingestion queue — processes bulk data imports. */
export const ingestionQueue: QueueProxy = {
  name: QUEUE_NAMES.ingestion,
  add: async (data, options) => {
    const queue = getQueue(QUEUE_NAMES.ingestion);
    return queue.add("ingest", data, {
      jobId: options?.jobId || `ingest:${data.source}:${Date.now()}`,
      priority: options?.priority || 2,
      removeOnComplete: 50,
      removeOnFail: 25,
    });
  },
  getJob: (jobId) => getQueue(QUEUE_NAMES.ingestion).getJob(jobId),
  getJobCounts: () => getQueue(QUEUE_NAMES.ingestion).getJobCounts(),
};

/** The search reindex queue — processes Meilisearch index updates. */
export const searchQueue: QueueProxy = {
  name: QUEUE_NAMES.search,
  add: async (data, options) => {
    const queue = getQueue(QUEUE_NAMES.search);
    return queue.add("reindex", data, {
      jobId: options?.jobId || `reindex:${data.index}:${Date.now()}`,
      priority: options?.priority || 3,
      removeOnComplete: 50,
      removeOnFail: 25,
    });
  },
  getJob: (jobId) => getQueue(QUEUE_NAMES.search).getJob(jobId),
  getJobCounts: () => getQueue(QUEUE_NAMES.search).getJobCounts(),
};

/** Get all queue proxies. */
export const allQueues: QueueProxy[] = [
  fraudQueue,
  ingestionQueue,
  searchQueue,
];

// ─── Job Data Types ────────────────────────────────────────────────────

export interface FraudScoreJobData {
  entityId: string;
  entityType:
    | "charity"
    | "corporation"
    | "government_contractor"
    | "healthcare_provider";
  /** Run signal detection before scoring. Default: true. */
  detectSignals?: boolean;
  /** Optional category for signal detection. */
  categoryId?: string;
}

export interface IngestionJobData {
  /** Source system identifier (e.g., "cfpb_complaints", "irs_990_xml") */
  source: string;
  /** Path to the ingestion script or function name */
  script?: string;
  /** Optional parameters to pass to the ingestion script */
  params?: Record<string, unknown>;
  /** Number of records to process in a single batch (for backpressure) */
  batchSize?: number;
  /** Max number of batches (0 = unlimited) */
  maxBatches?: number;
}

export interface SearchReindexJobData {
  /** Which index to reindex. "all" for full reindex. */
  index:
    | "all"
    | "charities"
    | "corporations"
    | "government"
    | "healthcare"
    | "consumer"
    | "political";
  /** Entity IDs to reindex (empty = full reindex of that category) */
  entityIds?: string[];
  /** Whether to delete existing index before reindexing */
  force?: boolean;
}

// ─── Worker Cleanup ────────────────────────────────────────────────────

/**
 * Close all queues and Redis connections gracefully.
 * Call this on process shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  logger.info("Closing all queues and Redis connections", {}, "job-queues");

  for (const queue of queues.values()) {
    try {
      await queue.close();
    } catch {
      // Ignore close errors
    }
  }
  queues.clear();

  if (bgRedis) {
    try {
      await bgRedis.quit();
    } catch {
      // Ignore quit errors
    }
    bgRedis = null;
  }

  logger.info("All queues and Redis connections closed", {}, "job-queues");
}

// ─── Health Check ──────────────────────────────────────────────────────

export interface QueueHealthStatus {
  name: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
}

/** Get health status for all queues. */
export async function getQueueHealth(): Promise<QueueHealthStatus[]> {
  const health: QueueHealthStatus[] = [];

  for (const queue of allQueues) {
    try {
      const counts = await queue.getJobCounts();
      health.push({
        name: queue.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: false,
      });
    } catch (error) {
      health.push({
        name: queue.name,
        waiting: -1,
        active: -1,
        delayed: -1,
        completed: -1,
        failed: -1,
        paused: false,
      });
      logger.error(
        `Failed to get health for queue ${queue.name}`,
        { error: String(error) },
        "job-queues",
      );
    }
  }

  return health;
}
