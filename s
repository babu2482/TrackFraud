/**
 * Sentry Client Configuration for Next.js
 *
 * This file configures Sentry for client-side error tracking.
 * It is automatically loaded by the Next.js client bundle.
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

    // Configure session replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Modify error event behavior
    beforeSend(event, hint) {
      // Ignore specific errors that are not actionable
      const error = hint.originalException;
      if (error && error.message === "ResizeObserver loop limit exceeded") {
        return null;
      }

      // Add custom tags
      event.tags = {
        ...event.tags,
        timestamp: new Date().toISOString(),
      };

      return event;
    },
  });
}