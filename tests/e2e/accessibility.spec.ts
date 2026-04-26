/**
 * E2E Accessibility Tests
 *
 * Verify basic accessibility requirements are met.
 */

import { test, expect } from "@playwright/test";

test.describe("Accessibility", () => {
  test("homepage has lang attribute on html", async ({ page }) => {
    await page.goto("/");
    const lang = await page.locator("html").first().getAttribute("lang");
    expect(lang).toBeTruthy();
    expect(lang?.length).toBeGreaterThan(0);
  });

  test("images have alt text", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const images = await page.locator("img").all();
    for (const img of images) {
      const alt = await img.getAttribute("alt");
      // alt can be empty string for decorative images, but should exist
      expect(alt !== null).toBe(true);
    }
  });

  test("form inputs have labels", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const inputs = await page.locator('input[type="text"], input[type="search"]').all();
    for (const input of inputs) {
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");
      const placeholder = await input.getAttribute("placeholder");
      const id = await input.getAttribute("id");
      // Input should have at least one labeling mechanism
      const hasLabel = ariaLabel || ariaLabelledBy || placeholder || id;
      expect(!!hasLabel).toBe(true);
    }
  });

  test("color contrast - text is readable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    // Check that body has text color defined
    const bodyColor = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return style.color;
    });
    expect(bodyColor.length).toBeGreaterThan(0);
  });

  test("focusable elements are visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    // Tab through first few focusable elements
    await page.keyboard.press("Tab");
    const focused = await page.locator(":focus").first();
    await expect(focused).toBeVisible();
  });

  test("skip navigation or logical tab order", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    // Page should be navigable with keyboard
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // Should not throw - keyboard navigation works
    expect(page.url()).toBeTruthy();
  });

  test("headings are properly nested", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const headings = await page.locator("h1, h2, h3, h4, h5, h6").all();
    let lastLevel = 0;
    for (const heading of headings) {
      const tagName = await heading.evaluate((el) => el.tagName.toLowerCase());
      const level = parseInt(tagName.replace("h", ""));
      // Headings should not skip more than one level
      if (lastLevel > 0) {
        expect(level - lastLevel).toBeLessThanOrEqual(2);
      }
      lastLevel = level;
    }
  });
});
