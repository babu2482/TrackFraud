import { NextRequest } from "next/server";
import { searchPaymentsByDoctor, searchPaymentsByCompany } from "@/lib/cms";
import { buildFraudMeter } from "@/lib/fraud-meter";
import {
  getLocalHealthcareMirrorStatus,
  hasLocalHealthcareMirror,
  searchStoredHealthcarePayments,
} from "@/lib/healthcare-read";
import { buildHealthcareSignals, computeHealthcareMetrics } from "@/lib/healthcare-analysis";
import { compositeScore } from "@/lib/fraud-signals";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const type = request.nextUrl.searchParams.get("type") ?? "doctor";
  if (!q) return Response.json({ error: "Query parameter q is required" }, { status: 400 });

  try {
    if (await hasLocalHealthcareMirror()) {
      const stored = await searchStoredHealthcarePayments({
        q,
        type: type === "company" ? "company" : "doctor",
      });
      const fraudMeter = buildFraudMeter({
        domain: "healthcare",
        riskSignals: stored.riskSignals,
      });
      return Response.json({
        ...stored,
        fraudMeter,
      });
    }

    let results;
    if (type === "company") {
      results = await searchPaymentsByCompany(q);
    } else {
      const parts = q.split(/\s+/);
      const lastName = parts.length >= 2 ? parts[parts.length - 1] : parts[0];
      const firstName = parts.length >= 2 ? parts[0] : undefined;
      results = await searchPaymentsByDoctor(lastName, firstName);
    }
    const metrics = computeHealthcareMetrics(results);
    const riskSignals = buildHealthcareSignals(results);
    const riskScore = compositeScore(riskSignals);
    const fraudMeter = buildFraudMeter({
      domain: "healthcare",
      riskSignals,
    });
    const mirrorStatus = await getLocalHealthcareMirrorStatus();
    return Response.json(
      withMirrorMetadata(
        { type, results, metrics, riskSignals, riskScore, fraudMeter },
        { dataSource: "live", mirrorCoverage: mirrorStatus.coverage }
      )
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
