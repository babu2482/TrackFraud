import fs from "node:fs";
import { parse } from "csv-parse";
import { strFromU8, unzipSync } from "fflate";
import type { FECCandidate, FECCommittee, FECTotals } from "../lib/fec";
import { prisma } from "../lib/db";
import {
  createEmptyStats,
  downloadVersionedFile,
  failIngestionRun,
  finishIngestionRun,
  startIngestionRun,
  upsertRawArtifact,
} from "../lib/ingestion-utils";
import {
  FEC_SOURCE_SYSTEM_ID,
  persistPoliticalCandidateBatch,
  persistPoliticalCommitteeBatch,
  persistPoliticalTotalsBatch,
} from "../lib/political-storage";

interface ParsedArgs {
  cycles: number[];
  batchSize: number;
  downloadDir: string;
  forceDownload: boolean;
  maxRows?: number;
}

const FEC_BROWSE_DATA_URL = "https://www.fec.gov/data/browse-data/";
const OFFICE_FULL_MAP: Record<string, string> = {
  H: "House",
  P: "President",
  S: "Senate",
};
const INCUMBENT_CHALLENGE_MAP: Record<string, string> = {
  C: "Challenger",
  I: "Incumbent",
  O: "Open seat",
};
const CANDIDATE_STATUS_MAP: Record<string, string> = {
  C: "Statutory candidate",
  F: "Future-election statutory candidate",
  N: "Not yet a statutory candidate",
  P: "Prior-cycle statutory candidate",
};
const COMMITTEE_DESIGNATION_MAP: Record<string, string> = {
  A: "Authorized by a candidate",
  B: "Lobbyist or registrant PAC",
  D: "Leadership PAC",
  J: "Joint fundraiser",
  P: "Principal campaign committee",
  U: "Unauthorized",
};
const ORGANIZATION_TYPE_MAP: Record<string, string> = {
  C: "Corporation",
  L: "Labor organization",
  M: "Membership organization",
  T: "Trade association",
  V: "Cooperative",
  W: "Corporation without capital stock",
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    cycles: [2026],
    batchSize: 2_000,
    downloadDir: "data/political/fec",
    forceDownload: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cycles") {
      const values = (argv[++i] ?? "")
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value >= 1980);
      if (values.length > 0) parsed.cycles = values;
      continue;
    }
    if (arg === "--batch-size") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.batchSize = value;
      continue;
    }
    if (arg === "--download-dir") {
      parsed.downloadDir = argv[++i] ?? parsed.downloadDir;
      continue;
    }
    if (arg === "--max-rows") {
      const value = Number.parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(value) && value > 0) parsed.maxRows = value;
      continue;
    }
    if (arg === "--force-download") {
      parsed.forceDownload = true;
    }
  }

  return parsed;
}

function cycleSuffix(cycle: number): string {
  return String(cycle).slice(-2);
}

function candidateMasterUrl(cycle: number): string {
  return `https://www.fec.gov/files/bulk-downloads/${cycle}/cn${cycleSuffix(cycle)}.zip`;
}

function committeeMasterUrl(cycle: number): string {
  return `https://www.fec.gov/files/bulk-downloads/${cycle}/cm${cycleSuffix(cycle)}.zip`;
}

function candidateSummaryUrl(cycle: number): string {
  return `https://www.fec.gov/files/bulk-downloads/${cycle}/candidate_summary_${cycle}.csv`;
}

function committeeSummaryUrl(cycle: number): string {
  return `https://www.fec.gov/files/bulk-downloads/${cycle}/committee_summary_${cycle}.csv`;
}

function parseDateYear(value?: string): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("/");
  const year = Number.parseInt(parts[parts.length - 1] ?? "", 10);
  return Number.isFinite(year) ? year : undefined;
}

