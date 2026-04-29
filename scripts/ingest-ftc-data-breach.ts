#!/usr/bin/env tsx
/**
 * FTC Data Breach & Consumer Protection Actions Ingestion Script
 *
 * Scrapes FTC enforcement actions, data breach settlements, and consumer
 * protection cases from the FTC website.
 *
 * Sources:
 *   - Privacy/Security Enforcement:
 *     https://www.ftc.gov/news-events/topics/protecting-consumer-privacy-security/privacy-security-enforcement
 *   - Enforcement Actions (General):
 *     https://www.ftc.gov/news-events/news/press-releases
 *   - Data Breach Database (aggregate):
 *     https://www.ftc.gov/news-events/data-visualizations
 *
 * Note: FTC's Consumer Sentinel Network raw data is law enforcement only.
 * We scrape publicly available enforcement actions and settlements.
 *
 * Usage:
 *   npx tsx scripts/ingest-ftc-data-breach.ts [--max-rows N] [--full]
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import https from "https";

// ============================================================
// Configuration
// ============================================================

const STORAGE_DIR = "./data/consumer/ftc";
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

interface FTCAction {
  id: string;
  date: Date;
  title: string;
  url: string;
  company?: string;
  settlementAmount?: number;
  violationTypes: string[];
  summary?: string;
  actionType: string; // "settlement" | "complaint" | "order" | "consent"
  industry?: string;
  rawHtml?: string;
}

interface FTCDataBreach {
  id: string;
  company: string;
  industry?: string;
  breachDate?: Date;
  notificationDate: Date;
  recordsAffected?: number;
  dataTypesExposed: string[];
  settlementAmount?: number;
  summary?: string;
  url: string;
}

// ============================================================
// HTTP Client
// ============================================================

function fetchPage(url: string, retries = MAX_RETRIES): Promise<string | null> {
  return new Promise((resolve) => {
    function attempt(retryNum: number) {
      https
        .get(url, { timeout: REQUEST_TIMEOUT }, (response) => {
          let data = "";

          // Handle redirects
          if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
            const location = response.headers.location;
            if (location) {
              fetchPage(location, retries - retryNum - 1)
                .then(resolve)
                .catch(() => resolve(null));
            } else {
              resolve(null);
            }
            return;
          }

          if (response.statusCode !== 200) {
            if (retryNum < retries) {
              setTimeout(() => attempt(retryNum + 1), 2000 * (retryNum + 1));
            } else {
              resolve(null);
            }
            return;
          }

          response.setEncoding("utf-8");
          response.on("data", (chunk) => {
            data += chunk;
          });
          response.on("end", () => {
            resolve(data);
          });
        })
        .on("error", (err) => {
          console.warn(`  ⚠️ Error fetching ${url}: ${err.message}`);
          if (retryNum < retries) {
            setTimeout(() => attempt(retryNum + 1), 2000 * (retryNum + 1));
          } else {
            resolve(null);
          }
        })
        .on("timeout", () => {
          if (retryNum < retries) {
            setTimeout(() => attempt(retryNum + 1), 2000 * (retryNum + 1));
          } else {
            resolve(null);
          }
        });
    }

    attempt(0);
  });
}

// ============================================================
// HTML Parsing Helpers
// ============================================================

function extractText(html: string, selector: string): string | null {
  // Simple regex-based extraction for common patterns
  // This is a basic implementation; for production, use cheerio or similar

  // Extract from <tag>text</tag>
  const tagRegex = new RegExp(`<${selector}[^>]*>([^<]*)</${selector}>`, "i");
  const match = html.match(tagRegex);
  return match ? match[1].trim() : null;
}

function extractBetween(html: string, start: string, end: string): string[] {
  const regex = new RegExp(`${start}(.*?)${end}`, "gis");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

function extractLinks(html: string, baseUrl = "https://www.ftc.gov"): string[] {
  const linkRegex = /href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    // Resolve relative URLs
    if (href.startsWith("/")) {
      href = baseUrl + href;
    } else if (
      !href.startsWith("http") &&
      !href.startsWith("#") &&
      !href.startsWith("mailto:")
    ) {
      href = baseUrl + "/" + href;
    }
    if (
      href.startsWith(baseUrl) &&
      !href.includes(".pdf") &&
      !href.includes(".jpg")
    ) {
      links.push(href);
    }
  }
  return [...new Set(links)]; // Deduplicate
}

function extractDates(html: string): Date | null {
  // Try to find date patterns
  const datePatterns = [
    // "(Month DD, YYYY)"
    /\((\w+\s+\d{1,2},\s+\d{4})\)/,
    // "Month DD, YYYY"
    /(\w+\s+\d{1,2},\s+\d{4})/,
    // "MM/DD/YYYY"
    /(\d{2}\/\d{2}\/\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    if (match) {
      const date = new Date(match[1]);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  return null;
}

function extractMoney(html: string): number | null {
  // Try to find dollar amounts
  const moneyPatterns = [
    /\$(\d[\d,]*)\.?\d*/g,
    /(\$?\d[\d,]*)\s*(million|billion|thousand)/gi,
  ];

  let maxAmount = 0;
  for (const pattern of moneyPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let amount = parseFloat(match[1].replace(/,/g, ""));
      if (isNaN(amount)) continue;

      // Handle multipliers
      if (match[2]) {
        const multiplier = match[2].toLowerCase();
        if (multiplier.includes("billion")) amount *= 1_000_000_000;
        else if (multiplier.includes("million")) amount *= 1_000_000;
        else if (multiplier.includes("thousand")) amount *= 1_000;
      }

      maxAmount = Math.max(maxAmount, amount);
    }
  }

  return maxAmount > 0 ? maxAmount : null;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// Source System Management
