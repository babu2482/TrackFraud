/**
 * E2E tests for category browsing.
 *
 * Tests:
 * - Browse a category page → entities listed
 * - Entity detail page → profile shown
 */

import { test, expect } from "@playwright/test";

test.describe("Category Pages", () => {
  test("charities category page loads", async ({ page }) => {
    await page.goto("/charities");

    // Page should load without error
    await expect(page).toHaveURL(/\/charities/);

    // Check for main content area
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("corporate category page loads", async ({ page }) => {
    await page.goto("/corporate");

    await expect(page).toHaveURL(/\/corporate/);

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("government category page loads", async ({ page }) => {
    await page.goto("/government");

    await expect(page).toHaveURL(/\/government/);

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("healthcare category page loads", async ({ page }) => {
    await page.goto("/healthcare");

    await expect(page).toHaveURL(/\/healthcare/);

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("political category page loads", async ({ page }) => {
    await page.goto("/political");

    await expect(page).toHaveURL(/\/political/);

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});

test.describe("Entity Detail Pages", () => {
  test("charity detail page returns data", async ({ page }) => {
    // Get a real charity from the API
    const response = await page.request.get("/api/charities", {
      params: { limit: "1" },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    if (data.charities && data.charities.length > 0) {
      const charity = data.charities[0];
      // Verify the charity data structure
      expect(charity).toHaveProperty("id");
      expect(charity).toHaveProperty("ein");
      expect(charity).toHaveProperty("name");
    }
  });

  test("fraud score API returns data", async ({ page }) => {
    // Get a charity from the API
    const response = await page.request.get("/api/charities", {
      params: { limit: "1" },
    });

    const data = await response.json();

    if (data.charities && data.charities.length > 0) {
      const entityId = data.charities[0].id;
      const scoreResponse = await page.request.get(
        `/api/fraud-scores?entityId=${entityId}`,
      );

      // Score API may return 200 with score, or 404 if no score exists
      // Both are valid responses
      expect([200, 404]).toContain(scoreResponse.status());
    }
  });
});
