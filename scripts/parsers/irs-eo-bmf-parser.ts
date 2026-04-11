#!/usr/bin/env -S tsx
/**
 * IRS EO Business Master File Parser
 *
 * Parses the IRS Exempt Organizations Business Master File (EO BMF) extract
 * and inserts records into CharityBusinessMasterRecord table.
 *
 * Source: https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
 * Format: Fixed-width ASCII text file with specific field positions
 *
 * Usage:
 *   npx tsx scripts/parsers/irs-eo-bmf-parser.ts --source-system-id <id> [--max-rows N]
 */

import "dotenv/config";
import { prisma } from "../../lib/db";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "fs";
import * as followRedirectsHttps from "follow-redirects/https";

interface ParsedRecord {
  recordType: string; // A = Active, R = Revoked, etc.
  ein: string; // Employer Identification Number
  name: string; // Organization Name
  mailingName?: string; // Mailing Address Name (if different)
  street1: string; // Street Address Line 1
  street2?: string; // Street Address Line 2
  city: string; // City
  state: string; // State/Province
  zipcode: string; // ZIP Code
  country?: string; // Country (for international)
  classificationCode: string; // Classification code
  classificationDescription?: string; // Description of classification
  rulingDate?: Date; // Date of ruling
  deductionCode?: string; // Deductibility status code
  foundationCode?: string; // Foundation type code
  activityCodes?: string[]; // Primary activity codes
  incomeAmount?: number; // Income amount (if available)
  assetAmount?: number; // Asset amount (if available)
  filingRequirementCode?: string; // Filing requirement code
  taxPeriodEndMonth: number; // Tax period end month (1-12)
  status: "Active" | "Revoked" | "Inactive";
}

interface IRSEOBMFParseConfig {
  sourceSystemId: string;
  maxRows?: number;
  batchSize?: number;
  downloadUrl?: string;
  storageDir?: string;
}

class IRSEOBMFParse {
  private config: Required<IRSEOBMFParseConfig>;
  private stats = {
    totalLines: 0,
    parsedRecords: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  constructor(config: IRSEOBMFParseConfig) {
    this.config = {
      sourceSystemId: config.sourceSystemId,
      maxRows: config.maxRows || 10000,
      batchSize: config.batchSize || 500,
      downloadUrl:
        config.downloadUrl ||
        process.env.IRS_EO_BMF_URL ||
        "https://www.irs.gov/pub/irs-exempt/eo_bmf.txt",
      storageDir: config.storageDir || "./data/raw/irs",
    };

    // Create storage directory if it doesn't exist
    if (!existsSync(this.config.storageDir)) {
      mkdirSync(this.config.storageDir, { recursive: true });
    }
  }

  async parseAndInsert(): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    console.log("📥 Downloading IRS EO BMF file...");

    try {
      const filePath = await this.downloadFile();
      console.log(`✅ File downloaded to ${filePath}`);

      console.log("🔍 Parsing CSV data...");
      const records = this.parseCSV(filePath);
      console.log(`📊 Parsed ${records.length.toLocaleString()} records`);

      if (this.config.maxRows && records.length > this.config.maxRows) {
        console.log(
          `⚠️  Limiting to first ${this.config.maxRows.toLocaleString()} records`,
        );
        records.splice(this.config.maxRows);
      }

      console.log("💾 Inserting into database...");
      await this.insertRecords(records);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ Parsing failed:", errorMessage);
      throw error;
    }

    return {
      inserted: this.stats.inserted,
      updated: this.stats.updated,
      skipped: this.stats.skipped,
      errors: this.stats.errors,
    };
  }

  private async downloadFile(): Promise<string> {
    const timestamp = new Date().toISOString().split("T")[0];
    const fileName = `irs-eo-bmf-${timestamp}.txt`;
    const filePath = `${this.config.storageDir}/${fileName}`;

    return this.tryDownloadUrls(filePath);
  }

  private async tryDownloadUrls(filePath: string): Promise<string> {
      // Try multiple possible URLs for the latest EO BMF file
      const urlsToTry = [
        "/pub/irs-exempt/eo_bmf.txt",
        "/pub/exempt_eo_bmf.txt",
        "/charities-non-profits/data/eo-bmf-file"
      ];

      let lastError: Error | null = null;

      for (const path of urlsToTry) {
        try {
          return await this.downloadFromUrl(path);
        } catch (error) {
          lastError = error as Error;
          continue;
        }
      }

      throw new Error(`Could not download EO BMF file: ${lastError?.message}`);
    }

    private async downloadFromUrl(path: string): Promise<string> {
      const options: followRedirectsHttps.RequestOptions = {
        hostname: "www.irs.gov",
        path,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "*/*",
        },
      };

      const req = followRedirectsHttps.request(
        options,
        (response: followRedirectsHttps.IncomingMessage) => {
          if ((response.statusCode ?? 0) !== 200) {
            reject(
              new Error(
                `Failed to download: ${response.statusCode} ${response.statusMessage}`,
              ),
            );
            return;
          }

          const contentLength = parseInt(
            response.headers["content-length"] || "0",
            10,
          );
          console.log(
            `📦 File size: ${(contentLength / 1024 / 1024).toFixed(2)} MB`,
          );

          const writer = createWriteStream(filePath);

          response.pipe(writer);

          writer.on('finish', () => {
            resolve(filePath);
          });

          writer.on('error', (err) => {
            reject(err);
          });
        },
      );

      req.on('error', (err: Error) => {
        reject(err);
      });

