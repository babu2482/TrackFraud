/**
 * Sentry Edge Configuration for Next.js
 *
 * This file configures Sentry for Edge runtime error tracking.
 * Used by API routes and middleware that run on the Edge.
 *
 * See: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,

    environment: process.env.NODE_ENV || "development",

    // Tracing sample rate for edge functions
    tracesSampleRate: 0.1,
  });
}