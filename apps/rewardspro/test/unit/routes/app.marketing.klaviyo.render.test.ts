import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { describe, expect, it, vi } from "vitest";

// The settings page is rendered for real; only Remix hooks and server neighbours are stubbed.
const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown> }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useFetcher: () => ({ state: "idle", data: undefined, submit: vi.fn() }),
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/services/klaviyo.server", () => ({ KlaviyoService: class {} }));

import KlaviyoSettings from "~/routes/app.marketing.klaviyo";

function pageHtml(hasKlaviyoApiKey: boolean) {
  remix.loaderData = {
    shop: "test-shop.myshopify.com",
    emailSettings: {
      emailProvider: "KLAVIYO",
      klaviyoEnabled: true,
      hasKlaviyoApiKey,
      klaviyoPublicKey: null,
      klaviyoDefaultListId: null,
      klaviyoSyncProfiles: true,
      klaviyoSyncEvents: true,
      klaviyoLastSyncAt: null,
      klaviyoSyncStatus: null,
      klaviyoOAuthConnected: false,
    },
    isOAuthConfigured: false,
    automationSettings: null,
    klaviyoLists: [],
    profileCount: 0,
    eventCount: 0,
  };
  return renderToStaticMarkup(
    createElement(AppProvider, { i18n: en }, createElement(KlaviyoSettings)),
  ).replaceAll("&#x27;", "'");
}

function privateKeyInput(html: string) {
  const match = html.match(/<input[^>]*type="password"[^>]*>/);
  expect(match).not.toBeNull();
  return match![0];
}

describe("Klaviyo private API key field", () => {
  it("starts empty when a key is saved, says so, and offers to remove it", () => {
    const html = pageHtml(true);

    expect(privateKeyInput(html)).toMatch(/value=""/);
    expect(html).toContain("A key is saved. Leave this blank to keep it, or enter a new key to replace it.");
    expect(html).toContain("Remove saved key");
    expect(html).toContain("Connected (API Key)");
  });

  it("asks for a key when none is saved", () => {
    const html = pageHtml(false);

    expect(privateKeyInput(html)).toMatch(/value=""/);
    expect(html).toContain("Find this in Klaviyo → Settings → API Keys");
    expect(html).not.toContain("Remove saved key");
    expect(html).toContain("Not Connected");
  });
});
