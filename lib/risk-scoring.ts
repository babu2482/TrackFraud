/**
 * TrackFraud Risk Scoring Engine
 *
 * Comprehensive risk assessment system that analyzes entities across multiple dimensions:
 * - Regulatory actions and enforcement history
 * - Filing irregularities and compliance patterns
 * - Network connections to flagged entities
 * - Financial anomalies and red flags
 * - Temporal patterns and behavioral changes
 *
 * Produces a 0-100 risk score with category breakdowns and contributing factors.
 */

import { PrismaClient } from "@prisma/client";
import {
  detectAllCharitySignals,
  type DetectedSignal,
} from "./fraud-scoring/signal-detectors";

const prisma = new PrismaClient();

// ============================================================================
// Type Definitions
// ============================================================================

export interface RiskScore {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  color: string;
  categoryScores: {
    regulatory: number;
    network: number;
    compliance: number;
    financial: number;
  };
  factors: RiskFactor[];
  calculatedAt: Date;
  entity: {
    id: string;
    name: string;
    ein?: string;
    cik?: string;
    entityType: string;
  };
  trend?: {
    direction: "improving" | "stable" | "worsening";
    change: number;
    lastScore?: number;
  };
}

export interface RiskFactor {
  category: "regulatory" | "network" | "compliance" | "financial";
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  weight: number;
  description: string;
  evidence: Record<string, unknown>;
}

export interface RiskScoreOptions {
  includeTrend?: boolean;
  historicalPeriod?: number; // days to look back
  includeNetwork?: boolean;
  networkDepth?: number;
  customWeights?: Partial<{
    regulatory: number;
    network: number;
    compliance: number;
    financial: number;
  }>;
}

// ============================================================================
// Default Weights Configuration
// ============================================================================

export const RISK_WEIGHTS = {
  regulatory: 0.3, // 30% - Regulatory actions are most significant
  network: 0.25, // 25% - Network connections reveal hidden patterns
  compliance: 0.25, // 25% - Filing patterns indicate organizational health
  financial: 0.2, // 20% - Financial anomalies suggest potential issues
};

export const SEVERITY_MULTIPLIERS = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

export const RISK_THRESHOLDS = {
  low: { min: 0, max: 39, color: "#10B981" }, // Green
  medium: { min: 40, max: 59, color: "#F59E0B" }, // Yellow
  high: { min: 60, max: 79, color: "#F97316" }, // Orange
  critical: { min: 80, max: 100, color: "#EF4444" }, // Red
};

// ============================================================================
// Signal-to-Category Mapping
// ============================================================================

const SIGNAL_CATEGORIES: Record<string, "regulatory" | "compliance" | "financial"> =
  {
    charity_high_compensation_ratio: "financial",
    charity_frequent_name_changes: "compliance",
    charity_ein_name_variation: "compliance",
    charity_missing_filings: "compliance",
    charity_auto_revocation: "regulatory",
    charity_operating_post_revocation: "regulatory",
    charity_not_in_pub78: "regulatory",
    charity_asset_revenue_anomaly: "financial",
    charity_foundation_high_assets: "financial",
  };

// ============================================================================
// Risk Scoring Engine
// ============================================================================

/**
 * Get the entity name from the database
 */
async function getEntityName(
  entityId: string
): Promise<{ id: string; name: string; ein?: string; entityType: string }> {
  // Try CharityProfile
  const charityProfile = await prisma.charityProfile.findFirst({
    where: { entityId },
    include: { CanonicalEntity: true },
  });
  if (charityProfile?.CanonicalEntity) {
    return {
      id: entityId,
      name: charityProfile.CanonicalEntity.displayName,
      ein: charityProfile.ein,
      entityType: "charity",
    };
  }

  // Try CorporateCompanyProfile
  const corpProfile = await prisma.corporateCompanyProfile.findFirst({
    where: { entityId },
    include: { CanonicalEntity: true },
  });
  if (corpProfile?.CanonicalEntity) {
    return {
      id: entityId,
      name: corpProfile.CanonicalEntity.displayName,
      entityType: "corporation",
    };
  }

  // Try HealthcareRecipientProfile
  const healthProfile = await prisma.healthcareRecipientProfile.findFirst({
    where: { entityId },
    include: { CanonicalEntity: true },
  });
  if (healthProfile?.CanonicalEntity) {
    return {
      id: entityId,
      name: healthProfile.CanonicalEntity.displayName,
      entityType: "healthcare_provider",
    };
  }

  // Try GovernmentAwardRecord
  const govRecord = await prisma.governmentAwardRecord.findFirst({
    where: { recipientEntityId: entityId },
    include: { CanonicalEntity: true },
  });
  if (govRecord?.CanonicalEntity) {
    return {
      id: entityId,
      name: govRecord.CanonicalEntity.displayName,
      entityType: "government_contractor",
    };
  }

  // Fallback to CanonicalEntity
  const canonical = await prisma.canonicalEntity.findUnique({
    where: { id: entityId },
  });
  if (canonical) {
    return {
      id: entityId,
      name: canonical.displayName,
      entityType: canonical.entityType,
    };
  }

  return { id: entityId, name: `Entity ${entityId.slice(0, 8)}`, entityType: "unknown" };
}