function parseNumber(value?: string): number | undefined {
  if (value == null) return undefined;
  const normalized = value.replace(/[$,]/g, "").trim();
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readZipText(zipPath: string): string {
  const archive = unzipSync(fs.readFileSync(zipPath));
  const [firstEntry] = Object.values(archive);
  if (!firstEntry) {
    throw new Error(`FEC archive ${zipPath} was empty`);
  }
  return strFromU8(firstEntry);
}

function* iterateDelimitedLines(text: string): Generator<string[]> {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    yield line.split("|");
  }
}

function parseCandidateMasterRow(fields: string[]): FECCandidate | null {
  if (fields.length < 15 || !fields[0] || !fields[1]) return null;
  const office = fields[5]?.trim();
  const electionYear = Number.parseInt(fields[3] ?? "", 10);
  return {
    candidate_id: fields[0].trim(),
    name: fields[1].trim(),
    party_full: fields[2]?.trim() || undefined,
    party: fields[2]?.trim() || undefined,
    office_full: office ? OFFICE_FULL_MAP[office] ?? office : undefined,
    office: office || undefined,
    state: fields[4]?.trim() || undefined,
    district: fields[6]?.trim() || undefined,
    incumbent_challenge_full: fields[7]
      ? INCUMBENT_CHALLENGE_MAP[fields[7].trim()] ?? fields[7].trim()
      : undefined,
    candidate_status: fields[8]
      ? CANDIDATE_STATUS_MAP[fields[8].trim()] ?? fields[8].trim()
      : undefined,
    election_years: Number.isFinite(electionYear) ? [electionYear] : [],
    cycles: Number.isFinite(electionYear) ? [electionYear] : [],
  };
}

function parseCommitteeMasterRow(fields: string[]): FECCommittee | null {
  if (fields.length < 15 || !fields[0] || !fields[1]) return null;
  const candidateId = fields[14]?.trim();
  return {
    committee_id: fields[0].trim(),
    name: fields[1].trim(),
    committee_type_full: fields[9]?.trim() || undefined,
    committee_type: fields[9]?.trim() || undefined,
    designation_full: fields[8]
      ? COMMITTEE_DESIGNATION_MAP[fields[8].trim()] ?? fields[8].trim()
      : undefined,
    party_full: fields[10]?.trim() || undefined,
    state: fields[6]?.trim() || undefined,
    treasurer_name: fields[2]?.trim() || undefined,
    candidate_ids: candidateId ? [candidateId] : [],
    cycles: [],
    organization_type_full: fields[12]
      ? ORGANIZATION_TYPE_MAP[fields[12].trim()] ?? fields[12].trim()
      : undefined,
  };
}

function parseCandidateSummaryRow(
  record: Record<string, string>,
  fallbackCycle: number
): {
  candidateId: string;
  totals: FECTotals;
} | null {
  const candidateId = record.Cand_Id?.trim();
  const inferredCycle =
    Number.parseInt(record.Coverage_End_Date?.slice(-4) ?? "", 10) || fallbackCycle;
  const cycle = Number.isFinite(inferredCycle) ? inferredCycle : fallbackCycle;
  if (!candidateId || !Number.isFinite(cycle)) return null;
  return {
    candidateId,
    totals: {
      cycle,
      receipts: parseNumber(record.Total_Receipt),
      disbursements: parseNumber(record.Total_Disbursement),
      individual_contributions: parseNumber(record.Individual_Contribution),
      other_political_committee_contributions: parseNumber(
        record.Other_Committee_Contribution
      ),
      operating_expenditures: parseNumber(record.Operating_Expenditure),
      cash_on_hand_end_period: parseNumber(record.Cash_On_Hand_COP),
      debts_owed_by_committee: parseNumber(record.Debt_Owed_By_Committee),
      contributions: parseNumber(record.Total_Contribution),
      last_report_year: parseDateYear(record.Coverage_End_Date) ?? cycle,
    },
  };
}

