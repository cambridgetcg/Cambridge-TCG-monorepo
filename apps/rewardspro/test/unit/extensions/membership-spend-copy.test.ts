/**
 * Shoppers can spend store credit at checkout only when signed in through
 * customer accounts or using Shop Pay, and only as their full balance
 * (help.shopify.com/en/manual/customers/store-credit). The membership
 * widget says so next to a signed-in shopper's balance.
 */
// @vitest-environment jsdom
import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXTENSION = path.resolve(__dirname, "../../../extensions/theme-app-extension-rewardspro");
const read = (file: string) => fs.readFileSync(path.join(EXTENSION, file), "utf8");
const SPEND = "Spend it at checkout while signed in or with Shop Pay. Your full balance is applied.";

const membership = {
  success: true,
  membership: { tier: { name: "Gold", cashbackPercent: 5 } },
  balance: { storeCredit: 12.5 },
};

function mount(attributes: string) {
  document.body.innerHTML = `<div id="membership-widget-root" class="rp-widget-root"
    data-shop-domain="shop.myshopify.com" data-shop-currency="GBP" ${attributes}></div>`;
  // eslint-disable-next-line no-new-func
  new Function(read("assets/membership-widget.js"))();
  return document.getElementById("membership-widget-root")!;
}

const signedIn = `data-state="authenticated" data-customer-id="1"
  data-api-endpoint="/apps/rewardspro/membership"`;

describe("membership widget: spending store credit", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => membership })));
    // eslint-disable-next-line no-new-func
    new Function(read("assets/rp-utils.js"))();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("tells a signed-in shopper how their credit is spent", async () => {
    const root = mount(signedIn);
    await vi.waitFor(() => expect(root.querySelector(".rp-auth-c__balance-amount")).not.toBeNull());
    expect(root.querySelector(".rp-auth-c__balance-hero")).toHaveTextContent(SPEND);
  });

  it("uses the theme's translation when there is one", async () => {
    const root = mount(`${signedIn} data-i18n-spend-at-checkout="Translated line"`);
    await vi.waitFor(() => expect(root).toHaveTextContent("Translated line"));
    expect(root).not.toHaveTextContent(SPEND);
  });

  it("doesn't show it to guests", () => {
    const root = mount(`data-state="guest" data-message="Join us"`);
    expect(root).not.toHaveTextContent(SPEND);
  });

  it("ships the same English in the locale and passes it through the block", () => {
    const locale = JSON.parse(read("locales/en.default.json"));
    expect(locale.widget.membership.spendAtCheckout).toBe(SPEND);
    expect(read("blocks/membership_widget.liquid")).toContain(
      `data-i18n-spend-at-checkout="{{ 'widget.membership.spendAtCheckout' | t }}"`,
    );
  });
});
