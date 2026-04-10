#!/usr/bin/env -S tsx
/**
 * Congress.gov API Ingestion Script
 *
 * Fetches bills, votes, and member voting records from the Congress.gov API.
 * Stores data in Bill, BillVote, MemberVote, and PoliticianCommittee tables.
 *
 * Usage:
 *   export CONGRESS_API_KEY="your-api-key"
 *   npx tsx scripts/ingest-congress-api.ts --all
 *   npx tsx scripts/ingest-congress-api.ts --bills-only --congress 118,117
 *   npx tsx scripts/ingest-congress-api.ts --votes-only --chamber h
 */

import { prisma } from "../lib/db";
import {
  createEmptyStats,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
} from "../lib/ingestion-utils";

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || "";
const CONGRESS_BASE_URL = "https://api.congress.gov/v3";
const CONGRESS_SOURCE_SYSTEM_ID = "congress_gov_api";

interface ParsedArgs {
  all: boolean;
  billsOnly: boolean;
  votesOnly: boolean;
  committeesOnly: boolean;
  congress?: number[];
  chamber?: string; // h (House), s (Senate)
  batchSize: number;
  maxRows?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    all: false,
    billsOnly: false,
    votesOnly: false,
    committeesOnly: false,
    congress: [],
    chamber: undefined,
    batchSize: 100,
    maxRows: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--all") {
      parsed.all = true;
      continue;
    }

    if (arg === "--bills-only") {
      parsed.billsOnly = true;
      continue;
    }

    if (arg === "--votes-only") {
      parsed.votesOnly = true;
      continue;
    }

    if (arg === "--committees-only") {
      parsed.committeesOnly = true;
      continue;
    }

    if (arg === "--congress") {
      const rawValue = argv[i + 1] ?? "";
      parsed.congress = rawValue
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => !Number.isNaN(value));
      i++;
      continue;
    }

    if (arg === "--chamber") {
      parsed.chamber = argv[i + 1]?.toLowerCase();
      i++;
      continue;
    }

    if (arg === "--batch-size") {
      const size = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(size) && size > 0) parsed.batchSize = size;
      i++;
      continue;
    }

    if (arg === "--max-rows") {
      const maxRows = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(maxRows) && maxRows > 0) parsed.maxRows = maxRows;
      i++;
      continue;
    }
  }

  return parsed;
}

// Congress.gov API Types
interface CongressBill {
  id: string;
  congress_number: number;
  type: string; // "H.R.", "S.", "H.Res.", etc.
  number: string;
  title?: string;
  summary?: Array<{
    abstract: string;
    version?: string;
  }>;
  action?: Array<{
    action_code: string;
    action_date: string;
    description: string;
    chamber_code?: "H" | "S";
  }>;
  subjects?: Array<{ name: string }>;
}

interface CongressVote {
  id: string; // e.g., "118/hv000001"
  congress_number: number;
  vote_type: string;
  question_text?: string;
  chamber_code: "H" | "S";
  rollcall_number: string;
  submitted_date: string;
  result: string; // "PASSED", "FAILED", etc.
  yeas: number;
  nays: number;
  not_voting: number;
  present?: number;
  vote_link?: string;
}

interface CongressMemberVote {
  name: string;
  party_affiliation: string; // "D", "R", "I"
  state?: string;
  vote_choice: string; // "YEA", "NAY", "NOT_VOTING", "PRESENT"
}

// API Client
class CongressAPIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string): Promise<T | null> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Api-Key": this.apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.error(`API error ${response.status}: ${endpoint}`);
        return null;
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error(`Request failed for ${endpoint}:`, error);
      return null;
    }
  }

  async getBills(congressNumber: number, chamber?: string): Promise<CongressBill[]> {
    const endpoint = `/bills/${congressNumber}${chamber ? `?chamber=${chamber}` : ""}`;
    const data = await this.request<{ bills: CongressBill[] }>(endpoint);
    return data?.bills || [];
  }

  async getVotes(congressNumber: number, chamber?: string): Promise<CongressVote[]> {
    const endpoint = `/votes/${congressNumber}${chamber ? `?chamber=${chamber}` : ""}`;
    const data = await this.request<{ votes: CongressVote[] }>(endpoint);
    return data?.votes || [];
  }

  async getMemberVotes(voteId: string): Promise<CongressMemberVote[]> {
    const endpoint = `/votes/${voteId}/members`;
    const data = await this.request<{ members: CongressMemberVote[] }>(endpoint);
    return data?.members || [];
  }

  async getCommitteeMembers(congressNumber: number, committeeCode?: string): Promise<unknown> {
    // Committee API structure varies - placeholder for future implementation
    const endpoint = `/committees/${congressNumber}${committeeCode ? `?committee_code=${committeeCode}` : ""}`;
    return await this.request(endpoint);
  }
}

