/**
 * trust-fraud.spec.ts — Fraud signals Manager Playwright spec
 *
 * /admin/fraud-signals — reads fraud_signals (storefront) joined to users +
 * trust_profiles. Mutations: resolve, dismiss, escalate, suspend.
 *
 * Tests:
 *   A. Page structure — header, KPI grid, severity + type pills, table-or-empty
 *   B. Filter controls — severity pill, type pill, search, show-resolved toggle
 *   C. No console errors
 *
 * Note: targets /admin/fraud-signals (sister's Manager page with h1 "Fraud
 * Signals"), not /admin/fraud (the "Fraud Detection & Trust" dashboard).
 * The spec's assertions — five KPI tiles, severity pills, show-resolved
 * toggle — match the fraud-signals Manager shape.
 *
 * To run:
 *   pnpm --filter cambridgetcg-storefront test:e2e --grep "Fraud Signals"
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/admin/fraud-signals";
const PAGE_TITLE_PATTERN = /Fraud Signals/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Fraud Signals — Manager archetype", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Fraud Signals");
  });

  test("renders five KPI tiles", async ({ page }) => {
    await expect(page.getByText("Unresolved")).toBeVisible();
    await expect(page.getByText("Critical Open")).toBeVisible();
    await expect(page.getByText("Suspend-action Open")).toBeVisible();
    await expect(page.getByText("Users Suspended")).toBeVisible();
    await expect(page.getByText("Resolved 24h")).toBeVisible();
  });

  test("renders severity pills with all four levels + an All", async ({ page }) => {
    const allPill = page.getByRole("link", { name: /^all unresolved/i }).first();
    await expect(allPill).toBeVisible();
    await expect(page.getByRole("link", { name: /^critical/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^high/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^medium/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^low/i }).first()).toBeVisible();
  });

  test("renders table or explicit empty state — never blank", async ({ page }) => {
    const tableHeader = page.locator("table thead th").first();
    const emptyState = page.getByText(/no (fraud signals|signals match|unresolved fraud signals)/i);
    await expect(tableHeader.or(emptyState).first()).toBeVisible({ timeout: 8_000 });
  });

  test("severity filter pill updates URL", async ({ page }) => {
    const highPill = page.getByRole("link", { name: /^high/i }).first();
    await highPill.click();
    await expect(page).toHaveURL(/severity=high/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("text search submits and updates URL", async ({ page }) => {
    const searchInput = page.locator('input[name="q"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("nonexistent-user-xyz");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/q=nonexistent/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("show-resolved toggle works", async ({ page }) => {
    const toggle = page.getByRole("link", { name: /show resolved too/i }).first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page).toHaveURL(/resolved=1/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
  });

  test("chargebacks deep-link is present in header", async ({ page }) => {
    const link = page.getByRole("link", { name: /chargebacks/i }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/admin/chargebacks");
  });

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
