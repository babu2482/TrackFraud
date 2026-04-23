import { prisma } from "@/lib/db";
import { latestDate } from "@/lib/warehouse";

export async function getSourceSystemFreshness(
  sourceSystemId: string
): Promise<Date | null> {
  const source = await prisma.sourceSystem.findUnique({
    where: { id: sourceSystemId },
    select: { lastSuccessfulSyncAt: true },
  });
  return source?.lastSuccessfulSyncAt ?? null;
}

export function classifyMirrorCoverage(params: {
  recordCount: number;
  detailReadyThreshold?: number;
  historicalReadyThreshold?: number;
}): string {
  if (params.recordCount <= 0) return "not-started";
  if (
    params.historicalReadyThreshold != null &&
    params.recordCount >= params.historicalReadyThreshold
  ) {
    return "historical-partial";
  }
  if (
    params.detailReadyThreshold != null &&
    params.recordCount >= params.detailReadyThreshold
  ) {
    return "detail-ready";
  }
  return "summary-only";
}

export async function resolveMirrorFreshness(params: {
  sourceSystemId: string;
  observedDates?: Array<Date | string | null | undefined>;
}): Promise<Date | null> {
  const sourceFreshness = await getSourceSystemFreshness(params.sourceSystemId);
  return latestDate(sourceFreshness, ...(params.observedDates ?? []));
}
