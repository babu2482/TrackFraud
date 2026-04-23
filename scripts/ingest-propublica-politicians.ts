#!/usr/bin/env -S tsx
/**
 * ProPublica Politicians Ingestor
 *
 * Fetches U.S. politician data from the ProPublica Congress API and stores it
 * in PoliticalCandidateProfile tables. The API provides comprehensive data on
 * current and former members of Congress including biographical information,
 * contact details, and social media links.
 *
 * API Reference: https://www.propublica.org/api/congress-api/
 * Rate Limit: 100 requests per minute (no key required for basic access)
 *
 * Usage:
 *   export PROPUBLICA_API_KEY="your-api-key"
 *   npx tsx scripts/ingest-propublica-politicians.ts
 *   npx tsx scripts/ingest-propublica-politicians.ts --chamber house
 *   npx tsx scripts/ingest-propublica-politicians.ts --class 1,2,senator
 */

import { prisma } from "../lib/db";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
} from "../lib/ingestion-utils";

const PROPUBLICA_API_KEY = process.env.PROPUBLICA_API_KEY || "";
const PROPUBLICA_SOURCE_SYSTEM_ID = "propublica_politicians";
const API_BASE_URL = "https://api.propublica.org/congress/v1";
const RATE_LIMIT_DELAY_MS = 650; // ~92 requests/minute to stay under limit

interface ParsedArgs {
  chamber?: "house" | "senate";
  class?: string[];
  currentOnly: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    currentOnly: true,
    class: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--chamber") {
      const val = argv[++i]?.toLowerCase();
      if (val === "house" || val === "senate") parsed.chamber = val;
    } else if (arg === "--class") {
      parsed.class = (argv[++i] ?? "").split(",").map((c) => c.trim());
    } else if (arg === "--all-time") {
      parsed.currentOnly = false;
    }
  }
  return parsed;
}

// ProPublica API response types
interface ProPublicaMember {
  attributes: {
    bioguide_id: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    party: "Democrat" | "Republican" | "Independent" | string;
    state: string;
    gender?: string;
    birth_date?: string;
    death_date?: string;
    first_elected?: string;
    next_election?: string;
    contact_form?: string;
    office?: string;
    phone?: string;
    fax?: string;
    website?: string;
    twitter_id?: string;
    facebook_id?: string;
    youtube_id?: string;
    instagram_id?: string;
    wikipedia_url?: string;
    google_entity_id?: string;
  };
}

interface ProPublicaResponse {
  results: {
    members: ProPublicaMember[];
  };
  current_congress: number;
}

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = {
        "User-Agent": "TrackFraud/1.0",
      };

      if (PROPUBLICA_API_KEY) {
        headers["X-Api-Key"] = PROPUBLICA_API_KEY;
      }

      const response = await fetch(url, { ...options, headers });

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

async function fetchCurrentMembers(
  chamber: "house" | "senate",
  stats: ReturnType<typeof createEmptyStats>
): Promise<ProPublicaMember[]> {
  const url = `${API_BASE_URL}/current/members/${chamber}.json`;
  console.log(`Fetching current ${chamber} members...`);

  const response = await fetchWithRetry<ProPublicaResponse>(url);
  stats.rowsRead += (response.results?.members?.length ?? 0);

  return response.results?.members || [];
}

