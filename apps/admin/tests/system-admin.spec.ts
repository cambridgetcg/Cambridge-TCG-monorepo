/**
 * system-admin.spec.ts — Admin Users Manager Playwright spec
 *
 * /system/admin — grant/revoke admin role on storefront users. Reads
 * users.role + admin_actions_log (for activity counts). Mutations:
 * grantAdmin, revokeAdmin (with self-lockout + last-admin guard).
 *
 * Tests:
 *   A. Page structure — header, KPIs, current/candidates pills, table or empty
 *   B. Tab switch — candidates view shows search prompt when q empty
 *   C. Search filter
 *   D. No console errors
 *
 * To run:
 *   pnpm --filter @cambridge-tcg/admin test:e2e --grep "Admin Users"
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/system/admin";
const PAGE_TITLE_PATTERN = /Admin Users/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Admin Users — Manager archetype", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Admin Users");
  });

  test("renders three KPI tiles", async ({ page }) => {
    await expect(page.getByText("Current Admins")).toBeVisible();
    await expect(page.getByText("Active 30d")).toBeVisible();
    await expect(page.getByText("Role Changes 30d")).toBeVisible();
  });

  test("renders current/candidates tab pills", async ({ page }) => {
    await expect(page.getByRole("link", { name: /current admins/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /grant new/i }).first()).toBeVisible();
  });

  test("renders table or explicit empty state — never blank", async ({ page }) => {
    const tableHeader = page.locator("table thead th").first();
    const emptyState = page.getByText(/no admins (on file|match)/i);
    await expect(tableHeader.or(emptyState).first()).toBeVisible({ timeout: 8_000 });
  });

  test("audit log deep-link is present", async ({ page }) => {
    const link = page.getByRole("link", { name: /audit log/i }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/system/audit");
  });

  test("candidates tab prompts for search input when empty", async ({ page }) => {
    await page.goto(`${ROUTE}?tab=candidates`);
    await expect(page.getByText(/type at least 2 characters/i)).toBeVisible({ timeout: 5_000 });
  });

  test("candidates tab search submits and updates URL", async ({ page }) => {
    await page.goto(`${ROUTE}?tab=candidates`);
    const searchInput = page.locator('input[name="q"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("nonexistent-xyz");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/q=nonexistent/);
    await expect(page).toHaveURL(/tab=candidates/);
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
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
