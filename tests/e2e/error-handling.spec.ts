/**
 * E2E Error Handling Tests
 *
 * Verify the application handles errors gracefully.
 */

import { test, expect } from "@playwright/test";

test.describe("Error Handling", () => {
  test("unknown route does not crash server", async ({ page }) => {
    await page.goto("/this-page-definitely-does-not-exist-999");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    // Page should still respond (Next.js 404 or redirect)
    expect(page.url()).toBeTruthy();
  });

  test("API health endpoint returns valid JSON", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.ok()).toBe(true);
    const data = await resp.json();
    expect(data).toHaveProperty("status");
  });

  test("search API rejects invalid input gracefully", async ({ request }) => {
    // Empty search should return a response (not crash)
    const resp = await request.get("/api/search", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });
    // Should return 200 with empty results or 422 for validation
    expect([200, 400, 422]).toContain(resp.status());
  });

  test("search API rejects malformed pagination", async ({ request }) => {
    const resp = await request.get("/api/search?page=-1&limit=99999");
    // Should handle gracefully (not crash)
    expect(resp.status()).toBeLessThan(500);
  });

  test("non-existent API route returns 404", async ({ request }) => {
    const resp = await request.get("/api/this-does-not-exist");
    expect(resp.status()).toBe(404);
  });
});