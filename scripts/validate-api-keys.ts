#!/usr/bin/env -S tsx
/**
 * API Key Configuration Validator
 *
 * Validates that all required API keys are properly configured in .env file.
 * Provides clear guidance on what's missing and how to obtain each key.
 *
 * Usage:
 *   npx tsx scripts/validate-api-keys.ts
 */

import "dotenv/config";

interface ApiKeyConfig {
  name: string;
  envVar: string;
  required: boolean;
  url: string;
  description: string;
}

const API_KEYS: ApiKeyConfig[] = [
  {
    name: "ProPublica Congress API",
    envVar: "PROPUBLICA_API_KEY",
    required: true,
    url: "https://projects.propublica.org/api-documentation/",
    description: "U.S. politician biographical data and contact information",
  },
  {
    name: "Congress.gov API",
    envVar: "CONGRESS_API_KEY",
    required: true,
    url: "https://congress.gov/help/api-keys",
    description: "Bills, votes, and member voting records from U.S. Congress",
  },
  {
    name: "Federal Register API",
    envVar: "FEDERAL_REGISTER_API_KEY",
    required: false,
    url: "https://www.federalregister.gov/api/v1/",
    description: "Federal Register documents and notices",
  },
];

function checkEnvVariable(envVar: string): {
  present: boolean;
  value?: string;
} {
  const value = process.env[envVar];
  return {
    present: !!value && value.trim().length > 0,
    value,
  };
}

async function main() {
  console.log("=".repeat(70));
  console.log("TrackFraud - API Key Configuration Validator");
  console.log("=".repeat(70));
  console.log();

  let missingRequired = 0;
  let presentCount = 0;
  let missingCount = 0;

  for (const config of API_KEYS) {
    const { present, value } = checkEnvVariable(config.envVar);

    if (present) {
      console.log(`✅ ${config.name}`);
      console.log(`   Environment Variable: ${config.envVar}=***`);
      console.log(`   Status: Configured ✓`);
      console.log();
      presentCount++;
    } else {
      const status = config.required
        ? "❌ MISSING (REQUIRED)"
        : "⚠️  Missing (optional)";
      console.log(`${status}`);
      console.log(`   Environment Variable: ${config.envVar}=(empty)`);
      console.log(`   Description: ${config.description}`);
      console.log(`   Get key from: ${config.url}`);

      if (config.required) {
        missingRequired++;
      }
      missingCount++;
      console.log();
    }
  }

  console.log("-".repeat(70));
  console.log("Summary");
  console.log("-".repeat(70));
  console.log(`Total API Keys: ${API_KEYS.length}`);
  console.log(`Configured: ${presentCount}/${API_KEYS.length}`);
  console.log(`Missing: ${missingCount}/${API_KEYS.length}`);

  if (missingRequired > 0) {
    console.log();
    console.log("⚠️  ACTION REQUIRED");
    console.log("-".repeat(70));
    console.log(
      `${missingRequired} required API key(s) are missing. The platform will operate`,
    );
    console.log("in limited mode until these keys are configured.");

    console.log();
    console.log("Quick Setup:");
    console.log("1. Copy the example environment file:");
    console.log("   cp .env.example .env");
    console.log();
    console.log("2. Edit .env and fill in your API keys:");
    console.log("   nano .env  # or use your preferred editor");
    console.log();
    console.log("3. Re-run this validator to confirm configuration:");
    console.log("   npx tsx scripts/validate-api-keys.ts");
    console.log();

    process.exit(1);
  } else {
    console.log();
    console.log("✅ All required API keys are configured!");
    console.log();
    console.log("Next steps:");
    console.log("1. Run data ingestion scripts to populate the database:");
    console.log("   npx tsx scripts/ingest-propublica-politicians.ts");
    console.log("   npx tsx scripts/ingest-congress-api.ts --bills-only");
    console.log();
    console.log("2. Check ingestion run status in database:");
    console.log(
      "   npx prisma db execute --file scripts/query_source_system.sql",
    );
    console.log();

    process.exit(0);
  }
}

main().catch((error) => {
  console.error("Validation failed:", error);
  process.exit(1);
});
