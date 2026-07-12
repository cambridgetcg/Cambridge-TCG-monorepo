import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_CONSENT_COOKIE,
  analyticsConsentGranted,
  trackAnalyticsEvent,
} from "./client";

describe("analyticsConsentGranted", () => {
  it("accepts only the exact granted consent cookie", () => {
    expect(
      analyticsConsentGranted(`theme=gallery; ${ANALYTICS_CONSENT_COOKIE}=granted`),
    ).toBe(true);
    expect(analyticsConsentGranted(`${ANALYTICS_CONSENT_COOKIE}=denied`)).toBe(false);
    expect(analyticsConsentGranted(`not-${ANALYTICS_CONSENT_COOKIE}=granted`)).toBe(false);
    expect(analyticsConsentGranted("")).toBe(false);
  });
});

describe("trackAnalyticsEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the typed event name and payload after consent", () => {
    const gtag = vi.fn();
    vi.stubGlobal("document", { cookie: `${ANALYTICS_CONSENT_COOKIE}=granted` });
    vi.stubGlobal("window", { gtag });

    const sent = trackAnalyticsEvent("nav_click", {
      nav_area: "desktop_primary",
      link_text: "Prices",
      link_url: "/prices",
      source_path: "/",
    });

    expect(sent).toBe(true);
    expect(gtag).toHaveBeenCalledOnce();
    expect(gtag).toHaveBeenCalledWith("event", "nav_click", {
      nav_area: "desktop_primary",
      link_text: "Prices",
      link_url: "/prices",
      source_path: "/",
    });
  });

  it("does nothing when consent is absent or denied", () => {
    const gtag = vi.fn();
    vi.stubGlobal("document", { cookie: `${ANALYTICS_CONSENT_COOKIE}=denied` });
    vi.stubGlobal("window", { gtag });

    expect(
      trackAnalyticsEvent("mobile_menu_open", { source_path: "/market" }),
    ).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("does nothing when gtag is unavailable", () => {
    vi.stubGlobal("document", { cookie: `${ANALYTICS_CONSENT_COOKIE}=granted` });
    vi.stubGlobal("window", {});

    expect(
      trackAnalyticsEvent("card_search_submit", {
        search_surface: "card_finder",
        game: "one-piece",
        query_length: 8,
        language_filter: "any",
      }),
    ).toBe(false);
  });

  it("swallows analytics failures so navigation can continue", () => {
    vi.stubGlobal("document", { cookie: `${ANALYTICS_CONSENT_COOKIE}=granted` });
    vi.stubGlobal("window", {
      gtag: vi.fn(() => {
        throw new Error("blocked");
      }),
    });

    expect(
      trackAnalyticsEvent("list_card_click", {
        nav_area: "mobile_utility",
        source_path: "/community",
      }),
    ).toBe(false);
  });
});