async function fetchMembersByClass(
  congressNumber: number,
  classNums: string[],
  stats: ReturnType<typeof createEmptyStats>
): Promise<ProPublicaMember[]> {
  const members: ProPublicaMember[] = [];

  for (const cls of classNums) {
    const url = `${API_BASE_URL}/${congressNumber}/members/class_${cls}.json`;
    console.log(`Fetching class ${cls} members (${congressNumber}th Congress)...`);

    try {
      const response = await fetchWithRetry<ProPublicaResponse>(url);
      const chamberMembers = response.results?.members || [];
      members.push(...chamberMembers);
      stats.rowsRead += chamberMembers.length;
    } catch (error) {
      console.error(`  Failed to fetch class ${cls}:`, error);
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
  }

  return members;
}

function mapProPublicaMember(
  member: ProPublicaMember
): { candidate: any; sourceUpdatedAt: Date } {
  const attrs = member.attributes;
  const birthDate = attrs.birth_date ? new Date(attrs.birth_date) : undefined;
  const deathDate = attrs.death_date ? new Date(attrs.death_date) : undefined;

  return {
    candidate: {
      bioguideId: attrs.bioguide_id,
      firstName: attrs.first_name || null,
      lastName: attrs.last_name,
      middleName: attrs.middle_name || null,
      fullName: `${attrs.first_name || ""} ${attrs.last_name}`.trim(),
      party: attrs.party || "Unknown",
      state: attrs.state || "",
      office: attrs.office || null,
      gender: attrs.gender || null,
      birthDate: birthDate,
      deathDate: deathDate,
      firstElected: attrs.first_elected ? parseInt(attrs.first_elected) : null,
      contactFormUrl: attrs.contact_form || null,
      phone: attrs.phone || null,
      profileUrl: attrs.website || null,
      twitterId: attrs.twitter_id || null,
      facebookId: attrs.facebook_id || null,
      wikipediaUrl: attrs.wikipedia_url || null,
      googleEntityId: attrs.google_entity_id || null,
    },
    sourceUpdatedAt: new Date(),
  };
}

async function upsertCandidate(
  candidate: any,
  sourceSystemId: string
): Promise<"inserted" | "updated"> {
  // Check if record exists first to determine insert vs update
  const existing = await prisma.politicalCandidateProfile.findUnique({
    where: { bioguideId: candidate.bioguideId },
  });

  await prisma.politicalCandidateProfile.upsert({
    where: { bioguideId: candidate.bioguideId },
    update: candidate,
    create: {
      ...candidate,
      sourceSystemId,
    },
  });

  return existing ? "updated" : "inserted";
}

async function main(): Promise<void> {
  console.log("=== ProPublica Politicians Ingestion ===");

  if (!PROPUBLICA_API_KEY) {
    console.warn(
      "⚠️  PROPUBLICA_API_KEY not set. Using unauthenticated access (may have lower rate limits)."
    );
  }

  const args = parseArgs(process.argv.slice(2));

  // Get or create source system FIRST (before starting ingestion run)
  await prisma.sourceSystem.upsert({
    where: { id: PROPUBLICA_SOURCE_SYSTEM_ID },
    update: {},
    create: {
      id: PROPUBLICA_SOURCE_SYSTEM_ID,
      categoryId: "political",
      name: "ProPublica Congress API",
      slug: "propublica-politicians",
      description: "U.S. politicians data from ProPublica",
      ingestionMode: "api",
      refreshCadence: "weekly",
    },
  });

  console.log(`Source system ready: ${PROPUBLICA_SOURCE_SYSTEM_ID}`);

  // Now start the ingestion run (source system must exist first)
  const { run } = await startIngestionRun({
    sourceSystemId: PROPUBLICA_SOURCE_SYSTEM_ID,
  });

  const stats = createEmptyStats();
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    if (args.chamber) {
      // Fetch specific chamber
      const members = await fetchCurrentMembers(args.chamber, stats);
      console.log(`Found ${members.length} ${args.chamber} members`);

      for (const member of members) {
        const { candidate } = mapProPublicaMember(member);
        const action = await upsertCandidate(candidate, PROPUBLICA_SOURCE_SYSTEM_ID);

        if (action === "inserted") totalInserted++;
        else totalUpdated++;

        stats.rowsInserted += action === "inserted" ? 1 : 0;
        stats.rowsUpdated += action === "updated" ? 1 : 0;

        // Rate limiting
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
      }
    } else if (args.class && args.class.length > 0) {
      // Fetch by class number (senators only: 1, 2, or 3)
      const congressNum = args.currentOnly ? 119 : 118; // Current is 119th Congress
      const members = await fetchMembersByClass(congressNum, args.class, stats);
      console.log(`Found ${members.length} class ${args.class.join(", ")} senators`);

      for (const member of members) {
        const { candidate } = mapProPublicaMember(member);
        const action = await upsertCandidate(candidate, PROPUBLICA_SOURCE_SYSTEM_ID);

        if (action === "inserted") totalInserted++;
        else totalUpdated++;

        stats.rowsInserted += action === "inserted" ? 1 : 0;
        stats.rowsUpdated += action === "updated" ? 1 : 0;

        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
      }
    } else {
      // Default: fetch all current members (House + Senate)
      console.log("Fetching all current Congress members...");

      for (const chamber of ["house", "senate"] as const) {
        const members = await fetchCurrentMembers(chamber, stats);
        console.log(`Processing ${members.length} ${chamber} members...`);

        for (const member of members) {
          const { candidate } = mapProPublicaMember(member);
          const action = await upsertCandidate(candidate, PROPUBLICA_SOURCE_SYSTEM_ID);

          if (action === "inserted") totalInserted++;
          else totalUpdated++;

          stats.rowsInserted += action === "inserted" ? 1 : 0;
          stats.rowsUpdated += action === "updated" ? 1 : 0;

          await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
        }
      }
    }

    console.log(
      `\nProPublica ingestion complete:` +
      ` ${totalInserted.toLocaleString()} inserted,` +
      ` ${totalUpdated.toLocaleString()} updated`
    );

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: PROPUBLICA_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Ingestion failed:", message);

    await failIngestionRun({
      runId: run.id,
      sourceSystemId: PROPUBLICA_SOURCE_SYSTEM_ID,
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
    console.log("ProPublica politicians ingestion completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("ProPublica politicians ingestion failed:", error);
    try {
      prisma.$disconnect();
    } catch { }
    process.exit(1);
  });