/**
 * Fraud Pipeline Health Check Endpoint
 *
 * Returns the health status of the fraud scoring pipeline including:
 * - Last successful run time
 * - Score distribution across entities
 * - Signal counts by severity
 * - Ingestion source status
 * - Anomaly detection on score distributions
 *
 * GET /api/admin/fraud-health
 */

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface HealthResponse {
  pipeline: PipelineHealth;
  scoring: ScoringHealth;
  ingestion: IngestionHealth;
  timestamp: string;
}

interface PipelineHealth {
  lastRun: string | null;
  lastRunAgeMs: number | null;
  healthy: boolean;
  status: "healthy" | "stale" | "missing";
  message: string;
}

interface ScoringHealth {
  totalScored: number;
  distribution: Record<string, number>;
  topSignals: Array<{ key: string; count: number }>;
  anomalyDetected: boolean;
  anomalyMessage: string | null;
}

interface IngestionHealth {
  sources: Array<{
    source: string;
    recordCount: number;
    lastIngested: string | null;
    healthy: boolean;
  }>;
  overallHealthy: boolean;
}

/**
 * Check if pipeline ran within the last 24 hours
 */
function checkPipelineHealth(): PipelineHealth {
  // We check the latest FraudSnapshot computedAt as a proxy for last run
  return {
    lastRun: null,
    lastRunAgeMs: null,
    healthy: false,
    status: "missing",
    message: "No pipeline runs recorded yet",
  };
}

/**
 * Get scoring health metrics
 */
async function getScoringHealth(): Promise<ScoringHealth> {
  // Total scored entities
  const totalScored = await prisma.fraudSnapshot.count({
    where: { isCurrent: true },
  });

  // Score distribution
  const distributionResult = await prisma.fraudSnapshot.groupBy({
    by: ["level"],
    where: { isCurrent: true },
    _count: { level: true },
  });

  const distribution: Record<string, number> = {};
  for (const row of distributionResult) {
    distribution[row.level] = row._count.level;
  }

  // Top signals by count
  const signalCounts = await prisma.fraudSignalEvent.groupBy({
    by: ["signalKey"],
    where: { status: "active" },
    _count: { signalKey: true },
    orderBy: { _count: { signalKey: "desc" } },
    take: 10,
  });

  const topSignals = signalCounts.map((row) => ({
    key: row.signalKey,
    count: row._count.signalKey,
  }));

  // Simple anomaly detection: check if distribution is heavily skewed
  const anomalyDetected = detectAnomaly(distribution, totalScored);

  return {
    totalScored,
    distribution,
    topSignals,
    anomalyDetected,
    anomalyMessage: anomalyDetected
      ? "Score distribution appears skewed — verify signal definitions"
      : null,
  };
}

/**
 * Simple anomaly detection: flag if >50% of entities are in critical/high
 */
function detectAnomaly(distribution: Record<string, number>, total: number): boolean {
  if (total === 0) return false;

  const criticalCount = distribution["critical"] || 0;
  const highCount = distribution["high"] || 0;
  const criticalHighRatio = (criticalCount + highCount) / total;

  // If more than 50% are critical or high, something may be wrong
  return criticalHighRatio > 0.5;
}

/**
 * Get ingestion source health
 */
