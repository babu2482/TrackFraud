import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for TrackFraud E2E tests.
 *
 * Run with: npx playwright test
 * Run with UI: npx playwright test --ui
 * Run specific file: npx playwright test tests/e2e/search.spec.ts
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/._*"], // Ignore macOS resource fork files
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
  },
});
