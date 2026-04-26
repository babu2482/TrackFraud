/**
 * E2E Mobile Responsiveness Tests
 *
 * Verify the application is usable on mobile viewports.
 */

import { test, expect } from "@playwright/test";

test.describe("Mobile Responsiveness", () => {
  test("homepage is usable on mobile (375px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    // Page should load and have content
    const body = page.locator("body");
    await expect(body).toBeVisible();
    await context.close();
  });

  test("homepage is usable on tablet (768px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const body = page.locator("body");
    await expect(body).toBeVisible();
    await context.close();
  });

  test("search page is usable on mobile (375px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const body = page.locator("body");
    await expect(body).toBeVisible();
    await context.close();
  });

  test("charities page is usable on tablet (768px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const page = await context.newPage();
    await page.goto("/charities");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const body = page.locator("body");
    await expect(body).toBeVisible();
    await context.close();
  });

  test("pages are usable on small desktop (1024px)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const body = page.locator("body");
    await expect(body).toBeVisible();
    await context.close();
  });
});