import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { randomUUID } from "crypto";

interface Job {
  id: string;
  slug: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  output: string[];
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  rowsInserted: number;
  rowsUpdated: number;
  rowsFailed: number;
}

// In-memory job store (in production, use Redis or database)
const jobs: Map<string, Job> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "Slug is required" },
        { status: 400 }
      );
    }

    // Find the corresponding script
    const scriptMap: Record<string, string> = {
      "irs-eo-bmf": "ingest-irs-eo-bmf.ts",
      "sec-edgar": "ingest-sec-bulk.ts",
      "cms-open-payments": "ingest-cms-open-payments.ts",
      "fec-api": "ingest-fec-summaries.ts",
      "usaspending": "ingest-usaspending-bulk.ts",
      "congress-gov-api": "ingest-congress-api.ts",
      "fda-warning-letters": "ingest-fda-warning-letters.ts",
      "ftc-data-breach": "ingest-ftc-data-breach.ts",
      "federal-register-api": "ingest-federal-register.ts",
      "sam-exclusions-list": "ingest-sam-exclusions.ts",
      "hhs-oig-exclusions": "ingest-hhs-oig-exclusions.ts",
      "epa-enforcement": "ingest-epa-enforcement.ts",
      "ofac-sanctions": "ingest-ofac-sanctions.ts",
      "ofac-sdn": "ingest-ofac-sanctions.ts",
      "cisa-alerts": "ingest-cisa-alerts.ts",
      "cabinet-members": "ingest-cabinet-members.ts",
      "cms-program-safeguard": "ingest-cms-program-safeguard.ts",
      "cfpb-complaints": "ingest-cfpb-complaints.ts",
      "irs-990-xml": "ingest-irs-990-xml.ts",
      "irs-990n": "ingest-irs-990n.ts",
      "irs-auto-revocation": "ingest-irs-auto-revocation.ts",
      "irs-pub78": "ingest-irs-pub78.ts",
      "propublica-politicians": "ingest-propublica-politicians.ts",
      "propublica-committees": "ingest-propublica-politicians.ts",
    };

    const script = scriptMap[slug];
    if (!script) {
      return NextResponse.json(
        { error: `No ingestion script found for slug: ${slug}` },
        { status: 404 }
      );
    }

    // Create job record
    const jobId = randomUUID();
    const job: Job = {
      id: jobId,
      slug,
      status: "pending",
      progress: 0,
      output: [],
      error: null,
      startedAt: new Date(),
      completedAt: null,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsFailed: 0,
    };
    jobs.set(jobId, job);

    // Start the ingestion process
    const process = spawn("npx", ["tsx", `scripts/${script}`], {
      cwd: "/Volumes/MacBackup/TrackFraudProject",
      stdio: ["pipe", "pipe", "pipe"],
    });

    process.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      job.output.push(output);
      
      // Parse progress from output
      const progressMatch = output.match(/(\d+)%/);
      if (progressMatch) {
        job.progress = parseInt(progressMatch[1], 10);
      }

      // Parse record counts
      const insertedMatch = output.match(/inserted\s+(\d+)/i);
      if (insertedMatch) {
        job.rowsInserted = parseInt(insertedMatch[1], 10);
      }
      const updatedMatch = output.match(/updated\s+(\d+)/i);
      if (updatedMatch) {
        job.rowsUpdated = parseInt(updatedMatch[1], 10);
      }
      const failedMatch = output.match(/failed\s+(\d+)/i);
      if (failedMatch) {
        job.rowsFailed = parseInt(failedMatch[1], 10);
      }
    });

    process.stderr?.on("data", (data: Buffer) => {
      job.output.push(`[ERROR] ${data.toString()}`);
    });

    process.on("close", (code: number) => {
      job.completedAt = new Date();
      job.status = code === 0 ? "completed" : "failed";
      if (code !== 0) {
        job.error = `Process exited with code ${code}`;
      }
      job.progress = code === 0 ? 100 : job.progress;
    });

    process.on("error", (err: Error) => {
      job.status = "failed";
      job.error = err.message;
      job.completedAt = new Date();
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: `Started ingestion for ${slug}`,
      script: `scripts/${script}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start ingestion" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (jobId) {
      // Get specific job status
      const job = jobs.get(jobId);
      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(job);
    } else {
      // Get all active jobs
      const activeJobs = Array.from(jobs.values()).filter(
        (job) => job.status === "running" || job.status === "pending"
      );
      return NextResponse.json({ jobs: activeJobs });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get job status" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Note: We can't actually kill the process easily in this setup
    // But we can remove it from tracking
    jobs.delete(jobId);

    return NextResponse.json({ success: true, message: "Job stopped" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop job" },
      { status: 500 }
    );
  }
}