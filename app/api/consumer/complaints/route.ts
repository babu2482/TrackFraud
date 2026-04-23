import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/consumer/complaints
 *
 * Fetches consumer complaint data from CFPB with support for:
 * - Pagination (page, limit)
 * - Filter by company, product, state, complaint status
 * - Search by complaint text or consumer submitted message
 * - Sort by date or other fields
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface ComplaintListItem {
  id: string;
  normalizedCompany: string;
  product: string;
  state: string;
  dateReceived: string;
  complaintWhatHappened?: string | null;
  consumerDisputed?: string | null;
  companyResponse?: string | null;
  submittedVia?: string | null;
  timely?: string | null;
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
    const company = searchParams.get("company");
    const product = searchParams.get("product");
    const state = searchParams.get("state");
    const sortBy = searchParams.get("sortBy") || "dateReceived";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as
      | "asc"
      | "desc";

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { complaintWhatHappened: { contains: search, mode: "insensitive" } },
        { normalizedCompany: { contains: search, mode: "insensitive" } },
      ];
    }

    if (company) {
      where.normalizedCompany = { contains: company, mode: "insensitive" };
    }

    if (product) {
      where.product = { contains: product, mode: "insensitive" };
    }

    if (state) {
      where.state = state;
    }

    // Build sort order
    const orderBy: any = {};
    switch (sortBy) {
      case "normalizedCompany":
        orderBy.normalizedCompany = sortOrder;
        break;
      case "product":
        orderBy.product = sortOrder;
        break;
      case "state":
        orderBy.state = sortOrder;
        break;
      case "dateReceived":
        orderBy.dateReceived = sortOrder;
        break;
      default:
        orderBy.dateReceived = sortOrder;
    }

    // Fetch complaints with pagination
    const [complaints, total] = await Promise.all([
      prisma.consumerComplaintRecord.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
        select: {
          id: true,
          normalizedCompany: true,
          product: true,
          state: true,
          dateReceived: true,
          complaintWhatHappened: true,
          consumerDisputed: true,
          companyResponse: true,
          submittedVia: true,
          timely: true,
        },
      }),
      prisma.consumerComplaintRecord.count({ where }),
    ]);

    // Format results
    const formattedComplaints: ComplaintListItem[] = complaints.map(
      (complaint) => ({
        id: complaint.id,
        normalizedCompany: complaint.normalizedCompany || "Unknown",
        product: complaint.product || "Unknown",
        state: complaint.state || "Unknown",
        dateReceived: complaint.dateReceived?.toISOString() || "",
        complaintWhatHappened: complaint.complaintWhatHappened,
        consumerDisputed: complaint.consumerDisputed,
        companyResponse: complaint.companyResponse,
        submittedVia: complaint.submittedVia,
        timely: complaint.timely,
      }),
    );

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      complaints: formattedComplaints,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      filters: {
        search,
        company,
        product,
        state,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error fetching consumer complaints:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch consumer complaints",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
