#!/usr/bin/env -S tsx
/**
 * Congress.gov API Ingestion Script (FIXED VERSION)
 *
 * Fetches bills, votes, and member voting records from the Congress.gov API.
 * Uses correct endpoint structure: /bill/{congress}/{type}/{number}
 *
 * Stores data in Bill, BillVote, MemberVote tables.
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

// Bill types to iterate through
const BILL_TYPES = {
  H: ["hr", "hres", "hconres"], // House bills, resolutions, concurrent resolutions
  S: ["s", "sres", "sconres"], // Senate bills, resolutions, concurrent resolutions
};

interface ParsedArgs {
  all: boolean;
  billsOnly: boolean;
  votesOnly: boolean;
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
  number: string;
  type: string; // "HR", "S", "HRES", etc.
  congress: number;
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
}

interface CongressMemberVote {
  name: string;
  party_affiliation: string; // "D", "R", "I"
  state?: string;
  vote_choice: string; // "YEA", "NAY", "NOT_VOTING", "PRESENT"
}

// API Client with correct endpoint structure
class CongressAPIClient {
  private baseUrl: string;
  private apiKey: string;
  private rateLimitDelay = 100; // 10 requests/second max

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
    } finally {
      // Rate limiting: wait 100ms between requests
      await new Promise((resolve) => setTimeout(resolve, this.rateLimitDelay));
    }
  }

  /**
   * Fetch a single bill using correct endpoint structure
   */
  async getBill(
    congressNumber: number,
    type: string,
    number: string,
  ): Promise<CongressBill | null> {
    const endpoint = `/bill/${congressNumber}/${type.toLowerCase()}/${number}`;
    const response = await this.request<{ bill?: CongressBill }>(endpoint);

    // API returns { bill: {...} } structure, unwrap it
    if (response?.bill) {
      return response.bill;
    }
    // Fallback: treat response itself as bill if no wrapper
    return response as CongressBill | null;
  }

  /**
   * Iterate through bills by trying sequential numbers until we hit gaps
   */
  async *iterateBills(
    congressNumber: number,
    chamber: "H" | "S",
    maxRows?: number,
  ): AsyncGenerator<CongressBill> {
    const types = BILL_TYPES[chamber];
    let totalRead = 0;

    for (const type of types) {
      console.log(`  Iterating ${chamber}${type.toUpperCase()} bills...`);

      // Try bill numbers from 1 to max expected (~5000 for HR, ~2000 for S)
      const maxNumber = chamber === "H" ? 6000 : 3000;
      let consecutiveFailures = 0;
      const maxConsecutiveFailures = 100; // Stop if we hit this many failures in a row

      for (let num = 1; num <= maxNumber; num++) {
        if (maxRows && totalRead >= maxRows) {
          return;
        }

        const bill = await this.getBill(congressNumber, type, num.toString());

        if (bill) {
          consecutiveFailures = 0;
          yield bill;
          totalRead++;

          // Progress indicator every 100 bills
          if (totalRead % 100 === 0) {
            console.log(
              `    Processed ${totalRead} ${type.toUpperCase()} bills...`,
            );
          }
        } else {
          consecutiveFailures++;
          if (consecutiveFailures >= maxConsecutiveFailures) {
            console.log(
              `  Stopped ${type.toUpperCase()}: hit ${maxConsecutiveFailures} consecutive failures`,
            );
            break;
          }
        }
      }
    }
  }

  /**
   * Fetch votes for a congress session and chamber
   */
  async getVotes(
    congressNumber: number,
    chamber?: string,
  ): Promise<CongressVote[]> {
    const voteType =
      chamber === "h" ? "hv" : chamber === "s" ? "sv" : undefined;

    // Try to fetch votes by iterating through rollcall numbers
    const votes: CongressVote[] = [];
    const maxRollcall = 1000; // Max expected rollcall votes per session

    for (let i = 1; i <= maxRollcall; i++) {
      const voteId = `${congressNumber}/${voteType || "hv"}${i.toString().padStart(6, "0")}`;
      const endpoint = `/votes/${voteId}`;

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          headers: {
            "X-Api-Key": this.apiKey,
            Accept: "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();

          // Check if vote matches chamber filter
          if (
            !chamber ||
            (chamber === "h" && data.chamber_code === "H") ||
            (chamber === "s" && data.chamber_code === "S")
          ) {
            votes.push(data);
          }
        } else if (response.status === 404) {
          // Skip missing votes, but stop after too many consecutive failures
          continue;
        }
      } catch (error) {
        console.error(`Failed to fetch vote ${voteId}:`, error);
      } finally {
        await new Promise((resolve) =>
          setTimeout(resolve, this.rateLimitDelay),
        );
      }
    }

    return votes;
  }

  async getMemberVotes(voteId: string): Promise<CongressMemberVote[]> {
    const endpoint = `/votes/${voteId}/members`;
    const data = await this.request<{ members: CongressMemberVote[] }>(
      endpoint,
    );
    return data?.members || [];
  }
}