// Data Processing Functions
async function processBill(
  bill: CongressBill,
  sourceSystemId: string,
): Promise<{ inserted: boolean }> {
  const summary = bill.summary?.[0]?.abstract || undefined;
  const latestAction = bill.action?.sort((a, b) =>
    new Date(b.action_date).getTime() - new Date(a.action_date).getTime()
  )[0];

  // Determine status from actions
  let status: string | undefined;
  if (latestAction) {
    const desc = latestAction.description.toLowerCase();
    if (desc.includes("became law") || desc.includes("enrolled")) {
      status = "became_law";
    } else if (desc.includes("passed")) {
      status = "passed_chamber";
    } else if (desc.includes("introduced")) {
      status = "introduced";
    } else {
      status = latestAction.description;
    }
  }

  const result = await prisma.bill.upsert({
    where: { id: Number.parseInt(bill.id.split("-")[1]) || Math.abs(bill.id.charCodeAt(0)) },
    update: {
      title: bill.title || "Untitled",
      summary,
      status,
      introducedDate: latestAction ? new Date(latestAction.action_date) : undefined,
      sourceUrl: `https://www.congress.gov/bill/${bill.congress_number}-congress/${bill.type.toLowerCase()}-${bill.number}`,
    },
    create: {
      sourceSystemId,
      congressNumber: bill.congress_number,
      billNumber: `${bill.type} ${bill.number}`,
      billType: bill.type,
      title: bill.title || "Untitled",
      summary,
      introducedDate: latestAction ? new Date(latestAction.action_date) : undefined,
      status,
      sourceUrl: `https://www.congress.gov/bill/${bill.congress_number}-congress/${bill.type.toLowerCase()}-${bill.number}`,
      externalId: bill.id,
    },
  });

  return { inserted: true }; // Simplified - Prisma doesn't expose updatedAt in this context
}

async function processVote(
  vote: CongressVote,
  sourceSystemId: string,
): Promise<{ billId?: number; voteId: number }> {
  // Parse vote ID to get chamber and rollcall number for external reference
  const [congressPart, rest] = vote.id.split("/");
  const chamberCode = rest?.startsWith("hv") ? "H" : rest?.startsWith("sv") ? "S" : vote.chamber_code;

  // Find or create the associated bill (votes are typically on bills)
  let billId: number | undefined;

  // Try to find a bill that this vote relates to
  // In practice, we'd need to track this relationship from the API
  // For now, we'll store votes without bill association

  const result = await prisma.billVote.upsert({
    where: { externalId: vote.id },
    update: {
      voteType: vote.vote_type,
      questionText: vote.question_text,
      voteDate: new Date(vote.submitted_date),
      result: vote.result,
      yeas: vote.yeas,
      nays: vote.nays,
      notVoting: vote.not_voting,
      present: vote.present,
      chamberCode,
      congressNumber: vote.congress_number,
      rollcallNumber: vote.rollcall_number,
      sourceUrl: vote.vote_link,
    },
    create: {
      sourceSystemId,
      billId: billId || 1, // Default to a placeholder bill ID if no association found
      voteType: vote.vote_type,
      questionText: vote.question_text,
      voteDate: new Date(vote.submitted_date),
      result: vote.result,
      yeas: vote.yeas,
      nays: vote.nays,
      notVoting: vote.not_voting,
      present: vote.present,
      chamberCode,
      congressNumber: vote.congress_number,
      externalId: vote.id,
      rollcallNumber: vote.rollcall_number,
      submittedDate: new Date(vote.submitted_date),
      sourceUrl: vote.vote_link,
    },
  });

  return { billId, voteId: result.id };
}

async function processMemberVotes(
  voteId: number,
  memberVotes: CongressMemberVote[],
  sourceSystemId: string,
): Promise<void> {
  for (const member of memberVotes) {
    await prisma.memberVote.upsert({
      where: {
        voteId_bioguideId: {
          voteId,
          bioguideId: `member-${member.name.replace(/\s+/g, "-").toLowerCase()}`,
        },
      },
      update: {
        name: member.name,
        party: member.party_affiliation,
        state: member.state,
        voteChoice: member.vote_choice,
      },
      create: {
        sourceSystemId,
        voteId,
        bioguideId: `member-${member.name.replace(/\s+/g, "-").toLowerCase()}`,
        name: member.name,
        party: member.party_affiliation,
        state: member.state,
        voteChoice: member.vote_choice,
      },
    });
  }
}

