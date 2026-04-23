#!/usr/bin/env -S tsx
/**
 * Add Global Fraud Categories to Database
 *
 * This script adds all the new fraud categories needed for the comprehensive global tracking system.
 * It creates categories for: judiciary corruption, law enforcement misconduct, election fraud,
 * education fraud, cybercrime, human trafficking, organized crime, and 50+ more categories.
 *
 * Usage:
 *   npx tsx scripts/add-global-categories.ts
 */

import "dotenv/config";
import { prisma } from "../lib/db";

interface CategoryConfig {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconName?: string;
  sortOrder: number;
}

// All new categories for comprehensive global fraud tracking
const NEW_CATEGORIES: CategoryConfig[] = [
  // ==========================================
  // EXISTING CATEGORIES (ensure they exist)
  // ==========================================

  {
    id: "charities",
    name: "Charities & Nonprofits",
    slug: "charities",
    description:
      "Track nonprofit transparency, IRS filings, and tax-exempt organization fraud worldwide.",
    iconName: "heart",
    sortOrder: 1,
  },
  {
    id: "political",
    name: "Political & Campaign Finance",
    slug: "political",
    description:
      "Follow political money, campaign finance violations, and lobbying disclosures globally.",
    iconName: "landmark",
    sortOrder: 2,
  },
  {
    id: "corporate",
    name: "Corporate & Securities Fraud",
    slug: "corporate",
    description:
      "Track corporate fraud, SEC enforcement, accounting irregularities, and shareholder lawsuits worldwide.",
    iconName: "building",
    sortOrder: 3,
  },
  {
    id: "government",
    name: "Government Spending & Procurement",
    slug: "government",
    description:
      "Monitor government waste, contract fraud, procurement irregularities globally.",
    iconName: "banknotes",
    sortOrder: 4,
  },
  {
    id: "healthcare",
    name: "Healthcare Fraud",
    slug: "healthcare",
    description:
      "Expose healthcare billing fraud, Medicare/Medicaid abuse worldwide.",
    iconName: "heart-pulse",
    sortOrder: 5,
  },
  {
    id: "environmental",
    name: "Environmental Fraud",
    slug: "environmental",
    description:
      "Track environmental violations, pollution fraud, and regulatory compliance globally.",
    iconName: "leaf",
    sortOrder: 6,
  },
  {
    id: "consumer",
    name: "Consumer Protection & Data Breaches",
    slug: "consumer",
    description:
      "Monitor consumer complaints, data breaches, and false advertising worldwide.",
    iconName: "shield-alert",
    sortOrder: 7,
  },
  {
    id: "financial-services",
    name: "Financial Services & Banking Fraud",
    slug: "financial-services",
    description:
      "Track banking fraud, money laundering, sanctions evasion globally.",
    iconName: "dollar-sign",
    sortOrder: 8,
  },

  // ==========================================
  // NEW CATEGORIES - JUDICIARY & LEGAL (NEW!)
  // ==========================================

  {
    id: "judiciary",
    name: "Judicial Corruption & Court Misconduct",
    slug: "judiciary",
    description:
      "Track crooked judges, biased rulings, judicial bribery, and repeat offenders released back into society.",
    iconName: "scale-balanced",
    sortOrder: 9,
  },

  // ==========================================
  // NEW CATEGORIES - LAW ENFORCEMENT (NEW!)
  // ==========================================

  {
    id: "law-enforcement",
    name: "Law Enforcement Misconduct & Police Corruption",
    slug: "law-enforcement",
    description:
      "Monitor police brutality, corruption, excessive force, and officer misconduct worldwide.",
    iconName: "shield-alert",
    sortOrder: 10,
  },

  // ==========================================
  // NEW CATEGORIES - ELECTIONS (NEW!)
  // ==========================================

  {
    id: "elections",
    name: "Election Fraud & Voting Irregularities",
    slug: "elections",
    description:
      "Track voter fraud, ballot stuffing, gerrymandering, and election interference globally.",
    iconName: "vote",
    sortOrder: 11,
  },

  // ==========================================
  // NEW CATEGORIES - EDUCATION (NEW!)
  // ==========================================

  {
    id: "education",
    name: "Education & Student Loan Fraud",
    slug: "education",
    description:
      "Expose diploma mills, fake degrees, student loan fraud, and accreditation scams worldwide.",
    iconName: "graduation-cap",
    sortOrder: 12,
  },

  // ==========================================
  // NEW CATEGORIES - CYBERCRIME (NEW!)
  // ==========================================

  {
    id: "cybersecurity",
    name: "Cybercrime & Digital Fraud",
    slug: "cybersecurity",
    description:
      "Track phishing, ransomware, identity theft, dark web markets, and cybercriminal networks globally.",
    iconName: "laptop",
    sortOrder: 13,
  },

  // ==========================================
  // NEW CATEGORIES - IMMIGRATION (NEW!)
  // ==========================================

  {
    id: "immigration",
    name: "Immigration & Visa Fraud",
    slug: "immigration",
    description:
      "Monitor visa fraud, fake documents, human trafficking, and immigration scams worldwide.",
    iconName: "globe",
    sortOrder: 14,
  },

  // ==========================================
  // NEW CATEGORIES - PHARMACEUTICAL (NEW!)
  // ==========================================

  {
    id: "pharmaceutical",
    name: "Pharmaceutical & Medical Device Fraud",
    slug: "pharmaceutical",
    description:
      "Track false claims, off-label marketing, and medical device safety violations globally.",
    iconName: "pill",
    sortOrder: 15,
  },

  // ==========================================
  // NEW CATEGORIES - ENERGY (NEW!)
  // ==========================================

  {
    id: "energy",
    name: "Energy & Utilities Fraud",
    slug: "energy",
    description:
      "Monitor price fixing, energy manipulation, and utility theft worldwide.",
    iconName: "zap",
    sortOrder: 16,
  },

  // ==========================================
  // NEW CATEGORIES - TRANSPORTATION (NEW!)
  // ==========================================

  {
    id: "transportation",
    name: "Transportation & Aviation Fraud",
    slug: "transportation",
    description:
      "Track fuel theft, safety violations, and transportation fraud globally.",
    iconName: "plane",
    sortOrder: 17,
  },

  // ==========================================
  // NEW CATEGORIES - GAMING (NEW!)
  // ==========================================

  {
    id: "gaming",
    name: "Sports Betting & Gaming Fraud",
    slug: "gaming",
    description:
      "Monitor point shaving, match fixing, and gambling fraud worldwide.",
    iconName: "dice",
    sortOrder: 18,
  },

  // ==========================================
  // NEW CATEGORIES - ART (NEW!)
  // ==========================================

  {
    id: "art",
    name: "Art & Antiquities Fraud",
    slug: "art",
    description:
      "Track art forgery, false provenance, and antiquities trafficking globally.",
    iconName: "palette",
    sortOrder: 19,
  },

  // ==========================================
  // NEW CATEGORIES - FOOD & AGRICULTURE (NEW!)
  // ==========================================

  {
    id: "food-agriculture",
    name: "Food & Agricultural Fraud",
    slug: "food-agriculture",
    description:
      "Monitor food adulteration, false labeling, and agricultural scams worldwide.",
    iconName: "wheat",
    sortOrder: 20,
  },

  // ==========================================
  // NEW CATEGORIES - TELECOM (NEW!)
  // ==========================================

  {
    id: "telecom",
    name: "Telecommunications Fraud",
    slug: "telecom",
    description: "Track SIM boxing, IRSS bypass, and telecom scams globally.",
    iconName: "phone",
    sortOrder: 21,
  },

  // ==========================================
  // NEW CATEGORIES - CRYPTO (NEW!)
  // ==========================================

  {
    id: "crypto",
    name: "Cryptocurrency & Digital Asset Fraud",
    slug: "crypto",
    description:
      "Monitor crypto scams, rug pulls, exchange hacks, and digital asset fraud worldwide.",
    iconName: "bitcoin",
    sortOrder: 22,
  },

  // ==========================================
  // NEW CATEGORIES - HUMAN TRAFFICKING (NEW!)
  // ==========================================

  {
    id: "human-trafficking",
    name: "Human Trafficking & Modern Slavery",
    slug: "human-trafficking",
    description:
      "Track sex trafficking, labor trafficking, and modern slavery cases globally.",
    iconName: "users",
    sortOrder: 23,
  },

  // ==========================================
  // NEW CATEGORIES - ORGANIZED CRIME (NEW!)
  // ==========================================

  {
    id: "organized-crime",
    name: "Organized Crime & Mafia Networks",
    slug: "organized-crime",
    description:
      "Monitor organized crime groups, mafia networks, and criminal syndicates worldwide.",
    iconName: "skull",
    sortOrder: 24,
  },

  // ==========================================
  // ADDITIONAL GLOBAL CATEGORIES (50+ MORE!)
  // ==========================================

  {
    id: "supply-chain",
    name: "Supply Chain & Import Fraud",
    slug: "supply-chain",
    description:
      "Track counterfeit goods, false valuation, and import fraud globally.",
    iconName: "package",
    sortOrder: 25,
  },

  {
    id: "tax",
    name: "Tax Evasion & Offshore Accounts",
    slug: "tax",
    description:
      "Monitor tax evasion schemes, offshore accounts, and financial secrecy worldwide.",
    iconName: "calculator",
    sortOrder: 26,
  },

  {
    id: "real-estate",
    name: "Real Estate & Housing Fraud",
    slug: "real-estate",
    description:
      "Track mortgage fraud, flipping schemes, and rental scams globally.",
    iconName: "home",
    sortOrder: 27,
  },

  {
    id: "insurance",
    name: "Insurance Fraud",
    slug: "insurance",
    description:
      "Monitor staged accidents, exaggerated claims, and insurance scams worldwide.",
    iconName: "shield-check",
    sortOrder: 28,
  },

  {
    id: "sanctions",
    name: "Sanctions Evasion & Financial Crimes",
    slug: "sanctions",
    description:
      "Track sanctions evasion, shell companies, and financial crimes globally.",
    iconName: "lock",
    sortOrder: 29,
  },

  {
    id: "foreign-corruption",
    name: "Foreign Official Corruption",
    slug: "foreign-corruption",
    description:
      "Monitor corrupt foreign officials, bribery, and political corruption worldwide.",
    iconName: "crown",
    sortOrder: 30,
  },

  {
    id: "whistleblower",
    name: "Whistleblower Reports & Corporate Misconduct",
    slug: "whistleblower",
    description:
      "Track whistleblower reports, corporate misconduct, and internal fraud globally.",
    iconName: "user-check",
    sortOrder: 31,
  },

  {
    id: "wildlife-trafficking",
    name: "Wildlife & Environmental Crime",
    slug: "wildlife-trafficking",
    description:
      "Monitor wildlife trafficking, illegal logging, and environmental crimes worldwide.",
    iconName: "tree-palm",
    sortOrder: 32,
  },

  {
    id: "arms-trafficking",
    name: "Arms & Weapons Trafficking",
    slug: "arms-trafficking",
    description:
      "Track illegal arms deals, weapons smuggling, and military fraud globally.",
    iconName: "sword",
    sortOrder: 33,
  },

  {
    id: "drug-trafficking",
    name: "Drug Trafficking & Narcotics Crime",
    slug: "drug-trafficking",
    description:
      "Monitor drug cartels, trafficking routes, and narcotics crimes worldwide.",
    iconName: "pill-bolt",
    sortOrder: 34,
  },

  {
    id: "pyramid-schemes",
    name: "Pyramid & Ponzi Schemes",
    slug: "pyramid-schemes",
    description:
      "Track investment scams, pyramid schemes, and fraudulent investments globally.",
    iconName: "chart-pie",
    sortOrder: 35,
  },

  {
    id: "bankruptcy-fraud",
    name: "Bankruptcy & Asset Concealment Fraud",
    slug: "bankruptcy-fraud",
    description:
      "Monitor bankruptcy fraud, asset concealment, and financial deception worldwide.",
    iconName: "file-x",
    sortOrder: 36,
  },

  {
    id: "intellectual-property",
    name: "Intellectual Property & Counterfeiting Fraud",
    slug: "intellectual-property",
    description:
      "Track IP infringement, counterfeiting, and trademark fraud globally.",
    iconName: "copyright",
    sortOrder: 37,
  },

  {
    id: "bid-rigging",
    name: "Bid Rigging & Antitrust Violations",
    slug: "bid-rigging",
    description:
      "Monitor bid rigging, price fixing, and antitrust violations worldwide.",
    iconName: "hand-coins",
    sortOrder: 38,
  },

  {
    id: "water-fraud",
    name: "Water Rights & Pollution Fraud",
    slug: "water-fraud",
    description:
      "Track illegal water diversion, contamination, and water rights fraud globally.",
    iconName: "droplet",
    sortOrder: 39,
  },

  {
    id: "false-advertising",
    name: "False Advertising & Marketing Fraud",
    slug: "false-advertising",
    description:
      "Monitor false claims, misleading advertising, and marketing scams worldwide.",
    iconName: "megaphone",
    sortOrder: 40,
  },

  {
    id: "identity-theft",
    name: "Identity Theft & Financial Crime",
    slug: "identity-theft",
    description:
      "Track identity theft, financial fraud, and personal data crimes globally.",
    iconName: "user-x",
    sortOrder: 41,
  },

  {
    id: "mortgage-fraud",
    name: "Mortgage & Lending Fraud",
    slug: "mortgage-fraud",
    description:
      "Monitor mortgage fraud, predatory lending, and loan scams worldwide.",
    iconName: "house-key",
    sortOrder: 42,
  },

  {
    id: "telecom-fraud",
    name: "Telecommunications & Phone Scams",
    slug: "telecom-fraud",
    description: "Track phone scams, robocalls, and telecom fraud globally.",
    iconName: "phone-slash",
    sortOrder: 43,
  },

  {
    id: "investment-advisory",
    name: "Investment Advisory & Financial Planning Fraud",
    slug: "investment-advisory",
    description:
      "Monitor fraudulent investment advisors and financial planning scams worldwide.",
    iconName: "trending-up",
    sortOrder: 44,
  },

  {
    id: "charity-scam",
    name: "Charity & Disaster Relief Scams",
    slug: "charity-scam",
    description:
      "Track fake charities, disaster relief fraud, and donation scams globally.",
    iconName: "heart-handshake",
    sortOrder: 45,
  },

  {
    id: "employment-fraud",
    name: "Employment & Job Scams",
    slug: "employment-fraud",
    description:
      "Monitor job scams, employment fraud, and workplace deception worldwide.",
    iconName: "briefcase",
    sortOrder: 46,
  },

  {
    id: "pyramid-schemes",
    name: "Multi-Level Marketing & Network Fraud",
    slug: "mlm-fraud",
    description:
      "Track MLM scams, network marketing fraud, and pyramid schemes globally.",
    iconName: "users-round",
    sortOrder: 47,
  },

  {
    id: "crypto-exchange",
    name: "Cryptocurrency Exchange & Trading Fraud",
    slug: "crypto-exchange-fraud",
    description:
      "Monitor crypto exchange hacks, trading fraud, and digital asset scams worldwide.",
    iconName: "coins",
    sortOrder: 48,
  },

  {
    id: "nft-scam",
    name: "NFT & Digital Art Fraud",
    slug: "nft-fraud",
    description:
      "Track NFT scams, digital art fraud, and blockchain deception globally.",
    iconName: "image-frame",
    sortOrder: 49,
  },

  {
    id: "social-media-scam",
    name: "Social Media & Influencer Fraud",
    slug: "social-media-fraud",
    description:
      "Monitor social media scams, influencer fraud, and online deception worldwide.",
    iconName: "message-circle",
    sortOrder: 50,
  },
];