/**
 * Calculate risk score from detected signals
 */
function calculateScoreFromSignals(
  signals: DetectedSignal[]
): Omit<RiskScore, "calculatedAt" | "entity" | "trend"> {
  // Group signals by category
  const categorySignals: Record<
    string,
    { signals: DetectedSignal[]; totalImpact: number }
  > = {
    regulatory: { signals: [], totalImpact: 0 },
    compliance: { signals: [], totalImpact: 0 },
    financial: { signals: [], totalImpact: 0 },
  };

  // Also track network separately (will be 0 for now)
  const networkSignals: DetectedSignal[] = [];

  // Categorize each signal
  for (const signal of signals) {
    const category =
      SIGNAL_CATEGORIES[signal.signalKey] ?? "compliance";
    categorySignals[category].signals.push(signal);
    categorySignals[category].totalImpact += signal.scoreImpact ?? 0;
  }

  // Normalize category scores to 0-100
  const normalizeScore = (raw: number): number =>
    Math.min(100, Math.round(raw));

  const regulatoryScore = normalizeScore(categorySignals.regulatory.totalImpact);
  const complianceScore = normalizeScore(categorySignals.compliance.totalImpact);
  const financialScore = normalizeScore(categorySignals.financial.totalImpact);

  // Calculate weighted overall score
  const weights = RISK_WEIGHTS;
  const overallScore = Math.round(
    regulatoryScore * weights.regulatory +
      0 * weights.network + // No network signals yet
      complianceScore * weights.compliance +
      financialScore * weights.financial
  );

  // Build risk factors from signals
  const factors: RiskFactor[] = signals
    .map((s) => ({
      category:
        (SIGNAL_CATEGORIES[s.signalKey] ?? "compliance") as RiskFactor["category"],
      type: s.signalKey,
      severity: s.severity,
      weight: s.scoreImpact ?? 0,
      description: s.signalLabel,
      evidence: {
        detail: s.detail,
        measuredValue: s.measuredValue,
        thresholdValue: s.thresholdValue,
        severity: s.severity,
      },
    }))
    .sort((a, b) => b.weight - a.weight);

  const { level, color } = getRiskLevel(overallScore);

  return {
    score: overallScore,
    level,
    color,
    categoryScores: {
      regulatory: regulatoryScore,
      network: 0,
      compliance: complianceScore,
      financial: financialScore,
    },
    factors,
  };
}

/**
 * Calculate comprehensive risk score for an entity
 */
export async function calculateRiskScore(
  entityId: string,
  entityType:
    | "charity"
    | "corporation"
    | "government_contractor"
    | "healthcare_provider",
  options: RiskScoreOptions = {}
): Promise<RiskScore> {
  const { includeTrend = true, customWeights = {} } = options;

  // Override weights if provided
  if (Object.keys(customWeights).length > 0) {
    Object.assign(RISK_WEIGHTS, customWeights);
  }

  let signals: DetectedSignal[] = [];

  // Run signal detection based on entity type
  if (entityType === "charity") {
    signals = await detectAllCharitySignals(entityId);
  } else {
    // For other entity types, gather available data for signals
    signals = await gatherGenericSignals(entityId, entityType);
  }

  // Calculate score from signals
  const scoreData = calculateScoreFromSignals(signals);

  // Get entity info
  const entityInfo = await getEntityName(entityId);

  // Calculate trend if requested
  let trend: RiskScore["trend"] | undefined;
  if (includeTrend) {
    const previousSnapshot = await prisma.fraudSnapshot.findFirst({
      where: { entityId, isCurrent: true },
      orderBy: { computedAt: "desc" },
      select: { score: true },
    });

    if (previousSnapshot) {
      const change = scoreData.score - previousSnapshot.score;
      trend = {
        direction: change > 5 ? "worsening" : change < -5 ? "improving" : "stable",
        change,
        lastScore: previousSnapshot.score,
      };
    } else {
      trend = { direction: "stable", change: 0 };
    }
  }

  const result: RiskScore = {
    ...scoreData,
    calculatedAt: new Date(),
    entity: entityInfo,
    trend,
  };

  // Store the score in FraudSnapshot
  await storeFraudSnapshot(entityId, result);

  return result;
}

