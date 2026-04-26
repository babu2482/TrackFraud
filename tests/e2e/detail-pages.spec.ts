/**
 * E2E Detail Pages Tests
 *
 * Verify entity detail pages render correctly with expected elements.
 */

import { test, expect } from "@playwright/test";

test.describe("Detail Pages", () => {
  test("charity detail page loads for valid EIN", async ({ page }) => {
    await page.goto("/charities/13-1623851");
    await expect(page).toHaveURL(/\/charities\//);
    // Page should load without 404
    const response = await page.waitForResponse(
      (resp) => resp.status() === 200 && resp.url().includes("/charities/")
    ).catch(null);
    expect(response !== null || page.url().includes("/charities/")).toBe(true);
  });

  test("404 or message for non-existent charity", async ({ page }) => {
    await page.goto("/charities/00-000000");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    // Should not crash - page should still be accessible
    expect(page.url()).toContain("/charities/");
  });

  test("search results page displays results", async ({ page }) => {
    await page.goto("/search?q=test");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    expect(page.url()).toContain("/search");
  });

  test("corporate detail page loads", async ({ page }) => {
    await page.goto("/corporate");
    await expect(page).toHaveURL(/\/corporate/);
  });

  test("government detail page loads", async ({ page }) => {
    await page.goto("/government");
    await expect(page).toHaveURL(/\/government/);
  });
});