function parseCommitteeSummaryRow(record: Record<string, string>): {
  committeeId: string;
  totals: FECTotals;
} | null {
  const committeeId = record.CMTE_ID?.trim();
  const cycle = Number.parseInt(record.FEC_ELECTION_YR?.trim() ?? "", 10);
  if (!committeeId || !Number.isFinite(cycle)) return null;
  return {
    committeeId,
    totals: {
      cycle,
      receipts: parseNumber(record.TTL_RECEIPTS),
      disbursements: parseNumber(record.TTL_DISB),
      individual_contributions: parseNumber(record.INDV_CONTB),
      other_political_committee_contributions: parseNumber(record.OTH_CMTE_CONTB),
      operating_expenditures: parseNumber(record.OP_EXP ?? record.TTL_OP_EXP),
      cash_on_hand_end_period: parseNumber(record.COH_COP ?? record.COH_COY),
      debts_owed_by_committee: parseNumber(record.DEBTS_OWED_BY_CMTE),
      contributions: parseNumber(record.TTL_CONTB),
      last_report_year: parseDateYear(record.CVG_END_DT) ?? cycle,
    },
  };
}

async function trackRawArtifact(params: {
  cycle: number;
  artifactType: string;
  fileName: string;
  url: string;
  downloadDir: string;
  runId: string;
  forceDownload: boolean;
  stats: ReturnType<typeof createEmptyStats>;
}) {
  const download = await downloadVersionedFile({
    url: params.url,
    downloadRoot: params.downloadDir,
    fileName: params.fileName,
    year: params.cycle,
    forceDownload: params.forceDownload,
  });
  if (download.downloaded) {
    params.stats.bytesDownloaded += download.byteSize;
  }
  await upsertRawArtifact({
    sourceSystemId: FEC_SOURCE_SYSTEM_ID,
    ingestionRunId: params.runId,
    artifactType: params.artifactType,
    originalUrl: params.url,
    parserVersion: "fec-bulk-v1",
    status: "fetched",
    download,
  });
  return download;
}

