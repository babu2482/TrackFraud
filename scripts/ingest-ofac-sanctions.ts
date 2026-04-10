#!/usr/bin/env tsx
/**
 * OFAC Sanctions List Ingestion Script
 * 
 * Downloads and ingests the Specially Designated Nationals (SDN) list
 * from the U.S. Treasury Department's Office of Foreign Assets Control.
 * 
 * Source: https://www.treasury.gov/ofac/downloads/
 * Data Format: CSV or JSON
 * Update Frequency: Daily (typically)
 * Records: ~12,000+ sanctioned individuals and entities
 * 
 * This is a CRITICAL data source for financial fraud detection as it includes:
 * - Terrorist organizations and individuals
 * - Narcotics traffickers
 * - Cyber threat actors
 * - Human rights abusers
 * - Countries under comprehensive sanctions (Iran, North Korea, Syria, Cuba)
 * - Russia-related sanctions (UKRAINE-EO13662, etc.)
 * 
 * Usage:
 *   npx tsx scripts/ingest-ofac-sanctions.ts [--max-rows N] [--full]
 */

import 'dotenv/config';
import { prisma } from '../lib/db';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { parse } from 'csv-parse/sync';
import * as followRedirectsHttps from 'follow-redirects/https';

const SOURCE_SYSTEM_SLUG = 'ofac-sdn-list';

// Configuration
const OFAC_SDN_CSV_URL = process.env.OFAC_SDN_CSV_URL ||
  'https://www.treasury.gov/ofac/downloads/sdn.csv';
const OFAC_CONSOLIDATED_JSON_URL = process.env.OFAC_CONSOLIDATED_JSON_URL ||
  'https://www.treasury.gov/ofac/downloads/consolidated.json';

const STORAGE_DIR = './data/treasury/ofac';

interface OFACCSVRow {
  Target_ID: string;
  Program: string;
  Title: string;
  Type: string;
  Call_Sign: string;
  Vessel_Flag: string;
  Vessel_Gross_Tonnage: string;
  VAT_Number: string;
  Tax_Id_Number: string;
  Address: string;
  City: string;
  State_or_Province: string;
  Postal_Code: string;
  Country: string;
  Date_of_Birth: string;
  Place_of_Birth: string;
  Nationality: string;
  Passport_Number: string;
  Document_Issued_Date: string;
  Document_Expiration_Date: string;
  ID_Type_1: string;
  ID_Number_1: string;
  ID_Country_1: string;
  ID_Type_2: string;
  ID_Number_2: string;
  ID_Country_2: string;
  Remarks: string;
  Alt_Name_1: string;
  Alt_Name_2: string;
  Alt_Name_3: string;
  Alt_Name_4: string;
  Alt_Name_5: string;
}

interface ParsedSanction {
  ofacId: string;
  programs: string[];
  name?: string;
  entityType: 'Individual' | 'Entity';
  addresses: Array<{
    address?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    country?: string;
  }>;
  ids: Array<{
    idType: string;
    idNumber: string;
    issuingCountry: string;
  }>;
  datesOfBirth?: string[];
  placesOfBirth?: string[];
  citizenCountries?: string[];
}

async function getSourceSystemId(): Promise<string> {
  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: SOURCE_SYSTEM_SLUG },
  });

  if (!sourceSystem) {
    // Try to find or create financial category
    let financialCategory = await prisma.fraudCategory.findUnique({
      where: { slug: 'financial' }
    });

    if (!financialCategory) {
      console.log('Creating "financial" fraud category...');
      financialCategory = await prisma.fraudCategory.create({
        data: {
          id: 'financial',
          name: 'Financial Fraud',
          slug: 'financial',
          description: 'Securities fraud, money laundering, sanctions violations, and financial crimes',
          status: 'active',
          iconName: 'dollar-sign',
          sortOrder: 3,
        }
      });
    }

    if (!financialCategory) {
      throw new Error('Financial fraud category not found. Please seed the database first.');
    }

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: SOURCE_SYSTEM_SLUG,
        categoryId: financialCategory.id,
        name: 'OFAC SDN List',
        slug: SOURCE_SYSTEM_SLUG,
        description: 'Specially Designated Nationals and Blocked Persons List from U.S. Treasury',
        ingestionMode: 'csv_download',
        baseUrl: 'https://www.treasury.gov/ofac/downloads/',
        refreshCadence: 'daily',
        freshnessSlaHours: 24,
        supportsIncremental: false,
      },
    });

    console.log(`Created new source system: ${sourceSystem.name}`);
  }

  return sourceSystem.id;
}

