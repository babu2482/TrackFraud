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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cik: string }> }
) {
  const { cik } = await params;
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
        { dataSource: "live", mirrorCoverage: mirrorStatus.coverage }
      )
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load company" }, { status: 500 });
  }
}
