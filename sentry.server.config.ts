/**
 * Sentry Server Configuration for Next.js
 *
 * This file configures Sentry for server-side error tracking.
 * It is automatically loaded by the Next.js server.
 *
 * See: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,

    // Adjust this value in production
    environment: process.env.NODE_ENV || "development",

    // Tracing sample rate for performance monitoring
    tracesSampleRate: 0.1,

    // Enable source map generation
    // This is typically set via sentry cli during build
    // autoInstrumentServerSourceMaps: true,
  });
}