/**
 * Gather signals for non-charity entity types
 */
async function gatherGenericSignals(
  entityId: string,
  entityType: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  // Check for name/identity changes (applies to all entity types)
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  const nameChanges = await prisma.entityAlias.findMany({
    where: {
      entityId,
      aliasType: "alternate_name",
      observedAt: { gt: threeYearsAgo },
    },
    select: { alias: true, observedAt: true },
  });

  if (nameChanges.length > 2) {
    const severity: DetectedSignal["severity"] =
      nameChanges.length >= 5
        ? "critical"
        : nameChanges.length >= 4
          ? "high"
          : "medium";

    signals.push({
      entityId,
      signalKey: `${entityType}_frequent_name_changes`,
      signalLabel: "Frequent Name/Identity Changes",
      severity,
      detail: `Entity has changed name ${nameChanges.length} times in the past 3 years`,
      measuredValue: nameChanges.length,
      measuredText: `${nameChanges.length} changes`,
      thresholdValue: 2,
      scoreImpact: severity === "critical" ? 20 : severity === "high" ? 15 : 10,
      methodologyVersion: "v1",
      status: "active",
      observedAt: new Date(),
    });
  }

  // Check for enforcement actions (government contractors, corporations)
  if (entityType === "government_contractor" || entityType === "corporation") {
    const dojActions = await prisma.dOJCivilFraud.findMany({
      where: {
        defendantName: { contains: entityId, mode: "insensitive" },
      },
      select: { defendantName: true, recoveryAmount: true, dateAnnounced: true },
      take: 10,
    });

    if (dojActions.length > 0) {
      const totalPenalties = dojActions.reduce(
        (sum: number, a: { recoveryAmount: number | null }) => sum + (a.recoveryAmount ?? 0),
        0
      );
      signals.push({
        entityId,
        signalKey: `${entityType}_doj_civil_fraud`,
        signalLabel: "Department of Justice Civil Fraud Actions",
        severity: "critical",
        detail: `${dojActions.length} DOJ civil fraud action(s) found, total penalties: $${totalPenalties.toLocaleString()}`,
        measuredValue: dojActions.length,
        measuredText: `${dojActions.length} actions`,
        thresholdValue: 0,
        scoreImpact: 40,
        methodologyVersion: "v1",
        status: "active",
        observedAt: new Date(),
      });
    }
  }

  // Check for FDA warning letters (healthcare)
  if (entityType === "healthcare_provider") {
    const fdaLetters = await prisma.fDAWarningLetter.findMany({
      where: {
        recipientName: { contains: entityId, mode: "insensitive" },
      },
      select: { recipientName: true, issueDate: true, violationTypes: true },
      take: 10,
    });

    if (fdaLetters.length > 0) {
      signals.push({
        entityId,
        signalKey: `${entityType}_fda_warning_letters`,
        signalLabel: "FDA Warning Letters",
        severity: "high",
        detail: `${fdaLetters.length} FDA warning letter(s) found`,
        measuredValue: fdaLetters.length,
        measuredText: `${fdaLetters.length} letters`,
        thresholdValue: 0,
        scoreImpact: 25,
        methodologyVersion: "v1",
        status: "active",
        observedAt: new Date(),
      });
    }
  }

  // Check for CFPB complaints (consumer entities)
  const complaints = await prisma.consumerComplaintRecord.findMany({
    where: { entityId },
    select: { issue: true, companyResponse: true, dateReceived: true },
    take: 50,
  });

  if (complaints.length > 10) {
    const severity: DetectedSignal["severity"] =
      complaints.length >= 50
        ? "critical"
        : complaints.length >= 25
          ? "high"
          : "medium";

    signals.push({
      entityId,
      signalKey: `${entityType}_high_complaint_count`,
      signalLabel: "High Consumer Complaint Count",
      severity,
      detail: `${complaints.length} consumer complaints found`,
      measuredValue: complaints.length,
      measuredText: `${complaints.length} complaints`,
      thresholdValue: 10,
      scoreImpact: severity === "critical" ? 20 : severity === "high" ? 15 : 10,
      methodologyVersion: "v1",
      status: "active",
      observedAt: new Date(),
    });
  }

  // Check for HHS exclusions (healthcare)
  if (entityType === "healthcare_provider") {
    const hhsExclusions = await prisma.hHSExclusion.findMany({
      where: {
        OR: [
          { lastName: { contains: entityId, mode: "insensitive" } },
          { organizationName: { contains: entityId, mode: "insensitive" } },
        ],
      },
      select: { lastName: true, firstName: true, exclusionReasons: true },
      take: 10,
    });

    if (hhsExclusions.length > 0) {
      signals.push({
        entityId,
        signalKey: `${entityType}_hhs_exclusion`,
        signalLabel: "HHS/OIG Exclusion List Match",
        severity: "critical",
        detail: `${hhsExclusions.length} HHS/OIG exclusion record(s) found`,
        measuredValue: hhsExclusions.length,
        measuredText: `${hhsExclusions.length} exclusions`,
        thresholdValue: 0,
        scoreImpact: 50,
        methodologyVersion: "v1",
        status: "active",
        observedAt: new Date(),
      });
    }
  }

  return signals;
}