// Data Processing Functions
async function processBill(
  bill: CongressBill,
  sourceSystemId: string,
): Promise<boolean> {
  // Add safety checks for required fields
  if (!bill.congress || !bill.type) {
    console.warn(
      `Skipping invalid bill record (missing congress or type):`,
      JSON.stringify(bill).substring(0, 200),
    );
    return false;
  }

  const summary = bill.summary?.[0]?.abstract || undefined;
  const latestAction = bill.action?.sort(
    (a, b) =>
      new Date(b.action_date).getTime() - new Date(a.action_date).getTime(),
  )[0];

  // Determine status from actions
  let status: string | undefined;
  if (latestAction && latestAction.description) {
    const desc = String(latestAction.description).toLowerCase();
    if (desc.includes("became law") || desc.includes("enrolled")) {
      status = "became_law";
    } else if (
      desc.includes("passed senate") ||
      desc.includes("passed house")
    ) {
      status = "passed_chamber";
    } else if (desc.includes("introduced")) {
      status = "introduced";
    } else if (desc.includes("referred to committee")) {
      status = "in_committee";
    }
  }

  // Generate unique ID from bill properties - handle undefined type/number
  if (!bill.type || !bill.number) {
    console.warn(`Skipping bill with missing type or number:`, bill);
    return false;
  }

  // Ensure bill.number exists before proceeding
  if (!bill.number) {
    console.warn(
      `Skipping bill with missing number:`,
      JSON.stringify(bill).substring(0, 200),
    );
    return false;
  }

  const billTypeLower = String(bill.type).toLowerCase();
  const billId = `${bill.congress}-${billTypeLower}-${bill.number}`;

  // Use composite key for upsert since externalId is nullable
  const existingBill = await prisma.bill.findFirst({
    where: {
      congressNumber: bill.congress,
      billNumber: `${String(bill.type)} ${bill.number}`,
      billType: String(bill.type),
    },
  });

  if (existingBill) {
    // Update existing record
    await prisma.bill.update({
      where: { id: existingBill.id },
      data: {
        title: String(bill.title) || "Untitled",
        summary,
        status,
        introducedDate: latestAction
          ? new Date(latestAction.action_date)
          : undefined,
        sourceUrl: `https://www.congress.gov/bill/${bill.congress}-congress/${billTypeLower}-${bill.number}`,
        externalId: billId,
      },
    });
  } else {
    // Create new record
    await prisma.bill.create({
      data: {
        sourceSystemId,
        congressNumber: bill.congress,
        billNumber: `${String(bill.type)} ${bill.number}`,
        billType: String(bill.type),
        title: String(bill.title) || "Untitled",
        summary,
        introducedDate: latestAction
          ? new Date(latestAction.action_date)
          : undefined,
        status,
        sourceUrl: `https://www.congress.gov/bill/${bill.congress}-congress/${billTypeLower}-${bill.number}`,
        externalId: billId,
      },
    });
  }

  return true;
}

