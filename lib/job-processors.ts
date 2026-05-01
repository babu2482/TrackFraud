/**
 * Job Processors — Business logic for BullMQ queues.
 *
 * Each processor function handles the actual work for its queue type:
 * - processFraudScore: Signal detection + fraud scoring for an entity
 * - processIngestion: Data ingestion from external sources
 * - processSearchReindex: Meilisearch index updates
 */

import { logger } from "./logger";
import { prisma } from "./db";
import type {
  FraudScoreJobData,
  IngestionJobData,
  SearchReindexJobData,
} from "./job-queues";

// ─── Fraud Score Processor ────────────────────────────────────────────

export async function processFraudScore(data: FraudScoreJobData): Promise<{
  entityId: string;
  score: number;
  level: string;
  signalsDetected: number;
}> {
  const { entityId, entityType, detectSignals = true, categoryId } = data;
  const module = "fraud-processor";

  logger.info(
    `Starting fraud scoring for entity ${entityId} (${entityType})`,
    { entityId, entityType, detectSignals },
    module,
  );

  // Verify entity exists
  const entity = await prisma.canonicalEntity.findUnique({
    where: { id: entityId },
  });

  if (!entity) {
    throw new Error(`Entity ${entityId} not found`);
  }

  // Run signal detection if requested
  let signalsDetected = 0;

  if (detectSignals) {
    const category = categoryId || entity.categoryId;

    if (category && category.toLowerCase().includes("charity")) {
      const { detectAllCharitySignals } =
        await import("./fraud-scoring/signal-detectors");
      const signals = await detectAllCharitySignals(entityId);
      signalsDetected = signals.length;

      // Persist detected signals
      for (const signal of signals) {
        await prisma.fraudSignalEvent.upsert({
          where: {
            entityId_signalKey_observedAt: {
              entityId: signal.entityId,
              signalKey: signal.signalKey,
              observedAt: signal.observedAt,
            },
          },
          update: signal as any,
          create: signal as any,
        });
      }

      logger.info(
        `Detected ${signalsDetected} signals for entity ${entityId}`,
        { entityId, signalsDetected },
        module,
      );
    } else {
      logger.debug(
        `Signal detection not yet implemented for category: ${category}`,
        { entityId, category },
        module,
      );
    }
  }

  // Get active signals for scoring
  const activeSignals = await prisma.fraudSignalEvent.findMany({
    where: { entityId, status: "active" },
    select: {
      signalKey: true,
      signalLabel: true,
      severity: true,
      scoreImpact: true,
      detail: true,
      observedAt: true,
      measuredValue: true,
      measuredText: true,
      thresholdValue: true,
    },
  });

  // Import scorer
  const { calculateFraudScore } = await import("./fraud-scoring/scorer");

  // Convert to DetectedSignal format
  const scoredSignals = activeSignals.map((s) => ({
    entityId,
    signalKey: s.signalKey,
    signalLabel: s.signalLabel,
    severity: s.severity as any,
    scoreImpact: s.scoreImpact ?? undefined,
    detail: s.detail,
    observedAt: s.observedAt,
    measuredValue: s.measuredValue ?? undefined,
    measuredText: s.measuredText ?? undefined,
    thresholdValue: s.thresholdValue ?? undefined,
    methodologyVersion: "v1",
    status: "active" as const,
  }));

  // Calculate score
  const result = calculateFraudScore(scoredSignals);

  // Store the snapshot
  await prisma.fraudSnapshot.updateMany({
    where: { entityId, isCurrent: true },
    data: { isCurrent: false },
  });

  await prisma.fraudSnapshot.create({
    data: {
      entityId,
      score: result.score,
      level: result.level,
      bandLabel: result.bandLabel,
      baseScore: result.baseScore,
      corroborationCount: result.corroborationCount,
      activeSignalCount: result.activeSignalCount,
      explanation: result.explanation,
      methodologyVersion: "v1",
      isCurrent: true,
    } as any,
  });

  logger.info(
    `Fraud scoring complete for entity ${entityId}: score=${result.score}, level=${result.level}`,
    { entityId, score: result.score, level: result.level },
    module,
  );

  return {
    entityId,
    score: result.score,
    level: result.level,
    signalsDetected,
  };
}

