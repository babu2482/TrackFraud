import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/charities
 *
 * Fetches charity data directly from the database with support for:
 * - Pagination (page, limit)
 * - Search by name or EIN
 * - Filter by state, NTEE code, status
 * - Sort by various fields
 * - Include fraud scores and risk levels
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface CharityListItem {
  id: string;
  ein: string;
  name: string;
  city?: string | null;
  state?: string | null;
  nteeCode?: string | null;
  status?: string | null;
  riskScore?: number | null;
  riskLevel?: string | null;
  signalCount?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10),
      ),
    );
    const search = searchParams.get("q");
    const state = searchParams.get("state");
    const nteeCode = searchParams.get("ntee");
    const sortBy = searchParams.get("sortBy") || "name";
    const sortOrder = (searchParams.get("sortOrder") || "asc") as
      | "asc"
      | "desc";

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { subName: { contains: search, mode: "insensitive" } },
        { ein: { contains: search } },
      ];
    }

    if (state) {
      where.state = state;
    }

    if (nteeCode) {
      where.nteeCode = nteeCode;
    }

    // Build sort order (CharityProfile has subName, not name)
    const orderBy: any = {};
    switch (sortBy) {
      case "name":
        orderBy.subName = sortOrder;
        break;
      case "ein":
        orderBy.ein = sortOrder;
        break;
      case "riskScore":
        // riskScore is not on CharityProfile; fall back to ein
        orderBy.ein = sortOrder;
        break;
      case "state":
        orderBy.state = sortOrder;
        break;
      default:
        orderBy.ein = sortOrder;
    }

    // Fetch charities with fraud scores
    const [charities, total] = await Promise.all([
      prisma.charityProfile.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
      }),
      prisma.charityProfile.count({ where }),
    ]);

    // Fetch fraud snapshots for these charities in batch
    const einList = charities.map((c) => c.ein);
    const fraudSnapshots = await prisma.fraudSnapshot.findMany({
      where: {
        entityId: { in: einList },
      },
      select: {
        entityId: true,
        score: true,
        level: true,
      },
    });

    // Create a map for quick lookup
    const fraudMap = new Map(fraudSnapshots.map((s) => [s.entityId, s]));

    // Format results
    const formattedCharities: CharityListItem[] = charities.map((charity) => ({
      id: charity.id,
      ein: charity.ein,
      name: charity.subName || charity.ein,
      city: charity.city,
      state: charity.state,
      nteeCode: charity.nteeCode,
      status: charity.subsectionCode?.toString() || null,
      riskScore: fraudMap.get(charity.ein)?.score ?? null,
      riskLevel: fraudMap.get(charity.ein)?.level ?? null,
      signalCount: 0,
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      charities: formattedCharities,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      filters: {
        search,
        state,
        nteeCode,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error fetching charities:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch charities",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/charities (Optional - for bulk operations)
 * Currently not implemented as this is read-only data from IRS
 */