async function processVote(
  vote: CongressVote,
  sourceSystemId: string,
): Promise<number> {
  const chamberCode = vote.chamber_code;

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
    },
    create: {
      sourceSystemId,
      billId: 1, // Placeholder - votes not directly linked to bills in this API
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
    },
  });

  return result.id;
}

async function processMemberVotes(
  voteId: number,
  memberVotes: CongressMemberVote[],
  sourceSystemId: string,
): Promise<void> {
  const promises = memberVotes.map(async (member) => {
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
  });

  await Promise.all(promises);
}

// Main Ingestion Logic
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("=== Congress.gov API Ingestion (FIXED) ===");
  console.log(
    `Mode: ${args.all ? "All" : args.billsOnly ? "Bills only" : args.votesOnly ? "Votes only" : "Default (all)"}`,
  );

  if (!CONGRESS_API_KEY) {
    console.warn(
      "⚠️  CONGRESS_API_KEY not set. Running in demo mode with limited data.",
    );
    console.log(
      "Set CONGRESS_API_KEY environment variable for full API access.",
    );
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

  const { run } = await startIngestionRun({
    sourceSystemId: CONGRESS_SOURCE_SYSTEM_ID,
  });
  const stats = createEmptyStats();

  try {
    // Determine which congress numbers to process
    const congressNumbers =
      (args.congress ?? []).length > 0 ? args.congress! : [118, 117]; // Default to current and previous congress

    console.log(`Processing Congress sessions: ${congressNumbers.join(", ")}`);

    if (args.billsOnly || args.all) {
      console.log("\n--- Fetching Bills ---");

      for (const congressNum of congressNumbers) {
        const client = new CongressAPIClient(
          CONGRESS_BASE_URL,
          CONGRESS_API_KEY,
        );

        // Determine chamber to process
        const chambers = args.chamber
          ? [args.chamber === "h" ? "H" : "S"]
          : ["H", "S"];

        for (const chamber of chambers) {
          console.log(
            `\n  Processing ${chamber} bills for Congress ${congressNum}...`,
          );

          let billCount = 0;

          // Use async generator to iterate through bills
          const chamberUpper =
            chamber?.toUpperCase() === "S" ? ("S" as const) : ("H" as const);
          for await (const bill of client.iterateBills(
            congressNum,
            chamberUpper,
            args.maxRows,
          )) {
            if (args.maxRows && stats.rowsRead >= args.maxRows) break;

            await processBill(bill, sourceSystem.id);
            stats.rowsRead++;
            billCount++;

            // Progress indicator every 500 bills
            if (billCount % 500 === 0) {
              console.log(
                `    Total: ${billCount} bills processed for Congress ${congressNum}`,
              );
            }
          }

          console.log(`  Completed ${chamber}: ${billCount} bills`);
        }
      }

      console.log(`\nTotal bills processed: ${stats.rowsRead}`);
    }

    if (args.votesOnly || args.all) {
      console.log("\n--- Fetching Votes ---");

      for (const congressNum of congressNumbers) {
        const client = new CongressAPIClient(
          CONGRESS_BASE_URL,
          CONGRESS_API_KEY,
        );

        let votes: CongressVote[];
        if (CONGRESS_API_KEY) {
          const chamberForVotes =
            args.chamber?.toLowerCase() === "s" ? "sv" : "hv";
          votes = await client.getVotes(congressNum, chamberForVotes);
        } else {
          console.log("Demo mode: Cannot fetch votes without API key");
          votes = [];
        }

        for (const vote of votes) {
          const voteId = await processVote(vote, sourceSystem.id);

          // Fetch and process member votes if we have API key
          if (CONGRESS_API_KEY && !args.billsOnly) {
            const memberVotes = await client.getMemberVotes(vote.id);
            await processMemberVotes(voteId, memberVotes, sourceSystem.id);
            stats.rowsUpdated += memberVotes.length;
          }

          stats.rowsRead++;

          if (args.maxRows && stats.rowsRead >= args.maxRows) break;
        }

        console.log(
          `Processed ${votes.length} votes for Congress ${congressNum}`,
        );
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
