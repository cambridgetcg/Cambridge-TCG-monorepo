/**
 * manager.template.spec.ts — Manager archetype Playwright template
 *
 * COPY THIS FILE when adding tests for a Manager-archetype page.
 * File naming: <module>-<page>.spec.ts  (e.g. trust-disputes.spec.ts)
 *
 * Manager pages own their data: search + filter pills + paginated table.
 * Pattern:
 *   1. Load list — assert structure is correct (even if empty)
 *   2. Click a row — assert drill-down renders (if applicable)
 *   3. Run a reversible state transition — assert list refreshes + audit row added
 *
 * This file ships as a WORKING EXAMPLE against /trust/disputes.
 * When copying, replace the route, selectors, and assertions for your module.
 *
 * To run this example:
 *   pnpm --filter @cambridge-tcg/admin test:e2e --grep "Disputes"
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// ⬇️  Edit these for your module
// ---------------------------------------------------------------------------
const ROUTE = "/trust/disputes";
const PAGE_TITLE_PATTERN = /Disputes/i;
// ---------------------------------------------------------------------------

async function devSignIn(page: Page): Promise<void> {
  await page.goto("/api/dev-signin");
  await expect(page).toHaveURL(/\/overview/, { timeout: 10_000 });
}

test.describe("Disputes — Manager archetype", () => {
  test.beforeEach(async ({ page }) => {
    await devSignIn(page);
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(PAGE_TITLE_PATTERN, { timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // A. Page structure — always passes whether data exists or not
  // -------------------------------------------------------------------------
  test("renders page header and title", async ({ page }) => {
    // h1 should match the page title
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeEmpty();
  });

  test("renders table or empty state — never blank", async ({ page }) => {
    // Page must show EITHER a table with ≥1 header column, OR an explicit
    // empty-state message. A blank white screen means a query failed silently.
    const tableHeader = page.locator("table thead th").first();
    const emptyState = page.getByText(/no (disputes|items|results)|nothing (here|found)/i);

    await expect(tableHeader.or(emptyState).first()).toBeVisible({ timeout: 8_000 });
  });

  test("no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Filter known benign errors (e.g. missing favicon, third-party scripts)
    const real = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR"),
    );
    expect(real, `Console errors: ${real.join(", ")}`).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // B. Search / filter — only meaningful if the Manager has those controls
  // -------------------------------------------------------------------------
  test("search form is present and submits without error", async ({ page }) => {
    const searchInput = page.locator('input[name="q"], input[type="search"]').first();

    // Skip this assertion if the page has no search form (it's a stub or read-only)
    if (!(await searchInput.isVisible())) {
      test.info().annotations.push({ type: "skip", description: "no search form found" });
      return;
    }

    await searchInput.fill("nonexistent-term-xyz");
    await searchInput.press("Enter");

    // After search, page should load without error boundary
    await expect(page.getByText("Application error")).not.toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/q=nonexistent/);
  });

  // -------------------------------------------------------------------------
  // C. State transitions — fill in for the specific action your page supports
  //
  // Pattern:
  //   1. Find a row in a known starting state
  //   2. Perform the action (click button, submit form)
  //   3. Assert the row moves to the new state (or list refreshes)
  //   4. Revert if the action is destructive
  //
  // Example (commented out — copy + adapt):
  // -------------------------------------------------------------------------

  /*
  test("force-resolving a dispute updates row status", async ({ page }) => {
    // Find the first open dispute
    const openRow = page.locator("tr").filter({ hasText: "open" }).first();
    await expect(openRow).toBeVisible({ timeout: 5_000 });

    // Click "Resolve" button in that row
    await openRow.getByRole("button", { name: /resolve/i }).click();

    // Fill in the reason prompt (if using window.prompt, it's mocked here)
    page.once("dialog", async (dialog) => {
      await dialog.accept("Automated test resolution");
    });

    // Assert row now shows "resolved"
    await expect(openRow).toContainText("resolved", { timeout: 5_000 });

    // Assert audit log row was added (if the page surfaces it)
    // await expect(page.locator("[data-audit-log]").last()).toContainText("force_resolve");
  });
  */
});
