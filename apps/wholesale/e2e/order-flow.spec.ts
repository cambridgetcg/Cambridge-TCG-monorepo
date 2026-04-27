import { test, expect } from "@playwright/test";
import { adminLogin, BASE, ADMIN_BASE } from "./helpers";

/*
 * E2E: Full order processing flow against the live site
 *
 * 1. Admin logs in
 * 2. Browses catalog, adds items to cart, submits order
 * 3. Navigates to admin stock check
 * 4. Marks items as in_stock → completes stock check → "quoted"
 * 5. Advances order through remaining statuses
 * 6. Verifies order detail page shows Delivered with items
 */

test.describe("Order processing flow", () => {
  test.describe.configure({ mode: "serial" });

  let orderId: number;

  test("1 — Admin logs in and sees catalog", async ({ page }) => {
    await adminLogin(page);
    await expect(
      page.locator("h1", { hasText: "Card Catalog" }),
    ).toBeVisible();
  });

  test("2 — Add items to cart and submit order", async ({ page }) => {
    await adminLogin(page);

    // Wait for catalog table to load with at least one Add button
    const firstAddBtn = page
      .locator("tbody tr button", { hasText: "Add" })
      .first();
    await expect(firstAddBtn).toBeVisible({ timeout: 15_000 });

    // Add first card to cart
    await firstAddBtn.click();

    // Wait for cart badge to appear in nav (confirms cart context updated)
    // Both mobile + desktop cart links render when itemCount > 0; check DOM presence
    await expect(page.locator('a[href="/orders/new"]').first()).toBeAttached({
      timeout: 5_000,
    });

    // Read cart items from localStorage
    const cartItems = await page.evaluate(() => {
      const raw = localStorage.getItem("tcg-cart");
      if (!raw) return [];
      return JSON.parse(raw).map(
        (i: { card: { id: number }; quantity: number }) => ({
          cardId: i.card.id,
          quantity: i.quantity,
        }),
      );
    });
    expect(cartItems.length).toBeGreaterThan(0);
    console.log("Cart items:", JSON.stringify(cartItems));

    // Note the highest existing order ID so we can identify our new order
    const ctx = page.context();
    const preRes = await ctx.request.get(`${BASE}/api/admin/orders`);
    const preOrders: { id: number }[] = await preRes.json();
    const maxIdBefore = preOrders.length > 0
      ? Math.max(...preOrders.map((o) => o.id))
      : 0;

    // Submit order via API — may return 500 if Vercel function times out
    // during email sending, but the order INSERT completes before the email.
    const res = await ctx.request.post(`${BASE}/api/orders`, {
      data: { items: cartItems },
    });

    if (res.ok()) {
      const order = await res.json();
      orderId = order.id;
      console.log(`Order #${orderId} created via API`);
    } else {
      // The order may have been created despite the error (DB insert
      // happens before email send, which can timeout on serverless).
      console.log(
        `API returned ${res.status()}, checking for newly created order...`,
      );
      const postRes = await ctx.request.get(`${BASE}/api/admin/orders`);
      expect(postRes.ok()).toBe(true);
      const postOrders: { id: number; status: string }[] =
        await postRes.json();
      const newOrders = postOrders
        .filter((o) => o.id > maxIdBefore)
        .sort((a, b) => b.id - a.id);

      if (newOrders.length > 0) {
        orderId = newOrders[0].id;
        console.log(`Found new order #${orderId} via admin API fallback`);
      } else {
        throw new Error(
          `Order creation failed: API ${res.status()}, no new orders found (max ID before: ${maxIdBefore})`,
        );
      }
    }

    expect(orderId).toBeGreaterThan(0);

    // Clear cart and verify order detail page
    await page.evaluate(() => localStorage.removeItem("tcg-cart"));
    await page.goto(`/orders/${orderId}`);
    await expect(
      page.locator(`text=Order #${orderId}`),
    ).toBeVisible({ timeout: 10_000 });
    // StatusBadge is a <span>, timeline steps are <div> — target the badge
    await expect(
      page.locator("span.inline-block", { hasText: "Submitted" }),
    ).toBeVisible();
    console.log(`Verified order #${orderId} is Submitted`);
  });

  test("3 — Admin opens stock check for the order", async ({ page }) => {
    expect(orderId).toBeGreaterThan(0);
    await adminLogin(page);

    await page.goto(`${ADMIN_BASE}/admin/orders/${orderId}/stock-check`);
    await expect(
      page.locator("h1", { hasText: "Stock Check" }),
    ).toBeVisible({ timeout: 15_000 });

    // Verify progress bar shows 0/N checked
    await expect(
      page.locator("text=/0\\/\\d+ items checked/"),
    ).toBeVisible();
  });

  test("4 — Mark items during stock check and complete", async ({ page }) => {
    expect(orderId).toBeGreaterThan(0);
    await adminLogin(page);

    await page.goto(`${ADMIN_BASE}/admin/orders/${orderId}/stock-check`);
    await expect(
      page.locator("h1", { hasText: "Stock Check" }),
    ).toBeVisible({ timeout: 15_000 });

    // Get all item cards (inside .space-y-3 container)
    const itemCards = page.locator(".space-y-3 > div");
    const count = await itemCards.count();
    expect(count).toBeGreaterThan(0);
    console.log(`Stock check: ${count} item(s) to check`);

    // Mark each item as "In Stock"
    for (let i = 0; i < count; i++) {
      const item = itemCards.nth(i);
      await item.locator('button:has-text("In Stock")').click();
      // Wait for the border to turn green (confirms save completed)
      await expect(item).toHaveClass(/border-green/, { timeout: 10_000 });
    }

    // All items should now be checked
    await expect(
      page.locator("text=All items checked"),
    ).toBeVisible({ timeout: 5_000 });

    // Click Send Quote
    const sendBtn = page.locator('button:has-text("Send Quote")');
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Should redirect to admin orders page
    await page.waitForURL(/admin.*\/orders/, { timeout: 15_000 });
  });

  test("5 — Verify order is Quoted and advance through statuses", async ({
    page,
  }) => {
    expect(orderId).toBeGreaterThan(0);
    await adminLogin(page);

    await page.goto(`${ADMIN_BASE}/admin/orders`);
    await expect(
      page.locator("h1", { hasText: "Manage Orders" }),
    ).toBeVisible({ timeout: 15_000 });

    // Find our order row
    const orderRow = page.locator("tr", { hasText: `#${orderId}` });
    await expect(orderRow).toBeVisible({ timeout: 10_000 });

    // Verify status badge shows "Quoted"
    await expect(orderRow.locator("text=Quoted")).toBeVisible();

    // Quoted → Confirmed: expand the row and click "Confirm Order" in the quote editor
    await orderRow.click();
    const confirmBtn = page.locator('button:has-text("Confirm Order")');
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();
    // Row collapses; wait for status to update
    await expect(orderRow.locator("text=Confirmed")).toBeVisible({ timeout: 10_000 });
    console.log(`Order #${orderId}: → Confirmed`);

    // Remaining transitions use row-level action buttons
    const transitions = [
      { button: "Mark Paid", expected: "Paid" },
      { button: "Mark Ordered", expected: "Ordered" },
      { button: "Mark Shipped", expected: "Shipped" },
      { button: "Mark Delivered", expected: "Delivered" },
    ];

    for (const { button, expected } of transitions) {
      await orderRow.locator(`button:has-text("${button}")`).click();
      await expect(orderRow.locator(`text=${expected}`)).toBeVisible({
        timeout: 10_000,
      });
      console.log(`Order #${orderId}: → ${expected}`);
    }
  });

  test("6 — Verify order detail page shows Delivered with items", async ({
    page,
  }) => {
    expect(orderId).toBeGreaterThan(0);
    await adminLogin(page);

    await page.goto(`/orders/${orderId}`);
    await expect(
      page.locator(`text=Order #${orderId}`),
    ).toBeVisible({ timeout: 10_000 });

    // Delivered status badge (span) should be visible
    await expect(
      page.locator("span.inline-block", { hasText: "Delivered" }),
    ).toBeVisible();

    // Items table should have rows (verifies leftJoin fix works)
    const itemRows = page.locator("tbody tr");
    await expect(itemRows.first()).toBeVisible();
    console.log(`Order #${orderId}: Delivered with ${await itemRows.count()} item(s) verified`);
  });
});