async function getIngestionHealth(): Promise<IngestionHealth> {
  const sources = [
    { model: "HHSExclusion", name: "HHS OIG Exclusions" },
    { model: "FDAWarningLetter", name: "FDA Warning Letters" },
    { model: "FTCDataBreach", name: "FTC Data Breaches" },
    { model: "OFACSanction", name: "OFAC Sanctions" },
    { model: "SAMExclusion", name: "SAM Exclusions" },
    { model: "CharityAutomaticRevocationRecord", name: "IRS Auto-Revocations" },
    { model: "CharityBusinessMasterRecord", name: "IRS Business Master File" },
    { model: "CharityPublication78Record", name: "IRS Publication 78" },
    { model: "ConsumerComplaintRecord", name: "CFPB Consumer Complaints" },
    { model: "HealthcarePaymentRecord", name: "CMS Open Payments" },
  ];

  const results = [];
  let overallHealthy = true;

  for (const source of sources) {
    try {
      // Dynamic count — we need to access models dynamically
      let count: number;
      let lastIngested: string | null = null;

      switch (source.model) {
        case "HHSExclusion":
          count = await prisma.hHSExclusion.count();
          lastIngested = await getLastIngested("HHSExclusion");
          break;
        case "FDAWarningLetter":
          count = await prisma.fDAWarningLetter.count();
          lastIngested = await getLastIngested("FDAWarningLetter");
          break;
        case "FTCDataBreach":
          count = await prisma.fTCDataBreach.count();
          lastIngested = await getLastIngested("FTCDataBreach");
          break;
        case "OFACSanction":
          count = await prisma.oFACSanction.count();
          lastIngested = await getLastIngested("OFACSanction");
          break;
        case "SAMExclusion":
          count = await prisma.sAMExclusion.count();
          lastIngested = await getLastIngested("SAMExclusion");
          break;
        case "CharityAutomaticRevocationRecord":
          count = await prisma.charityAutomaticRevocationRecord.count();
          lastIngested = await getLastIngested("CharityAutomaticRevocationRecord");
          break;
        case "CharityBusinessMasterRecord":
          count = await prisma.charityBusinessMasterRecord.count();
          lastIngested = await getLastIngested("CharityBusinessMasterRecord");
          break;
        case "CharityPublication78Record":
          count = await prisma.charityPublication78Record.count();
          lastIngested = await getLastIngested("CharityPublication78Record");
          break;
        case "ConsumerComplaintRecord":
          count = await prisma.consumerComplaintRecord.count();
          lastIngested = await getLastIngested("ConsumerComplaintRecord");
          break;
        case "HealthcarePaymentRecord":
          count = await prisma.healthcarePaymentRecord.count();
          lastIngested = await getLastIngested("HealthcarePaymentRecord");
          break;
        default:
          count = 0;
      }

      // A source is unhealthy if it has 0 records and wasn't intentionally skipped
      const healthy = count > 0;
      if (!healthy) overallHealthy = false;

      results.push({
        source: source.name,
        recordCount: count,
        lastIngested,
        healthy,
      });
    } catch (error) {
      console.error(`Error checking ${source.model}:`, error);
      results.push({
        source: source.name,
        recordCount: 0,
        lastIngested: null,
        healthy: false,
      });
      overallHealthy = false;
    }
  }

  return { sources: results, overallHealthy };
}

/**
 * Get the most recent createdAt from an ingestion run for a source model
 */
async function getLastIngested(modelName: string): Promise<string | null> {
  try {
    // Get the source system associated with this model
    const sourceSlugs: Record<string, string> = {
      HHSExclusion: "hhs_oig_exclusions",
      FDAWarningLetter: "fda_warning_letters",
      FTCDataBreach: "ftc_data_breach",
      OFACSanction: "ofac_sdn",
      SAMExclusion: "sam_exclusions",
      CharityAutomaticRevocationRecord: "irs_auto_revocation",
      CharityBusinessMasterRecord: "irs_eo_bmf",
      CharityPublication78Record: "irs_pub78",
      ConsumerComplaintRecord: "cfpb_consumer",
      HealthcarePaymentRecord: "cms_open_payments",
    };

    const slug = sourceSlugs[modelName];
    if (!slug) return null;

    const sourceSystem = await prisma.sourceSystem.findUnique({
      where: { slug },
      select: { lastSuccessfulSyncAt: true },
    });

    return sourceSystem?.lastSuccessfulSyncAt?.toISOString() ?? null;
  } catch {
    return null;
  }
}

/**
 * GET handler
 */
export async function GET() {
  try {
    const [pipelineHealth, scoringHealth, ingestionHealth] = await Promise.all([
      Promise.resolve(checkPipelineHealth()),
      getScoringHealth(),
      getIngestionHealth(),
    ]);

    // Also check for latest fraud snapshot to infer last run
    const latestSnapshot = await prisma.fraudSnapshot.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    });

    if (latestSnapshot?.computedAt) {
      const lastRunMs = Date.now() - latestSnapshot.computedAt.getTime();
      pipelineHealth.lastRun = latestSnapshot.computedAt.toISOString();
      pipelineHealth.lastRunAgeMs = lastRunMs;
      pipelineHealth.healthy = lastRunMs < 24 * 60 * 60 * 1000; // 24 hours
      pipelineHealth.status = pipelineHealth.healthy ? "healthy" : "stale";
      pipelineHealth.message = pipelineHealth.healthy
        ? "Pipeline ran recently"
        : `Pipeline last ran ${Math.floor(lastRunMs / (60 * 60 * 1000))} hours ago`;
    }

    const response: HealthResponse = {
      pipeline: pipelineHealth,
      scoring: scoringHealth,
      ingestion: ingestionHealth,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: pipelineHealth.healthy ? 200 : 200, // Still 200, let client check healthy flag
    });
  } catch (error) {
    console.error("Error in fraud-health endpoint:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve fraud pipeline health",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
