import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { B2B_PURCHASE_AVAILABILITY } from "./purchase-availability";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("B2B new-purchase boundary", () => {
  it("keeps price-derived browsing and every new-purchase step closed", () => {
    expect(B2B_PURCHASE_AVAILABILITY).toMatchObject({
      catalog_mode: "structural",
      price_values_available: false,
      price_sort_available: false,
      new_cart_items_enabled: false,
      checkout_enabled: false,
    });
  });

  it("rejects checkout before cart, price, stock, or Stripe work", () => {
    const checkout = source("src/lib/b2b/checkout.ts");
    const guard = checkout.indexOf("if (!B2B_PURCHASE_AVAILABILITY.checkout_enabled)");

    expect(guard).toBeGreaterThan(-1);
    for (const operation of [
      "loadCartRows(userId)",
      'fetchCard(r.sku, "wholesale")',
      "getStripe()",
      "reserveCartItems(",
    ]) {
      expect(guard, operation).toBeLessThan(checkout.indexOf(operation));
    }
  });

  it("does not let the add-item action create a row while paused", () => {
    const actions = source("src/app/account/b2b/cart/actions.ts");
    const guard = actions.indexOf(
      "if (!B2B_PURCHASE_AVAILABILITY.new_cart_items_enabled) return",
    );

    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(
      actions.indexOf("const user = await requireWholesalePage()"),
    );
    expect(guard).toBeLessThan(actions.indexOf("cart.addItem"));
  });

  it("shows structural status without price sort or new-payment affordances", () => {
    const currentSurfaces = [
      "src/app/account/b2b/page.tsx",
      "src/app/account/b2b/catalog/page.tsx",
      "src/app/account/b2b/cards/[sku]/page.tsx",
      "src/app/account/b2b/cart/page.tsx",
      "src/app/account/b2b/checkout/page.tsx",
    ].map(source).join("\n");

    expect(currentSurfaces).not.toMatch(/price_(?:asc|desc)/);
    expect(currentSurfaces).not.toContain("AddToB2BCart");
    expect(currentSurfaces).not.toContain("PayButton");
    expect(currentSurfaces).not.toMatch(/prices apply|sort by price|Pay with Stripe/i);
    expect(currentSurfaces).toContain("Withheld");
    expect(currentSurfaces).toContain("Checkout paused");
  });

  it("preserves paid amounts only on completed order-history surfaces", () => {
    const orderHistory = [
      "src/app/account/b2b/orders/page.tsx",
      "src/app/account/b2b/orders/[id]/page.tsx",
    ].map(source).join("\n");

    expect(orderHistory).toContain("order.total_pence");
    expect(orderHistory).toContain("price_pence");
  });
});
