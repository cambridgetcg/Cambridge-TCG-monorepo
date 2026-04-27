/**
 * Shared Remambo /neworder form submission logic.
 * Used by refill.ts (and can later replace inline submission in remambo-order.ts / order-promos.ts).
 */
import type { Page } from "playwright";

export interface RemamboSubmitItem {
  url: string;
  price: number;   // JPY price from DB
  qty: number;
  comment: string;
}

export interface RemamboSubmitResult {
  livePrice: number | null;
  finalPrice: number;
}

/**
 * Submit a single item to Remambo's /neworder form.
 *
 * After URL submission, Remambo auto-populates title and price from CardRush.
 * We only touch fields that need changing:
 *   - price: override only if DB price is lower than live
 *   - qty: set only if > 1 (form defaults to 1)
 *   - shipping: set to 0
 *   - comments: set
 *   - protection: uncheck
 */
export async function submitToRemambo(
  page: Page,
  item: RemamboSubmitItem
): Promise<RemamboSubmitResult> {
  // Step 1: Navigate and submit URL
  await page.goto("https://www.remambo.jp/neworder", { waitUntil: "networkidle" });
  await page.fill('input[name="url"]', item.url);
  await page.click("button.button");
  await page.waitForLoadState("networkidle");

  // Read auto-detected live price
  const priceInput = page.locator('input[name="price"]');
  const autoPrice = await priceInput.inputValue();
  const livePrice = autoPrice ? Number(autoPrice) : null;

  // Use the lower of DB price vs live price (never overpay)
  const finalPrice =
    livePrice && livePrice > 0
      ? Math.min(item.price, livePrice)
      : item.price;

  // Step 2: Only fill fields that differ from auto-populated defaults
  if (finalPrice !== livePrice) {
    await priceInput.fill(String(finalPrice));
  }
  if (item.qty > 1) {
    await page.fill('input[name="qty"]', String(item.qty));
  }
  await page.fill('input[name="shipping"]', "0");
  await page.fill('input[name="comments"]', item.comment);

  const protection = page.locator('input[name="protection"]');
  if (await protection.isChecked()) {
    await protection.uncheck();
  }

  // Submit
  await page.click("button.button");
  await page.waitForLoadState("networkidle");

  return { livePrice, finalPrice };
}
