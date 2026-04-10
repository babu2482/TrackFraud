import type { MirrorDataSource, MirrorMetadata } from "@/lib/types";

export function normalizeEntityName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function compactText(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > 0 ? compacted : null;
}

export function parseOptionalDate(
  value?: string | number | Date | null
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function latestDate(
  ...dates: Array<Date | string | null | undefined>
): Date | null {
  let latest: Date | null = null;
  for (const value of dates) {
    const parsed = parseOptionalDate(value ?? null);
    if (!parsed) continue;
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }
  return latest;
}

export function toIsoStringOrNull(
  value?: Date | string | null
): string | null {
  const parsed = parseOptionalDate(value ?? null);
  return parsed ? parsed.toISOString() : null;
}

export function withMirrorMetadata<T extends object>(
  payload: T,
  metadata: {
    dataSource: MirrorDataSource;
    sourceFreshnessAt?: Date | string | null;
    mirrorCoverage?: string;
  }
): T & MirrorMetadata {
  return {
    ...payload,
    dataSource: metadata.dataSource,
    sourceFreshnessAt: toIsoStringOrNull(metadata.sourceFreshnessAt ?? null),
    mirrorCoverage: metadata.mirrorCoverage ?? "not-started",
  };
}