// ============================================================

async function ensureSourceSystem(): Promise<{
  breachId: string;
  actionId: string;
}> {
  // FTC Data Breach source system
  let breachSystem = await prisma.sourceSystem.findUnique({
    where: { slug: "ftc-data-breach" },
  });

  if (!breachSystem) {
    const category = await prisma.fraudCategory.findUnique({
      where: { slug: "consumer" },
    });

    if (!category) {
      throw new Error(
        'Category "consumer" not found. Seed the database first.',
      );
    }

    breachSystem = await prisma.sourceSystem.create({
      data: {
        id: "ftc-data-breach",
        categoryId: category.id,
        name: "FTC Data Breach Enforcement",
        slug: "ftc-data-breach",
        description:
          "FTC data breach settlements and enforcement actions. Companies that had data breaches and the settlements they paid.",
        ingestionMode: "scraping",
        baseUrl:
          "https://www.ftc.gov/news-events/topics/protecting-consumer-privacy-security/privacy-security-enforcement",
        refreshCadence: "weekly",
        freshnessSlaHours: 168,
        supportsIncremental: false,
      },
    });

    console.log(`✅ Created FTC Data Breach source system`);
  }

  // FTC Consumer Protection Action source system
  let actionSystem = await prisma.sourceSystem.findUnique({
    where: { slug: "ftc-consumer-protection" },
  });

  if (!actionSystem) {
    const category = await prisma.fraudCategory.findUnique({
      where: { slug: "consumer" },
    });

    if (!category) {
      throw new Error(
        'Category "consumer" not found. Seed the database first.',
      );
    }

    actionSystem = await prisma.sourceSystem.create({
      data: {
        id: "ftc-consumer-protection",
        categoryId: category.id,
        name: "FTC Consumer Protection Actions",
        slug: "ftc-consumer-protection",
        description:
          "FTC consumer protection enforcement actions. Settlements, consent orders, and complaints against companies for consumer protection violations.",
        ingestionMode: "scraping",
        baseUrl: "https://www.ftc.gov/news-events/news/press-releases",
        refreshCadence: "weekly",
        freshnessSlaHours: 168,
        supportsIncremental: false,
      },
    });

    console.log(`✅ Created FTC Consumer Protection source system`);
  }

  return { breachId: breachSystem.id, actionId: actionSystem.id };
}