      req.end();
    });
  }

  private parseCSV(filePath: string): ParsedRecord[] {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    this.stats.totalLines = lines.length;
    const records: ParsedRecord[] = [];

    for (const line of lines) {
      try {
        const record = this.parseLine(line);
        if (record) {
          records.push(record);
          this.stats.parsedRecords++;
        }
      } catch (error) {
        console.warn(`⚠️  Warning parsing line: ${line.substring(0, 50)}...`);
        this.stats.errors++;
      }
    }

    return records;
  }

  private parseLine(line: string): ParsedRecord | null {
    // IRS EO BMF format (fixed-width fields)
    // This is a simplified parser - actual format may vary

    const ein = line.substring(0, 9).trim();
    if (!ein || ein === "00-0000000") return null;

    const name = line.substring(13, 58).trim();
    if (!name) return null;

    const status: "Active" | "Revoked" | "Inactive" = line.includes("REVOKED")
      ? "Revoked"
      : line.includes("INACTIVE")
        ? "Inactive"
        : "Active";

    return {
      recordType: "A",
      ein,
      name,
      street1: line.substring(58, 90).trim(),
      city: line.substring(90, 117).trim(),
      state: line.substring(117, 120).trim(),
      zipcode: line.substring(120, 130).trim(),
      classificationCode: "X", // Default - would need proper parsing
      taxPeriodEndMonth: 12,
      status,
    };
  }

  private async insertRecords(records: ParsedRecord[]): Promise<void> {
    const batchSize = this.config.batchSize;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}...`);

      await Promise.all(
        batch.map(async (record) => {
          try {
            // Check if record exists
            const existing =
              await prisma.charityBusinessMasterRecord.findUnique({
                where: {
                  ein_sourceSystemId: {
                    ein: record.ein,
                    sourceSystemId: this.config.sourceSystemId,
                  },
                },
              });

            if (existing) {
              // Update existing record
              await prisma.charityBusinessMasterRecord.update({
                where: {
                  ein_sourceSystemId: {
                    ein: record.ein,
                    sourceSystemId: this.config.sourceSystemId,
                  },
                },
                data: {
                  name: record.name,
                  city: record.city,
                  state: record.state,
                  zipcode: record.zipcode,
                  status:
                    record.status === "Revoked"
                      ? "revoked"
                      : record.status === "Inactive"
                        ? "inactive"
                        : "active",
                  updatedAt: new Date(),
                },
              });
              this.stats.updated++;
            } else {
              // Insert new record
              await prisma.charityBusinessMasterRecord.create({
                data: {
                  sourceSystemId: this.config.sourceSystemId,
                  ein: record.ein,
                  name: record.name,
                  city: record.city || null,
                  state: record.state || null,
                  zipcode: record.zipcode || null,
                  status:
                    record.status === "Revoked"
                      ? "revoked"
                      : record.status === "Inactive"
                        ? "inactive"
                        : "active",
                },
              });
              this.stats.inserted++;
            }

            // Update related CharityProfile if exists
            await this.updateCharityProfile(record.ein, record.name);
          } catch (error) {
            console.error(`  Error processing EIN ${record.ein}:`, error);
            this.stats.errors++;
          }
        });
        }),
      );

      // Progress update every batch
      const processed = Math.min(i + batchSize, records.length);
      if ((processed / batchSize) % 10 === 0 || processed >= records.length) {
        console.log(
          `  Progress: ${processed.toLocaleString()}/${records.length.toLocaleString()} - Inserted: ${this.stats.inserted.toLocaleString()}, Updated: ${this.stats.updated.toLocaleString()}`,
        );
      }

      // Small delay to avoid overwhelming the database
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async updateCharityProfile(ein: string, name: string): Promise<void> {
    try {
      // Check if charity profile exists
      const existingProfile = await prisma.charityProfile.findUnique({
        where: { ein },
      });

      if (existingProfile) {
        // Update with latest info
        await prisma.charityProfile.update({
          where: { ein },
          data: {
            name,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create new profile from BMF record
        await prisma.charityProfile.create({
          data: {
            ein,
            name,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      // Silently fail - this is just an enhancement
    }
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  let sourceSystemId = "";
  let maxRows: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source-system-id" || args[i] === "-s") {
      sourceSystemId = args[++i] || "";
    } else if (args[i] === "--max-rows" || args[i] === "-m") {
      maxRows = parseInt(args[++i] || "0", 10) || undefined;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
IRS EO BMF Parser

Usage:
  npx tsx scripts/parsers/irs-eo-bmf-parser.ts --source-system-id <id> [--max-rows N]

Options:
  -s, --source-system-id    Source system ID from database
  -m, --max-rows            Maximum rows to process (default: all)
  -h, --help                Show this help message

Example:
  npx tsx scripts/parsers/irs-eo-bmf-parser.ts --source-system-id irs_eo_bmf --max-rows 10000
`);
      process.exit(0);
    }
  }

  if (!sourceSystemId) {
    console.error("❌ Error: source-system-id is required");
    process.exit(1);
  }

  try {
    const parser = new IRSEOBMFParse({
      sourceSystemId,
      maxRows,
    });

    const results = await parser.parseAndInsert();

    console.log("\n" + "=".repeat(60));
    console.log("✅ IRS EO BMF Parsing Complete");
    console.log("=".repeat(60));
    console.log(
      `Total lines: ${parser.getStats().totalLines.toLocaleString()}`,
    );
    console.log(
      `Parsed records: ${parser.getStats().parsedRecords.toLocaleString()}`,
    );
    console.log(`Inserted: ${results.inserted.toLocaleString()}`);
    console.log(`Updated: ${results.updated.toLocaleString()}`);
    console.log(`Skipped: ${results.skipped.toLocaleString()}`);
    console.log(`Errors: ${results.errors.toLocaleString()}`);
  } catch (error) {
    console.error("❌ Parsing failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
