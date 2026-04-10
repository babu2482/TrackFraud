#!/usr/bin/env tsx
/**
 * SAM.gov Exclusions Ingestion Script
 * 
 * Downloads and ingests the System for Award Management (SAM) exclusions list
 * from the U.S. government's SAM.gov website.
 * 
 * Source: https://www.sam.gov/content/sam/regulatory/compliance/enforcement-actions/exclusions-list.html
 * Data Format: CSV download via API or direct file access
 * Update Frequency: Daily
 * Records: ~5,000+ excluded entities
 * 
 * This is a CRITICAL data source for fraud detection as it includes:
 * - Debarred contractors (excluded from federal contracts)
 * - Suspended entities under investigation
 * - Entities excluded from non-contract federal assistance
 * - HHS OIG exclusions (Medicare/Medicaid ineligible)
 * 
 * Usage:
 *   npx tsx scripts/ingest-sam-exclusions.ts [--max-rows N] [--full]
 */

import 'dotenv/config';
import { prisma } from '../lib/db';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { parse } from 'csv-parse/sync';
import https from 'https';

const SOURCE_SYSTEM_SLUG = 'sam-exclusions-list';
const STORAGE_DIR = './data/government/sam';

// SAM.gov Exclusions API endpoint (no key required)
const SAM_EXCLUSIONS_CSV_URL = process.env.SAM_EXCLUSIONS_CSV_URL || 
  'https://www.sam.gov/content/sam/regulatory/compliance/enforcement-actions/exclusions-list.csv';

interface SAMCSVRow {
  UEI: string;
  LegalName: string;
  ExclusionReasons: string;
  EffectiveDate: string;
  ExpirationDate: string;
  IssuingAgency: string;
  Address?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
}

interface ParsedExclusion {
  uei: string;
  legalName: string;
  exclusionReasons: string[];
  effectiveDate: Date;
  expirationDate?: Date;
  issuingAgency: string;
}

