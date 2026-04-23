#!/usr/bin/env -S tsx
/**
 * Federal Register Ingestion Script
 *
 * Fetches federal rules, regulations, and notices from the Federal Register API.
 * The API provides access to all documents published in the Federal Register
 * including rules, proposed rules, notices, and presidential documents.
 *
 * API Reference: https://www.federalregister.gov/api/v1/
 * No API key required for basic access (rate limited)
 *
 * Usage:
 *   npx tsx scripts/ingest-federal-register.ts --all
 *   npx tsx scripts/ingest-federal-register.ts --agency EPA,FDA,HHS
 *   npx tsx scripts/ingest-federal-register.ts --type rules,notices
 *   npx tsx scripts/ingest-federal-register.ts --date-from 2024-01-01 --date-to 2024-12-31
 */

import { prisma } from "../lib/db";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
} from "../lib/ingestion-utils";

const FEDERAL_REGISTER_SOURCE_SYSTEM_ID = "federal-register-api";
const API_BASE_URL = "https://www.federalregister.gov/api/v1";
const BATCH_SIZE = 50; // Documents per batch to database
const RATE_LIMIT_DELAY_MS = 200; // Be respectful of their servers

interface ParsedArgs {
  all: boolean;
  agencies?: string[];
  types?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  maxRows?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    all: false,
    types: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      parsed.all = true;
    } else if (arg === "--agency" || arg === "--agencies") {
      parsed.agencies = (argv[++i] ?? "").split(",").map((a) => a.trim());
    } else if (arg === "--type" || arg === "--types") {
      parsed.types = (argv[++i] ?? "").split(",").map((t) => t.trim().toLowerCase());
    } else if (arg === "--date-from") {
      parsed.dateFrom = new Date(argv[++i] ?? "");
    } else if (arg === "--date-to") {
      parsed.dateTo = new Date(argv[++i] ?? "");
    } else if (arg === "--max-rows") {
      const val = parseInt(argv[++i] ?? "0", 10);
      parsed.maxRows = Number.isFinite(val) ? val : undefined;
    }
  }
  return parsed;
}

// Federal Register API response types
interface FRDocument {
  id: string;
  title: string;
  type: string;
  agency: string[];
  document_number: string;
  publication_date: string;
  effective_date?: string;
  start_date?: string;
  end_date?: string;
  fr_volume?: number;
  fr_page?: number;
  summary?: string;
  url: string;
  pdf_url?: string;
  comments_url?: string;
  docket_ids?: string[];
  cfda_numbers?: string[];
}

interface FRResponse {
  results: FRDocument[];
  meta: {
    total_pages: number;
    current_page: number;
    per_page: number;
    total_count: number;
  };
}

async function fetchWithRetry<T>(
  url: string,
  retries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "TrackFraud/1.0",
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `HTTP ${response.status}: ${errorText.slice(0, 200)}`
        );
      }

      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      console.log(`  Retry ${attempt}/${retries} after delay...`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS * attempt));
    }
  }
  throw new Error("Should not reach here");
}