// ============================================================
// Scraping: Privacy/Security Enforcement Page
// ============================================================

async function scrapePrivacyEnforcement(
  maxRows: number | null = null,
): Promise<FTCDataBreach[]> {
  console.log("\n🕷️  Scraping FTC Privacy/Security Enforcement page...");

  const url =
    "https://www.ftc.gov/news-events/topics/protecting-consumer-privacy-security/privacy-security-enforcement";
  const html = await fetchPage(url);

  if (!html) {
    console.warn("  ⚠️ Failed to fetch FTC privacy enforcement page");
    return [];
  }

  console.log(`  ✅ Fetched page (${(html.length / 1024).toFixed(1)} KB)`);

  // Save raw HTML for debugging
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
  writeFileSync(`${STORAGE_DIR}/ftc-privacy-enforcement.html`, html);

  // Parse enforcement entries
  // The FTC page has entries with date, title, and link
  const entries: FTCDataBreach[] = [];

  // Extract items - look for article/list item patterns
  const itemRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(html)) !== null) {
    if (maxRows && entries.length >= maxRows) break;

    const itemHtml = itemMatch[1];
    const plainText = stripHtmlTags(itemHtml);

    // Skip if too short
    if (plainText.length < 20) continue;

    // Extract title/link
    const linkMatches = itemHtml.match(
      /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi,
    );
    let title = "FTC Enforcement Action";
    let linkUrl = url;

    if (linkMatches && linkMatches.length > 0) {
      const firstLink = linkMatches[0];
      const hrefMatch = firstLink.match(/href="([^"]+)"/);
      const textMatch = firstLink.match(/>([^<]+)<\/a>/);
      if (hrefMatch) linkUrl = hrefMatch[1];
      if (textMatch) title = textMatch[1].trim();
    }

    // Resolve relative URL
    if (linkUrl.startsWith("/")) {
      linkUrl = "https://www.ftc.gov" + linkUrl;
    }

    // Extract date
    const date = extractDates(itemHtml);

    // Extract settlement amount
    const settlementAmount = extractMoney(itemHtml);

    // Determine industry from keywords
    let industry: string | undefined;
    const industryKeywords: Record<string, string[]> = {
      technology: [
        "tech",
        "software",
        "app",
        "data",
        "cyber",
        "security",
        "platform",
      ],
      healthcare: [
        "health",
        "medical",
        "hospital",
        "clinic",
        "patient",
        "pharma",
      ],
      finance: ["bank", "credit", "loan", "financial", "payment", "insurance"],
      retail: ["retail", "store", "shop", "e-commerce", "commerce", "consumer"],
      education: ["education", "school", "university", "student", "learning"],
      telecommunications: [
        "telecom",
        "phone",
        "cell",
        "mobile",
        "carrier",
        "wireless",
      ],
    };

    const textLower = plainText.toLowerCase();
    for (const [ind, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some((kw) => textLower.includes(kw))) {
        industry = ind;
        break;
      }
    }

    // Extract data types exposed from keywords
    const dataTypes: string[] = [];
    const dataKeywords = [
      "personal information",
      "personal data",
      "social security",
      "credit card",
      "bank account",
      "medical records",
      "health information",
      "email",
      "password",
      "biometric",
      "location data",
      "browsing history",
      "purchase history",
    ];

    for (const keyword of dataKeywords) {
      if (textLower.includes(keyword)) {
        dataTypes.push(keyword);
      }
    }

    // Generate ID from URL
    const urlHash =
      linkUrl.split("/").pop()?.split("?")[0] || `ftc-${Date.now()}`;
    const id = `FTC_BREACH_${urlHash}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    entries.push({
      id,
      company:
        title
          .replace(/\s*-\s*FTC.*/i, "")
          .trim()
          .substring(0, 200) || "Unknown Company",
      industry,
      breachDate: date,
      notificationDate: date || new Date(),
      settlementAmount,
      dataTypesExposed: dataTypes.length > 0 ? dataTypes : ["unknown"],
      summary: plainText.substring(0, 2000),
      url: linkUrl,
    });
  }

  console.log(`  ✅ Extracted ${entries.length} enforcement entries`);
  return entries;
}

// ============================================================
// Scraping: Press Releases (General Enforcement)
// ============================================================

async function scrapePressReleases(
  maxRows: number | null = null,
): Promise<FTCAction[]> {
  console.log("\n🕷️  Scraping FTC Press Releases...");

  const url = "https://www.ftc.gov/news-events/news/press-releases";
  const html = await fetchPage(url);

  if (!html) {
    console.warn("  ⚠️ Failed to fetch FTC press releases page");
    return [];
  }

  console.log(`  ✅ Fetched page (${(html.length / 1024).toFixed(1)} KB)`);

  // Save raw HTML
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
  writeFileSync(`${STORAGE_DIR}/ftc-press-releases.html`, html);

  const actions: FTCAction[] = [];

  // Extract press release entries
  const itemRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(html)) !== null) {
    if (maxRows && actions.length >= maxRows) break;

    const itemHtml = itemMatch[1];
    const plainText = stripHtmlTags(itemHtml);

    if (plainText.length < 20) continue;

    // Extract title/link
    const linkMatches = itemHtml.match(
      /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi,
    );
    let title = "FTC Press Release";
    let linkUrl = url;

    if (linkMatches && linkMatches.length > 0) {
      const firstLink = linkMatches[0];
      const hrefMatch = firstLink.match(/href="([^"]+)"/);
      const textMatch = firstLink.match(/>([^<]+)<\/a>/);
      if (hrefMatch) linkUrl = hrefMatch[1];
      if (textMatch) title = textMatch[1].trim();
    }

    if (linkUrl.startsWith("/")) {
      linkUrl = "https://www.ftc.gov" + linkUrl;
    }

    const date = extractDates(itemHtml);
    const settlementAmount = extractMoney(itemHtml);

    // Determine action type from title
    let actionType: FTCAction["actionType"] = "complaint";
    const titleLower = title.toLowerCase();
    if (titleLower.includes("settle") || titleLower.includes("consent")) {
      actionType = "settlement";
    } else if (titleLower.includes("consent order")) {
      actionType = "consent";
    } else if (titleLower.includes("order")) {
      actionType = "order";
    }

    // Determine if this is data breach/privacy related
    const isPrivacyRelated =
      titleLower.includes("data") ||
      titleLower.includes("privacy") ||
      titleLower.includes("breach") ||
      titleLower.includes("security") ||
      titleLower.includes("hack") ||
      titleLower.includes("cyber");

    // Extract violation types
    const violationTypes: string[] = [];
    const violationKeywords = [
      "deceptive",
      "unfair",
      "fraud",
      "misleading",
      "data breach",
      "privacy",
      "security",
      "antitrust",
      "merger",
      "competition",
      "consumer protection",
      "telemarketing",
      "do not call",
      "identity theft",
    ];

    for (const keyword of violationKeywords) {
      if (
        titleLower.includes(keyword) ||
        plainText.toLowerCase().includes(keyword)
      ) {
        violationTypes.push(keyword);
      }
    }

    if (violationTypes.length === 0) {
      violationTypes.push(
        isPrivacyRelated ? "data_security" : "consumer_protection",
      );
    }

    // Extract company name (first mentioned entity before "to pay" or "settles")
    let company: string | undefined;
    const companyPatterns = [
      /"(.*?)"/, // Company in quotes
      /(\w[\w\s&.,]+?)\s+(to pay|agrees to|settles|ordered to)/i,
    ];

    for (const pattern of companyPatterns) {
      const match = plainText.match(pattern);
      if (match && match[1]) {
        company = match[1].trim();
        break;
      }
    }

    // Generate ID
    const urlHash =
      linkUrl.split("/").pop()?.split("?")[0] || `ftc-${Date.now()}`;
    const id = `FTC_ACTION_${urlHash}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    actions.push({
      id,
      date: date || new Date(),
      title,
      url: linkUrl,
      company,
      settlementAmount,
      violationTypes,
      summary: plainText.substring(0, 2000),
      actionType,
      rawHtml: itemHtml,
    });
  }

  console.log(`  ✅ Extracted ${actions.length} press releases`);
  return actions;
}