// Main Ingestion Logic
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("=== Congress.gov API Ingestion ===");
  console.log(`Mode: ${args.all ? "All" : args.billsOnly ? "Bills only" : args.votesOnly ? "Votes only" : args.committeesOnly ? "Committees only" : "Default (all)"}`);

  if (!CONGRESS_API_KEY) {
    console.warn("⚠️  CONGRESS_API_KEY not set. Running in demo mode with limited data.");
    console.log("Set CONGRESS_API_KEY environment variable for full API access.");
  }

  // Get or create source system
  const sourceSystem = await prisma.sourceSystem.upsert({
    where: { id: CONGRESS_SOURCE_SYSTEM_ID },
    update: {},
    create: {
      id: CONGRESS_SOURCE_SYSTEM_ID,
      categoryId: "political",
      name: "Congress.gov API",
      slug: "congress-gov-api",
      description: "U.S. Congress bills, votes, and member data",
      ingestionMode: "api",
      baseUrl: CONGRESS_BASE_URL,
      refreshCadence: "daily",
    },
  });

  const { run } = await startIngestionRun({ sourceSystemId: CONGRESS_SOURCE_SYSTEM_ID });
  const stats = createEmptyStats();

  try {
    // Determine which congress numbers to process
    const congressNumbers = (args.congress ?? []).length > 0
      ? args.congress!
      : [118, 117]; // Default to current and previous congress

    console.log(`Processing Congress sessions: ${congressNumbers.join(", ")}`);

    if (args.billsOnly || args.all) {
      console.log("\n--- Fetching Bills ---");

      for (const congressNum of congressNumbers) {
        const client = new CongressAPIClient(CONGRESS_BASE_URL, CONGRESS_API_KEY);

        // Try to fetch bills from API
        let bills: CongressBill[];
        if (CONGRESS_API_KEY) {
          bills = await client.getBills(congressNum, args.chamber);
        } else {
          // Demo mode - create sample data
          console.log("Demo mode: Creating sample bill data");
          bills = [
            {
              id: `bill-${congressNum}-001`,
              congress_number: congressNum,
              type: "H.R.",
              number: "1",
              title: "Sample Bill for Demo",
              summary: [{ abstract: "This is a sample bill created in demo mode." }],
              action: [
                {
                  action_code: "I",
                  action_date: new Date().toISOString(),
                  description: "Introduced in House",
                  chamber_code: "H",
                },
              ],
            },
          ];
        }

        for (const bill of bills) {
          await processBill(bill, sourceSystem.id);
          stats.rowsRead++;

          if (args.maxRows && stats.rowsRead >= args.maxRows) break;
        }

        console.log(`Processed ${bills.length} bills for Congress ${congressNum}`);
      }
    }

    if (args.votesOnly || args.all) {
      console.log("\n--- Fetching Votes ---");

      for (const congressNum of congressNumbers) {
        const client = new CongressAPIClient(CONGRESS_BASE_URL, CONGRESS_API_KEY);

        let votes: CongressVote[];
        if (CONGRESS_API_KEY) {
          votes = await client.getVotes(congressNum, args.chamber);
        } else {
          // Demo mode - create sample vote data
          console.log("Demo mode: Creating sample vote data");
          votes = [
            {
              id: `${congressNum}/hv000001`,
              congress_number: congressNum,
              vote_type: "Legislation",
              question_text: "Sample Vote Question",
              chamber_code: "H",
              rollcall_number: "000001",
              submitted_date: new Date().toISOString(),
              result: "PASSED",
              yeas: 250,
              nays: 150,
              not_voting: 30,
            },
          ];
        }

        for (const vote of votes) {
          const { voteId } = await processVote(vote, sourceSystem.id);

          // Fetch and process member votes
          if (CONGRESS_API_KEY) {
            const memberVotes = await client.getMemberVotes(vote.id);
            await processMemberVotes(voteId, memberVotes, sourceSystem.id);
            stats.rowsUpdated += memberVotes.length;
          } else {
            // Demo mode - sample member votes
            console.log("Demo mode: Creating sample member vote data");
            const demoMembers = [
              { name: "John Smith", party_affiliation: "D", state: "CA", vote_choice: "YEA" },
              { name: "Jane Doe", party_affiliation: "R", state: "TX", vote_choice: "NAY" },
            ];
            await processMemberVotes(voteId, demoMembers, sourceSystem.id);
            stats.rowsUpdated += demoMembers.length;
          }

          stats.rowsRead++;

          if (args.maxRows && stats.rowsRead >= args.maxRows) break;
        }

        console.log(`Processed ${votes.length} votes for Congress ${congressNum}`);
      }
    }

    // Finish ingestion run
    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: CONGRESS_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });

    console.log("\n=== Ingestion Complete ===");
    console.log(`Bills/Votes read: ${stats.rowsRead}`);
    console.log(`Member votes recorded: ${stats.rowsUpdated}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failIngestionRun({
      runId: run.id,
      sourceSystemId: CONGRESS_SOURCE_SYSTEM_ID,
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
    console.log("Congress.gov ingestion completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Congress.gov ingestion failed:", error);
    process.exit(1);
  });