import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { describe, expect, it, vi } from "vitest";

import {
  FirstRunSetupCard,
  shouldShowFirstRunSetup,
  type FirstRunSetupState,
} from "~/components/FirstRunSetupCard";

const THEME_EDITOR_URL =
  "https://shop.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=key/membership_widget";

const newShop: FirstRunSetupState = {
  hasTier: false,
  autoCashbackOn: false,
  widgetOn: false,
  themeEditorUrl: THEME_EDITOR_URL,
};

function cardHtml(state: FirstRunSetupState, notices?: string) {
  const view = renderToStaticMarkup(
    createElement(
      AppProvider,
      { i18n: en },
      createElement(FirstRunSetupCard, {
        ...state,
        onCreateTier: vi.fn(),
        onTurnOnCashback: vi.fn(),
        onDismiss: vi.fn(),
        notices: notices ? createElement("p", null, notices) : undefined,
      }),
    ),
  );
  return view.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

describe("first-run setup card", () => {
  it("lists the three steps a new shop needs before customers earn cashback", () => {
    const html = cardHtml(newShop);

    expect(html).toContain("Create your first tier");
    expect(html).toContain("Until a tier exists, orders earn nothing.");
    expect(html).toContain("Turn on automatic cashback");
    expect(html).toContain("While it's off, cashback waits on the Orders page for you to issue.");
    expect(html).toContain("Turn on the rewards widget");
    expect(html).toContain("Click Save in the theme editor to publish it.");
  });

  it("opens the theme editor in a new tab with the membership widget embed switched on", () => {
    const html = cardHtml(newShop);
    const link = (html.match(/<a\b[^>]*>/g) ?? []).find((tag) => tag.includes(`href="${THEME_EDITOR_URL}"`));

    expect(link).toBeDefined();
    expect(link).toContain('target="_blank"');
  });

  it("marks finished steps done and drops their action", () => {
    const html = cardHtml({ ...newShop, hasTier: true, autoCashbackOn: true });

    expect(html.match(/>Done</g) ?? []).toHaveLength(2);
    expect(html).not.toContain("Create a tier");
    expect(html).not.toContain(">Turn on<");
    expect(html).toContain("Open theme editor");
  });

  it("shows notices above the steps", () => {
    const html = cardHtml(newShop, "A notice for this shop");

    expect(html.indexOf("A notice for this shop")).toBeGreaterThan(-1);
    expect(html.indexOf("A notice for this shop")).toBeLessThan(html.indexOf("Create your first tier"));
  });
});

describe("when the first-run setup card shows", () => {
  it("shows while any step is unfinished", () => {
    expect(shouldShowFirstRunSetup(newShop, false)).toBe(true);
    expect(shouldShowFirstRunSetup({ ...newShop, hasTier: true, autoCashbackOn: true }, false)).toBe(true);
  });

  it("hides once every step is done", () => {
    expect(shouldShowFirstRunSetup({ ...newShop, hasTier: true, autoCashbackOn: true, widgetOn: true }, false)).toBe(false);
  });

  it("hides once the merchant dismisses it", () => {
    expect(shouldShowFirstRunSetup(newShop, true)).toBe(false);
  });
});
