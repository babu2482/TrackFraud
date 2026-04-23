import { NextRequest } from "next/server";
import { searchAwards } from "@/lib/usaspending";
import {
  getLocalGovernmentMirrorStatus,
  hasLocalGovernmentMirror,
  searchStoredGovernmentAwards,
} from "@/lib/government-read";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  if (!q) return Response.json({ error: "Query parameter q is required" }, { status: 400 });

  try {
    if (await hasLocalGovernmentMirror()) {
      return Response.json(await searchStoredGovernmentAwards({ q, page }));
    }

    const data = await searchAwards(q, page);
    const mirrorStatus = await getLocalGovernmentMirrorStatus();
    return Response.json(
      withMirrorMetadata(data, {
        dataSource: "live",
        mirrorCoverage: mirrorStatus.coverage,
      })
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
