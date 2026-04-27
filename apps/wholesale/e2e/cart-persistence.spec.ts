import { test, expect } from "@playwright/test";
import { adminLogin, BASE } from "./helpers";

/*
 * E2E: Cart persistence across logout/login
 *
 * Verifies that items added to the cart survive a sign-out → sign-in cycle.
 * Cart items persist via both localStorage and server-side DB sync.
 */

test.describe("Cart persistence", () => {
  test("Cart items survive logout and login", async ({ page }) => {
    // 1. Log in and add an item to cart
    await adminLogin(page);

    const firstAddBtn = page
      .locator("tbody tr button", { hasText: "Add" })
      .first();
    await expect(firstAddBtn).toBeVisible({ timeout: 15_000 });
    await firstAddBtn.click();

    // Wait for localStorage to be populated with the cart item
    await expect(async () => {
      const count = await page.evaluate(() => {
        const raw = localStorage.getItem("tcg-cart");
        return raw ? JSON.parse(raw).length : 0;
      });
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 5_000 });

    // Record what's in the cart (card ID + quantity)
    const cartBefore = await page.evaluate(() => {
      const raw = localStorage.getItem("tcg-cart");
      if (!raw) return [];
      return JSON.parse(raw).map(
        (i: { card: { id: number }; quantity: number }) => ({
          cardId: i.card.id,
          quantity: i.quantity,
        }),
      );
    });
    expect(cartBefore.length).toBeGreaterThan(0);
    console.log("Cart before logout:", JSON.stringify(cartBefore));

    // Wait for debounced server sync to complete (1500ms debounce + network)
    await page.waitForTimeout(3000);

    // 2. Sign out via the desktop-visible button
    const signOutBtn = page
      .locator("div.hidden.md\\:flex button", { hasText: "Sign Out" });
    await signOutBtn.click();

    // Wait for redirect to login page
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    console.log("Signed out, now on login page");

    // 3. Log back in
    await adminLogin(page);

    // 4. Wait for cart to be restored (from localStorage or server merge)
    await expect(async () => {
      const count = await page.evaluate(() => {
        const raw = localStorage.getItem("tcg-cart");
        return raw ? JSON.parse(raw).length : 0;
      });
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    // 5. Verify cart items are restored
    const cartAfter = await page.evaluate(() => {
      const raw = localStorage.getItem("tcg-cart");
      if (!raw) return [];
      return JSON.parse(raw).map(
        (i: { card: { id: number }; quantity: number }) => ({
          cardId: i.card.id,
          quantity: i.quantity,
        }),
      );
    });
    console.log("Cart after login:", JSON.stringify(cartAfter));

    expect(cartAfter.length).toBeGreaterThan(0);

    // Every item from before logout should still be present
    for (const before of cartBefore) {
      const found = cartAfter.find(
        (a: { cardId: number }) => a.cardId === before.cardId,
      );
      expect(found).toBeTruthy();
      expect(found.quantity).toBeGreaterThanOrEqual(before.quantity);
    }

    // Cart badge should be visible in desktop nav
    const desktopCartLink = page.locator(
      'div.hidden.md\\:flex a[href="/orders/new"]',
    );
    await expect(desktopCartLink).toBeVisible({ timeout: 5_000 });
    console.log("Cart persistence verified");

    // 6. Clean up — clear the cart so we don't leave test data
    await page.evaluate(() => localStorage.removeItem("tcg-cart"));
    const ctx = page.context();
    await ctx.request.delete(`${BASE}/api/cart`).catch(() => {});
  });
});
