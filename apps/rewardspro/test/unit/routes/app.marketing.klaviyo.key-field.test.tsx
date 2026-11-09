// @vitest-environment jsdom
import { createElement } from "react";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The settings page is rendered for real; only Remix hooks and server neighbours are stubbed.
// Every fetcher shares one submit, so a test sees what the page posts.
const remix = vi.hoisted(() => ({ loaderData: {} as Record<string, unknown>, submit: vi.fn() }));
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => remix.loaderData,
  useFetcher: () => ({ state: "idle", data: undefined, submit: remix.submit }),
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock("~/shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("~/db.server", () => ({ default: {} }));
vi.mock("~/services/klaviyo.server", () => ({ KlaviyoService: class {} }));

import KlaviyoSettings from "~/routes/app.marketing.klaviyo";

describe("Klaviyo private API key field, clicked", () => {
  it("forgets a typed key once the saved key is removed, so a later save can't put it back", async () => {
    remix.loaderData = {
      shop: "test-shop.myshopify.com",
      emailSettings: {
        emailProvider: "KLAVIYO",
        klaviyoEnabled: true,
        hasKlaviyoApiKey: true,
        hasStoredKlaviyoApiKey: true,
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
    render(createElement(AppProvider, { i18n: en }, createElement(KlaviyoSettings)));
    const user = userEvent.setup();

    const keyField = screen.getByLabelText("Klaviyo Private API Key");
    await user.type(keyField, "pk_typed_before_removal");
    await user.click(screen.getByRole("button", { name: "Remove saved key" }));

    expect((remix.submit.mock.calls[0][0] as FormData).get("intent")).toBe("removeApiKey");
    expect(keyField).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Save Connection Settings" }));

    const saved = remix.submit.mock.calls[1][0] as FormData;
    expect(saved.get("intent")).toBe("saveConnection");
    expect(saved.get("klaviyoApiKey")).toBe("");
  });
});