function mapFRDocument(doc: FRDocument): { record: any; sourceUpdatedAt: Date } {
  // Use document_number as the unique identifier since it's guaranteed to be present
  const uniqueId = doc.document_number || `fr-${doc.id}`;

  // Generate a fallback URL if not provided (Federal Register uses predictable URLs)
  const url = doc.url || `https://www.federalregister.gov/documents/${uniqueId.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return {
    record: {
      externalId: uniqueId,
      title: doc.title,
      documentType: doc.type,
      agencies: Array.isArray(doc.agency) ? doc.agency.join(", ") : null,
      documentNumber: doc.document_number,
      publicationDate: new Date(doc.publication_date),
      effectiveDate: doc.effective_date ? new Date(doc.effective_date) : null,
      startDate: doc.start_date ? new Date(doc.start_date) : null,
      endDate: doc.end_date ? new Date(doc.end_date) : null,
      frVolume: doc.fr_volume ?? null,
      frPage: doc.fr_page ?? null,
      summary: doc.summary || null,
      url: url,
      pdfUrl: doc.pdf_url || null,
      commentsUrl: doc.comments_url || null,
      docketIds: Array.isArray(doc.docket_ids) ? doc.docket_ids.join(", ") : null,
      cfdaNumbers: Array.isArray(doc.cfda_numbers) ? doc.cfda_numbers.join(", ") : null,
    },
    sourceUpdatedAt: new Date(),
  };
}

async function upsertDocument(
  record: any,
  sourceSystemId: string
): Promise<"inserted" | "updated" | "skipped"> {
  // Skip if externalId is missing or invalid
  if (!record.externalId) {
    console.warn(`Skipping document with missing ID: ${record.title?.slice(0, 50)}...`);
    return "skipped";
  }

  // Check if record exists first to determine insert vs update
  const existing = await prisma.federalRegisterDocument.findUnique({
    where: { externalId: record.externalId },
  });

  await prisma.federalRegisterDocument.upsert({
    where: { externalId: record.externalId },
    update: record,
    create: {
      ...record,
      sourceSystemId,
    },
  });

  return existing ? "updated" : "inserted";
}

async function fetchDocuments(
  page: number,
  filters: Record<string, string> = {}
): Promise<FRDocument[]> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: "100", // Max allowed by API
    ...filters,
  });

  const url = `${API_BASE_URL}/documents/?${params.toString()}`;
  console.log(`  Fetching page ${page}...`);

  const response = await fetchWithRetry<FRResponse>(url);

  // Rate limiting between requests
  await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

  return response.results || [];
}

async function main(): Promise<void> {
  console.log("=== Federal Register API Ingestion ===");

  const args = parseArgs(process.argv.slice(2));

  // Get or create source system FIRST (before starting ingestion run)
  await prisma.sourceSystem.upsert({
    where: { id: FEDERAL_REGISTER_SOURCE_SYSTEM_ID },
    update: {},
    create: {
      id: FEDERAL_REGISTER_SOURCE_SYSTEM_ID,
      categoryId: "political",
      name: "Federal Register API",
      slug: "federal-register-api",
      description: "U.S. Federal Register rules, regulations, and notices",
      ingestionMode: "api",
      refreshCadence: "daily",
    },
  });

  console.log(`Source system ready: ${FEDERAL_REGISTER_SOURCE_SYSTEM_ID}`);

  // Now start the ingestion run (source system must exist first)
  const { run } = await startIngestionRun({
    sourceSystemId: FEDERAL_REGISTER_SOURCE_SYSTEM_ID,
  });

  const stats = createEmptyStats();
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalPagesProcessed = 0;

  try {
    // Build filters based on arguments
    const filters: Record<string, string> = {};

    if (args.agencies && args.agencies.length > 0) {
      filters.agency = args.agencies.join(",");
    }

    if (args.types && args.types.length > 0) {
      // Map our type names to FR API types
      const typeMap: Record<string, string> = {
        rules: "Rule",
        rule: "Rule",
        proposed: "Proposed Rule",
        "proposed rule": "Proposed Rule",
        notices: "Notice",
        notice: "Notice",
        presidential: "Presidential Document",
        "presidential document": "Presidential Document",
      };
      const frTypes = args.types
        .map((t) => typeMap[t] || t)
        .filter(Boolean);
      filters.type = frTypes.join(",");
    }

    if (args.dateFrom && !isNaN(args.dateFrom.getTime())) {
      filters.start_date = args.dateFrom.toISOString().split("T")[0];
    }

    if (args.dateTo && !isNaN(args.dateTo.getTime())) {
      filters.end_date = args.dateTo.toISOString().split("T")[0];
    }

    console.log(`Filters:`, JSON.stringify(filters, null, 2));

    // Fetch first page to get total count
    const firstPageDocs = await fetchDocuments(1, filters);

    if (firstPageDocs.length === 0) {
      console.log("No documents found matching criteria");
      await finishIngestionRun({
        runId: run.id,
        sourceSystemId: FEDERAL_REGISTER_SOURCE_SYSTEM_ID,
        stats,
        status: "completed",
      });
      return;
    }

    // Get total pages from first request (we need to make a count request)
    const countUrl = `${API_BASE_URL}/documents/?per_page=1${Object.entries(filters).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("")}`;
    const countResponse = await fetchWithRetry<FRResponse>(countUrl);
    const totalCount = countResponse.meta?.total_count || firstPageDocs.length;
    const totalPages = Math.ceil(totalCount / 100);

    console.log(`Found ${totalCount.toLocaleString()} documents across ${totalPages} pages`);

    // Process first page
    let allDocs: FRDocument[] = [...firstPageDocs];
    totalPagesProcessed++;

    // Fetch remaining pages if needed
    const maxPages = args.maxRows ? Math.ceil(args.maxRows / 100) : Infinity;

    for (let page = 2; page <= totalPages && page <= maxPages; page++) {
      const docs = await fetchDocuments(page, filters);
      allDocs.push(...docs);
      totalPagesProcessed++;

      if (args.maxRows && allDocs.length >= args.maxRows) {
        allDocs = allDocs.slice(0, args.maxRows);
        break;
      }

      // Progress update every 10 pages
      if (page % 10 === 0) {
        console.log(`  Processed ${page}/${totalPages} pages (${allDocs.length.toLocaleString()} documents)`);
      }
    }

    console.log(`\nProcessing ${allDocs.length.toLocaleString()} documents...`);

    // Batch insert documents
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = allDocs.slice(i, i + BATCH_SIZE);

      for (const doc of batch) {
        const { record } = mapFRDocument(doc);
        const action = await upsertDocument(record, FEDERAL_REGISTER_SOURCE_SYSTEM_ID);

        if (action === "inserted") totalInserted++;
        else if (action === "updated") totalUpdated++;
        // "skipped" actions are silently ignored

        stats.rowsRead++;
        stats.rowsInserted += action === "inserted" ? 1 : 0;
        stats.rowsUpdated += action === "updated" ? 1 : 0;
      }

      // Progress update every batch
      const processed = Math.min(i + BATCH_SIZE, allDocs.length);
      console.log(
        `  Processed ${processed.toLocaleString()}/${allDocs.length.toLocaleString()} documents` +
        ` (inserted: ${totalInserted}, updated: ${totalUpdated})`
      );
    }

    console.log(
      `\nFederal Register ingestion complete:` +
      ` Pages processed: ${totalPagesProcessed}` +
      ` Documents: ${allDocs.length.toLocaleString()}` +
      ` Inserted: ${totalInserted.toLocaleString()}, Updated: ${totalUpdated.toLocaleString()}`
    );

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: FEDERAL_REGISTER_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Ingestion failed:", message);

    await failIngestionRun({
      runId: run.id,
      sourceSystemId: FEDERAL_REGISTER_SOURCE_SYSTEM_ID,
      stats,
      errorSummary: message,
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("Federal Register ingestion completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Federal Register ingestion failed:", error);
    try {
      prisma.$disconnect();
    } catch { }
    process.exit(1);
  });