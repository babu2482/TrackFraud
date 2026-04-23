/**
 * Fraud Scores API Endpoint
 *
 * Provides access to calculated fraud scores and signals for entities.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateFraudScore } from "@/lib/fraud-scoring/scorer";
import { detectAllCharitySignals } from "@/lib/fraud-scoring/signal-detectors";

/**
 * GET /api/fraud-scores
 *
 * Query parameters:
 * - entityId: Specific entity ID (required for single entity)
 * - category: Filter by category (charity, corporate, etc.)
 * - minScore: Minimum score threshold (0-100)
 * - level: Risk level filter (low, medium, high, critical)
 * - limit: Results per page (default: 20)
 * - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId");
    const category = searchParams.get("category");
    const minScore = parseInt(searchParams.get("minScore") || "0", 10);
    const level = searchParams.get("level") as
      | "low"
      | "medium"
      | "high"
      | "critical"
      | null;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Single entity query
    if (entityId) {
      return await getEntityFraudScore(entityId);
    }

    // List query with filters
    const whereClause: any = {
      isCurrent: true,
      score: { gte: minScore },
    };

    if (level) {
      whereClause.level = level;
    }

    if (category) {
      whereClause.entity = {
        categoryId: { contains: category, mode: "insensitive" as const },
      };
    }

    // Get snapshots with entity info
    const [snapshots, totalCount] = await Promise.all([
      prisma.fraudSnapshot.findMany({
        where: whereClause,
        include: {
          CanonicalEntity: {
            select: {
              displayName: true,
              entityType: true,
              categoryId: true,
              summary: true,
              homepageUrl: true,
            },
          },
        },
        orderBy: { score: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.fraudSnapshot.count({ where: whereClause }),
    ]);

    // Get signals for each entity
    const results = await Promise.all(
      snapshots.map(async (snapshot) => {
        const signals = await prisma.fraudSignalEvent.findMany({
          where: {
            entityId: snapshot.entityId,
            status: "active",
          },
          select: {
            signalKey: true,
            signalLabel: true,
            severity: true,
            detail: true,
            scoreImpact: true,
            observedAt: true,
          },
          orderBy: { scoreImpact: "desc" },
          take: 10,
        });

        return {
          entityId: snapshot.entityId,
          entityName: snapshot.CanonicalEntity?.displayName || "Unknown",
          entityType: snapshot.CanonicalEntity?.entityType || "unknown",
          category: snapshot.CanonicalEntity?.categoryId || "unknown",
          score: snapshot.score,
          level: snapshot.level,
          bandLabel: snapshot.bandLabel,
          activeSignalCount: snapshot.activeSignalCount,
          corroborationCount: snapshot.corroborationCount,
          explanation: snapshot.explanation,
          computedAt: snapshot.computedAt.toISOString(),
          signals: signals.map((s) => ({
            key: s.signalKey,
            label: s.signalLabel,
            severity: s.severity,
            detail: s.detail,
            impact: s.scoreImpact || 0,
          })),
        };
      }),
    );

    return NextResponse.json({
      results,
      total: totalCount,
      offset,
      limit,
      hasMore: offset + limit < totalCount,
    });
  } catch (error) {
    console.error("Fraud scores API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fraud scores" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/fraud-scores
 *
 * Trigger fraud score calculation for an entity.
 * Runs signal detection and scoring if not already done.
 *
 * Request body:
 * {
 *   entityId: string,
 *   detectSignals?: boolean  // Run detection before scoring (default: true)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityId, detectSignals = true } = body;

    if (!entityId) {
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    // Verify entity exists
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    // Run signal detection if requested
    let signals: any[] = [];
    if (detectSignals) {
      console.log(`Running signal detection for entity ${entityId}...`);

      // Only charity signals implemented currently
      if (entity.categoryId.toLowerCase().includes("charity")) {
        signals = await detectAllCharitySignals(entityId);

        // Persist detected signals
        if (signals.length > 0) {
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
        }
      } else {
        console.log(
          `Signal detection not yet implemented for category: ${entity.categoryId}`,
        );
      }
    }

    // Get active signals for scoring
    const activeSignals = await prisma.fraudSignalEvent.findMany({
      where: {
        entityId,
        status: "active",
      },
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

    // Convert to DetectedSignal format for scorer
    const scoredSignals = activeSignals.map((s) => ({
      entityId,
      signalKey: s.signalKey,
      signalLabel: s.signalLabel,
      severity: s.severity as any,
      scoreImpact: s.scoreImpact ?? undefined,
      detail: s.detail,
      observedAt: s.observedAt,
      sourceSystemId: undefined,
      measuredValue: s.measuredValue ?? undefined,
      measuredText: s.measuredText ?? undefined,
      thresholdValue: s.thresholdValue ?? undefined,
      sourceRecordId: undefined,
      methodologyVersion: "v1",
      status: "active" as const,
    }));

    // Calculate score
    const result = calculateFraudScore(scoredSignals);

    // Mark previous snapshots as not current
    await prisma.fraudSnapshot.updateMany({
      where: { entityId, isCurrent: true },
      data: { isCurrent: false },
    });

    // Create new snapshot
    const snapshot = await prisma.fraudSnapshot.create({
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
      include: {
        CanonicalEntity: {
          select: {
            displayName: true,
            entityType: true,
            categoryId: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      snapshot: {
        entityId: snapshot.entityId,
        entityName: snapshot.CanonicalEntity?.displayName,
        score: snapshot.score,
        level: snapshot.level,
        bandLabel: snapshot.bandLabel,
        activeSignalCount: snapshot.activeSignalCount,
        corroborationCount: snapshot.corroborationCount,
        explanation: snapshot.explanation,
        computedAt: snapshot.computedAt.toISOString(),
      },
      signalsDetected: detectSignals ? signals.length : 0,
      totalActiveSignals: activeSignals.length,
    });
  } catch (error) {
    console.error("Fraud score calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate fraud score" },
      { status: 500 },
    );
  }
}

/**
 * Helper: Get fraud score for a single entity with full details
 */