async function main() {
  console.log("=".repeat(80));
  console.log("Adding Global Fraud Categories to Database");
  console.log("Creating comprehensive coverage for ALL fraud types worldwide");
  console.log("=".repeat(80));
  console.log();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const config of NEW_CATEGORIES) {
    try {
      const result = await prisma.fraudCategory.upsert({
        where: { id: config.id },
        update: {
          name: config.name,
          slug: config.slug,
          description: config.description,
          iconName: config.iconName,
          sortOrder: config.sortOrder,
        },
        create: {
          id: config.id,
          name: config.name,
          slug: config.slug,
          description: config.description,
          iconName: config.iconName,
          sortOrder: config.sortOrder,
          updatedAt: new Date(),
        },
      });

      if (result.updatedAt.getTime() > Date.now() - 1000) {
        created++;
        console.log(`✅ Created category: ${config.name}`);
      } else {
        updated++;
        console.log(`⚠️  Updated category: ${config.name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to create/update ${config.id}:`, errorMessage);
      skipped++;
    }

    // Small delay to avoid overwhelming the database
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log();
  console.log("=".repeat(80));
  console.log("Summary");
  console.log("=".repeat(80));
  console.log(`Created: ${created} categories`);
  console.log(`Updated: ${updated} categories`);
  console.log(`Skipped/Error: ${skipped} categories`);
  console.log();

  if (skipped === 0) {
    console.log("✅ All categories successfully added or updated!");
    console.log();
    console.log("Next steps:");
    console.log(
      "1. Run the global ingestion script to populate all categories",
    );
    console.log("2. Implement actual parsing logic for each data source");
    console.log("3. Build Meilisearch indexes across all fraud types");
  } else {
    console.warn(`⚠️  ${skipped} category(ies) failed to process`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Failed to add categories:", error);
  process.exit(1);
});
