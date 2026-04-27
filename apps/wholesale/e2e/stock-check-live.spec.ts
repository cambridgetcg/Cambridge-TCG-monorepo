import { test, expect } from "@playwright/test";
import { adminLogin } from "./helpers";

/**
 * E2E: Live stock check on order 33
 *
 * 1. Admin logs in
 * 2. Opens stock check for order 33
 * 3. Clicks "Check All" to trigger live stock check
 * 4. Waits for progress to advance (not full completion — too many items)
 * 5. Verifies live results appear and items auto-transition
 */

const ORDER_ID = 33;
const ADMIN_BASE = "https://admin.wholesaletcgdirect.com";

test.describe("Live stock check — Order 33", () => {
  test("Check All auto-processes items and shows live results", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await adminLogin(page);

    await page.goto(`${ADMIN_BASE}/admin/orders/${ORDER_ID}/stock-check`);
    await expect(
      page.locator("h1", { hasText: "Stock Check" }),
    ).toBeVisible({ timeout: 15_000 });

    // Read progress before
    const progressText = await page
      .locator("text=/\\d+\\/\\d+ items checked/")
      .textContent();
    const match = progressText?.match(/(\d+)\/(\d+)/);
    const checkedBefore = match ? parseInt(match[1]) : 0;
    const total = match ? parseInt(match[2]) : 0;
    console.log(`Before: ${checkedBefore}/${total}`);

    // Click Check All
    const checkAllBtn = page.locator('button:has-text("Check All")');
    await expect(checkAllBtn).toBeEnabled();
    await checkAllBtn.click();

    // Progress counter should appear on button
    await expect(
      page.locator("button", { hasText: /Checking \d+\// }),
    ).toBeVisible({ timeout: 10_000 });
    console.log("Check All started — progress visible");

    // Wait for at least some stock indicators to appear (first batch results)
    await expect(page.locator("text=/\\d+ in stock/").first()).toBeVisible({
      timeout: 120_000,
    });
    console.log("First live results appeared");

    // Wait for progress to advance by at least 10 items
    await expect(async () => {
      const text = await page
        .locator("text=/\\d+\\/\\d+ items checked/")
        .textContent();
      const m = text?.match(/(\d+)\/(\d+)/);
      const now = m ? parseInt(m[1]) : 0;
      expect(now).toBeGreaterThanOrEqual(checkedBefore + 10);
    }).toPass({ timeout: 120_000 });

    // Read final progress
    const afterText = await page
      .locator("text=/\\d+\\/\\d+ items checked/")
      .textContent();
    const afterMatch = afterText?.match(/(\d+)\/(\d+)/);
    const checkedAfter = afterMatch ? parseInt(afterMatch[1]) : 0;
    console.log(
      `After: ${checkedAfter}/${total} (+${checkedAfter - checkedBefore})`,
    );

    // Verify live result indicators
    const stockCount = await page.locator("text=/\\d+ in stock/").count();
    const priceOkCount = await page.locator("text=/¥[\\d,]+ ✓/").count();
    console.log(
      `Stock indicators: ${stockCount}, Price match (✓): ${priceOkCount}`,
    );
    expect(stockCount).toBeGreaterThan(0);

    // Screenshot
    await page.screenshot({
      path: "test-results/stock-check-live.png",
      fullPage: true,
    });
    console.log("Screenshot saved");
  });

  test("Per-item Check button works on a single item", async ({ page }) => {
    test.setTimeout(60_000);

    await adminLogin(page);
    await page.goto(`${ADMIN_BASE}/admin/orders/${ORDER_ID}/stock-check`);
    await expect(
      page.locator("h1", { hasText: "Stock Check" }),
    ).toBeVisible({ timeout: 15_000 });

    // Find a pending item by its dark border
    const allItems = page.locator(".space-y-3 > div");
    const itemCount = await allItems.count();
    let targetIdx = -1;
    for (let i = 0; i < itemCount; i++) {
      const cls = (await allItems.nth(i).getAttribute("class")) ?? "";
      if (cls.includes("border-[#1e1e2e]")) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx === -1) {
      console.log("No pending items left — skipping per-item test");
      return;
    }

    // Use nth() locator which is stable even if class changes
    const targetItem = allItems.nth(targetIdx);
    const cardNum = await targetItem.locator(".font-mono").textContent();
    console.log(`Checking single item [${targetIdx}]: ${cardNum}`);

    const checkBtn = targetItem.locator('button:has-text("Check")').first();
    await checkBtn.click();

    // Wait for result text to appear on this item
    await expect(
      targetItem.locator("text=/\\d+ in stock|Out of stock/"),
    ).toBeVisible({ timeout: 30_000 });

    const resultText = await targetItem
      .locator("text=/\\d+ in stock|Out of stock/")
      .textContent();
    console.log(`Result for ${cardNum}: ${resultText}`);

    // Verify the item is no longer pending (green or red border)
    const cls = (await targetItem.getAttribute("class")) ?? "";
    const transitioned =
      cls.includes("border-green") || cls.includes("border-red");
    expect(transitioned).toBe(true);
    console.log(`${cardNum} transitioned from pending`);
  });
});
