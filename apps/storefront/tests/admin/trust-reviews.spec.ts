/**
 * trust-reviews.spec.ts — Reviews moderation page Playwright spec
 *
 * /admin/reviews — three-tab Manager (flagged / appealed / hidden) over
 * trade_reviews. Three mutations (hideReview, unhideReview, resolveAppeal)
 * wired through adminAction.
 *
 * Tests:
 *   A. Page structure — header, filter pills, section
 *   B. Tab navigation via ?tab= search param
 *   C. Substrate-honesty — Provenance + WhyLink to trust-score
 *   D. No console errors
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/admin/reviews";
const PAGE_TITLE_PATTERN = /Reviews/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Reviews — moderation Manager", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Reviews");
  });

  test("renders filter pills for three tabs", async ({ page }) => {
    await expect(page.getByRole("link", { name: /^flagged/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^appealed/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^hidden/i }).first()).toBeVisible();
  });

  test("appealed tab updates URL", async ({ page }) => {
    const link = page.getByRole("link", { name: /^appealed/i }).first();
    await link.click();
    await expect(page).toHaveURL(/tab=appealed/);
    await expect(page.getByText("Application error")).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("renders section heading + table or empty state", async ({ page }) => {
    const heading = page.locator("h2").first();
    const empty = page.getByText(/No reviews match this filter/i);
    await expect(heading.or(empty).first()).toBeVisible({ timeout: 8_000 });
  });

  test("renders Provenance label in header", async ({ page }) => {
    await expect(page.getByText(/^live$/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("renders WhyLink to trust-score methodology", async ({ page }) => {
    const link = page
      .getByRole("link", { name: /reviewer-trust weighting/i })
      .first();
    await expect(link).toBeVisible({ timeout: 5_000 });
    await expect(link).toHaveAttribute("href", /methodology\/trust-score/);
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
