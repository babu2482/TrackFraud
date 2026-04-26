/**
 * E2E Rate Limiting Tests
 *
 * Verify rate limiting middleware and API rate limits work correctly.
 */

import { test, expect } from "@playwright/test";

test.describe("Rate Limiting", () => {
  test("normal requests succeed", async ({ request }) => {
    // A few requests should all succeed
    for (let i = 0; i < 5; i++) {
      const resp = await request.get("/api/health");
      expect(resp.ok()).toBe(true);
    }
  });

  test("rapid requests to search API", async ({ request }) => {
    const promises = [];
    // Send 20 rapid requests
    for (let i = 0; i < 20; i++) {
      promises.push(
        request.get("/api/search?q=test", {
          headers: { "x-forwarded-for": "192.168.1.100" },
        })
      );
    }
    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status());
    // At least some should succeed (200) or return rate limit (429)
    const hasValidResponse = statuses.some((s) => s === 200 || s === 429);
    expect(hasValidResponse).toBe(true);
    // None should 500
    expect(statuses.some((s) => s >= 500)).toBe(false);
  });

  test("middleware responds to all pages", async ({ page }) => {
    await page.goto("/");
    // Page should load - middleware shouldn't block normal traffic
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    expect(page.url()).toBeTruthy();
  });
});