async function ingestCandidateMaster(params: {
  cycle: number;
  batchSize: number;
  maxRows?: number;
  downloadDir: string;
  forceDownload: boolean;
  runId: string;
  stats: ReturnType<typeof createEmptyStats>;
}) {
  const download = await trackRawArtifact({
    cycle: params.cycle,
    artifactType: "fec_candidate_master_zip",
    fileName: `cn${cycleSuffix(params.cycle)}.zip`,
    url: candidateMasterUrl(params.cycle),
    downloadDir: params.downloadDir,
    runId: params.runId,
    forceDownload: params.forceDownload,
    stats: params.stats,
  });

  const text = readZipText(download.localPath);
  const batch: FECCandidate[] = [];
  let processedRows = 0;
  for (const fields of iterateDelimitedLines(text)) {
    if (params.maxRows && processedRows >= params.maxRows) break;
    const parsed = parseCandidateMasterRow(fields);
    if (!parsed) {
      params.stats.rowsSkipped++;
      continue;
    }
    processedRows++;
    params.stats.rowsRead++;
    batch.push(parsed);
    if (batch.length >= params.batchSize) {
      const result = await persistPoliticalCandidateBatch(
        batch,
        download.sourcePublishedAt
      );
      params.stats.rowsInserted += result.inserted;
      params.stats.rowsUpdated += result.updated;
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    const result = await persistPoliticalCandidateBatch(batch, download.sourcePublishedAt);
    params.stats.rowsInserted += result.inserted;
    params.stats.rowsUpdated += result.updated;
  }

  await prisma.rawArtifact.update({
    where: { storageKey: download.storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "fec-bulk-v1",
      status: "parsed",
      errorSummary: null,
    },
  });
}

async function ingestCommitteeMaster(params: {
  cycle: number;
  batchSize: number;
  maxRows?: number;
  downloadDir: string;
  forceDownload: boolean;
  runId: string;
  stats: ReturnType<typeof createEmptyStats>;
}) {
  const download = await trackRawArtifact({
    cycle: params.cycle,
    artifactType: "fec_committee_master_zip",
    fileName: `cm${cycleSuffix(params.cycle)}.zip`,
    url: committeeMasterUrl(params.cycle),
    downloadDir: params.downloadDir,
    runId: params.runId,
    forceDownload: params.forceDownload,
    stats: params.stats,
  });

  const text = readZipText(download.localPath);
  const batch: FECCommittee[] = [];
  let processedRows = 0;
  for (const fields of iterateDelimitedLines(text)) {
    if (params.maxRows && processedRows >= params.maxRows) break;
    const parsed = parseCommitteeMasterRow(fields);
    if (!parsed) {
      params.stats.rowsSkipped++;
      continue;
    }
    processedRows++;
    params.stats.rowsRead++;
    batch.push(parsed);
    if (batch.length >= params.batchSize) {
      const result = await persistPoliticalCommitteeBatch(
        batch,
        download.sourcePublishedAt
      );
      params.stats.rowsInserted += result.inserted;
      params.stats.rowsUpdated += result.updated;
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    const result = await persistPoliticalCommitteeBatch(batch, download.sourcePublishedAt);
    params.stats.rowsInserted += result.inserted;
    params.stats.rowsUpdated += result.updated;
  }

  await prisma.rawArtifact.update({
    where: { storageKey: download.storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "fec-bulk-v1",
      status: "parsed",
      errorSummary: null,
    },
  });
}

async function ingestCandidateSummary(params: {
  cycle: number;
  batchSize: number;
  maxRows?: number;
  downloadDir: string;
  forceDownload: boolean;
  runId: string;
  stats: ReturnType<typeof createEmptyStats>;
}) {
  const download = await trackRawArtifact({
    cycle: params.cycle,
    artifactType: "fec_candidate_summary_csv",
    fileName: `candidate_summary_${params.cycle}.csv`,
    url: candidateSummaryUrl(params.cycle),
    downloadDir: params.downloadDir,
    runId: params.runId,
    forceDownload: params.forceDownload,
    stats: params.stats,
  });

  const parser = fs.createReadStream(download.localPath).pipe(
    parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<{
    identifierType: "fec_candidate_id";
    identifierValue: string;
    ownerType: "candidate";
    totals: FECTotals;
  }> = [];
  let processedRows = 0;

  for await (const record of parser) {
    if (params.maxRows && processedRows >= params.maxRows) break;
    const parsed = parseCandidateSummaryRow(
      record as Record<string, string>,
      params.cycle
    );
    if (!parsed) {
      params.stats.rowsSkipped++;
      continue;
    }
    processedRows++;
    params.stats.rowsRead++;
    batch.push({
      identifierType: "fec_candidate_id",
      identifierValue: parsed.candidateId,
      ownerType: "candidate",
      totals: parsed.totals,
    });
    if (batch.length >= params.batchSize) {
      const result = await persistPoliticalTotalsBatch({
        rows: batch,
        sourceUpdatedAt: download.sourcePublishedAt,
      });
      params.stats.rowsInserted += result.inserted;
      params.stats.rowsUpdated += result.updated;
      params.stats.rowsSkipped += result.skipped;
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    const result = await persistPoliticalTotalsBatch({
      rows: batch,
      sourceUpdatedAt: download.sourcePublishedAt,
    });
    params.stats.rowsInserted += result.inserted;
    params.stats.rowsUpdated += result.updated;
    params.stats.rowsSkipped += result.skipped;
  }

  await prisma.rawArtifact.update({
    where: { storageKey: download.storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "fec-bulk-v1",
      status: "parsed",
      errorSummary: null,
    },
  });
}

async function ingestCommitteeSummary(params: {
  cycle: number;
  batchSize: number;
  maxRows?: number;
  downloadDir: string;
  forceDownload: boolean;
  runId: string;
  stats: ReturnType<typeof createEmptyStats>;
}) {
  const download = await trackRawArtifact({
    cycle: params.cycle,
    artifactType: "fec_committee_summary_csv",
    fileName: `committee_summary_${params.cycle}.csv`,
    url: committeeSummaryUrl(params.cycle),
    downloadDir: params.downloadDir,
    runId: params.runId,
    forceDownload: params.forceDownload,
    stats: params.stats,
  });

  const parser = fs.createReadStream(download.localPath).pipe(
    parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<{
    identifierType: "fec_committee_id";
    identifierValue: string;
    ownerType: "committee";
    totals: FECTotals;
  }> = [];
  let processedRows = 0;

  for await (const record of parser) {
    if (params.maxRows && processedRows >= params.maxRows) break;
    const parsed = parseCommitteeSummaryRow(record as Record<string, string>);
    if (!parsed) {
      params.stats.rowsSkipped++;
      continue;
    }
    processedRows++;
    params.stats.rowsRead++;
    batch.push({
      identifierType: "fec_committee_id",
      identifierValue: parsed.committeeId,
      ownerType: "committee",
      totals: parsed.totals,
    });
    if (batch.length >= params.batchSize) {
      const result = await persistPoliticalTotalsBatch({
        rows: batch,
        sourceUpdatedAt: download.sourcePublishedAt,
      });
      params.stats.rowsInserted += result.inserted;
      params.stats.rowsUpdated += result.updated;
      params.stats.rowsSkipped += result.skipped;
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    const result = await persistPoliticalTotalsBatch({
      rows: batch,
      sourceUpdatedAt: download.sourcePublishedAt,
    });
    params.stats.rowsInserted += result.inserted;
    params.stats.rowsUpdated += result.updated;
    params.stats.rowsSkipped += result.skipped;
  }

  await prisma.rawArtifact.update({
    where: { storageKey: download.storageKey },
    data: {
      parsedAt: new Date(),
      parserVersion: "fec-bulk-v1",
      status: "parsed",
      errorSummary: null,
    },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { run } = await startIngestionRun({ sourceSystemId: FEC_SOURCE_SYSTEM_ID });
  const stats = createEmptyStats();
  stats.bytesDownloaded = 0;

  try {
    for (const cycle of args.cycles) {
      process.stdout.write(`Processing FEC bulk cycle ${cycle} from ${FEC_BROWSE_DATA_URL}\n`);
      await ingestCandidateMaster({
        cycle,
        batchSize: args.batchSize,
        maxRows: args.maxRows,
        downloadDir: args.downloadDir,
        forceDownload: args.forceDownload,
        runId: run.id,
        stats,
      });
      await ingestCommitteeMaster({
        cycle,
        batchSize: args.batchSize,
        maxRows: args.maxRows,
        downloadDir: args.downloadDir,
        forceDownload: args.forceDownload,
        runId: run.id,
        stats,
      });
      await ingestCandidateSummary({
        cycle,
        batchSize: args.batchSize,
        maxRows: args.maxRows,
        downloadDir: args.downloadDir,
        forceDownload: args.forceDownload,
        runId: run.id,
        stats,
      });
      await ingestCommitteeSummary({
        cycle,
        batchSize: args.batchSize,
        maxRows: args.maxRows,
        downloadDir: args.downloadDir,
        forceDownload: args.forceDownload,
        runId: run.id,
        stats,
      });
    }

    await finishIngestionRun({
      runId: run.id,
      sourceSystemId: FEC_SOURCE_SYSTEM_ID,
      stats,
      status: "completed",
    });

    console.log(
      JSON.stringify(
        {
          runId: run.id,
          cycles: args.cycles,
          rowsRead: stats.rowsRead,
          rowsInserted: stats.rowsInserted,
          rowsUpdated: stats.rowsUpdated,
          rowsSkipped: stats.rowsSkipped,
          rowsFailed: stats.rowsFailed,
          bytesDownloaded: stats.bytesDownloaded,
          sourceInfoUrl: FEC_BROWSE_DATA_URL,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failIngestionRun({
      runId: run.id,
      sourceSystemId: FEC_SOURCE_SYSTEM_ID,
      stats,
      errorSummary: message,
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch { }
  process.exit(1);
});