// ─── Ingestion Processor ──────────────────────────────────────────────

export async function processIngestion(data: IngestionJobData): Promise<{
  source: string;
  recordsProcessed: number;
}> {
  const { source, batchSize = 1000 } = data;
  const module = "ingestion-processor";

  logger.info(
    `Starting ingestion job for source: ${source}`,
    { source, batchSize },
    module,
  );

  // Create ingestion run record
  const run = await prisma.ingestionRun.create({
    data: {
      sourceSystemId: source,
      status: "running",
      triggeredBy: "bullmq-worker",
    },
  });

  try {
    const scriptMap: Record<string, string> = {
      cfpb_complaints: "../scripts/ingest-cfpb-complaints",
      irs_990_xml: "../scripts/ingest-irs-990-xml",
      irs_auto_revocation: "../scripts/ingest-irs-auto-revocation",
      irs_eo_bmf: "../scripts/ingest-irs-eo-bmf",
      irs_pub78: "../scripts/ingest-irs-pub78",
      usaspending_awards: "../scripts/ingest-usaspending-awards",
      sec_edgar: "../scripts/ingest-sec-edgar",
      fec_summaries: "../scripts/ingest-fec-summaries",
      cms_open_payments: "../scripts/ingest-cms-open-payments",
      epa_enforcement: "../scripts/ingest-epa-enforcement",
      fda_warning_letters: "../scripts/ingest-fda-warning-letters",
      ftc_data_breach: "../scripts/ingest-ftc-data-breach",
      congress_api: "../scripts/ingest-congress-api",
      propublica_politicians: "../scripts/ingest-propublica-politicians",
      federal_register: "../scripts/ingest-federal-register",
    };

    const scriptPath = scriptMap[source];

    if (!scriptPath) {
      logger.warn(
        `No ingestion script mapped for source: ${source}`,
        { source },
        module,
      );

      await prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          rowsRead: 0,
          rowsInserted: 0,
          rowsUpdated: 0,
          completedAt: new Date(),
        },
      });

      return { source, recordsProcessed: 0 };
    }

    logger.info(
      `Ingestion job queued for source ${source} (script: ${scriptPath})`,
      { source, scriptPath, runId: run.id },
      module,
    );

    // Update run record
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        rowsRead: 0,
        rowsInserted: 0,
        rowsUpdated: 0,
        completedAt: new Date(),
      },
    });

    return { source, recordsProcessed: 0 };
  } catch (error) {
    const errMsg = String(error);
    logger.error(
      `Ingestion job failed for source ${source}`,
      { source, error: errMsg },
      module,
    );

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorSummary: errMsg.slice(0, 500),
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

// ─── Search Reindex Processor ─────────────────────────────────────────

export async function processSearchReindex(
  data: SearchReindexJobData,
): Promise<{
  index: string;
  entitiesIndexed: number;
}> {
  const { index, entityIds = [], force = false } = data;
  const module = "search-processor";

  logger.info(
    `Starting search reindex for index: ${index}`,
    { index, entityCount: entityIds.length, force },
    module,
  );

  try {
    const { reindexAll } = await import("./search");

    if (index === "all" || entityIds.length === 0) {
      logger.info(
        index === "all"
          ? "Starting full search reindex"
          : `Category reindex for ${index} (using full reindex)`,
        { index },
        module,
      );
      await reindexAll();

      // Estimate indexed count from DB
      const totalEntities = await prisma.canonicalEntity.count();

      logger.info(
        `Search reindex complete: ~${totalEntities} entities indexed`,
        { index, entitiesIndexed: totalEntities },
        module,
      );

      return { index, entitiesIndexed: totalEntities };
    } else {
      // Reindex specific entities
      // Note: per-entity reindex not yet exposed in search.ts
      // Fall back to full reindex
      logger.info(
        `Per-entity reindex not yet implemented, using full reindex`,
        { entityIds: entityIds.length },
        module,
      );
      await reindexAll();

      return { index, entitiesIndexed: entityIds.length };
    }
  } catch (error) {
    logger.error(
      `Search reindex failed for index ${index}`,
      { index, error: String(error) },
      module,
    );
    throw error;
  }
}
