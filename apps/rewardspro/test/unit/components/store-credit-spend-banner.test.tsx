import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";

import { StoreCreditSpendBanner } from "~/components/StoreCreditSpendBanner";
import type { StoreCreditSpendProblem } from "~/services/store-credit-spend.server";

const SETTINGS_URL = "https://shop.myshopify.com/admin/settings/customer_accounts";

function bannerHtml(problems: StoreCreditSpendProblem[]) {
  const view = renderToStaticMarkup(
    createElement(AppProvider, { i18n: en }, createElement(StoreCreditSpendBanner, { shop: "shop.myshopify.com", problems })),
  );
  return view.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

describe("store credit spend banner", () => {
  it("says how shoppers spend store credit, and what this shop must change", () => {
    const html = bannerHtml(["legacy-accounts"]);

    expect(html).toContain("Make sure shoppers can spend their store credit");
    expect(html).toContain(
      "Shoppers can spend it at checkout only when they sign in with new customer accounts or pay with Shop Pay.",
    );
    expect(html).toContain("Your store uses legacy customer accounts, which don't support store credit.");
    expect(html).toContain("Upgrade to new customer accounts.");
  });

  it.each([
    ["sign-in-links-hidden", "Your store hides its sign-in links, so shoppers can't sign in at checkout. Show the sign-in links."],
    ["store-credit-off", "Store credit is turned off, so checkout doesn't offer it. Turn on Store credit."],
  ] as const)("explains %s in plain words", (problem, text) => {
    expect(bannerHtml([problem])).toContain(text);
  });

  it("lists every problem the shop has", () => {
    const html = bannerHtml(["legacy-accounts", "sign-in-links-hidden", "store-credit-off"]);

    expect(html).toContain("legacy customer accounts");
    expect(html).toContain("hides its sign-in links");
    expect(html).toContain("Store credit is turned off");
  });

  it("opens Settings > Customer accounts, where each fix is, in a new tab", () => {
    const html = bannerHtml(["store-credit-off"]);
    const link = (html.match(/<a\b[^>]*>/g) ?? []).find((tag) => tag.includes(`href="${SETTINGS_URL}"`));

    expect(link).toBeDefined();
    expect(link).toContain('target="_blank"');
    expect(html).toContain("Open customer account settings");
  });

  it("can't be dismissed: it stays until the shop is fixed", () => {
    expect(bannerHtml(["legacy-accounts"])).not.toContain("Dismiss");
  });

  it("renders nothing when shoppers can spend their store credit", () => {
    const html = bannerHtml([]);

    expect(html).not.toContain("store credit");
    expect(html).not.toContain(SETTINGS_URL);
  });
});
