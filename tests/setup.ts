/**
 * Vitest global setup file.
 * Runs before all tests to configure the test environment.
 */

import { beforeAll, afterAll } from 'vitest';

// Set test environment
beforeAll(() => {
  (process.env as any).NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://trackfraud:trackfraud_dev_password@localhost:5432/trackfraud_test';
  process.env.MEILISEARCH_URL = process.env.MEILISEARCH_URL || 'http://localhost:7700';
  process.env.MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || 'test-key';
  process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
});

afterAll(() => {
  // Cleanup if needed
});
