/**
 * Bulk SEC EDGAR Local Data Ingestion Script
 *
 * Uses raw SQL bulk operations for maximum performance.
 * Reads from data/corporate/sec/submissions/ and data/corporate/sec/companyfacts/
 *
 * Usage:
 *   npx tsx scripts/ingest-sec-bulk.ts
 *   npx tsx scripts/ingest-sec-bulk.ts --limit 100
 *   npx tsx scripts/ingest-sec-bulk.ts --dry-run
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Pool, PoolClient } from "pg";

const SEC_SOURCE_SYSTEM_ID = "sec_edgar";
const SEC_DATA_DIR = path.join(__dirname, "../data/corporate/sec");
const SUBMISSIONS_DIR = path.join(SEC_DATA_DIR, "submissions");
const COMPANYFACTS_DIR = path.join(SEC_DATA_DIR, "companyfacts");

interface ParsedArgs {
  dryRun: boolean;
  limit: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { dryRun: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--limit") {
      const val = parseInt(argv[++i] ?? "0", 10);
      if (Number.isFinite(val) && val > 0) parsed.limit = val;
    }
  }
  return parsed;
}

function getCikFromFilename(filename: string): string {
  const match = filename.match(/^CIK(\d+)\.json$/);
  if (match) {
    return match[1].replace(/^0+/, "").padStart(10, "0");
  }
  return "";
}

function scanJsonFiles(dir: string, limit: number): string[] {
  if (!fs.existsSync(dir)) {
    console.warn(`Directory does not exist: ${dir}`);
    return [];
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("._"))
    .sort();
  return limit > 0 ? files.slice(0, limit) : files;
}

function parseJsonFile(filePath: string): any {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to parse ${filePath}: ${error}`);
    return null;
  }
}

function normalizeEntityName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

function generateId(prefix: string, value: string): string {
  return `${prefix}_${Buffer.from(value).toString("base64url").slice(0, 20)}`;
}

const PG_MAX_PARAMS = 65000; // Safety margin below PostgreSQL limit of 65535

function getParamCount(numRows: number, numCols: number): number {
  return numRows * numCols;
}

function buildBatchInsertSql(
  table: string,
  columns: string[],
  values: any[][],
  onConflict: string | null = null,
): { sql: string; params: any[] } {
  if (values.length === 0) {
    return { sql: "", params: [] };
  }
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const colCount = columns.length;
  const rows = values.map((_, i) => {
    const rowParams = columns
      .map((_, j) => `$${i * colCount + j + 1}`)
      .join(", ");
    return `(${rowParams})`;
  });
  let sql = `INSERT INTO ${table} (${colList}) VALUES ${rows.join(", ")}`;
  if (onConflict) {
    sql += ` ON CONFLICT ${onConflict} DO NOTHING`;
  }
  const params = values.flat();
  return { sql, params };
}

function splitBatches<T>(
  items: T[],
  maxParams: number,
  colsPerItem: number,
): T[][] {
  const maxItems = Math.floor(maxParams / colsPerItem);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += maxItems) {
    batches.push(items.slice(i, i + maxItems));
  }
  return batches;
}

async function ensureSourceSystem(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO "SourceSystem" (id, "categoryId", name, slug, description, "ingestionMode", "baseUrl", "refreshCadence")
     VALUES ($1, 'corporate', 'SEC EDGAR API', 'sec-edgar-api', 'U.S. Securities and Exchange Commission filings', 'api', 'https://data.sec.gov', 'daily')
     ON CONFLICT (id) DO NOTHING`,
    [SEC_SOURCE_SYSTEM_ID],
  );
}

async function main(): Promise<void> {
  console.log("=== SEC EDGAR Bulk Local Data Ingestion ===\n");
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    console.log("DRY RUN MODE - No data will be written to database\n");
  }

  // Connect to database
  const pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "trackfraud",
    user: "trackfraud",
    password: "trackfraud_dev_password",
  });

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  }

  await ensureSourceSystem(client);

  // Scan files
  const submissionFiles = scanJsonFiles(SUBMISSIONS_DIR, args.limit);
  const factsFiles = scanJsonFiles(COMPANYFACTS_DIR, args.limit);

  console.log(`Found ${submissionFiles.length} submission files`);
  console.log(`Found ${factsFiles.length} company facts files\n`);

  const stats = {
    submissionsProcessed: 0,
    submissionsFailed: 0,
    factsProcessed: 0,
    factsFailed: 0,
    entitiesCreated: 0,
    profilesUpserted: 0,
    filingsInserted: 0,
    snapshotsUpserted: 0,
  };

  // ============================================================
  // PHASE 1: Parse all submissions and collect data
  // ============================================================
  console.log("Phase 1: Parsing submissions data...");

  interface SubmissionData {
    cik: string;
    name: string;
    entityType?: string;
    sic?: string;
    sicDescription?: string;
    tickers: string[];
    exchanges: string[];
    stateOfIncorporation?: string;
    fiscalYearEnd?: string;
    filings: Array<{
      accessionNumber: string;
      filingDate?: string;
      reportDate?: string;
      form: string;
      primaryDocument?: string;
      primaryDocDescription?: string;
    }>;
  }

  const submissionMap = new Map<string, SubmissionData>();

  for (const file of submissionFiles) {
    const cik = getCikFromFilename(file);
    if (!cik) {
      stats.submissionsFailed++;
      continue;
    }

    const filePath = path.join(SUBMISSIONS_DIR, file);
    const data = parseJsonFile(filePath);
    if (!data) {
      stats.submissionsFailed++;
      continue;
    }

    const filings: SubmissionData["filings"] = [];
    if (data.filings?.recent) {
      const recent = data.filings.recent;
      const count = Math.min(recent.accessionNumber?.length || 0, 100);
      for (let i = 0; i < count; i++) {
        filings.push({
          accessionNumber: recent.accessionNumber[i],
          filingDate: recent.filingDate?.[i],
          reportDate: recent.reportDate?.[i],
          form: recent.form?.[i] || "",
          primaryDocument: recent.primaryDocument?.[i],
          primaryDocDescription: recent.primaryDocDescription?.[i],
        });
      }
    }

    submissionMap.set(cik, {
      cik,
      name: data.name || data.entityName || "Unknown",
      entityType: data.entityType,
      sic: data.sic,
      sicDescription: data.sicDescription,
      tickers: (data.tickers || []).filter((t: string) => t),
      exchanges: (data.exchanges || []).filter((e: string) => e),
      stateOfIncorporation: data.stateOfIncorporation,
      fiscalYearEnd: data.fiscalYearEnd,
      filings,
    });
    stats.submissionsProcessed++;
  }

  console.log(
    `  Parsed ${stats.submissionsProcessed} submissions, ${stats.submissionsFailed} failed\n`,
  );

  // ============================================================
  // PHASE 2: Bulk create CanonicalEntities and EntityIdentifiers
  // ============================================================
  console.log("Phase 2: Creating canonical entities and identifiers...");

  const uniqueCiks = [...new Set(submissionMap.keys())];

  // Check which entities already exist (batch the ANY query to avoid param limits)
  const existingIdentifiers = new Set<string>();
  const batchLimit = 10000;
  for (let i = 0; i < uniqueCiks.length; i += batchLimit) {
    const batch = uniqueCiks.slice(i, i + batchLimit);
    const result = await client.query(
      `SELECT "identifierValue" FROM "EntityIdentifier"
       WHERE "identifierType" = 'sec_cik'
       AND "identifierValue" = ANY($1)`,
      [batch],
    );
    for (const row of result.rows) {
      existingIdentifiers.add(row.identifierValue);
    }
  }

  const existingCiks = existingIdentifiers;

  const newCiks = uniqueCiks.filter((cik) => !existingCiks.has(cik));

  if (newCiks.length > 0) {
    // Bulk insert canonical entities (batched to avoid PG param limit)
    const entityBatches = splitBatches(
      newCiks,
      PG_MAX_PARAMS,
      8, // 8 columns per entity
    );

    for (const batch of entityBatches) {
      const entityValues: any[][] = batch.map((cik) => {
        const submission = submissionMap.get(cik)!;
        const entityId = generateId("ce", cik);
        return [
          entityId,
          "corporate",
          submission.name,
          normalizeEntityName(submission.name),
          "company",
          "active",
          "US",
          "US",
        ];
      });

      const entitySql = buildBatchInsertSql(
        '"CanonicalEntity"',
        [
          "id",
          "categoryId",
          "displayName",
          "normalizedName",
          "entityType",
          "status",
          "primaryJurisdiction",
          "countryCode",
        ],
        entityValues,
        '("id")', // Skip if already exists
      );
      if (entitySql.sql) {
        await client.query(entitySql.sql, entitySql.params);
      }
    }

    // Bulk insert entity identifiers (batched separately with 10 cols)
    const identifierBatches = splitBatches(
      newCiks,
      PG_MAX_PARAMS,
      10, // 10 columns per identifier
    );
    console.log(`  Processing ${identifierBatches.length} identifier batches for ${newCiks.length} new CIKs`);
    for (const batch of identifierBatches) {
      if (batch.length === 0) continue;
      const now = new Date().toISOString();
      const identifierValues: any[][] = batch.map((cik, i) => {
        const entityId = generateId("ce", cik);
        return [
          generateId("eid", `${cik}-${i}`),
          entityId,
          SEC_SOURCE_SYSTEM_ID,
          "sec_cik",
          cik,
          true,
          null, // confidence
          now, // observedAt
          now, // createdAt
          now, // updatedAt
        ];
      });

      const identifierSql = buildBatchInsertSql(
        '"EntityIdentifier"',
        [
          "id",
          "entityId",
          "sourceSystemId",
          "identifierType",
          "identifierValue",
          "isPrimary",
          "confidence",
          "observedAt",
          "createdAt",
          "updatedAt",
        ],
        identifierValues,
      );
      if (identifierSql.sql && identifierSql.params.length > 0) {
        await client.query(identifierSql.sql, identifierSql.params);
      }
    }

    stats.entitiesCreated = newCiks.length;
  }

  console.log(`  Created ${stats.entitiesCreated} new canonical entities\n`);

  // ============================================================
  // PHASE 3: Bulk upsert CorporateCompanyProfile
  // ============================================================
  console.log("Phase 3: Upserting company profiles...");

  // Get all entity IDs for existing CIKs
  const allProfileCiks = [...submissionMap.keys()];
  const profileIdentifiers = await client.query(
    `SELECT "identifierValue", "entityId" FROM "EntityIdentifier"
     WHERE "identifierType" = 'sec_cik'
     AND "identifierValue" = ANY($1)`,
    [allProfileCiks],
  );

  const cikToEntityId = new Map(
    profileIdentifiers.rows.map((r: any) => [r.identifierValue, r.entityId]),
  );

  // Also get existing profiles
  const existingProfiles = await client.query(
    `SELECT cik FROM "CorporateCompanyProfile"
     WHERE cik = ANY($1)`,
    [allProfileCiks],
  );
  const existingProfileCiks = new Set(
    existingProfiles.rows.map((r: any) => r.cik),
  );

  // Build profile data
  interface ProfileData {
    cik: string;
    entityId: string;
    entityType: string | null;
    sic: string | null;
    sicDescription: string | null;
    tickers: string[];
    exchanges: string[];
    stateOfIncorporation: string | null;
    fiscalYearEnd: string | null;
    isExisting: boolean;
  }

  const profileData: ProfileData[] = [];

  for (const cik of allProfileCiks) {
    const submission = submissionMap.get(cik)!;
    const entityId = cikToEntityId.get(cik);
    if (!entityId) continue;

    profileData.push({
      cik,
      entityId,
      entityType: submission.entityType || null,
      sic: submission.sic || null,
      sicDescription: submission.sicDescription || null,
      tickers: submission.tickers.length > 0 ? submission.tickers : [],
      exchanges: submission.exchanges.length > 0 ? submission.exchanges : [],
      stateOfIncorporation: submission.stateOfIncorporation || null,
      fiscalYearEnd: submission.fiscalYearEnd || null,
      isExisting: existingProfileCiks.has(cik),
    });
  }

  // Bulk insert new profiles (batched to avoid PG param limit)
  const newProfiles = profileData.filter((p) => !p.isExisting);
  if (newProfiles.length > 0) {
    const now = new Date().toISOString();
    const profileBatches = splitBatches(
      newProfiles,
      PG_MAX_PARAMS,
      13, // 13 columns per profile (including createdAt, updatedAt)
    );

    for (const batch of profileBatches) {
      const profileValues: any[][] = batch.map((p) => [
        generateId("cpp", p.cik),
        SEC_SOURCE_SYSTEM_ID,
        p.entityId,
        p.cik,
        p.entityType,
        p.sic,
        p.sicDescription,
        p.tickers, // PostgreSQL array
        p.exchanges, // PostgreSQL array
        p.stateOfIncorporation,
        p.fiscalYearEnd,
        now, // createdAt
        now, // updatedAt
      ]);

      const profileSql = buildBatchInsertSql(
        '"CorporateCompanyProfile"',
        [
          "id",
          "sourceSystemId",
          "entityId",
          "cik",
          "entityType",
          "sic",
          "sicDescription",
          "tickers",
          "exchanges",
          "stateOfIncorporation",
          "fiscalYearEnd",
          "createdAt",
          "updatedAt",
        ],
        profileValues,
        '("cik")',
      );
      await client.query(profileSql.sql, profileSql.params);
    }
    stats.profilesUpserted += newProfiles.length;
  }

  // Update existing profiles in batches (one at a time to handle arrays properly)
  const existingProfilesToUpdate = profileData.filter((p) => p.isExisting);
  if (existingProfilesToUpdate.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < existingProfilesToUpdate.length; i += batchSize) {
      const batch = existingProfilesToUpdate.slice(i, i + batchSize);

      for (const p of batch) {
        await client.query(
          `UPDATE "CorporateCompanyProfile" SET
            "entityType" = $1,
            sic = $2,
            "sicDescription" = $3,
            tickers = $4::text[],
            exchanges = $5::text[],
            "stateOfIncorporation" = $6,
            "fiscalYearEnd" = $7,
            "updatedAt" = NOW()
           WHERE cik = $8`,
          [
            p.entityType,
            p.sic,
            p.sicDescription,
            p.tickers, // pg handles arrays natively
            p.exchanges, // pg handles arrays natively
            p.stateOfIncorporation,
            p.fiscalYearEnd,
            p.cik,
          ],
        );
      }
    }
    stats.profilesUpserted += existingProfilesToUpdate.length;
  }

  console.log(`  Upserted ${stats.profilesUpserted} profiles\n`);

  // ============================================================
  // PHASE 4: Bulk insert CorporateFilingRecord
  // ============================================================
  console.log("Phase 4: Inserting filing records...");

  // Collect all filings
  interface FilingRecord {
    id: string;
    sourceSystemId: string;
    entityId: string;
    accessionNumber: string;
    filingDate: string | null;
    reportDate: string | null;
    form: string;
    primaryDocument: string | null;
    primaryDocDescription: string | null;
  }

  const allFilings: FilingRecord[] = [];

  for (const [cik, submission] of submissionMap) {
    const entityId = cikToEntityId.get(cik);
    if (!entityId) continue;

    for (const filing of submission.filings) {
      allFilings.push({
        id: generateId("fr", filing.accessionNumber),
        sourceSystemId: SEC_SOURCE_SYSTEM_ID,
        entityId,
        accessionNumber: filing.accessionNumber,
        filingDate: filing.filingDate
          ? new Date(filing.filingDate).toISOString()
          : null,
        reportDate: filing.reportDate
          ? new Date(filing.reportDate).toISOString()
          : null,
        form: filing.form,
        primaryDocument: filing.primaryDocument || null,
        primaryDocDescription: filing.primaryDocDescription || null,
      });
    }
  }

  // Check which filings already exist
  const existingAccessionNumbers = allFilings.map((f) => f.accessionNumber);
  const existingFilings = await client.query(
    `SELECT "accessionNumber" FROM "CorporateFilingRecord"
     WHERE "accessionNumber" = ANY($1)`,
    [existingAccessionNumbers],
  );
  const existingAccessions = new Set(
    existingFilings.rows.map((r: any) => r.accessionNumber),
  );

  const newFilings = allFilings.filter(
    (f) => !existingAccessions.has(f.accessionNumber),
  );

  if (newFilings.length > 0) {
    const now = new Date().toISOString();
    
    // Deduplicate filings by ID (same accession number can appear for multiple CIKs)
    const seenIds = new Set<string>();
    const deduplicatedFilings: FilingRecord[] = [];
    for (const f of newFilings) {
      if (!seenIds.has(f.id)) {
        seenIds.add(f.id);
        deduplicatedFilings.push(f);
      }
    }
    console.log(`  Deduplicated from ${newFilings.length} to ${deduplicatedFilings.length} filings`);
    
    // Also check for existing IDs (in case of partial previous runs) - batch the query
    const existingIdsSet = new Set<string>();
    const idBatchLimit = 10000;
    const allIds = deduplicatedFilings.map((f) => f.id);
    console.log(`  Checking ${allIds.length} filing IDs for duplicates in DB...`);
    for (let i = 0; i < allIds.length; i += idBatchLimit) {
      const idBatch = allIds.slice(i, i + idBatchLimit);
      const idCheck = await client.query(
        `SELECT "id" FROM "CorporateFilingRecord"
         WHERE "id" = ANY($1)`,
        [idBatch],
      );
      for (const row of idCheck.rows) {
        existingIdsSet.add(row.id);
      }
    }
    console.log(`  Found ${existingIdsSet.size} existing filing IDs in DB`);
    const trulyNewFilings = deduplicatedFilings.filter((f) => !existingIdsSet.has(f.id));
    console.log(`  ${trulyNewFilings.length} truly new filings to insert`);

    // Bulk insert new filings in batches (11 cols per row, 65000/11 = ~5909 max per batch)
    const filingBatches = splitBatches(
      trulyNewFilings,
      PG_MAX_PARAMS,
      11, // 11 columns per filing (including createdAt, updatedAt)
    );

    for (const batch of filingBatches) {
      const filingValues: any[][] = batch.map((f) => [
        f.id,
        f.sourceSystemId,
        f.entityId,
        f.accessionNumber,
        f.filingDate,
        f.reportDate,
        f.form,
        f.primaryDocument,
        f.primaryDocDescription,
        now, // createdAt
        now, // updatedAt
      ]);

      const filingSql = buildBatchInsertSql(
        '"CorporateFilingRecord"',
        [
          "id",
          "sourceSystemId",
          "entityId",
          "accessionNumber",
          "filingDate",
          "reportDate",
          "form",
          "primaryDocument",
          "primaryDocDescription",
          "createdAt",
          "updatedAt",
        ],
        filingValues,
        '("accessionNumber")',
      );
      await client.query(filingSql.sql, filingSql.params);
    }
    stats.filingsInserted = trulyNewFilings.length;
  }

  console.log(
    `  Inserted ${stats.filingsInserted} new filings, ${existingAccessions.size} already existed\n`,
  );

  // ============================================================
  // PHASE 5: Process company facts
  // ============================================================
  console.log("Phase 5: Processing company facts...");

  // Build CIK to entityId map for facts
  const factsCiks = factsFiles
    .map((f) => getCikFromFilename(f))
    .filter(Boolean);
  const factsIdentifiers = await client.query(
    `SELECT "identifierValue", "entityId" FROM "EntityIdentifier"
     WHERE "identifierType" = 'sec_cik'
     AND "identifierValue" = ANY($1)`,
    [factsCiks],
  );

  const factsCikToEntityId = new Map(
    factsIdentifiers.rows.map((r: any) => [r.identifierValue, r.entityId]),
  );

  // Deduplicate facts by entityId (same CIK can appear multiple times)
  const seenEntityIds = new Set<string>();
  const uniqueFactsFiles: { cik: string; file: string }[] = [];
  for (const file of factsFiles) {
    const cik = getCikFromFilename(file);
    if (cik && !seenEntityIds.has(cik)) {
      seenEntityIds.add(cik);
      uniqueFactsFiles.push({ cik, file });
    }
  }
  console.log(`  Deduplicated facts from ${factsFiles.length} to ${uniqueFactsFiles.length} files`);

  // Check which snapshots already exist (by entityId)
  const uniqueEntityIds = uniqueFactsFiles
    .map((f) => factsCikToEntityId.get(f.cik))
    .filter(Boolean) as string[];
  const existingSnapshots = new Set<string>();
  if (uniqueEntityIds.length > 0) {
    // Batch the query to avoid param limits
    const snapBatchLimit = 10000;
    for (let i = 0; i < uniqueEntityIds.length; i += snapBatchLimit) {
      const batch = uniqueEntityIds.slice(i, i + snapBatchLimit);
      const snapResult = await client.query(
        `SELECT "entityId" FROM "CorporateCompanyFactsSnapshot"
         WHERE "entityId" = ANY($1)`,
        [batch],
      );
      for (const row of snapResult.rows) {
        existingSnapshots.add(row.entityId);
      }
    }
  }
  console.log(`  Found ${existingSnapshots.size} existing snapshots`);

  for (const { cik, file } of uniqueFactsFiles) {
    const entityId = factsCikToEntityId.get(cik);
    if (!entityId) {
      stats.factsFailed++;
      continue;
    }

    const filePath = path.join(COMPANYFACTS_DIR, file);
    const facts = parseJsonFile(filePath);
    if (!facts) {
      stats.factsFailed++;
      continue;
    }

    const snapshotId = generateId("ccfs", entityId);
    const isExisting = existingSnapshots.has(entityId);
    
    if (!isExisting) {
      // Try to insert, if duplicate then update (race condition / partial run handling)
      try {
        await client.query(
          `INSERT INTO "CorporateCompanyFactsSnapshot" (
            id, "sourceSystemId", "entityId", "factsJson", "sourceUpdatedAt", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())`,
          [snapshotId, SEC_SOURCE_SYSTEM_ID, entityId, JSON.stringify(facts)],
        );
        stats.snapshotsUpserted++;
      } catch (err: any) {
        if (err.code === '23505') {
          // Duplicate key - update instead
          await client.query(
            `UPDATE "CorporateCompanyFactsSnapshot"
             SET "factsJson" = $1, "sourceUpdatedAt" = NOW(), "updatedAt" = NOW()
             WHERE "entityId" = $2`,
            [JSON.stringify(facts), entityId],
          );
          stats.snapshotsUpserted++;
        } else {
          throw err;
        }
      }
    } else {
      // Update existing snapshot
      await client.query(
        `UPDATE "CorporateCompanyFactsSnapshot"
         SET "factsJson" = $1, "sourceUpdatedAt" = NOW(), "updatedAt" = NOW()
         WHERE "entityId" = $2`,
        [JSON.stringify(facts), entityId],
      );
      stats.snapshotsUpserted++;
    }

    stats.factsProcessed++;
  }

  console.log(
    `  Processed ${stats.factsProcessed} facts files, ${stats.factsFailed} failed, ${stats.snapshotsUpserted} snapshots upserted\n`,
  );

  // ============================================================
  // Summary
  // ============================================================
  console.log("=== Ingestion Summary ===");
  console.log(`Submissions processed: ${stats.submissionsProcessed}`);
  console.log(`Submissions failed: ${stats.submissionsFailed}`);
  console.log(`Canonical entities created: ${stats.entitiesCreated}`);
  console.log(`Company profiles upserted: ${stats.profilesUpserted}`);
  console.log(`Filing records inserted: ${stats.filingsInserted}`);
  console.log(`Company facts processed: ${stats.factsProcessed}`);
  console.log(`Company facts failed: ${stats.factsFailed}`);
  console.log(`Facts snapshots upserted: ${stats.snapshotsUpserted}`);

  if (args.dryRun) {
    console.log("\nDRY RUN - No data was written to the database");
  }

  await client.release();
  await pool.end();

  console.log("\n✅ SEC EDGAR bulk ingestion completed successfully");
  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ SEC EDGAR bulk ingestion failed:", error);
  process.exit(1);
});
