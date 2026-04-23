/**
 * Script to analyze which AI/ML dependencies are actually used in the codebase.
 * 
 * This helps determine if heavy packages like spacy, numpy, scikit-learn, pandas, nltk
 * can be removed from requirements.txt to reduce Docker image size and build time.
 * 
 * Usage: npx tsx scripts/analyze-ai-dependencies.ts
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const BACKEND_DIR = join(__dirname, "../backend");

const AI_ML_PACKAGES = [
  "spacy",
  "numpy",
  "scikit-learn",
  "pandas",
  "nltk",
  "tensorflow",
  "torch",
  "keras",
  "transformers",
  "langchain",
  "openai",
  "anthropic",
];

interface PackageUsage {
  package: string;
  used: boolean;
  files: string[];
  lines: number[];
}

function analyzeImports(): PackageUsage[] {
  const results: PackageUsage[] = AI_ML_PACKAGES.map(pkg => ({
    package: pkg,
    used: false,
    files: [],
    lines: [],
  }));

  function scanDirectory(dir: string): void {
    try {
      const files = readdirSync(dir, { recursive: true });
      
      for (const file of files) {
        const fullPath = join(dir, file as string);
        
        if (typeof file === "string" && file.endsWith(".py")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            
            for (const usage of results) {
              lines.forEach((line, index) => {
                if (
                  line.includes(`import ${usage.package}`) ||
                  line.includes(`from ${usage.package}`) ||
                  line.includes(require(usage.package))
                ) {
                  usage.used = true;
                  usage.files.push(fullPath.replace(__dirname + "/../", ""));
                  usage.lines.push(index + 1);
                }
              });
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  scanDirectory(BACKEND_DIR);
  return results;
}

function main(): void {
  console.log("=".repeat(60));
  console.log("AI/ML Dependency Usage Analysis");
  console.log("=".repeat(60));
  console.log();

  const results = analyzeImports();

  let unusedCount = 0;
  let usedCount = 0;

  for (const result of results) {
    const status = result.used ? "✅ USED" : "❌ UNUSED";
    const color = result.used ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";
    
    console.log(
      `${color}${status}${reset} ${result.package.padEnd(20)} - ${result.files.length} file(s)`
    );

    if (result.used) {
      usedCount++;
      for (let i = 0; i < result.files.length; i++) {
        console.log(
          `  → ${result.files[i]}:${result.lines[i]}`
        );
      }
    } else {
      unusedCount++;
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log(`Summary: ${usedCount} used, ${unusedCount} unused out of ${AI_ML_PACKAGES.length} packages`);
  console.log("=".repeat(60));
  console.log();

  if (unusedCount > 0) {
    console.log("Recommendation:");
    console.log("Consider removing unused packages from backend/requirements.txt:");
    for (const result of results) {
      if (!result.used) {
        console.log(`  - ${result.package}`);
      }
    }
  }
}

main();