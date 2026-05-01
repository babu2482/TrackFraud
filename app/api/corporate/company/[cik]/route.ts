import { NextRequest } from "next/server";
import { getCompanySubmissions, extractRecentFilings } from "@/lib/sec";
import { buildFraudMeter } from "@/lib/fraud-meter";
import { buildCorporateSignals } from "@/lib/corporate-analysis";
import {
  getLocalCorporateMirrorStatus,
  getStoredCorporateCompanyDetail,
  hasLocalCorporateMirror,
} from "@/lib/corporate-read";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";
import { prisma } from "@/lib/db";

/**
 * Check if a string looks like a UUID
 */
function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * Resolve a UUID to a CIK by looking up the CanonicalEntity in the database
 */
async function resolveUUIDToCik(uuid: string): Promise<string | null> {
  try {
    const company = await prisma.corporateCompanyProfile.findFirst({
      where: {
        CanonicalEntity: {
          id: uuid,
        },
      },
      select: {
        cik: true,
      },
    });
    return company?.cik ?? null;
  } catch (error) {
    console.error(`Failed to resolve UUID to CIK: ${error}`);
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cik: string }> },
) {
  const { cik: rawId } = await params;

  // If the ID looks like a UUID, resolve it to a CIK
  let cik: string;
  if (isUUID(rawId)) {
    const resolvedCik = await resolveUUIDToCik(rawId);
    if (!resolvedCik) {
      return Response.json(
        { error: "Company not found for this entity ID" },
        { status: 404 },
      );
    }
    cik = resolvedCik;
  } else {
    cik = rawId;
  }

  try {
    if (await hasLocalCorporateMirror()) {
      const stored = await getStoredCorporateCompanyDetail(cik);
      if (stored) {
        const fraudMeter = buildFraudMeter({
          domain: "corporate",
          riskSignals: stored.riskSignals,
        });
        return Response.json({
          ...stored,
          fraudMeter,
        });
      }
    }

    const submissions = await getCompanySubmissions(cik);
    const filings = extractRecentFilings(submissions, 30);
    const riskSignals = buildCorporateSignals(filings);
    const riskScore = compositeScore(riskSignals);
    const fraudMeter = buildFraudMeter({
      domain: "corporate",
      riskSignals,
    });
    const mirrorStatus = await getLocalCorporateMirrorStatus();
    return Response.json(
      withMirrorMetadata(
        {
          company: {
            cik: submissions.cik,
            name: submissions.name,
            entityType: submissions.entityType,
            sic: submissions.sic,
            sicDescription: submissions.sicDescription,
            tickers: submissions.tickers,
            exchanges: submissions.exchanges,
            stateOfIncorporation: submissions.stateOfIncorporation,
            fiscalYearEnd: submissions.fiscalYearEnd,
          },
          filings,
          riskSignals,
          riskScore,
          fraudMeter,
        },
        { dataSource: "live", mirrorCoverage: mirrorStatus.coverage },
      ),
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load company" },
      { status: 500 },
    );
  }
}
