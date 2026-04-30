/**
 * dashboard.template.spec.ts — Dashboard archetype Playwright template
 *
 * COPY THIS FILE when adding tests for a Dashboard-archetype page.
 * File naming: <module>-<page>.spec.ts  (e.g. commerce-auctions.spec.ts)
 *
 * Dashboard pages are read-only: KPI grid at top, deep-links out to the
 * canonical admin surface for each sub-domain.
 * Pattern:
 *   1. Load page — assert HTTP 200, page title, KPI grid renders
 *   2. Assert KPI counts are non-negative numbers (not NaN, not "-1")
 *   3. Assert deep-link hrefs point somewhere valid (not "#" or empty)
 *
 * This file ships as a WORKING EXAMPLE against /commerce/auctions.
 * When copying, replace the route and assertions for your module.
 *
 * To run this example:
 *   pnpm --filter @cambridge-tcg/admin test:e2e --grep "Auctions"
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// ⬇️  Edit these for your module
// ---------------------------------------------------------------------------
const ROUTE = "/commerce/auctions";
const PAGE_TITLE_PATTERN = /Auctions/i;
// ---------------------------------------------------------------------------

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Auctions — Dashboard archetype", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // A. Load — every Dashboard page must pass this
  // -------------------------------------------------------------------------
  test("renders without error boundary", async ({ page }) => {
    await expect(
      page.getByText("Application error: a client-side exception has occurred"),
    ).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Internal Server Error")).not.toBeVisible({ timeout: 2_000 });
  });

  test("renders page heading", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeEmpty();
  });

  // -------------------------------------------------------------------------
  // B. KPI grid — assert counts are valid numbers (not blank, not "N/A" when
  //    the DB is reachable, not literal "-1" from safeCount fallback)
  // -------------------------------------------------------------------------
  test("KPI cards show numeric values", async ({ page }) => {
    // KpiCard renders values in an element with data-kpi-value attribute
    // (or the nearest large-number element — adapt selector if needed)
    const kpiValues = page.locator("[data-kpi-value], .kpi-value");
    const count = await kpiValues.count();

    if (count === 0) {
      // Page may not have KPIs (it's a stub), or the selector needs updating
      test.info().annotations.push({
        type: "info",
        description: "No [data-kpi-value] elements found — confirm page has KPI grid",
      });
      return;
    }

    for (let i = 0; i < count; i++) {
      const text = await kpiValues.nth(i).innerText();
      const num = parseInt(text.replace(/[^0-9-]/g, ""), 10);
      // "-1" means safeCount returned its error fallback — DB read failed
      expect(num, `KPI ${i} value is -1 (DB error fallback): "${text}"`).not.toBe(-1);
      // NaN means the element is empty or non-numeric
      expect(isNaN(num), `KPI ${i} value is NaN: "${text}"`).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // C. Deep links — Dashboard pages link OUT to canonical admin surfaces
  // -------------------------------------------------------------------------
  test("external links have non-empty hrefs", async ({ page }) => {
    // ExternalLink renders as <a target="_blank" rel="...">
    const externalLinks = page.locator('a[target="_blank"]');
    const count = await externalLinks.count();

    for (let i = 0; i < count; i++) {
      const href = await externalLinks.nth(i).getAttribute("href");
      expect(href, `External link ${i} has empty href`).toBeTruthy();
      expect(href, `External link ${i} href is "#"`).not.toBe("#");
    }
  });

  // -------------------------------------------------------------------------
  // D. No console errors
  // -------------------------------------------------------------------------
  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    const real = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    );
    expect(real, `Console errors: ${real.join(", ")}`).toHaveLength(0);
  });
});
