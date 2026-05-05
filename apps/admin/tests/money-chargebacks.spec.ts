/**
 * money-chargebacks.spec.ts — Chargebacks Manager page Playwright spec
 *
 * /money/chargebacks — reads chargebacks + chargeback_lifecycle_log from
 * storefront. Two mutations (annotate, force_resolve) wired through
 * adminAction → admin_actions_log + chargeback_lifecycle_log.
 *
 * Tests:
 *   A. Page structure — header, title, KPI grid, table or empty state
 *   B. Filter controls — status pills + text search
 *   C. No console errors
 *
 * To run:
 *   pnpm --filter @cambridge-tcg/admin test:e2e --grep "Chargebacks"
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/money/chargebacks";
const PAGE_TITLE_PATTERN = /Chargebacks/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Chargebacks — Manager archetype", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // A. Page structure
  // -------------------------------------------------------------------------

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Chargebacks");
  });

  test("renders KPI grid with five tiles", async ({ page }) => {
    await expect(page.getByText("Needs Response")).toBeVisible();
    await expect(page.getByText("Under Review")).toBeVisible();
    await expect(page.getByText("Open Value")).toBeVisible();
    await expect(page.getByText(/Won \(lifetime\)/i)).toBeVisible();
    await expect(page.getByText(/Lost \(lifetime\)/i)).toBeVisible();
  });

  test("renders table or explicit empty state — never blank", async ({ page }) => {
    const tableHeader = page.locator("table thead th").first();
    const emptyState = page.getByText(/no chargebacks (recorded|match)/i);
    await expect(tableHeader.or(emptyState).first()).toBeVisible({ timeout: 8_000 });
  });

  test("table has expected column headers when rows exist", async ({ page }) => {
    const firstHeader = page.locator("table thead th").first();
    if (!(await firstHeader.isVisible())) return;

    const headers = page.locator("table thead th");
    const headerTexts = await headers.allTextContents();
    const normalised = headerTexts.map((h) => h.trim().toLowerCase());

    expect(normalised.some((h) => h.includes("dispute"))).toBe(true);
    expect(normalised.some((h) => h.includes("user"))).toBe(true);
    expect(normalised.some((h) => h.includes("amount"))).toBe(true);
    expect(normalised.some((h) => h.includes("status"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // B. Filter controls
  // -------------------------------------------------------------------------

  test("text search submits and updates URL", async ({ page }) => {
    const searchInput = page.locator('input[name="q"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    await searchInput.fill("nonexistent-dispute-xyz");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/q=nonexistent/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("status filter pill 'Open' updates URL", async ({ page }) => {
    const openPill = page.getByRole("link", { name: /^open/i }).first();
    await expect(openPill).toBeVisible({ timeout: 5_000 });
    await openPill.click();

    await expect(page).toHaveURL(/status=open/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
    const tableOrEmpty = page
      .locator("table thead th")
      .first()
      .or(page.getByText(/no chargebacks (recorded|match)/i));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 8_000 });
  });

  // -------------------------------------------------------------------------
  // C. No console errors
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
