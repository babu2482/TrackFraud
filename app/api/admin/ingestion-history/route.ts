import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/ingestion-history
 *
 * Query parameters:
 * - days: number of days to look back (default: 7)
 * - source: filter by category name (optional)
 * - status: filter by status (completed/running/failed) (optional)
 * - page: page number for pagination (default: 1)
 * - limit: items per page (default: 50, max: 200)
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "7", 10);
    const source = searchParams.get("source") || null;
    const status = searchParams.get("status") || null;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // Build where clause
    const where: any = {
      startedAt: {
        gte: sinceDate,
      },
    };

    if (status && status !== "all") {
      where.status = status;
    }

    if (source && source !== "all") {
      where.SourceSystem = {
        FraudCategory: {
          name: source,
        },
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.ingestionRun.count({ where });

    // Fetch runs with pagination
    const runs = await prisma.ingestionRun.findMany({
      where,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: {
        startedAt: "desc",
      },
      include: {
        SourceSystem: {
          select: {
            name: true,
            slug: true,
            FraudCategory: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const formattedRuns = runs.map((run) => ({
      id: run.id,
      sourceSystemId: run.sourceSystemId,
      status: run.status,
      rowsRead: run.rowsRead || 0,
      rowsInserted: run.rowsInserted || 0,
      rowsUpdated: run.rowsUpdated || 0,
      rowsSkipped: run.rowsSkipped || 0,
      rowsFailed: run.rowsFailed || 0,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      errorSummary: run.errorSummary,
      SourceSystem: run.SourceSystem ? {
        ...run.SourceSystem,
        categoryName: run.SourceSystem.FraudCategory?.name || "Unknown",
      } : undefined,
    }));

    return NextResponse.json({
      runs: formattedRuns,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching ingestion history:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch ingestion history",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}