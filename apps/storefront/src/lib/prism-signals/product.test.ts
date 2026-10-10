import { describe, expect, it } from "vitest";
import { PRODUCT_OFFER_NON_CLAIMS } from "@cambridge-tcg/product-flow";
import {
  PRISM_SIGNALS_PLAN_CATALOG,
  createPrismSignalsAllStripeTestOffer,
  createPrismSignalsPreviewOffer,
  prismSignalsTelegramPreviewHref,
} from "./product";
import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_LINKS,
  PRISM_TELEGRAM_PREVIEW_START,
} from "./presentation";

describe("PRISM Signals canonical preview offer", () => {
  it("keeps rights unevaluated and every payment rail off", () => {
    const offer = createPrismSignalsPreviewOffer();
    expect(offer).toMatchObject({
      schema: "cambridgetcg.product-offer/1",
      id: "prism-signals",
      version: 1,
      status: "preview",
      environment: "test",
      rights: {
        purpose: "subscriber_derived_signal",
        decision: "not_evaluated",
      },
      delivery: {
        web: { availability: "test", url: "/prism-signals" },
        telegram: { availability: "off" },
      },
    });
    expect(offer.rails).toHaveLength(4);
    expect(offer.rails.every((rail) => rail.availability === "off")).toBe(true);
    expect(offer.rails.every((rail) => !("price_ref" in rail))).toBe(true);
    expect(offer.non_claims).toEqual(PRODUCT_OFFER_NON_CLAIMS);
    expect(offer.brand).toEqual({
      name: PRISM_SIGNALS_BRAND.maker,
      product_name: PRISM_SIGNALS_BRAND.name,
      byline: PRISM_SIGNALS_BRAND.tagline,
    });
    expect(offer.links).toEqual({
      terms: PRISM_SIGNALS_LINKS.terms.path,
      support: PRISM_SIGNALS_LINKS.support.path,
      methodology: PRISM_SIGNALS_LINKS.methodology.path,
    });
    expect(Object.isFrozen(offer)).toBe(true);
    expect(prismSignalsTelegramPreviewHref(offer)).toBeNull();
  });

  it("can expose only the configured free Telegram test delivery", () => {
    const offer = createPrismSignalsPreviewOffer({
      telegram_bot_username: "PrismSignalsPreviewBot",
    });
    expect(offer.delivery.telegram).toEqual({
      availability: "test",
      bot_username: "PrismSignalsPreviewBot",
      start_parameter: PRISM_TELEGRAM_PREVIEW_START,
    });
    expect(prismSignalsTelegramPreviewHref(offer)).toBe(
      `https://t.me/PrismSignalsPreviewBot?start=${PRISM_TELEGRAM_PREVIEW_START}`,
    );
    expect(offer.rails.find((rail) => rail.rail === "telegram_stars")).toEqual({
      rail: "telegram_stars",
      channel: "telegram",
      availability: "off",
    });
  });

  it("re-exports the frozen plan catalogue and All sandbox offer factory", () => {
    expect(PRISM_SIGNALS_PLAN_CATALOG.plans.map((plan) => plan.name)).toEqual([
      "Free",
      "All",
    ]);
    expect(
      createPrismSignalsAllStripeTestOffer({
        price_ref: "pf_prism_all_price_01",
      }),
    ).toMatchObject({
      id: "prism-signals-all",
      status: "test",
      environment: "test",
      rights: {
        purpose: "synthetic_fixture_delivery",
        decision: "granted",
      },
    });
  });

  it("rejects a fabricated or malformed bot identity", () => {
    expect(() =>
      createPrismSignalsPreviewOffer({ telegram_bot_username: "not-a-bot" }),
    ).toThrow(/product-flow\/v1 offer contract/);
  });
});
