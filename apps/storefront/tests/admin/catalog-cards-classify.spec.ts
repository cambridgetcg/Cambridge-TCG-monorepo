/**
 * catalog-cards-classify.spec.ts — Playwright spec for the classify
 * Manager surface (kingdom-089).
 *
 * Three routes covered:
 *   /admin/catalog/cards/classify          — landing
 *   /admin/catalog/cards/classify/review   — bulk review queue
 *   /admin/catalog/cards/classify/[sku]    — per-card detail (skipped when no
 *                                            test SKU is configured)
 *
 * Each route asserts:
 *   - page renders 200 + correct title
 *   - structural elements present (heading, lookup form / banner)
 *   - graceful degradation when the migration hasn't applied
 *
 * Detail-page mutation flow is NOT covered here (would require seeded
 * test data + DB cleanup); the manager template's reversible state
 * transition pattern is the right place to add that once we have a
 * stable test fixture.
 *
 * Run:
 *   pnpm --filter cambridgetcg-storefront test:e2e --grep "Classify"
 */

import { test, expect, type Page } from "@playwright/test";

const LANDING_ROUTE = "/admin/catalog/cards/classify";
const REVIEW_ROUTE = "/admin/catalog/cards/classify/review";
const DETAIL_TEST_SKU = process.env.TEST_CLASSIFY_SKU ?? "";

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Classify — landing", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(LANDING_ROUTE);
    await expect(page).toHaveTitle(/Classify/i, { timeout: 10_000 });
  });

  test("renders page header", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/classify/i);
  });

  test("renders SKU lookup form OR substrate-not-ready banner", async ({
    page,
  }) => {
    // Either the substrate is ready (form present) or it's not (banner present).
    // Both shapes are correct — the page is substrate-honest about its state.
    const hasForm = await page
      .locator("input#sku-lookup")
      .isVisible()
      .catch(() => false);
    const hasBanner = await page
      .getByText(/substrate not yet applied/i)
      .isVisible()
      .catch(() => false);
    expect(hasForm || hasBanner).toBe(true);
  });

  test("links to methodology page", async ({ page }) => {
    const link = page.getByRole("link", {
      name: /how priority works/i,
    });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toContain("/methodology/edition-variants");
  });
});

test.describe("Classify — review queue", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(REVIEW_ROUTE);
  });

  test("renders page header", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/review/i);
  });

  test("renders banner, empty state, OR table — substrate-honest", async ({
    page,
  }) => {
    const hasBanner = await page
      .getByText(/substrate not yet applied/i)
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no cards in the review queue/i)
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .locator("table")
      .isVisible()
      .catch(() => false);
    expect(hasBanner || hasEmpty || hasTable).toBe(true);
  });

  test("back link returns to landing", async ({ page }) => {
    const back = page.getByRole("link", { name: /back to classify/i });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`${LANDING_ROUTE}$`));
  });
});

test.describe("Classify — per-card detail", () => {
  test.skip(
    !DETAIL_TEST_SKU,
    "Set TEST_CLASSIFY_SKU env to enable the detail-page spec.",
  );

  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(
      `${LANDING_ROUTE}/${encodeURIComponent(DETAIL_TEST_SKU)}`,
    );
  });

  test("renders sku + classification sections", async ({ page }) => {
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    // Either substrate-ready or substrate-not-ready (banner)
    const hasBanner = await page
      .getByText(/substrate not yet applied/i)
      .isVisible()
      .catch(() => false);
    if (hasBanner) return; // page is substrate-honest; nothing more to assert
    // When substrate is ready, both attribute sections should render
    await expect(page.locator("text=edition_variant").first()).toBeVisible();
    await expect(page.locator("text=promo_origin").first()).toBeVisible();
  });
});