async function getEntityFraudScore(entityId: string) {
  const snapshot = await prisma.fraudSnapshot.findFirst({
    where: { entityId, isCurrent: true },
    include: {
      CanonicalEntity: {
        select: {
          displayName: true,
          entityType: true,
          categoryId: true,
          summary: true,
          homepageUrl: true,
          stateCode: true,
          normalizedName: true,
        },
      },
    },
    orderBy: { computedAt: "desc" },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "No fraud score found for this entity", hasScore: false },
      { status: 404 },
    );
  }

  // Get all active signals
  const signals = await prisma.fraudSignalEvent.findMany({
    where: {
      entityId,
      status: "active",
    },
    orderBy: { scoreImpact: "desc" },
  });

  // Get historical scores (last 5)
  const history = await prisma.fraudSnapshot.findMany({
    where: { entityId },
    orderBy: { computedAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    hasScore: true,
    current: {
      entityId: snapshot.entityId,
      entityName: snapshot.CanonicalEntity?.displayName,
      entityType: snapshot.CanonicalEntity?.entityType,
      category: snapshot.CanonicalEntity?.categoryId,
      score: snapshot.score,
      level: snapshot.level,
      bandLabel: snapshot.bandLabel,
      activeSignalCount: snapshot.activeSignalCount,
      corroborationCount: snapshot.corroborationCount,
      explanation: snapshot.explanation,
      computedAt: snapshot.computedAt.toISOString(),
    },
    signals: signals.map((s) => ({
      key: s.signalKey,
      label: s.signalLabel,
      severity: s.severity,
      detail: s.detail,
      measuredValue: s.measuredValue,
      measuredText: s.measuredText,
      thresholdValue: s.thresholdValue,
      impact: s.scoreImpact || 0,
      observedAt: s.observedAt.toISOString(),
    })),
    history: history.map((h) => ({
      score: h.score,
      level: h.level,
      computedAt: h.computedAt.toISOString(),
    })),
  });
}
