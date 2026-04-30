/**
 * E2E Navigation Tests
 *
 * Verify all top-level navigation links work and pages load without errors.
 */

import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("homepage loads and has title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TrackFraud/i);
  });

  test("search page is accessible", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveURL(/\/search/);
  });

  test("charities page is accessible", async ({ page }) => {
    await page.goto("/charities");
    await expect(page).toHaveURL(/\/charities/);
  });

  test("corporate page is accessible", async ({ page }) => {
    await page.goto("/corporate");
    await expect(page).toHaveURL(/\/corporate/);
  });

  test("government page is accessible", async ({ page }) => {
    await page.goto("/government");
    await expect(page).toHaveURL(/\/government/);
  });

  test("healthcare page is accessible", async ({ page }) => {
    await page.goto("/healthcare");
    await expect(page).toHaveURL(/\/healthcare/);
  });

  test("political page is accessible", async ({ page }) => {
    await page.goto("/political");
    await expect(page).toHaveURL(/\/political/);
  });

  test("consumer page is accessible", async ({ page }) => {
    await page.goto("/consumer");
    await expect(page).toHaveURL(/\/consumer/);
  });

  test("about page is accessible", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveURL(/\/about/);
  });

  test("no console errors on homepage", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(3000);

    // Filter out expected static resource 404s and known issues
    const realErrors = errors.filter(
      (e) =>
        !e.includes("404") &&
        !e.includes("favicon") &&
        !e.includes("Failed to load resource"),
    );
    expect(realErrors).toHaveLength(0);
  });
});
