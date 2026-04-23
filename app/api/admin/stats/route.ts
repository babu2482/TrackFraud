import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/stats
 *
 * Returns database statistics for the admin dashboard.
 * Provides record counts across all major entity categories.
 */

export async function GET(request: NextRequest) {
  try {
    // Fetch counts for all major entity categories
    const [
      charityCount,
      billCount,
      healthcarePaymentCount,
      consumerComplaintCount,
      corporateProfileCount,
      corporateFilingCount,
      ofacSanctionCount,
      samExclusionCount,
      fraudSignalCount,
      fraudSnapshotCount,
    ] = await Promise.all([
      prisma.charityProfile.count(),
      prisma.bill.count(),
      prisma.healthcarePaymentRecord.count(),
      prisma.consumerComplaintRecord.count(),
      prisma.corporateCompanyProfile.count(),
      prisma.corporateFilingRecord.count(),
      prisma.oFACSanction.count(),
      prisma.sAMExclusion.count(),
      prisma.fraudSignalEvent.count(),
      prisma.fraudSnapshot.count(),
    ]);

    // Calculate totals
    const total =
      charityCount +
      billCount +
      healthcarePaymentCount +
      consumerComplaintCount +
      corporateProfileCount +
      corporateFilingCount +
      ofacSanctionCount +
      samExclusionCount +
      fraudSignalCount +
      fraudSnapshotCount;

    // Return formatted response
    return NextResponse.json({
      stats: {
        charities: charityCount,
        politics: billCount,
        healthcare: healthcarePaymentCount,
        consumer: consumerComplaintCount,
        corporate: corporateProfileCount + corporateFilingCount,
        government: 0, // Will be populated when USAspending data is loaded
        sanctions: ofacSanctionCount + samExclusionCount,
        total,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch database statistics",
        message:
          error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
