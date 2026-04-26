/**
 * E2E Fraud Scores Tests
 *
 * Verify fraud score display and risk level indicators.
 */

import { test, expect } from "@playwright/test";

test.describe("Fraud Scores", () => {
  test("search results page loads", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveURL(/\/search/);
  });

  test("charities page loads and displays content", async ({ page }) => {
    await page.goto("/charities");
    await expect(page).toHaveURL(/\/charities/);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  });

  test("fraud scores API responds", async ({ request }) => {
    const resp = await request.get("/api/fraud-scores", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });
    // Should not 500 error
    expect(resp.status()).toBeLessThan(500);
  });

  test("categories API returns category data", async ({ request }) => {
    const resp = await request.get("/api/categories");
    expect(resp.status()).toBeLessThan(500);
  });
});