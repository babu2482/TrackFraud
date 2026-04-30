import { NextRequest } from "next/server";
import {
  isValidEin,
  loadCharityComputation,
  normalizeEin,
} from "@/lib/charity-detail";
import { loadStoredCharityDetail } from "@/lib/charity-read";
import { persistCharityComputation } from "@/lib/charity-storage";
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
 * Resolve a UUID to an EIN by looking up the CanonicalEntity in the database
 */
async function resolveUUIDToEin(uuid: string): Promise<string | null> {
  try {
    const charity = await prisma.charityProfile.findFirst({
      where: {
        CanonicalEntity: {
          id: uuid,
        },
      },
      select: {
        ein: true,
      },
    });
    return charity?.ein ?? null;
  } catch (error) {
    console.error(`Failed to resolve UUID to EIN: ${error}`);
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ein: string }> },
) {
  const { ein: rawId } = await params;

  // If the ID looks like a UUID, resolve it to an EIN
  let ein: string;
  if (isUUID(rawId)) {
    const resolvedEin = await resolveUUIDToEin(rawId);
    if (!resolvedEin) {
      return Response.json(
        { error: "Charity not found for this entity ID" },
        { status: 404 },
      );
    }
    ein = normalizeEin(resolvedEin);
  } else {
    ein = normalizeEin(rawId);
  }

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
