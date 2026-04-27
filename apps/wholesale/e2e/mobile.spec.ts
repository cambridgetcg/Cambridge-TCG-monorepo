import { test, expect } from "@playwright/test";
import { adminLogin, BASE } from "./helpers";

/*
 * E2E: Mobile compatibility tests (375×812 viewport)
 *
 * Verifies responsive behaviour shipped in the mobile-responsiveness commit:
 * hamburger nav, hidden columns, scrollable tables, fluid search, stacked grids.
 */

test.describe("Mobile layout", () => {
  test("Nav: hamburger menu opens and closes", async ({ page }) => {
    await adminLogin(page);

    // Desktop nav should NOT be visible at mobile width
    const desktopNav = page.locator("div.hidden.md\\:flex");
    await expect(desktopNav).toBeHidden();

    // Hamburger button should be visible
    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();

    // Open menu
    await hamburger.click();
    const mobileMenu = page.locator("nav div.md\\:hidden.mt-3");
    await expect(mobileMenu).toBeVisible();

    // Verify links present
    await expect(mobileMenu.locator("a", { hasText: "Catalog" })).toBeVisible();
    await expect(mobileMenu.locator("a", { hasText: "Orders" })).toBeVisible();
    await expect(mobileMenu.locator("a", { hasText: "Margins" })).toBeVisible();

    // Close menu
    await hamburger.click();
    await expect(mobileMenu).toBeHidden();
  });

  test("Nav: mobile menu links navigate correctly", async ({ page }) => {
    await adminLogin(page);
    const hamburger = page.locator('button[aria-label="Toggle menu"]');

    // Catalog
    await hamburger.click();
    await page.locator("nav div.md\\:hidden.mt-3 a", { hasText: "Catalog" }).click();
    await expect(page).toHaveURL(/\/catalog/);

    // Orders
    await hamburger.click();
    await page.locator("nav div.md\\:hidden.mt-3 a", { hasText: "Orders" }).click();
    await expect(page).toHaveURL(/\/orders/);

    // Margins
    await hamburger.click();
    await page.locator("nav div.md\\:hidden.mt-3 a", { hasText: "Margins" }).click();
    await expect(page).toHaveURL(/\/margin/);
  });

  test("Catalog: low-priority columns hidden", async ({ page }) => {
    await adminLogin(page);

    // Wait for table to render
    await expect(page.locator("thead th").first()).toBeVisible({ timeout: 15_000 });

    // Card # should be visible
    await expect(page.locator("thead th", { hasText: "Card #" })).toBeVisible();

    // Price should be visible
    await expect(page.locator("thead th", { hasText: "Price" })).toBeVisible();

    // SKU, Set, Type should be hidden on mobile (hidden md:table-cell)
    await expect(page.locator("thead th", { hasText: "SKU" })).toBeHidden();
    await expect(page.locator("thead th", { hasText: "Set" })).toBeHidden();
    await expect(page.locator("thead th", { hasText: "Type" })).toBeHidden();
  });

  test("Catalog: Add button is tappable", async ({ page }) => {
    await adminLogin(page);

    const firstAddBtn = page
      .locator("tbody tr button", { hasText: "Add" })
      .first();
    await expect(firstAddBtn).toBeVisible({ timeout: 15_000 });

    // Tap Add
    await firstAddBtn.click();

    // Cart badge should appear in nav (mobile cart link next to hamburger)
    const cartLink = page.locator('a[href="/orders/new"]');
    await expect(cartLink).toBeVisible({ timeout: 5_000 });

    // Cart link should be within the viewport
    const box = await cartLink.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  });

  test("Catalog: search input fills width", async ({ page }) => {
    await adminLogin(page);

    const searchInput = page.locator(
      'input[placeholder="Search by name, card number, or SKU..."]',
    );
    await expect(searchInput).toBeVisible({ timeout: 15_000 });

    const box = await searchInput.boundingBox();
    expect(box).not.toBeNull();
    // At 375px viewport, the w-full input should be ≥ 300px
    expect(box!.width).toBeGreaterThanOrEqual(300);
  });

  test("Order detail: SKU column hidden", async ({ page }) => {
    await adminLogin(page);

    // Fetch first order ID from API
    const ctx = page.context();
    const res = await ctx.request.get(`${BASE}/api/admin/orders`);
    expect(res.ok()).toBe(true);
    const orders: { id: number }[] = await res.json();
    expect(orders.length).toBeGreaterThan(0);

    await page.goto(`/orders/${orders[0].id}`);
    await expect(
      page.locator(`text=Order #${orders[0].id}`),
    ).toBeVisible({ timeout: 15_000 });

    // Card # visible, SKU hidden
    await expect(page.locator("thead th", { hasText: "Card #" })).toBeVisible();
    await expect(page.locator("thead th", { hasText: "SKU" })).toBeHidden();
  });

  test("Orders list: low-priority columns hidden", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/orders");
    await expect(
      page.locator("h1", { hasText: "Orders" }),
    ).toBeVisible({ timeout: 15_000 });

    // Order # and Status should be visible
    await expect(page.locator("thead th", { hasText: "Order #" })).toBeVisible();
    await expect(page.locator("thead th", { hasText: "Status" })).toBeVisible();
    await expect(page.locator("thead th", { hasText: "Total" })).toBeVisible();

    // Date and Items should be hidden on mobile
    await expect(page.locator("thead th", { hasText: "Date" })).toBeHidden();
    await expect(page.locator("thead th", { hasText: "Items" })).toBeHidden();
  });

  test("Admin orders: Client and Date columns hidden", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/admin/orders");
    await expect(
      page.locator("h1", { hasText: "Manage Orders" }),
    ).toBeVisible({ timeout: 15_000 });

    // Order #, Total, Status, Actions should be visible
    await expect(page.locator("thead th", { hasText: "Order #" })).toBeVisible();
    await expect(page.locator("thead th", { hasText: "Total" })).toBeVisible();
    await expect(page.locator("thead th", { hasText: "Status" })).toBeVisible();
    await expect(page.locator("thead th", { hasText: "Actions" })).toBeVisible();

    // Client and Date should be hidden on mobile
    await expect(page.locator("thead th", { hasText: "Client" })).toBeHidden();
    await expect(page.locator("thead th", { hasText: "Date" })).toBeHidden();
  });

  test("Margin calculator: renders on mobile", async ({ page }) => {
    await adminLogin(page);

    await page.goto("/margin");
    await expect(
      page.locator("h1", { hasText: "Margin Calculator" }),
    ).toBeVisible({ timeout: 15_000 });

    // Inputs should be visible
    const jpyInput = page.locator("input").first();
    await expect(jpyInput).toBeVisible();
  });
});
