/**
 * money-rewards.spec.ts — Rewards (prize fulfilment) page Playwright spec
 *
 * /money/rewards — unified prize fulfilment queue across raffles, mystery
 * boxes, and reward packs. Three sections (ready-to-ship clusters,
 * shipped-awaiting-confirm, awaiting-address) and three mutations
 * (shipPrize, bulkShipCluster, markFulfilled). Undo is deep-linked to the
 * legacy admin while a shared eligibility helper is extracted.
 *
 * Tests:
 *   A. Page structure — header, KPI grid, banner
 *   B. Substrate-honesty primitives — Provenance + WhyLink + ExternalLink
 *   C. No console errors
 */

import { test, expect, type Page } from "@playwright/test";

const ROUTE = "/money/rewards";
const PAGE_TITLE_PATTERN = /Rewards/i;

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Rewards — prize fulfilment queue", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  test("renders page header with title", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Rewards");
  });

  test("renders KPI grid with four tiles", async ({ page }) => {
    await expect(page.getByText("Unfulfilled")).toBeVisible();
    await expect(page.getByText("Ready to ship")).toBeVisible();
    await expect(page.getByText(/Shipped \(awaiting confirm\)/i)).toBeVisible();
    await expect(page.getByText("Awaiting address")).toBeVisible();
  });

  test("renders config-vs-fulfilment banner", async ({ page }) => {
    await expect(
      page.getByText(/configuration .* still happens in the legacy admin/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("renders sections or empty state — never blank", async ({ page }) => {
    const ready = page.locator("h2", {
      hasText: /^Ready to ship/i,
    });
    const shipped = page.locator("h2", {
      hasText: /Shipped — awaiting confirmation/i,
    });
    const awaiting = page.locator("h2", {
      hasText: /Awaiting customer address/i,
    });
    const empty = page.getByText(/No unfulfilled prizes/i);

    await expect(
      ready.or(shipped).or(awaiting).or(empty).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("renders Provenance label in header", async ({ page }) => {
    await expect(page.getByText(/^live$/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("renders WhyLink to prize-fulfillment methodology", async ({ page }) => {
    const link = page.getByRole("link", { name: /ordering rules/i }).first();
    await expect(link).toBeVisible({ timeout: 5_000 });
    await expect(link).toHaveAttribute(
      "href",
      /methodology\/prize-fulfillment/,
    );
  });

  test("renders ExternalLink to legacy raffle/box config", async ({ page }) => {
    const cta = page.getByRole("link", { name: /raffle \/ box config/i }).first();
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await expect(cta).toHaveAttribute(
      "href",
      /cambridgetcg\.com\/admin\/rewards/,
    );
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
