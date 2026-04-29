/**
 * Consumer Fraud Signal Detection Engine
 *
 * Implements consumer-specific fraud detection signals based on CFPB complaint
 * data and FTC data breach records:
 *
 * 1. high_complaint_volume  - >100 complaints/year from CFPB data (20 pts, high)
 * 2. low_response_rate      - <20% company response rate to complaints (15 pts, medium)
 * 3. repeat_issues          - Same issue category >30% of all complaints (10 pts, medium)
 * 4. ftc_data_breach        - Company in FTC data breach database (25 pts, high)
 * 5. non_timely_response    - <50% timely responses to complaints (10 pts, low)
 *
 * Each detector returns DetectedSignal[] that can be persisted to FraudSignalEvent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const METHOD_VERSION = "v2";

/**
 * A fraud signal detected by one of the consumer detectors.
 * Maps to Prisma's FraudSignalEventCreateInput for persistence.
 */
export interface DetectedSignal {
  entityId: string;
  sourceSystemId?: string;
  signalKey: string;
  signalLabel: string;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  measuredValue?: number;
  measuredText?: string;
  thresholdValue?: number;
  scoreImpact?: number;
  sourceRecordId?: string;
  methodologyVersion: string;
  status: "active" | "resolved" | "dismissed";
  observedAt: Date;
  resolvedAt?: Date;
}

// ---------------------------------------------------------------------------
// Signal 1: High Complaint Volume
// ---------------------------------------------------------------------------

/**
 * Detects entities with more than 100 CFPB complaints in a single year.
 *
 * Queries ConsumerComplaintRecord for complaints received within the last
 * 12 months. When the count exceeds the threshold, severity escalates:
 *  - >300 complaints → critical
 *  - >200 complaints → high
 *  - >100 complaints → high (base)
 *
 * @param entityId - The CanonicalEntity id to check
 * @returns DetectedSignal[] containing at most one signal
 */