async function downloadCSV(): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const fileName = `ofac-sdn-${timestamp}.csv`;
  const filePath = `${STORAGE_DIR}/${fileName}`;

  // Create storage directory if it doesn't exist
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }

  console.log(`Downloading OFAC SDN list from ${OFAC_SDN_CSV_URL}...`);

  return new Promise((resolve, reject) => {
    const options: followRedirectsHttps.RequestOptions = {
      hostname: 'www.treasury.gov',
      path: '/ofac/downloads/sdn.csv',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };

    const req = followRedirectsHttps.request(options, (response: followRedirectsHttps.IncomingMessage) => {
      if ((response.statusCode ?? 0) !== 200) {
        reject(new Error(`Failed to download CSV: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const contentLength = parseInt(response.headers['content-length'] || '0', 10);
      console.log(`File size: ${(contentLength / 1024 / 1024).toFixed(2)} MB`);

      const writer = createWriteStream(filePath);
      
      response.pipe(writer);
      
      writer.on('finish', () => {
        console.log(`Saved to ${filePath}`);
        resolve(filePath);
      });
      
      writer.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', (err: Error) => {
      reject(err);
    });

    req.end();
  });
}

function parseCSVRow(row: OFACCSVRow): ParsedSanction {
  // Parse addresses (OFAC can have multiple addresses per target)
  const addresses: Array<{
    address?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    country?: string;
  }> = [];

  if (row.Address || row.City || row.Country) {
    addresses.push({
      address: row.Address?.trim() || undefined,
      city: row.City?.trim() || undefined,
      stateOrProvince: row.State_or_Province?.trim() || undefined,
      postalCode: row.Postal_Code?.trim() || undefined,
      country: row.Country?.trim() || undefined,
    });
  }

  // Parse IDs (OFAC can have multiple ID types)
  const ids: Array<{
    idType: string;
    idNumber: string;
    issuingCountry: string;
  }> = [];

  if (row.ID_Type_1 && row.ID_Number_1) {
    ids.push({
      idType: row.ID_Type_1.trim(),
      idNumber: row.ID_Number_1.trim(),
      issuingCountry: row.ID_Country_1?.trim() || 'Unknown',
    });
  }

  if (row.ID_Type_2 && row.ID_Number_2) {
    ids.push({
      idType: row.ID_Type_2.trim(),
      idNumber: row.ID_Number_2.trim(),
      issuingCountry: row.ID_Country_2?.trim() || 'Unknown',
    });
  }

  // Parse programs (can be multiple, separated by semicolons)
  const programs = row.Program
    ? row.Program.split(';').map(p => p.trim()).filter(Boolean)
    : [];

  // Collect alternative names
  const altNames: string[] = [];
  ['Alt_Name_1', 'Alt_Name_2', 'Alt_Name_3', 'Alt_Name_4', 'Alt_Name_5'].forEach((key) => {
    const value = row[key as keyof OFACCSVRow];
    if (value && value.trim() !== '') {
      altNames.push(value.trim());
    }
  });

  // Parse dates of birth (can be multiple or ranges)
  const datesOfBirth: string[] = [];
  if (row.Date_of_Birth && row.Date_of_Birth.trim() !== '') {
    datesOfBirth.push(row.Date_of_Birth.trim());
  }

  // Parse places of birth
  const placesOfBirth: string[] = [];
  if (row.Place_of_Birth && row.Place_of_Birth.trim() !== '') {
    placesOfBirth.push(row.Place_of_Birth.trim());
  }

  // Parse nationalities/citizenship countries
  const citizenCountries: string[] = [];
  if (row.Nationality && row.Nationality.trim() !== '') {
    citizenCountries.push(row.Nationality.trim());
  }

  return {
    ofacId: row.Target_ID.trim(),
    programs,
    name: row.Title?.trim() || altNames[0] || undefined,
    entityType: (row.Type === 'Individual') ? 'Individual' : 'Entity',
    addresses,
    ids,
    datesOfBirth: datesOfBirth.length > 0 ? datesOfBirth : undefined,
    placesOfBirth: placesOfBirth.length > 0 ? placesOfBirth : undefined,
    citizenCountries: citizenCountries.length > 0 ? citizenCountries : undefined,
  };
}

async function ingestSanctions(filePath: string, maxRows: number | null = null): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const sourceSystemId = await getSourceSystemId();

  console.log(`Reading CSV file...`);

  // Read and parse CSV
  const fileContent = readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as OFACCSVRow[];

  console.log(`Total records in CSV: ${records.length}`);

  if (maxRows && records.length > maxRows) {
    console.log(`Limiting to first ${maxRows} records for testing`);
    records.splice(maxRows);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 50;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (row) => {
        try {
          const sanction = parseCSVRow(row);

          // Check if record exists
          const existing = await prisma.oFACSanction.findUnique({
            where: { ofacId: sanction.ofacId },
          });

          if (existing) {
            // Update existing record
            await prisma.oFACSanction.update({
              where: { ofacId: sanction.ofacId },
              data: {
                programs: sanction.programs,
                name: sanction.name,
                entityType: sanction.entityType,
                addresses: sanction.addresses,
                ids: sanction.ids,
                datesOfBirth: sanction.datesOfBirth,
                placesOfBirth: sanction.placesOfBirth,
                citizenCountries: sanction.citizenCountries,
                updatedAt: new Date(),
              },
            });
            updated++;
          } else {
            // Insert new record
            await prisma.oFACSanction.create({
              data: {
                sourceSystemId,
                ofacId: sanction.ofacId,
                programs: sanction.programs,
                name: sanction.name,
                entityType: sanction.entityType,
                addresses: sanction.addresses,
                ids: sanction.ids,
                datesOfBirth: sanction.datesOfBirth,
                placesOfBirth: sanction.placesOfBirth,
                citizenCountries: sanction.citizenCountries,
              },
            });
            inserted++;
          }
        } catch (error) {
          console.error(`Error processing ${row.Target_ID}:`, error);
          failed++;
        }
      })
    );

    // Update progress every 10 batches
    const processed = Math.min(i + batchSize, records.length);
    if ((processed / batchSize) % 10 === 0 || processed >= records.length) {
      const percent = Math.round((processed / records.length) * 100);
      console.log(`Progress: ${percent}% (${processed}/${records.length}) - Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`);
    }

    // Small delay to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return { inserted, updated, skipped, failed };
}

async function updateSourceSystemStatus(
  sourceSystemId: string,
  stats: { inserted: number; updated: number; skipped: number; failed: number },
  bytesDownloaded: number
): Promise<void> {
  await prisma.sourceSystem.update({
    where: { id: sourceSystemId },
    data: {
      lastAttemptedSyncAt: new Date(),
      lastSuccessfulSyncAt: stats.failed === 0 ? new Date() : null,
      lastError: stats.failed > 0 ? `${stats.failed} records failed to process` : null,
    },
  });

  // Create ingestion run record
  await prisma.ingestionRun.create({
    data: {
      sourceSystemId,
      runType: 'full',
      status: stats.failed > 0 ? 'partial_success' : 'completed',
      rowsRead: stats.inserted + stats.updated + stats.skipped,
      rowsInserted: stats.inserted,
      rowsUpdated: stats.updated,
      rowsSkipped: stats.skipped,
      rowsFailed: stats.failed,
      bytesDownloaded: BigInt(bytesDownloaded),
    },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const maxRowsArg = args.find(a => a.startsWith('--max-rows='));
  const maxRows = maxRowsArg ? parseInt(maxRowsArg.split('=')[1], 10) : null;
  const fullMode = args.includes('--full');

  console.log('='.repeat(60));
  console.log('OFAC SDN List Ingestion');
  console.log('='.repeat(60));
  console.log(`Mode: ${fullMode ? 'Full' : maxRows ? `Test (${maxRows} rows)` : 'Incremental'}`);
  console.log();

  const startTime = Date.now();

  try {
    // Download CSV
    const filePath = await downloadCSV();

    // Get file size
    const fileSize = statSync(filePath).size;

    // Ingest records
    console.log('\nIngesting sanctions...');
    const results = await ingestSanctions(filePath, maxRows);

    // Update source system status
    const sourceSystemId = await getSourceSystemId();
    await updateSourceSystemStatus(sourceSystemId, results, fileSize);

    // Print summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log('='.repeat(60));
    console.log('Ingestion Complete');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration} seconds`);
    console.log(`Inserted: ${results.inserted}`);
    console.log(`Updated: ${results.updated}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Total processed: ${results.inserted + results.updated + results.skipped}`);
    console.log();

  } catch (error) {
    console.error('Ingestion failed:', error);

    // Update source system with error
    try {
      const sourceSystemId = await getSourceSystemId();
      await prisma.sourceSystem.update({
        where: { id: sourceSystemId },
        data: {
          lastAttemptedSyncAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (updateError) {
      console.error('Failed to update source system:', updateError);
    }

    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch { }
  process.exit(1);
});