// ============================================================
// Ingestion: Data Breaches
// ============================================================

async function ingestDataBreaches(
  sourceSystemId: string,
  breaches: FTCDataBreach[],
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  console.log(`\n🔄 Ingesting ${breaches.length} data breach records...`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 50;

  for (let i = 0; i < breaches.length; i += batchSize) {
    const batch = breaches.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (breach) => {
        try {
          const result = await prisma.fTCDataBreach.upsert({
            where: { url: breach.url },
            update: {
              company: breach.company,
              industry: breach.industry,
              breachDate: breach.breachDate,
              notificationDate: breach.notificationDate,
              recordsAffected: breach.recordsAffected,
              dataTypesExposed: breach.dataTypesExposed,
              settlementAmount: breach.settlementAmount,
              url: breach.url,
              updatedAt: new Date(),
            },
            create: {
              sourceSystemId,
              company: breach.company,
              industry: breach.industry,
              breachDate: breach.breachDate,
              notificationDate: breach.notificationDate,
              recordsAffected: breach.recordsAffected,
              dataTypesExposed: breach.dataTypesExposed,
              settlementAmount: breach.settlementAmount,
              url: breach.url,
            },
          });

          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`  ❌ Error ingesting ${breach.id}:`, error);
          failed++;
        }
      }),
    );

    const processed = Math.min(i + batchSize, breaches.length);
    console.log(
      `   Progress: ${processed}/${breaches.length} — ` +
        `Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`,
    );

    if (i + batchSize < breaches.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { inserted, updated, skipped, failed };
}

