import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/healthcare/payments
 *
 * Fetches healthcare payment data from CMS Open Payments with support for:
 * - Pagination (page, limit)
 * - Filter by recipient name, state, specialty, payment amount
 * - Search by recipient name or NPI
 * - Sort by date or payment amount
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface PaymentListItem {
  id: string;
  physicianFirstName: string;
  physicianLastName: string;
  physicianSpecialty?: string | null;
  recipientState?: string;
  recipientCity?: string | null;
  amountUsd?: number | null;
  dateOfPayment?: string;
  natureOfPayment?: string | null;
  manufacturerName?: string | null;
  paymentType?: string | null;
  programYear?: number | null;
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
    const specialty = searchParams.get("specialty");
    const minAmount = searchParams.get("minAmount")
      ? parseFloat(searchParams.get("minAmount")!)
      : undefined;
    const maxAmount = searchParams.get("maxAmount")
      ? parseFloat(searchParams.get("maxAmount")!)
      : undefined;
    const sortBy = searchParams.get("sortBy") || "dateOfPayment";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as
      | "asc"
      | "desc";

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { physicianFirstName: { contains: search, mode: "insensitive" } },
        { physicianLastName: { contains: search, mode: "insensitive" } },
        { manufacturerName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (state) {
      where.recipientState = state;
    }

    if (specialty) {
      where.physicianSpecialty = { contains: specialty, mode: "insensitive" };
    }

    if (minAmount !== undefined) {
      where.paymentAmount = {
        ...where.paymentAmount,
        gte: minAmount,
      };
    }

    if (maxAmount !== undefined) {
      where.paymentAmount = {
        ...where.paymentAmount,
        lte: maxAmount,
      };
    }

    // Build sort order
    const orderBy: any = {};
    switch (sortBy) {
      case "physicianFirstName":
        orderBy.physicianFirstName = sortOrder;
        break;
      case "physicianLastName":
        orderBy.physicianLastName = sortOrder;
        break;
      case "amountUsd":
        orderBy.amountUsd = sortOrder;
        break;
      case "recipientState":
        orderBy.recipientState = sortOrder;
        break;
      case "dateOfPayment":
        orderBy.dateOfPayment = sortOrder;
        break;
      default:
        orderBy.dateOfPayment = sortOrder;
    }

    // Fetch payments with pagination
    const [payments, total] = await Promise.all([
      prisma.healthcarePaymentRecord.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy,
        select: {
          id: true,
          physicianFirstName: true,
          physicianLastName: true,
          physicianSpecialty: true,
          recipientState: true,
          recipientCity: true,
          amountUsd: true,
          dateOfPayment: true,
          natureOfPayment: true,
          manufacturerName: true,
          paymentType: true,
          programYear: true,
        },
      }),
      prisma.healthcarePaymentRecord.count({ where }),
    ]);

    // Format results
    const formattedPayments: PaymentListItem[] = payments.map((payment) => ({
      id: payment.id,
      physicianFirstName: payment.physicianFirstName || "Unknown",
      physicianLastName: payment.physicianLastName || "Unknown",
      physicianSpecialty: payment.physicianSpecialty,
      recipientState: payment.recipientState || "Unknown",
      recipientCity: payment.recipientCity,
      amountUsd: payment.amountUsd,
      dateOfPayment: payment.dateOfPayment?.toISOString() || "",
      natureOfPayment: payment.natureOfPayment,
      manufacturerName: payment.manufacturerName,
      paymentType: payment.paymentType,
      programYear: payment.programYear ?? undefined,
    }));

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      payments: formattedPayments,
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      filters: {
        search,
        state,
        specialty,
        minAmount,
        maxAmount,
      },
      sorting: {
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    console.error("Error fetching healthcare payments:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch healthcare payments",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
