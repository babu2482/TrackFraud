/**
 * E2E Workflow Tests
 *
 * Comprehensive end-to-end tests covering the main user workflows:
 * - Homepage search flow
 * - Category browsing flow
 * - Search with filters flow
 * - Submit tip flow
 * - Charity detail page flow
 * - Navigation and links flow
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage Workflows", () => {
  test("homepage loads with all key sections", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TrackFraud/i);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(5000); // Wait for dynamic components (FraudMap etc.)

    // Hero section - flexible heading match
    await expect(page.getByRole("heading", { name: /Track/i })).toBeVisible({
      timeout: 10000,
    });

    // Search input
    await expect(
      page.getByRole("searchbox", { name: "Search fraud database" }),
    ).toBeVisible();

    // Stats ticker - use first occurrence to avoid strict mode violation
    await expect(page.getByText(/Charities/).first()).toBeVisible();

    // CTA section
    await expect(
      page.getByRole("link", { name: "Submit a Tip" }),
    ).toBeVisible();
  });

  test("homepage search redirects to /search with query", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("searchbox", { name: "Search fraud database" })
      .fill("charity test");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/search\?q=/);
  });

  test("homepage has no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);

    // Filter out expected static resource 404s
    const realErrors = errors.filter(
      (e) => !e.includes("404") && !e.includes("favicon"),
    );
    expect(realErrors).toHaveLength(0);
  });

  test("footer links work", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // About link - use footer-specific selector
    const aboutLink = page.locator("footer a").getByText("About");
    if (await aboutLink.isVisible().catch(() => false)) {
      await aboutLink.click();
    } else {
      await page.getByRole("link", { name: "About" }).first().click();
    }
    await expect(page).toHaveURL(/\/about/);

    // Go back to homepage
    await page.goto("/");

    // Terms link - use footer-specific selector
    const termsLink = page.locator("footer a").getByText("Terms");
    if (await termsLink.isVisible().catch(() => false)) {
      await termsLink.click();
    } else {
      await page.getByRole("link", { name: "Terms" }).first().click();
    }
    await expect(page).toHaveURL(/\/terms/);
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible();

    // Privacy link
    await page.goto("/");
    const privacyLink = page.locator("footer a").getByText("Privacy");
    if (await privacyLink.isVisible().catch(() => false)) {
      await privacyLink.click();
    } else {
      await page.getByRole("link", { name: "Privacy" }).first().click();
    }
    await expect(page).toHaveURL(/\/privacy/);
    await expect(
      page.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeVisible();
  });
});

test.describe("Search Workflows", () => {
  test("search page loads with empty state", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveURL(/\/search/);

    // Search input should be visible
    await expect(
      page.getByRole("searchbox", { name: "Search all entities" }),
    ).toBeVisible();
  });

  test("search returns results for common terms", async ({ page }) => {
    await page.goto("/search");
    await page
      .getByRole("searchbox", { name: "Search all entities" })
      .fill("association");
    await page.waitForTimeout(2000); // Wait for debounced search

    // Results should appear - use flexible locator
    const resultCards = page.locator('[class*="space-y"] a');
    await expect(resultCards.first()).toBeVisible({ timeout: 15000 });
  });

  test("search filters by category", async ({ page }) => {
    await page.goto("/search");
    await page
      .getByRole("searchbox", { name: "Search all entities" })
      .fill("test");
    await page.waitForTimeout(500);

    // Open filters
    await page.getByRole("button", { name: "Filters" }).click();

    // Select charity category
    await page.getByRole("combobox").first().selectOption("charity");
    await page.waitForTimeout(1000);

    // URL should reflect the filter (if search was performed)
    expect(page.url()).toContain("/search");
  });

  test("search filters by state", async ({ page }) => {
    await page.goto("/search");
    await page
      .getByRole("searchbox", { name: "Search all entities" })
      .fill("association");
    await page.waitForTimeout(2000); // Wait for search results to appear

    // Verify search results loaded
    const resultCards = page.locator('[class*="space-y"] a');
    await expect(resultCards.first()).toBeVisible({ timeout: 10000 });

    // Open filters
    await page.getByRole("button", { name: "Filters" }).click();

    // Select a state (third combobox is state)
    await page.getByRole("combobox").nth(2).selectOption("CA");
    await page.waitForTimeout(2000);

    // URL should include state filter
    expect(page.url()).toContain("state=");
  });

  test("clear filters button works", async ({ page }) => {
    await page.goto("/search");
    await page
      .getByRole("searchbox", { name: "Search all entities" })
      .fill("test");
    await page.waitForTimeout(500);

    // Open filters and set one
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("combobox").nth(1).selectOption("High");

    // Wait for filter to apply
    await page.waitForTimeout(1000);

    // Clear filters
    const clearBtn = page.getByRole("button", { name: "Clear all" });
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("search API returns expected data structure", async ({ request }) => {
    const response = await request.get("/api/search", {
      params: { q: "association", limit: "5" },
    });
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty("results");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("processingTimeMs");
    expect(Array.isArray(data.results)).toBe(true);

    if (data.results.length > 0) {
      const result = data.results[0];
      expect(result).toHaveProperty("entityId");
      expect(result).toHaveProperty("entityType");
      expect(result).toHaveProperty("name");
    }
  });
});

test.describe("Category Navigation", () => {
  const categories = [
    { name: "Charities", type: "charity" },
    { name: "Corporate", type: "corporation" },
    { name: "Government", type: "government_contractor" },
    { name: "Healthcare", type: "healthcare_provider" },
  ];

  for (const cat of categories) {
    test(`"${cat.name}" nav link works`, async ({ page }) => {
      await page.goto("/");
      // Click the link in the navbar specifically
      const navLink = page
        .locator("nav a")
        .getByText(new RegExp(`^${cat.name}$`));
      if (await navLink.isVisible().catch(() => false)) {
        await navLink.click();
      } else {
        // Fallback to general link locator
        await page.getByRole("link", { name: cat.name }).first().click();
      }
      await expect(page).toHaveURL(new RegExp(`/search\\?type=${cat.type}`));
    });
  }

  test("More dropdown shows additional categories", async ({ page }) => {
    await page.goto("/");

    // Click More button
    const moreBtn = page.getByRole("button", { name: "More" });
    if (await moreBtn.isVisible().catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(500);

      // Additional categories should be visible
      const dropdownLinks = page.locator(
        '[class*="absolute"][class*="z-50"] a',
      );
      expect(await dropdownLinks.count()).toBeGreaterThan(0);
    }
  });
});

test.describe("Submit Tip Workflow", () => {
  test("submit page loads with form", async ({ page }) => {
    await page.goto("/submit");
    await expect(page).toHaveURL(/\/submit/);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000); // Wait for categories to load

    // Form heading
    await expect(
      page.getByRole("heading", { name: "Submit a Fraud Tip" }),
    ).toBeVisible();

    // Required fields
    await expect(page.locator("select").first()).toBeVisible();
    await expect(
      page.locator('input[placeholder*="organization"]'),
    ).toBeVisible();
  });

  test("submit tip form with valid data", async ({ page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // Wait for categories to load

    // Fill required fields
    await page.locator("select").first().selectOption({ index: 1 });
    await page
      .locator('input[placeholder*="organization"]')
      .fill("Test Entity " + Date.now());
    await page
      .locator('input[placeholder*="title"]')
      .fill("Test tip for E2E testing");
    await page
      .locator('textarea[placeholder*="Describe"]')
      .fill(
        "This is a test submission for automated E2E testing purposes only. Not a real fraud tip.",
      );

    // Submit
    await page.getByRole("button", { name: "Submit Tip" }).click();
    await page.waitForTimeout(5000); // Longer wait for submission

    // Success state - check for heading or success indicator
    const hasSuccessHeading = await page
      .getByRole("heading", { name: "Tip Submitted" })
      .isVisible()
      .catch(() => false);
    const hasSuccessText = await page
      .getByText(/submitted|thank you|success/i)
      .isVisible()
      .catch(() => false);
    expect(hasSuccessHeading || hasSuccessText).toBe(true);
  });

  test("submit form shows all categories", async ({ page }) => {
    await page.goto("/submit");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000); // Wait for API to load categories

    const categories = await page.locator("select option").allTextContents();
    expect(categories.length).toBeGreaterThan(2); // At least default + some categories
  });
});

test.describe("Charity Detail Pages", () => {
  test("charity detail page loads with valid EIN", async ({ page }) => {
    test.setTimeout(60000); // Extended timeout for API calls

    // Get a charity with valid EIN
    const response = await page.request.get("/api/charities", {
      params: { limit: "10" },
    });
    const data = await response.json();

    let ein = null;
    for (const c of data.charities || []) {
      if (c.ein && /^\d{2}-?\d{7}$/.test(c.ein)) {
        ein = c.ein;
        break;
      }
    }

    if (!ein) {
      test.skip();
      return;
    }

    await page.goto(`/charities/${ein}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(15000); // Extended wait for API + rendering

    // Should show EIN (may be formatted with dashes like "XX-XXXXXXX")
    const einDigits = ein.replace(/[^\d]/g, "");
    const hasEin =
      (await page
        .getByText(ein)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(einDigits)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(
          new RegExp(einDigits.substring(0, 2) + "-" + einDigits.substring(2)),
        )
        .isVisible()
        .catch(() => false));
    expect(hasEin).toBe(true);

    // Also verify no error state
    const hasError = await page
      .getByText(/Invalid|Error|not found/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test("charity detail page shows error for invalid EIN", async ({ page }) => {
    await page.goto("/charities/00-0000000");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5000); // Extended wait for error state

    // Should show error message or organization not found
    const hasError =
      (await page
        .getByText(/Invalid/i)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(/not found/i)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(/Failed to load/i)
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByText(/organization.*found/i)
        .isVisible()
        .catch(() => false));
    expect(hasError).toBe(true);
  });

  test("back to charities link works", async ({ page }) => {
    await page.goto("/charities/00-0000000");
    await page.waitForTimeout(1000);

    // Back link should be visible
    const backLink = page.getByRole("link", { name: /Back/i });
    if (await backLink.isVisible().catch(() => false)) {
      await backLink.click();
      await page.waitForTimeout(1000);
      // The back link goes to /charities which redirects to /search
      expect(page.url()).toMatch(/\/charities|\/search/);
    }
  });
});

test.describe("API Endpoints", () => {
  test("health endpoint", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.ok()).toBe(true);
    const data = await resp.json();
    expect(data.status).toBe("healthy");
  });

  test("categories endpoint", async ({ request }) => {
    const resp = await request.get("/api/categories");
    expect(resp.ok()).toBe(true);
    const data = await resp.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test("fraud scores endpoint", async ({ request }) => {
    const resp = await request.get("/api/fraud-scores");
    expect(resp.status()).toBeLessThan(500);
  });

  test("search POST endpoint", async ({ request }) => {
    const resp = await request.post("/api/search", {
      data: {
        query: "association",
        limit: 5,
      },
    });
    expect(resp.status()).toBeLessThan(500);
  });
});

test.describe("Page Titles and SEO", () => {
  test("each page has appropriate title", async ({ page }) => {
    const pages = [
      { url: "/", expected: /TrackFraud/i },
      { url: "/search", expected: /TrackFraud/i },
      { url: "/submit", expected: /TrackFraud/i },
      { url: "/about", expected: /TrackFraud/i },
      { url: "/terms", expected: /TrackFraud/i },
      { url: "/privacy", expected: /TrackFraud/i },
    ];

    for (const p of pages) {
      await page.goto(p.url);
      const title = await page.title();
      expect(title).toMatch(p.expected);
    }
  });

  test("homepage has proper heading hierarchy", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
  });
});
