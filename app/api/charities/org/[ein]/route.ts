import { NextRequest } from "next/server";
import {
  isValidEin,
  loadCharityComputation,
  normalizeEin,
} from "@/lib/charity-detail";
import { loadStoredCharityDetail } from "@/lib/charity-read";
import { persistCharityComputation } from "@/lib/charity-storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ein: string }> }
) {
  const { ein: rawEin } = await params;
  const ein = normalizeEin(rawEin);
  if (!isValidEin(ein)) {
    return Response.json({ error: "Invalid EIN" }, { status: 400 });
  }

  try {
    const record = await loadCharityComputation(ein);
    try {
      await persistCharityComputation(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[charity-storage] Failed to persist ${ein}: ${message}`);
    }
    return Response.json(record.detail);
  } catch (err) {
    const storedDetail = await loadStoredCharityDetail(ein);
    if (storedDetail) {
      return Response.json(storedDetail);
    }

    const message =
      err instanceof Error ? err.message : "Failed to load organization";
    return Response.json({ error: message }, { status: 404 });
  }
}