export async function detectHighComplaintVolume(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const complaintCount = await prisma.consumerComplaintRecord.count({
      where: {
        entityId,
        dateReceived: { gte: oneYearAgo },
      },
    });

    const threshold = 100;

    if (complaintCount > threshold) {
      let severity: "low" | "medium" | "high" | "critical" = "high";
      let scoreImpact = 20;

      if (complaintCount >= 300) {
        severity = "critical";
        scoreImpact = 30;
      } else if (complaintCount >= 200) {
        severity = "high";
        scoreImpact = 25;
      }

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "high_complaint_volume",
        signalLabel: "High Consumer Complaint Volume",
        severity,
        detail: `${complaintCount} CFPB complaints received in the last year (threshold: ${threshold})`,
        measuredValue: complaintCount,
        measuredText: `${complaintCount} complaints`,
        thresholdValue: threshold,
        scoreImpact,
        methodologyVersion: METHOD_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(`Error detecting high complaint volume for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 2: Low Response Rate
// ---------------------------------------------------------------------------

/**
 * Detects entities where the company response rate to CFPB complaints falls
 * below 20%.
 *
 * A "response" is any complaint where `companyResponse` is non-null and
 * non-empty. The rate is computed as:
 *   responses_with_text / total_complaints
 *
 * @param entityId - The CanonicalEntity id to check
 * @returns DetectedSignal[] containing at most one signal
 */
export async function detectLowResponseRate(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const totalComplaints = await prisma.consumerComplaintRecord.count({
      where: { entityId },
    });

    if (totalComplaints === 0) {
      return signals;
    }

    const respondedComplaints = await prisma.consumerComplaintRecord.count({
      where: {
        entityId,
        companyResponse: { not: "" },
      },
    });

    const responseRate = (respondedComplaints / totalComplaints) * 100;
    const threshold = 20.0;

    if (responseRate < threshold) {
      let severity: "low" | "medium" | "high" | "critical" = "medium";
      let scoreImpact = 15;

      if (responseRate < 5) {
        severity = "high";
        scoreImpact = 20;
      }

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "low_response_rate",
        signalLabel: "Low Company Response Rate",
        severity,
        detail: `Company responded to ${responseRate.toFixed(1)}% of complaints (threshold: ${threshold}%)`,
        measuredValue: responseRate,
        measuredText: `${responseRate.toFixed(1)}%`,
        thresholdValue: threshold,
        scoreImpact,
        methodologyVersion: METHOD_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(`Error detecting low response rate for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 3: Repeat Issues
// ---------------------------------------------------------------------------

/**
 * Detects entities where a single issue category accounts for more than 30%
 * of all complaints, suggesting a systemic, unresolved problem.
 *
 * Uses the `issue` field on ConsumerComplaintRecord. The dominant issue is
 * reported in `measuredText`.
 *
 * @param entityId - The CanonicalEntity id to check
 * @returns DetectedSignal[] containing at most one signal
 */
export async function detectRepeatIssues(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    const totalComplaints = await prisma.consumerComplaintRecord.count({
      where: {
        entityId,
        NOT: { OR: [{ issue: null }, { issue: "" }] },
      },
    });

    if (totalComplaints < 10) {
      // Not enough data to meaningfully assess concentration
      return signals;
    }

    // Aggregate complaints by issue category using a raw query
    const issueBreakdown = await prisma.$queryRawUnsafe<
      Array<{ issue: string; cnt: number }>
    >(
      `
      SELECT "issue", COUNT(*)::int AS cnt
      FROM "ConsumerComplaintRecord"
      WHERE "entityId" = $1
        AND "issue" IS NOT NULL
        AND "issue" != ''
      GROUP BY "issue"
      ORDER BY cnt DESC
      LIMIT 1
      `,
      entityId,
    );

    if (issueBreakdown.length === 0) {
      return signals;
    }

    const topIssue = issueBreakdown[0];
    const concentration = (topIssue.cnt / totalComplaints) * 100;
    const threshold = 30.0;

    if (concentration > threshold) {
      let severity: "low" | "medium" | "high" | "critical" = "medium";
      let scoreImpact = 10;

      if (concentration >= 60) {
        severity = "high";
        scoreImpact = 15;
      }

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "repeat_issues",
        signalLabel: "Repeat Issue Concentration",
        severity,
        detail: `"${topIssue.issue}" accounts for ${concentration.toFixed(1)}% of complaints (threshold: ${threshold}%)`,
        measuredValue: concentration,
        measuredText: topIssue.issue,
        thresholdValue: threshold,
        scoreImpact,
        methodologyVersion: METHOD_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(`Error detecting repeat issues for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 4: FTC Data Breach
// ---------------------------------------------------------------------------

/**
 * Detects entities that appear in the FTC data breach database.
 *
 * Matches the entity's displayName (from CanonicalEntity) against the
 * `company` field in FTCDataBreach. A match is a strong indicator of
 * poor data security or cover-up attempts.
 *
 * @param entityId - The CanonicalEntity id to check
 * @returns DetectedSignal[] containing at most one signal (one per breach is capped)
 */
export async function detectFtcDataBreach(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Fetch the entity's display name
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      select: { displayName: true },
    });

    if (!entity || !entity.displayName) {
      return signals;
    }

    // Check FTC data breach records for this company name
    const breaches = await prisma.fTCDataBreach.findMany({
      where: {
        company: {
          equals: entity.displayName,
          mode: "insensitive",
        },
      },
      orderBy: {
        notificationDate: "desc",
      },
    });

    if (breaches.length > 0) {
      const latestBreach = breaches[0];
      const recordsAffected = latestBreach.recordsAffected ?? 0;

      let severity: "low" | "medium" | "high" | "critical" = "high";
      let scoreImpact = 25;

      if (recordsAffected > 1_000_000) {
        severity = "critical";
        scoreImpact = 35;
      } else if (recordsAffected > 100_000) {
        severity = "high";
        scoreImpact = 30;
      }

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "ftc_data_breach",
        signalLabel: "FTC Data Breach History",
        severity,
        detail: `Company found in FTC data breach records. Latest breach on ${latestBreach.notificationDate.toISOString().split("T")[0]} (${breaches.length} total record(s), ~${recordsAffected.toLocaleString()} records affected)`,
        measuredValue: breaches.length,
        measuredText: `${latestBreach.notificationDate.toISOString().split("T")[0]} - ${recordsAffected.toLocaleString()} records`,
        scoreImpact,
        sourceRecordId: latestBreach.id,
        methodologyVersion: METHOD_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(`Error detecting FTC data breach for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Signal 5: Non-Timely Response
// ---------------------------------------------------------------------------

/**
 * Detects entities where fewer than 50% of CFPB complaints receive a timely
 * response from the company.
 *
 * Uses the `timely` field on ConsumerComplaintRecord (expected values:
 * "Yes" / "No"). The rate is computed from complaints that have a non-null
 * `timely` value.
 *
 * @param entityId - The CanonicalEntity id to check
 * @returns DetectedSignal[] containing at most one signal
 */
export async function detectNonTimelyResponse(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  try {
    // Count complaints with a known timely value
    const totalWithTimely = await prisma.consumerComplaintRecord.count({
      where: {
        entityId,
        NOT: { OR: [{ timely: null }, { timely: "" }] },
      },
    });

    if (totalWithTimely === 0) {
      return signals;
    }

    const timelyCount = await prisma.consumerComplaintRecord.count({
      where: {
        entityId,
        timely: "Yes",
      },
    });

    const timelyRate = (timelyCount / totalWithTimely) * 100;
    const threshold = 50.0;

    if (timelyRate < threshold) {
      let severity: "low" | "medium" | "high" | "critical" = "low";
      let scoreImpact = 10;

      if (timelyRate < 20) {
        severity = "medium";
        scoreImpact = 15;
      }

      signals.push({
        entityId,
        sourceSystemId,
        signalKey: "non_timely_response",
        signalLabel: "Non-Timely Company Response",
        severity,
        detail: `Only ${timelyRate.toFixed(1)}% of complaints received a timely response (threshold: ${threshold}%)`,
        measuredValue: timelyRate,
        measuredText: `${timelyRate.toFixed(1)}%`,
        thresholdValue: threshold,
        scoreImpact,
        methodologyVersion: METHOD_VERSION,
        status: "active",
        observedAt: new Date(),
      });
    }
  } catch (error) {
    console.error(`Error detecting non-timely response for ${entityId}:`, error);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Aggregate detector
// ---------------------------------------------------------------------------

/**
 * Runs all consumer fraud signal detectors for a single entity in parallel.
 *
 * @param entityId - The CanonicalEntity id to evaluate
 * @param sourceSystemId - Optional source system reference
 * @returns All detected signals across every consumer detector
 */
export async function detectAllConsumerSignals(
  entityId: string,
  sourceSystemId?: string,
): Promise<DetectedSignal[]> {
  const allSignals: DetectedSignal[] = [];

  console.log(`Running consumer fraud signal detection for entity ${entityId}...`);

  // Run all detectors in parallel
  const [
    complaintVolumeSignals,
    responseRateSignals,
    repeatIssueSignals,
    dataBreachSignals,
    timelyResponseSignals,
  ] = await Promise.all([
    detectHighComplaintVolume(entityId, sourceSystemId),
    detectLowResponseRate(entityId, sourceSystemId),
    detectRepeatIssues(entityId, sourceSystemId),
    detectFtcDataBreach(entityId, sourceSystemId),
    detectNonTimelyResponse(entityId, sourceSystemId),
  ]);

  allSignals.push(
    ...complaintVolumeSignals,
    ...responseRateSignals,
    ...repeatIssueSignals,
    ...dataBreachSignals,
    ...timelyResponseSignals,
  );

  console.log(
    `Detected ${allSignals.length} consumer fraud signals for entity ${entityId}`,
  );

  return allSignals;
}

// ---------------------------------------------------------------------------
// Persistence helper (duplicated here for file self-containment, shared
// pattern with signal-detectors.ts)
// ---------------------------------------------------------------------------

/**
 * Upserts an array of detected signals into FraudSignalEvent.
 *
 * @param signals - The signals to persist
 */
export async function persistConsumerSignals(signals: DetectedSignal[]): Promise<void> {
  if (signals.length === 0) {
    return;
  }

  try {
    for (const signal of signals) {
      await prisma.fraudSignalEvent.upsert({
        where: {
          entityId_signalKey_observedAt: {
            entityId: signal.entityId,
            signalKey: signal.signalKey,
            observedAt: signal.observedAt,
          },
        },
        update: signal,
        create: signal as any,
      });
    }

    console.log(`Persisted ${signals.length} consumer fraud signals to database`);
  } catch (error) {
    console.error("Error persisting consumer fraud signals:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Batch detection
// ---------------------------------------------------------------------------

/**
 * Iterates over all consumer entities and runs the full consumer signal
 * detection suite, persisting results in batches.
 *
 * @param batchSize - Number of entities to process per batch (default: 100)
 * @param limit - Optional cap on total entities to process
 * @returns Summary of entities processed and signals detected
 */
export async function batchDetectConsumerSignals(
  batchSize: number = 100,
  limit?: number,
): Promise<{ processed: number; signalsDetected: number }> {
  console.log("Starting batch consumer fraud signal detection...");

  let processed = 0;
  let totalSignals = 0;
  let offset = 0;

  // Determine total consumer entities
  const totalCount =
    limit ??
    (await prisma.canonicalEntity.count({
      where: { categoryId: "consumer" },
    }));

  while (offset < totalCount) {
    const entities = await prisma.canonicalEntity.findMany({
      take: batchSize,
      skip: offset,
      where: {
        categoryId: "consumer",
      },
      select: { id: true },
    });

    if (entities.length === 0) break;

    console.log(
      `Processing batch ${Math.floor(offset / batchSize) + 1} (${offset}-${Math.min(offset + batchSize, totalCount)} of ${totalCount})`,
    );

    for (const entity of entities) {
      try {
        const signals = await detectAllConsumerSignals(entity.id);

        if (signals.length > 0) {
          await persistConsumerSignals(signals);
          totalSignals += signals.length;
        }

        processed++;
      } catch (error) {
        console.error(`Error processing entity ${entity.id}:`, error);
        processed++;
      }
    }

    offset += batchSize;

    if (processed % 100 === 0) {
      console.log(
        `Progress: ${processed}/${totalCount} entities, ${totalSignals} signals detected`,
      );
    }
  }

  console.log("\n=== Batch Consumer Detection Complete ===");
  console.log(`Entities Processed: ${processed}`);
  console.log(`Total Signals Detected: ${totalSignals}`);

  return { processed, signalsDetected: totalSignals };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const command = process.argv[2];
  const entityId = process.argv[3];

  switch (command) {
    case "single":
      if (!entityId) {
        console.error(
          "Usage: tsx lib/fraud-scoring/consumer-detectors.ts single <entityId>",
        );
        process.exit(1);
      }

      detectAllConsumerSignals(entityId)
        .then((signals) => {
          console.log("\nDetected Consumer Signals:");
          signals.forEach((s) => {
            console.log(
              `  - [${s.severity.toUpperCase()}] ${s.signalLabel}: ${s.detail}`,
            );
          });

          if (signals.length > 0 && process.argv[4] === "--persist") {
            return persistConsumerSignals(signals).then(() => {
              console.log("\nSignals persisted to database");
            });
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          process.exit(1);
        });
      break;

    case "batch": {
      const limit = parseInt(process.argv[3] || "0", 10);
      void batchDetectConsumerSignals(100, limit || undefined)
        .then((stats) => {
          console.log("\nBatch complete:", stats);
          process.exit(0);
        })
        .catch((error) => {
          console.error("Batch failed:", error);
          process.exit(1);
        });
      break;
    }

    default:
      console.log(
        "Usage: tsx lib/fraud-scoring/consumer-detectors.ts <command> [options]",
      );
      console.log("  single <entityId> [--persist]  Run detection on one entity");
      console.log("  batch [limit]                  Run detection on all consumer entities");
      process.exit(0);
  }
}
