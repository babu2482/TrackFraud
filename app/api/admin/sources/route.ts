import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/sources
 *
 * Returns all data sources with their current status, record counts, and freshness.
 * Only queries tables that actually exist in the current database schema.
 */

interface SourceStatus {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  baseUrl: string | null;
  ingestionMode: string;
  refreshCadence: string | null;
  freshnessSlaHours: number | null;
  lastAttemptedSyncAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastError: string | null;
  recordCount: number;
  hoursSinceSync: number | null;
  isFresh: boolean;
  hasActiveJob: boolean;
  activeJobProgress: number | null;
  activeJobId: string | null;
  supportsIncremental: boolean;
}

export async function GET(_request: NextRequest) {
  try {
    // Get all source systems with their category info
    const sourceSystems = await prisma.sourceSystem.findMany({
      include: {
        FraudCategory: {
          select: { name: true, slug: true },
        },
        IngestionRun: {
          where: { status: "running" },
          select: { id: true, rowsRead: true, rowsInserted: true, rowsUpdated: true },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    // Only query tables that actually exist in the current database
    const recordCounts = await Promise.all([
      // Charity sources (these tables exist)
      prisma.charityProfile.count(),
      prisma.charityBusinessMasterRecord.count(),
      prisma.charityEpostcard990NRecord.count(),
      prisma.charityFiling.count(),
      prisma.charityAutomaticRevocationRecord.count(),
      prisma.charityPublication78Record.count(),
      prisma.charityFiling990Index.count(),
      prisma.proPublicaNonprofit.count(),
    ]);

    // Map record counts to source slugs
    const slugToCount: Record<string, number> = {
      "irs-eo-bmf": recordCounts[0],
      "irs-990n": recordCounts[2],
      "irs-990-xml": recordCounts[3],
      "irs-auto-revocation": recordCounts[4],
      "irs-pub78": recordCounts[5],
      "propublica-nonprofit": recordCounts[7],
    };

    const now = new Date();

    const sources: SourceStatus[] = sourceSystems.map((source) => {
      const activeJob = source.IngestionRun[0];
      const recordCount = slugToCount[source.slug] || 0;
      const lastSync = source.lastSuccessfulSyncAt;

      let hoursSinceSync: number | null = null;
      if (lastSync) {
        const diffMs = now.getTime() - lastSync.getTime();
        hoursSinceSync = Math.round(diffMs / (1000 * 60 * 60));
      }

      const isFresh = source.freshnessSlaHours
        ? (hoursSinceSync ?? 9999) <= source.freshnessSlaHours
        : hoursSinceSync === null || hoursSinceSync < 24;

      let activeJobProgress: number | null = null;
      if (activeJob && activeJob.rowsRead && activeJob.rowsRead > 0) {
        const processed = (activeJob.rowsInserted || 0) + (activeJob.rowsUpdated || 0);
        activeJobProgress = Math.min(100, Math.round((processed / activeJob.rowsRead) * 100));
      }

      return {
        id: source.id,
        slug: source.slug,
        name: source.name,
        categoryId: source.categoryId,
        categoryName: source.FraudCategory?.name || "Uncategorized",
        description: source.description,
        baseUrl: source.baseUrl,
        ingestionMode: source.ingestionMode,
        refreshCadence: source.refreshCadence,
        freshnessSlaHours: source.freshnessSlaHours,
        lastAttemptedSyncAt: source.lastAttemptedSyncAt,
        lastSuccessfulSyncAt: source.lastSuccessfulSyncAt,
        lastError: source.lastError,
        recordCount,
        hoursSinceSync,
        isFresh,
        hasActiveJob: !!activeJob,
        activeJobProgress,
        activeJobId: activeJob?.id || null,
        supportsIncremental: source.supportsIncremental,
      };
    });

    // Calculate summary statistics
    const summary = {
      totalSources: sources.length,
      freshSources: sources.filter((s) => s.isFresh).length,
      staleSources: sources.filter((s) => !s.isFresh && s.recordCount > 0).length,
      neverSynced: sources.filter((s) => s.recordCount === 0).length,
      activeJobs: sources.filter((s) => s.hasActiveJob).length,
      totalRecords: sources.reduce((sum, s) => sum + s.recordCount, 0),
      sourcesWithError: sources.filter((s) => s.lastError !== null).length,
    };

    return NextResponse.json({
      sources,
      summary,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching sources:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch data sources",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}