// ============================================================
// Ingestion: Consumer Protection Actions
// ============================================================

async function ingestConsumerProtectionActions(
  sourceSystemId: string,
  actions: FTCAction[],
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  console.log(
    `\n🔄 Ingesting ${actions.length} consumer protection actions...`,
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 50;

  for (let i = 0; i < actions.length; i += batchSize) {
    const batch = actions.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (action) => {
        try {
          const result = await prisma.fTCConsumerProtectionAction.upsert({
            where: { url: action.url },
            update: {
              date: action.date,
              respondentName: action.company || action.title,
              actionType: action.actionType,
              summary: action.summary,
              settlementAmount: action.settlementAmount,
              url: action.url,
              updatedAt: new Date(),
            },
            create: {
              sourceSystemId,
              date: action.date,
              respondentName: action.company || action.title,
              actionType: action.actionType,
              summary: action.summary,
              settlementAmount: action.settlementAmount,
              url: action.url,
            },
          });

          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          console.error(`  ❌ Error ingesting ${action.id}:`, error);
          failed++;
        }
      }),
    );

    const processed = Math.min(i + batchSize, actions.length);
    console.log(
      `   Progress: ${processed}/${actions.length} — ` +
        `Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`,
    );

    if (i + batchSize < actions.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { inserted, updated, skipped, failed };
}

// ============================================================
// Update Source System Status
// ============================================================

async function updateSourceSystemStatus(
  sourceSystemId: string,
  stats: { inserted: number; updated: number; skipped: number; failed: number },
  rowsRead: number,
): Promise<void> {
  await prisma.sourceSystem.update({
    where: { id: sourceSystemId },
    data: {
      lastAttemptedSyncAt: new Date(),
      lastSuccessfulSyncAt: stats.failed === 0 ? new Date() : undefined,
      lastError:
        stats.failed > 0 ? `${stats.failed} records failed to process` : null,
    },
  });

  await prisma.ingestionRun.create({
    data: {
      sourceSystemId,
      runType: "full",
      status: stats.failed > 0 ? "partial_success" : "completed",
      rowsRead,
      rowsInserted: stats.inserted,
      rowsUpdated: stats.updated,
      rowsSkipped: stats.skipped,
      rowsFailed: stats.failed,
      bytesDownloaded: BigInt(rowsRead * 2048), // Estimated ~2KB per record
    },
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const maxRowsArg = args.find(
    (a) => a.startsWith("--max-rows=") || a.startsWith("--max-rows"),
  );
  const maxRows = maxRowsArg
    ? parseInt(
        (maxRowsArg as string).split("=")[1] ||
          args[args.indexOf(maxRowsArg) + 1] ||
          "0",
        10,
      )
    : null;
  const fullMode = args.includes("--full");

  console.log("═".repeat(70));
  console.log("🛡️  FTC Data Breach & Consumer Protection Actions Ingestion");
  console.log("═".repeat(70));
  console.log(
    `Mode: ${fullMode ? "Full" : maxRows ? `Test (${maxRows} rows)` : "Full (no limit)"}`,
  );
  console.log("");

  const startTime = Date.now();

  try {
    // Ensure source systems exist
    const { breachId, actionId } = await ensureSourceSystem();

    // Scrape data
    const breaches = await scrapePrivacyEnforcement(maxRows);
    const actions = await scrapePressReleases(maxRows);

    // Filter actions to only privacy/security related for breach table
    const privacyActions = actions.filter((a) =>
      a.violationTypes.some((v) =>
        [
          "data breach",
          "privacy",
          "security",
          "cyber",
          "hack",
          "identity theft",
        ].includes(v),
      ),
    );

    // Convert privacy actions to breach format
    const actionBreaches: FTCDataBreach[] = privacyActions.map((action) => ({
      id: action.id.replace("ACTION", "BREACH"),
      company: action.company || action.title.substring(0, 100),
      industry: undefined,
      breachDate: action.date,
      notificationDate: action.date,
      recordsAffected: undefined,
      dataTypesExposed: action.violationTypes,
      settlementAmount: action.settlementAmount,
      summary: action.summary,
      url: action.url,
    }));

    // Combine breaches
    const allBreaches = [...breaches, ...actionBreaches];

    // Remove duplicates by URL
    const seenUrls = new Set<string>();
    const uniqueBreaches = allBreaches.filter((b) => {
      if (seenUrls.has(b.url)) return false;
      seenUrls.add(b.url);
      return true;
    });

    // Ingest breaches
    const breachStats = await ingestDataBreaches(breachId, uniqueBreaches);
    await updateSourceSystemStatus(
      breachId,
      breachStats,
      uniqueBreaches.length,
    );

    // Ingest consumer protection actions (all, not just privacy)
    const actionStats = await ingestConsumerProtectionActions(
      actionId,
      actions,
    );
    await updateSourceSystemStatus(actionId, actionStats, actions.length);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("");
    console.log("═".repeat(70));
    console.log("✅ FTC Data Breach & Consumer Protection Ingestion Complete");
    console.log("═".repeat(70));
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log("");
    console.log("📊 Data Breach Records:");
    console.log(`   ➕ Inserted: ${breachStats.inserted}`);
    console.log(`   🔄 Updated: ${breachStats.updated}`);
    console.log(`   ❌ Failed: ${breachStats.failed}`);
    console.log("");
    console.log("📊 Consumer Protection Actions:");
    console.log(`   ➕ Inserted: ${actionStats.inserted}`);
    console.log(`   🔄 Updated: ${actionStats.updated}`);
    console.log(`   ❌ Failed: ${actionStats.failed}`);
    console.log("");
    console.log("ℹ️  Note: FTC's Consumer Sentinel Network raw data requires");
    console.log(
      "   law enforcement access. This script scrapes publicly available",
    );
    console.log("   enforcement actions and settlements from ftc.gov.");
    console.log("");
  } catch (error) {
    console.error("\n❌ Ingestion failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
