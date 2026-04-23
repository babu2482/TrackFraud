import { NextRequest } from "next/server";
import { searchCompanies } from "@/lib/sec";
import {
  getLocalCorporateMirrorStatus,
  hasLocalCorporateMirror,
  searchStoredCorporateCompanies,
} from "@/lib/corporate-read";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "Query parameter q is required" }, { status: 400 });

  try {
    if (await hasLocalCorporateMirror()) {
      return Response.json(await searchStoredCorporateCompanies(q));
    }

    const results = await searchCompanies(q);
    const mirrorStatus = await getLocalCorporateMirrorStatus();
    return Response.json(
      withMirrorMetadata(
        { results },
        { dataSource: "live", mirrorCoverage: mirrorStatus.coverage }
      )
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