/**
 * Store fraud score in the database
 */
async function storeFraudSnapshot(
  entityId: string,
  score: RiskScore
): Promise<void> {
  // Deactivate previous current snapshots
  await prisma.fraudSnapshot.updateMany({
    where: { entityId, isCurrent: true },
    data: { isCurrent: false },
  });

  // Create new snapshot
  await prisma.fraudSnapshot.create({
    data: {
      entityId,
      score: score.score,
      level: score.level,
      bandLabel:
        score.level === "critical"
          ? "Critical Risk"
          : score.level === "high"
            ? "High Risk"
            : score.level === "medium"
              ? "Moderate Risk"
              : "Low Risk",
      activeSignalCount: score.factors.length,
      explanation: score.factors
        .slice(0, 5)
        .map((f) => `${f.description}: ${f.evidence.detail}`)
        .join("; "),
      methodologyVersion: "v1",
      isCurrent: true,
    },
  });
}

/**
 * Get risk level from score
 */
export function getRiskLevel(
  score: number
): { level: RiskScore["level"]; color: string } {
  if (score >= 80) {
    return { level: "critical", color: RISK_THRESHOLDS.critical.color };
  }
  if (score >= 60) {
    return { level: "high", color: RISK_THRESHOLDS.high.color };
  }
  if (score >= 40) {
    return { level: "medium", color: RISK_THRESHOLDS.medium.color };
  }
  return { level: "low", color: RISK_THRESHOLDS.low.color };
}

/**
 * Batch calculate risk scores for multiple entities
 */
export async function batchCalculateRiskScores(
  entityIds: string[],
  entityType:
    | "charity"
    | "corporation"
    | "government_contractor"
    | "healthcare_provider",
  options: RiskScoreOptions = {}
): Promise<RiskScore[]> {
  const scores: RiskScore[] = [];

  for (const entityId of entityIds) {
    try {
      const score = await calculateRiskScore(entityId, entityType, options);
      scores.push(score);
    } catch (error) {
      console.error(`Failed to calculate risk score for ${entityId}:`, error);
    }
  }

  return scores;
}

/**
 * Get existing fraud snapshot for an entity
 */
export async function getFraudSnapshot(
  entityId: string
): Promise<{
  score: number;
  level: string;
  computedAt: Date;
  explanation?: string;
} | null> {
  const snapshot = await prisma.fraudSnapshot.findFirst({
    where: { entityId, isCurrent: true },
    orderBy: { computedAt: "desc" },
    select: {
      score: true,
      level: true,
      computedAt: true,
      explanation: true,
    },
  });

  if (!snapshot) return null;

  return {
    score: snapshot.score,
    level: snapshot.level,
    computedAt: snapshot.computedAt,
    explanation: snapshot.explanation ?? undefined,
  };
}

/**
 * Get fraud signals for an entity
 */
export async function getFraudSignals(
  entityId: string
): Promise<
  Array<{
    signalKey: string;
    signalLabel: string;
    severity: string;
    detail: string;
    scoreImpact?: number;
    observedAt: Date;
  }>
> {
  const signals = await prisma.fraudSignalEvent.findMany({
    where: { entityId, status: "active" },
    orderBy: { observedAt: "desc" },
    select: {
      signalKey: true,
      signalLabel: true,
      severity: true,
      detail: true,
      scoreImpact: true,
      observedAt: true,
    },
  });

  return signals.map((s) => ({
    ...s,
    scoreImpact: s.scoreImpact ?? undefined,
  }));
}

// ============================================================================
// Export default
// ============================================================================

export default {
  calculateRiskScore,
  batchCalculateRiskScores,
  getRiskLevel,
  RISK_WEIGHTS,
  SEVERITY_MULTIPLIERS,
  RISK_THRESHOLDS,
  getFraudSnapshot,
  getFraudSignals,
};