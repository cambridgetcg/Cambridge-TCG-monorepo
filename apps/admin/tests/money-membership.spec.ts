/**
 * money-membership.spec.ts — Membership Dashboard page Playwright spec
 *
 * /money/membership — read-only viewer for the tiers table + per-tier user
 * counts and spend breakdown. No mutations on this chapel; tier perk
 * editing still happens in the legacy admin (linked out from the header).
 *
 * Tests:
 *   A. Page structure — header, KPI grid, tiers section
 *   B. Substrate-honesty primitives — Provenance + WhyLink + ExternalLink
 *   C. No console errors
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/money/membership";
const PAGE_TITLE_PATTERN = /Membership/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Membership — Dashboard archetype", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Membership");
  });

  test("renders KPI grid with four tiles", async ({ page }) => {
    await expect(page.getByText("Total members")).toBeVisible();
    await expect(page.getByText("Tracked annual spend")).toBeVisible();
    await expect(page.getByText("Paid subscribers")).toBeVisible();
    // Top-tier label is dynamic ("OG tier", "Platinum tier", etc.) — match suffix
    await expect(page.getByText(/tier$/i).first()).toBeVisible();
  });

  test("renders Tiers section heading", async ({ page }) => {
    await expect(
      page.locator("h2", { hasText: /^Tiers/i }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("renders at least one tier card with a perk grid", async ({ page }) => {
    // Each card has the "Cashback" stat — the simplest existence probe
    await expect(page.getByText("Cashback").first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Berries multiplier/i).first()).toBeVisible();
    await expect(page.getByText(/P2P commission/i).first()).toBeVisible();
  });

  test("renders Provenance label in header", async ({ page }) => {
    await expect(page.getByText(/^live$/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders WhyLink to membership methodology", async ({ page }) => {
    const link = page
      .getByRole("link", { name: /how qualification works/i })
      .first();
    await expect(link).toBeVisible({ timeout: 5_000 });
    await expect(link).toHaveAttribute(
      "href",
      /methodology\/membership/,
    );
  });

  test("renders ExternalLink to legacy admin tier editor", async ({ page }) => {
    const cta = page
      .getByRole("link", { name: /edit tier perks/i })
      .first();
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await expect(cta).toHaveAttribute("href", /cambridgetcg\.com\/admin\/tiers/);
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
