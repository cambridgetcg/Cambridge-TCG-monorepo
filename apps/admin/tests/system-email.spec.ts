/**
 * system-email.spec.ts — Email Queue page Playwright spec
 *
 * /system/email — the Cemetery's New Chapel (kingdom-020). Reads
 * email_queue dead-letters + 7-day status histogram + per-event volume.
 * Two mutations (retryEmail, dismissEmail) wired through adminAction.
 *
 * Tests:
 *   A. Page structure — header, KPI grid, sections
 *   B. Substrate-honesty — Provenance pill
 *   C. No console errors
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/system/email";
const PAGE_TITLE_PATTERN = /Email Queue/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Email Queue — Cemetery's New Chapel", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Email Queue");
  });

  test("renders KPI grid with five status tiles", async ({ page }) => {
    await expect(page.getByText(/pending · 7d/i)).toBeVisible();
    await expect(page.getByText(/sent · 7d/i)).toBeVisible();
    await expect(page.getByText(/cancelled · 7d/i)).toBeVisible();
    await expect(page.getByText(/failed · 7d/i)).toBeVisible();
    await expect(page.getByText(/dead · 7d/i)).toBeVisible();
  });

  test("renders Dead letters section heading", async ({ page }) => {
    await expect(
      page.locator("h2", { hasText: /Dead letters/i }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("dead-letter rows or empty state — never blank", async ({ page }) => {
    const deadHeading = page.locator("h2", { hasText: /Dead letters/i }).first();
    await expect(deadHeading).toBeVisible();

    const empty = page.getByText(/Nothing in the dead queue/i);
    const retryButton = page.getByRole("button", { name: /^retry$/i }).first();
    await expect(empty.or(retryButton).first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders Provenance label in header", async ({ page }) => {
    await expect(page.getByText(/^live$/i).first()).toBeVisible({
      timeout: 5_000,
    });
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
