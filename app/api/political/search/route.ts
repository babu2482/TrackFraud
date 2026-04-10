import { NextRequest } from "next/server";
import {
  isFECRequestError,
  listCandidates,
  listCommittees,
  searchCandidates,
  searchCommittees,
} from "@/lib/fec";
import {
  hasLocalPoliticalMirror,
  searchStoredPoliticalEntities,
} from "@/lib/political-read";
import { withMirrorMetadata } from "@/lib/warehouse";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const type = request.nextUrl.searchParams.get("type") ?? "candidates";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);

  if (!q) {
    return Response.json({ error: "Query parameter q is required" }, { status: 400 });
  }

  try {
    if (await hasLocalPoliticalMirror()) {
      const stored = await searchStoredPoliticalEntities({
        q,
        type: type === "committees" ? "committees" : "candidates",
        page,
      });
      return Response.json(stored);
    }

    if (type === "committees") {
      const data = await searchCommittees(q, page);
      return Response.json(
        withMirrorMetadata(
          {
            type: "committees",
            results: data.results,
            pagination: data.pagination,
          },
          { dataSource: "live", mirrorCoverage: "not-started" }
        )
      );
    }
    const data = await searchCandidates(q, page);
    return Response.json(
      withMirrorMetadata(
        {
          type: "candidates",
          results: data.results,
          pagination: data.pagination,
        },
        { dataSource: "live", mirrorCoverage: "not-started" }
      )
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    const status = isFECRequestError(err) ? err.status : 500;
    return Response.json({ error: message }, { status });
  }
}
