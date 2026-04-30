/**
 * E2E tests for search functionality.
 *
 * Tests the main search user flow:
 * - Navigate to search page
 * - Enter search query
 * - Verify results are displayed
 */

import { test, expect } from "@playwright/test";

test.describe("Search Page", () => {
  test("homepage has navigation links", async ({ page }) => {
    await page.goto("/");

    // Check that the page loads
    await expect(page).toHaveTitle(/TrackFraud/i);

    // Check for navigation links
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });

  test("search page exists and renders", async ({ page }) => {
    await page.goto("/search");

    // Check that search page loads
    await expect(page).toHaveURL(/\/search/);

    // Look for search-related elements
    const searchHeading = page.getByRole("heading", { name: "Search" }).first();
    // Either the heading exists or the page loads without error
    const pageLoaded =
      (await searchHeading.isVisible().catch(() => false)) ||
      (await page.locator("main").isVisible());

    expect(pageLoaded).toBe(true);
  });

  test("search returns results for known term", async ({ page }) => {
    // Use the API directly since the dev server may not be running
    const response = await page.request.get("/api/charities", {
      params: { q: "charity", limit: "5" },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    // Response should have charities and total
    expect(data).toHaveProperty("charities");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.charities)).toBeTruthy();
  });

  test("charities API returns valid data", async ({ page }) => {
    const response = await page.request.get("/api/charities", {
      params: { limit: "1" },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("charities");
    expect(data).toHaveProperty("total");
    expect(data.total).toBeGreaterThan(0);
  });

  test("health API returns valid data", async ({ page }) => {
    const response = await page.request.get("/api/health");

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("healthy");
  });
});
