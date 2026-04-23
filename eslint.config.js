import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/",
      ".next/",
      "coverage/",
      "backend/",
      "prisma/migrations/",
      "scripts/backfill-irs-990-xml-years.ts",
      "lib/fraud-scoring/signal-detectors.ts",
      "lib/fraud-scoring/scorer.ts",
      "lib/search.ts",
      "lib/government-read.ts",
      "lib/logger.ts",
      "app/admin/page.tsx",
      "lib/usaspending.ts",
    ],
  },
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
    },
  }
);