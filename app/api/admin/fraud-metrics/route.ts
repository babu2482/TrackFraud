import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/fraud-metrics
 *
 * Returns fraud detection metrics for the admin dashboard.
 * Provides counts of high-risk entities, total signals, and average risk scores.
 */

interface FraudMetrics {
  highRiskEntities: number;
  criticalRiskEntities: number;
  totalSignals: number;
  avgRiskScore: number;
  signalsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  topSignalTypes: Array<{
    signalKey: string;
    count: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    // Fetch fraud snapshots with risk levels
    const [
      criticalRiskCount,
      highRiskCount,
      totalSignals,
      avgRiskScore,
      signalsBySeverity,
      topSignals,
    ] = await Promise.all([
      // Count critical risk entities
      prisma.fraudSnapshot.count({
        where: {
          level: "critical",
          isCurrent: true,
        },
      }),
      // Count high risk entities
      prisma.fraudSnapshot.count({
        where: {
          level: "high",
          isCurrent: true,
        },
      }),
      // Count total active fraud signals
      prisma.fraudSignalEvent.count({
        where: {
          status: "active",
        },
      }),
      // Calculate average risk score
      prisma.fraudSnapshot.aggregate({
        where: {
          isCurrent: true,
        },
        _avg: {
          score: true,
        },
      }),
      // Count signals by severity
      prisma.fraudSignalEvent.groupBy({
        by: ["severity"],
        where: {
          status: "active",
        },
        _count: {
          severity: true,
        },
      }),
      // Get top signal types by count
      prisma.fraudSignalEvent.groupBy({
        by: ["signalKey"],
        where: {
          status: "active",
        },
        _count: {
          signalKey: true,
        },
        orderBy: {
          _count: {
            signalKey: "desc",
          },
        },
        take: 10,
      }),
    ]);

    // Format signals by severity
    const severityMap: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    } = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const group of signalsBySeverity) {
      const severity = group.severity as keyof typeof severityMap;
      if (severity in severityMap) {
        severityMap[severity] = group._count.severity;
      }
    }

    // Format top signal types
    const topSignalTypes: Array<{
      signalKey: string;
      count: number;
    }> = topSignals.map((signal) => ({
      signalKey: signal.signalKey,
      count: signal._count.signalKey,
    }));

    // Calculate metrics
    const metrics: FraudMetrics = {
      highRiskEntities: highRiskCount,
      criticalRiskEntities: criticalRiskCount,
      totalSignals,
      avgRiskScore: avgRiskScore._avg.score ?? 0,
      signalsBySeverity: severityMap as {
        critical: number;
        high: number;
        medium: number;
        low: number;
      },
      topSignalTypes,
    };

    // Return formatted response
    return NextResponse.json({
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching fraud metrics:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch fraud metrics",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
