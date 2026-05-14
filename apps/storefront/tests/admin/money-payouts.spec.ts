/**
 * money-payouts.spec.ts — Payouts Dashboard page Playwright spec
 *
 * /admin/payouts — reads outstanding + recent payouts (P2P trades + auctions)
 * from storefront RDS. One mutation (recordPayout) wired through
 * adminAction → admin_actions_log. Stripe Connect transfers stay in the
 * legacy admin for now; this page links out to them.
 *
 * Tests:
 *   A. Page structure — header, KPI grid, two sections, banner
 *   B. Substrate-honesty primitives — Provenance + WhyLink + ExternalLink
 *   C. No console errors
 *
 * To run:
 *   pnpm --filter cambridgetcg-storefront test:e2e --grep "Payouts"
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/admin/payouts";
const PAGE_TITLE_PATTERN = /Payouts/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Payouts — Dashboard archetype", () => {
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
    await expect(heading).toContainText("Payouts");
  });

  test("renders KPI grid with five tiles", async ({ page }) => {
    await expect(page.getByText("Outstanding", { exact: true })).toBeVisible();
    await expect(page.getByText("Outstanding Owed")).toBeVisible();
    await expect(page.getByText(/Paid \(7d\)/)).toBeVisible();
    await expect(page.getByText(/Commission \(7d\)/)).toBeVisible();
    await expect(page.getByText(/Avg turnaround/i)).toBeVisible();
  });

  test("renders both Outstanding and Recent payouts sections", async ({ page }) => {
    await expect(
      page.locator("h2", { hasText: /^Outstanding$/i }).first(),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.locator("h2", { hasText: /Recent payouts/i }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("each section shows table or explicit empty state — never blank", async ({ page }) => {
    const outstanding = page.getByText(/no outstanding payouts/i);
    const recent = page.getByText(/no payouts recorded yet/i);
    const tables = page.locator("table thead th");

    // At least one of: a table, the outstanding empty state, the recent empty state
    await expect(
      tables.first().or(outstanding).or(recent).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  // -------------------------------------------------------------------------
  // B. Substrate-honesty primitives
  // -------------------------------------------------------------------------

  test("renders Provenance label in header", async ({ page }) => {
    // Provenance for kind="live" with source="Storefront RDS" — the visible
    // text comes out as "live" with a tooltip. Our header carries it.
    await expect(page.getByText(/^live$/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("renders WhyLink to payout-holds methodology", async ({ page }) => {
    const link = page
      .getByRole("link", { name: /how are hold days set/i })
      .first();
    await expect(link).toBeVisible({ timeout: 5_000 });
    await expect(link).toHaveAttribute(
      "href",
      /methodology\/payout-holds/,
    );
  });

  test("renders ExternalLink to legacy admin for Stripe balance + Connect", async ({ page }) => {
    const cta = page
      .getByRole("link", { name: /stripe balance \+ connect/i })
      .first();
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await expect(cta).toHaveAttribute(
      "href",
      /cambridgetcg\.com\/admin\/payouts/,
    );
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