async function getSourceSystemId(): Promise<string> {
  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: SOURCE_SYSTEM_SLUG },
  });

  if (!sourceSystem) {
    // Try to find or create government category
    let govCategory = await prisma.fraudCategory.findUnique({
      where: { slug: 'government' }
    });
    
    if (!govCategory) {
      console.log('Creating "government" fraud category...');
      govCategory = await prisma.fraudCategory.create({
        data: {
          id: 'government',
          name: 'Government Fraud',
          slug: 'government',
          description: 'Federal contract fraud, grant abuse, and government procurement violations',
          status: 'active',
          iconName: 'landmark',
          sortOrder: 2,
        }
      });
    }

    if (!govCategory) {
      throw new Error('Government fraud category not found. Please seed the database first.');
    }

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: SOURCE_SYSTEM_SLUG,
        categoryId: govCategory.id,
        name: 'SAM.gov Exclusions List',
        slug: SOURCE_SYSTEM_SLUG,
        description: 'Excluded entities from System for Award Management (debarred/suspended contractors)',
        ingestionMode: 'csv_download',
        baseUrl: 'https://www.sam.gov/',
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
  const fileName = `sam-exclusions-${timestamp}.csv`;
  const filePath = `${STORAGE_DIR}/${fileName}`;

  // Create storage directory if it doesn't exist
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }

  console.log(`Downloading SAM exclusions list from ${SAM_EXCLUSIONS_CSV_URL}...`);

  return new Promise((resolve, reject) => {
    const url = new URL(SAM_EXCLUSIONS_CSV_URL);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        // Try alternative endpoint if primary fails
        console.log(`Primary endpoint failed (${response.statusCode}), trying alternative...`);
        
        const altUrl = 'https://www.sam.gov/content/sam/regulatory/compliance/enforcement-actions/exclusions-list.csv';
        https.get(altUrl, (altResponse) => {
          if (altResponse.statusCode !== 200) {
            reject(new Error(`Failed to download CSV: ${altResponse.statusCode} ${altResponse.statusMessage}`));
            return;
          }

          const contentLength = parseInt(altResponse.headers['content-length'] || '0', 10);
          console.log(`File size (alternative): ${(contentLength / 1024 / 1024).toFixed(2)} MB`);

          const writer = createWriteStream(filePath);
          
          altResponse.pipe(writer);
          
          writer.on('finish', () => {
            console.log(`Saved to ${filePath}`);
            resolve(filePath);
          });
          
          writer.on('error', (err) => {
            reject(err);
          });
        }).on('error', (err) => {
          reject(err);
        });
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
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function parseCSVRow(row: SAMCSVRow): ParsedExclusion | null {
  // Skip rows without essential data
  if (!row.UEI || !row.LegalName || !row.EffectiveDate) {
    return null;
  }

  // Parse exclusion reasons (can be multiple, separated by semicolons or newlines)
  const exclusionReasons = row.ExclusionReasons
    ? [row.ExclusionReasons]
        .flat()
        .map(r => r.trim())
        .filter(Boolean)
    : ['Unknown'];

  // Parse dates
  let effectiveDate: Date;
  try {
    effectiveDate = new Date(row.EffectiveDate);
    if (isNaN(effectiveDate.getTime())) {
      throw new Error('Invalid date format');
    }
  } catch (e) {
    console.warn(`Skipping row with invalid effective date: ${row.LegalName}`);
    return null;
  }

  let expirationDate: Date | undefined;
  if (row.ExpirationDate && row.ExpirationDate.trim() !== '') {
    try {
      expirationDate = new Date(row.ExpirationDate);
      if (isNaN(expirationDate.getTime())) {
        console.warn(`Warning: Invalid expiration date for ${row.LegalName}`);
        expirationDate = undefined;
      }
    } catch (e) {
      // Ignore invalid expiration dates
    }
  }

  return {
    uei: row.UEI.trim(),
    legalName: row.LegalName.trim(),
    exclusionReasons,
    effectiveDate,
    expirationDate,
    issuingAgency: row.IssuingAgency?.trim() || 'Unknown',
  };
}

async function ingestExclusions(filePath: string, maxRows: number | null = null): Promise<{
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
  }) as SAMCSVRow[];

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
          const exclusion = parseCSVRow(row);
          
          if (!exclusion) {
            skipped++;
            return;
          }
          
          // Check if record exists
          const existing = await prisma.sAMExclusion.findUnique({
            where: { uei: exclusion.uei },
          });

          if (existing) {
            // Update existing record
            await prisma.sAMExclusion.update({
              where: { uei: exclusion.uei },
              data: {
                legalName: exclusion.legalName,
                exclusionReasons: exclusion.exclusionReasons,
                effectiveDate: exclusion.effectiveDate,
                expirationDate: exclusion.expirationDate,
                issuingAgency: exclusion.issuingAgency,
                updatedAt: new Date(),
              },
            });
            updated++;
          } else {
            // Insert new record
            await prisma.sAMExclusion.create({
              data: {
                sourceSystemId,
                uei: exclusion.uei,
                legalName: exclusion.legalName,
                exclusionReasons: exclusion.exclusionReasons,
                effectiveDate: exclusion.effectiveDate,
                expirationDate: exclusion.expirationDate,
                issuingAgency: exclusion.issuingAgency,
              },
            });
            inserted++;
          }
        } catch (error) {
          console.error(`Error processing ${row.UEI}:`, error);
          failed++;
        }
      })
    );

    // Update progress every 10 batches
    const processed = Math.min(i + batchSize, records.length);
    if ((processed / batchSize) % 10 === 0 || processed >= records.length) {
      const percent = Math.round((processed / records.length) * 100);
      console.log(`Progress: ${percent}% (${processed}/${records.length}) - Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
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
  console.log('SAM.gov Exclusions List Ingestion');
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
    console.log('\nIngesting exclusions...');
    const results = await ingestExclusions(filePath, maxRows);

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
  } catch {}
  process.exit(1);
});