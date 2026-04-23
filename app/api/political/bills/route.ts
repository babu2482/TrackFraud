import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/political/bills
 *
 * Fetches legislative bill data from Congress.gov with support for:
 * - Pagination (page, limit)
 * - Filter by congress session, chamber, bill type, status
 * - Search by title or bill number
 * - Sort by various fields
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface BillListItem {
  id: number;
  congressNumber: number | null;
  billNumber: string;
  billType: string;
  title: string;
  status?: string | null;
  summary?: string | null;
  introducedDate?: Date | null;
  sourceUrl?: string | null;
  externalId?: string | null;
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
    const congress = searchParams.get("congress")
      ? parseInt(searchParams.get("congress")!, 10)
      : undefined;
    const chamber = searchParams.get("chamber"); // h, s, or undefined
    const status = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "introducedDate";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as
      | "asc"
      | "desc";

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { billNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    if (congress) {
      where.congressNumber = congress;
    }

    if (chamber) {
      // Filter by chamber based on bill type prefix
      where.billType = {
        contains: chamber === "h" ? "H" : "S",
        mode: "insensitive",
      };
    }

    if (status) {
      where.status = status;
    }

    // Build sort order
    const orderBy: any = {};
    switch (sortBy) {
      case "title":
        orderBy.title = sortOrder;
        break;
      case "billNumber":
        orderBy.billNumber = sortOrder;
        break;
      case "congressNumber":
        orderBy.congressNumber = sortOrder;
        break;
      case "introducedDate":
        orderBy.introducedDate = sortOrder;
        break;
      case "status":
        orderBy.status = sortOrder;
        break;
      default:
        orderBy.introducedDate = sortOrder;
    }

    // Fetch bills with pagination
    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
      }),
      prisma.bill.count({ where }),
    ]);

    // Format results
    const formattedBills: BillListItem[] = bills.map((bill) => ({
      id: bill.id,
      congressNumber: bill.congressNumber,
      billNumber: bill.billNumber,
      billType: bill.billType || "",
      title: bill.title || "Untitled",
      status: bill.status,
      summary: bill.summary,
      introducedDate: bill.introducedDate,
      sourceUrl: bill.sourceUrl,
      externalId: bill.externalId,
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      bills: formattedBills,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      filters: {
        search,
        congress,
        chamber,
        status,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error fetching political bills:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch political bills",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
