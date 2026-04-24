/**
 * Environment variable validation using Zod.
 *
 * Provides typesafe access to environment variables and fails fast
 * at module load time if required variables are missing or invalid.
 *
 * Usage:
 *   import { env } from './lib/env';
 *   const url = env.DATABASE_URL; // TypeScript knows this is a string
 */

import { z } from 'zod';

// ─── Schema Definitions ───────────────────────────────────────────────

const envSchema = z.object({
  // ── Required: Core Infrastructure ──────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),

  // ── Required: Search ───────────────────────────────────────────────
  MEILISEARCH_URL: z.string().url().min(1, 'MEILISEARCH_URL is required'),
  MEILISEARCH_API_KEY: z.string().min(1, 'MEILISEARCH_API_KEY is required'),

  // ── Required: Application ──────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.string().url().min(1, 'NEXT_PUBLIC_APP_URL is required'),

  // ── Optional: Redis (rate limiting, caching) ───────────────────────
  REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),
  REDIS_PORT: z.coerce.number().optional().default(6379),

  // ── Optional: API Keys (enhanced data sources) ─────────────────────
  CONGRESS_API_KEY: z.string().optional(),
  PROPUBLICA_API_KEY: z.string().optional(),
  PROPUBLICA_NONPROFITS_API_KEY: z.string().optional(),
  OPENSECRETS_API_KEY: z.string().optional(),
  SEC_EDGAR_API_KEY: z.string().optional(),
  EPA_ECHO_API_KEY: z.string().optional(),
  FDA_OPENFDA_API_KEY: z.string().optional(),

  // ── Optional: Security ─────────────────────────────────────────────
  JWT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),

  // ── Optional: Sentry ───────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(0.1),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional().default(0.1),

  // ── Optional: Rate Limiting ────────────────────────────────────────
  RATE_LIMIT_STRICT: z.coerce.number().positive().optional().default(10),
  RATE_LIMIT_STANDARD: z.coerce.number().positive().optional().default(60),
  RATE_LIMIT_RELAXED: z.coerce.number().positive().optional().default(120),
  RATE_LIMIT_WINDOW: z.coerce.number().positive().optional().default(60),

  // ── Optional: Logging ──────────────────────────────────────────────
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional().default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional().default('json'),

  // ── Optional: CORS ─────────────────────────────────────────────────
  CORS_ORIGINS: z.string().optional().default('http://localhost:3001'),

  // ── Optional: Feature Flags ────────────────────────────────────────
  NEXT_PUBLIC_ENABLE_SEARCH: z.string().optional().default('true'),
  NEXT_PUBLIC_ENABLE_FRAUD_SCORING: z.string().optional().default('true'),
});

// ─── Validate and Export ──────────────────────────────────────────────

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `  - ${path}: ${issue.message}`;
      });
      // eslint-disable-next-line no-console
      console.error(
        '\n❌ Environment validation failed:\n' +
          messages.join('\n') +
          '\n\nPlease check your .env file and ensure all required variables are set.\n'
      );
      process.exit(1);
    }
    throw error;
  }
}

const env = validateEnv();

// ─── Helper: Check if production ──────────────────────────────────────

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

// ─── Helper: Feature flags ────────────────────────────────────────────

export const features = {
  search: env.NEXT_PUBLIC_ENABLE_SEARCH === 'true',
  fraudScoring: env.NEXT_PUBLIC_ENABLE_FRAUD_SCORING === 'true',
};

// ─── Helper: Rate limit config ────────────────────────────────────────

export const rateLimitConfig = {
  strict: env.RATE_LIMIT_STRICT,
  standard: env.RATE_LIMIT_STANDARD,
  relaxed: env.RATE_LIMIT_RELAXED,
  window: env.RATE_LIMIT_WINDOW,
};

// ─── Export validated env ─────────────────────────────────────────────

export { env };
export default env;