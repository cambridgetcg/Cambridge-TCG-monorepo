/**
 * system-audit.spec.ts — Audit Log Manager page Playwright spec
 *
 * /system/audit — reads admin_actions_log from storefront.
 * Read-only governance trail. No mutations.
 *
 * Tests:
 *   A. Page structure — header, table or empty state, KPI grid, filter controls
 *   B. Filter interactions — kind pills, text search, date range form
 *   C. No console errors
 *
 * To run:
 *   pnpm --filter @cambridge-tcg/admin test:e2e --grep "Audit Log"
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/system/audit";
const PAGE_TITLE_PATTERN = /Audit Log/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Audit Log — Manager archetype", () => {
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
    await expect(heading).toContainText("Audit Log");
  });

  test("renders KPI grid with three tiles", async ({ page }) => {
    // KpiCard labels
    await expect(page.getByText("Actions Today")).toBeVisible();
    await expect(page.getByText("Actions This Week")).toBeVisible();
    await expect(page.getByText("Unique Actors Today")).toBeVisible();
  });

  test("renders table or explicit empty state — never blank", async ({ page }) => {
    const tableHeader = page.locator("table thead th").first();
    const emptyState = page.getByText(/no audit actions|no actions match/i);
    await expect(tableHeader.or(emptyState).first()).toBeVisible({ timeout: 8_000 });
  });

  test("table has expected column headers when rows exist", async ({ page }) => {
    // Only assert headers if table rendered (rows > 0)
    const firstHeader = page.locator("table thead th").first();
    if (!(await firstHeader.isVisible())) return;

    const headers = page.locator("table thead th");
    const headerTexts = await headers.allTextContents();
    const normalised = headerTexts.map((h) => h.trim().toLowerCase());

    // Must have time, actor, action, target, reason, changes columns
    expect(normalised.some((h) => h.includes("time"))).toBe(true);
    expect(normalised.some((h) => h.includes("actor"))).toBe(true);
    expect(normalised.some((h) => h.includes("action"))).toBe(true);
    expect(normalised.some((h) => h.includes("target"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // B. Filter controls
  // -------------------------------------------------------------------------

  test("text search submits and updates URL", async ({ page }) => {
    const searchInput = page.locator('input[name="q"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    await searchInput.fill("nonexistent-actor-xyz-test");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/q=nonexistent/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("date range form applies without error", async ({ page }) => {
    const fromInput = page.locator('input[name="from"]').first();
    const toInput = page.locator('input[name="to"]').first();
    const applyButton = page.getByRole("button", { name: /apply/i });

    await expect(fromInput).toBeVisible();
    await fromInput.fill("2026-01-01");
    await toInput.fill("2026-12-31");
    await applyButton.click();

    await expect(page).toHaveURL(/from=2026-01-01/);
    await expect(page).toHaveURL(/to=2026-12-31/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("kind filter pill updates URL and preserves page structure", async ({ page }) => {
    // "All" pill is always present
    const allPill = page.getByRole("link", { name: /^all/i }).first();
    await expect(allPill).toBeVisible();

    // If other kind pills exist, click one and verify URL updates
    const kindPills = page.locator("nav a").filter({ hasNot: page.getByText(/^all/i) });
    const pillCount = await kindPills.count();

    if (pillCount > 0) {
      await kindPills.first().click();
      await expect(page).toHaveURL(/kind=/);
      // Page must still render without error after filtering
      await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
      const tableOrEmpty = page
        .locator("table thead th")
        .first()
        .or(page.getByText(/no (audit actions|actions match)/i));
      await expect(tableOrEmpty.first()).toBeVisible({ timeout: 8_000 });
    }
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
