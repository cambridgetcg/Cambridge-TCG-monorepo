/**
 * Shoppers can spend store credit at checkout only when signed in through
 * new customer accounts or using Shop Pay, by selecting "Apply store
 * credit", and only as the full amount: they can't choose part of it.
 * "Store credit isn't available for legacy customer accounts"
 * (help.shopify.com/en/manual/customers/store-credit). The membership
 * widget says so next to a signed-in shopper's balance, only on shops the
 * proxy reports as using new customer accounts, and only when there is
 * credit to spend.
 */
// @vitest-environment jsdom
import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const EXTENSION = path.resolve(__dirname, "../../../extensions/theme-app-extension-rewardspro");
const read = (file: string) => fs.readFileSync(path.join(EXTENSION, file), "utf8");
const SPEND =
  "To spend it, select Apply store credit at checkout while signed in or using Shop Pay. You can't choose to use only part of it.";

function membership(customerAccountsVersion?: string, storeCredit = 12.5) {
  return {
    success: true,
    membership: { tier: { name: "Gold", cashbackPercent: 5 } },
    balance: { storeCredit },
    settings: { currency: "GBP", ...(customerAccountsVersion ? { customerAccountsVersion } : {}) },
  };
}

function mount(attributes: string, response: unknown = membership("NEW_CUSTOMER_ACCOUNTS")) {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => response })));
  // eslint-disable-next-line no-new-func
  new Function(read("assets/rp-utils.js"))();
  document.body.innerHTML = `<div id="membership-widget-root" class="rp-widget-root"
    data-shop-domain="shop.myshopify.com" data-shop-currency="GBP" ${attributes}></div>`;
  // eslint-disable-next-line no-new-func
  new Function(read("assets/membership-widget.js"))();
  return document.getElementById("membership-widget-root")!;
}

const signedIn = `data-state="authenticated" data-customer-id="1"
  data-api-endpoint="/apps/rewardspro/membership"`;

async function rendered(root: HTMLElement) {
  await vi.waitFor(() => expect(root.querySelector(".rp-auth-c__balance-amount")).not.toBeNull());
  return root.querySelector(".rp-auth-c__balance-hero")!;
}

describe("membership widget: spending store credit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("tells a signed-in shopper how to spend their credit on a shop with new customer accounts", async () => {
    const hero = await rendered(mount(signedIn));
    expect(hero).toHaveTextContent(SPEND);
  });

  it("says nothing about spending on a shop with legacy customer accounts", async () => {
    const hero = await rendered(mount(signedIn, membership("CLASSIC")));
    expect(hero.querySelector(".rp-auth__balance-spend")).toBeNull();
  });

  it("says nothing about spending when the proxy couldn't tell which accounts the shop uses", async () => {
    const hero = await rendered(mount(signedIn, membership(undefined)));
    expect(hero.querySelector(".rp-auth__balance-spend")).toBeNull();
  });

  it("says nothing about spending when there is no credit to spend", async () => {
    const hero = await rendered(mount(signedIn, membership("NEW_CUSTOMER_ACCOUNTS", 0)));
    expect(hero.querySelector(".rp-auth__balance-spend")).toBeNull();
  });

  it("uses the theme's translation when there is one", async () => {
    const hero = await rendered(mount(`${signedIn} data-i18n-spend-at-checkout="Translated line"`));
    expect(hero).toHaveTextContent("Translated line");
    expect(hero).not.toHaveTextContent(SPEND);
  });

  it("doesn't show it to guests", () => {
    const root = mount(`data-state="guest" data-message="Join us"`);
    expect(root).not.toHaveTextContent(SPEND);
  });

  it("ships the same English in the locale, the JS fallback and the block", () => {
    const locale = JSON.parse(read("locales/en.default.json"));
    expect(locale.widget.membership.spendAtCheckout).toBe(SPEND);
    expect(read("assets/membership-widget.js")).toContain(`dataset.i18nSpendAtCheckout || "${SPEND}"`);
    expect(read("blocks/membership_widget.liquid")).toContain(
      `data-i18n-spend-at-checkout="{{ 'widget.membership.spendAtCheckout' | t }}"`,
    );
  });
});
