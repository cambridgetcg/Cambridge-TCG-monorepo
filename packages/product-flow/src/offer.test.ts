import { describe, expect, it } from "vitest";

import {
  PRODUCT_OFFER_NON_CLAIMS,
  PRODUCT_PAYMENT_RAILS,
  ProductFlowContractError,
  buildTelegramDeepLinkV1,
  parseProductOfferV1,
} from "./index";

const ref = (label: string) => `pf_${label.padEnd(16, "x")}`;

function offRails() {
  return [
    { rail: "stripe_web", channel: "web", availability: "off" },
    { rail: "telegram_stars", channel: "telegram", availability: "off" },
    { rail: "paypal_web", channel: "web", availability: "off" },
    { rail: "crypto_web", channel: "web", availability: "off" },
  ];
}

function previewOffer() {
  return {
    schema: "cambridgetcg.product-offer/1",
    brand: {
      name: "Cambridge TCG",
      product_name: "Example Signals",
      byline: "Example Signals by Cambridge TCG",
    },
    id: "example-signals",
    version: 1,
    status: "preview",
    environment: "test",
    audience: "Collectors evaluating a clearly labelled preview.",
    delivery: {
      web: { availability: "test", url: "/example-signals" },
      telegram: {
        availability: "test",
        bot_username: "ExampleSignalsBot",
        start_parameter: "example_preview",
      },
    },
    rails: offRails(),
    rights: {
      purpose: "subscriber_derived_signal",
      decision: "not_evaluated",
    },
    links: {
      terms: "/example-signals/terms",
      support: "https://example.com/support",
      methodology: "/methodology/example-signals",
    },
    non_claims: [...PRODUCT_OFFER_NON_CLAIMS],
  };
}

function testOffer() {
  const offer = previewOffer();
  offer.status = "test";
  offer.rights.decision = "granted";
  offer.rails = [
    {
      rail: "stripe_web",
      channel: "web",
      availability: "test",
      price_ref: ref("stripe-test-price"),
    },
    {
      rail: "telegram_stars",
      channel: "telegram",
      availability: "test",
      price_ref: ref("stars-test-price"),
    },
    { rail: "paypal_web", channel: "web", availability: "off" },
    { rail: "crypto_web", channel: "web", availability: "off" },
  ] as ReturnType<typeof offRails>;
  return offer;
}

function liveOffer() {
  const offer = testOffer();
  offer.status = "live";
  offer.environment = "production";
  offer.delivery.web.availability = "live";
  offer.delivery.telegram.availability = "live";
  offer.rails = [
    {
      rail: "stripe_web",
      channel: "web",
      availability: "live",
      price_ref: ref("stripe-live-price"),
    },
    {
      rail: "telegram_stars",
      channel: "telegram",
      availability: "live",
      price_ref: ref("stars-live-price"),
    },
    { rail: "paypal_web", channel: "web", availability: "off" },
    { rail: "crypto_web", channel: "web", availability: "off" },
  ] as ReturnType<typeof offRails>;
  return offer;
}

describe("parseProductOfferV1", () => {
  it("parses a complete preview offer and deeply freezes a fresh output", () => {
    const input = previewOffer();
    const parsed = parseProductOfferV1(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.brand)).toBe(true);
    expect(Object.isFrozen(parsed.delivery.telegram)).toBe(true);
    expect(Object.isFrozen(parsed.rails)).toBe(true);
    expect(Object.isFrozen(parsed.rails[0])).toBe(true);
    expect(parsed.non_claims).toBe(PRODUCT_OFFER_NON_CLAIMS);
  });

  it("canonicalizes rail declaration order", () => {
    const offer = previewOffer();
    offer.rails.reverse();
    expect(parseProductOfferV1(offer).rails.map((entry) => entry.rail)).toEqual(
      PRODUCT_PAYMENT_RAILS,
    );
  });

  it("requires preview and test offers to remain in test", () => {
    for (const status of ["preview", "test"] as const) {
      const offer = status === "preview" ? previewOffer() : testOffer();
      offer.status = status;
      offer.environment = "production";
      expect(() => parseProductOfferV1(offer)).toThrow(
        ProductFlowContractError,
      );
    }
  });

  it("allows live availability only on a live production offer", () => {
    expect(parseProductOfferV1(liveOffer()).status).toBe("live");

    const testEnvironment = liveOffer();
    testEnvironment.environment = "test";
    expect(() => parseProductOfferV1(testEnvironment)).toThrow(
      ProductFlowContractError,
    );

    const preview = previewOffer();
    preview.delivery.web = { availability: "live", url: "/example-signals" };
    expect(() => parseProductOfferV1(preview)).toThrow(
      ProductFlowContractError,
    );
  });

  it("allows test rails only on test status, never preview", () => {
    const offer = testOffer();
    expect(parseProductOfferV1(offer).rails[0]?.availability).toBe("test");
    offer.status = "preview";
    expect(() => parseProductOfferV1(offer)).toThrow(ProductFlowContractError);
  });

  it("pins Telegram Stars to Telegram and all other rails to web", () => {
    const cases = [
      ["stripe_web", "telegram"],
      ["telegram_stars", "web"],
      ["paypal_web", "telegram"],
      ["crypto_web", "telegram"],
    ] as const;
    for (const [rail, wrongChannel] of cases) {
      const offer = testOffer();
      const declaration = offer.rails.find((entry) => entry.rail === rail)!;
      declaration.channel = wrongChannel;
      expect(() => parseProductOfferV1(offer), rail).toThrow(
        ProductFlowContractError,
      );
    }
  });

  it("requires all four rails exactly once", () => {
    const missing = previewOffer();
    missing.rails.pop();
    expect(() => parseProductOfferV1(missing)).toThrow(
      ProductFlowContractError,
    );

    const duplicate = previewOffer();
    duplicate.rails[3] = { ...duplicate.rails[0]! };
    expect(() => parseProductOfferV1(duplicate)).toThrow(
      ProductFlowContractError,
    );
  });

  it("forbids price_ref on off rails and requires an opaque one when enabled", () => {
    const offWithPrice = previewOffer();
    Object.assign(offWithPrice.rails[0]!, { price_ref: ref("hidden-price") });
    expect(() => parseProductOfferV1(offWithPrice)).toThrow(
      ProductFlowContractError,
    );

    const rawProviderPrice = testOffer();
    rawProviderPrice.rails[0]!.price_ref = "price_123_customer@example.com";
    expect(() => parseProductOfferV1(rawProviderPrice)).toThrow(
      ProductFlowContractError,
    );
  });

  it("requires live rights to be granted", () => {
    const offer = liveOffer();
    offer.rights.decision = "not_evaluated";
    expect(() => parseProductOfferV1(offer)).toThrow(ProductFlowContractError);
  });

  it("requires the complete fixed non-claim set in canonical order", () => {
    const missing = previewOffer();
    missing.non_claims.pop();
    expect(() => parseProductOfferV1(missing)).toThrow(
      ProductFlowContractError,
    );

    const reordered = previewOffer();
    reordered.non_claims.reverse();
    expect(() => parseProductOfferV1(reordered)).toThrow(
      ProductFlowContractError,
    );
  });

  it("accepts only safe root-relative or HTTPS policy links", () => {
    for (const unsafe of [
      "javascript:alert(1)",
      "http://example.com/terms",
      "//example.com/terms",
      "https://user:secret@example.com/terms",
    ]) {
      const offer = previewOffer();
      offer.links.terms = unsafe;
      expect(() => parseProductOfferV1(offer), unsafe).toThrow(
        ProductFlowContractError,
      );
    }
  });

  it("rejects unknown fields, accessors, custom prototypes, and sparse arrays", () => {
    const unknown = previewOffer() as ReturnType<typeof previewOffer> & {
      secret?: string;
    };
    unknown.secret = "must-not-pass";
    expect(() => parseProductOfferV1(unknown)).toThrow(
      ProductFlowContractError,
    );

    const accessor = previewOffer();
    Object.defineProperty(accessor.brand, "name", {
      enumerable: true,
      get: () => "Cambridge TCG",
    });
    expect(() => parseProductOfferV1(accessor)).toThrow(
      ProductFlowContractError,
    );

    const custom = previewOffer();
    custom.brand = Object.assign(
      Object.create({ inherited: true }),
      custom.brand,
    );
    expect(() => parseProductOfferV1(custom)).toThrow(ProductFlowContractError);

    const sparse = previewOffer();
    sparse.rails = new Array(4) as ReturnType<typeof offRails>;
    expect(() => parseProductOfferV1(sparse)).toThrow(ProductFlowContractError);
  });
});

describe("buildTelegramDeepLinkV1", () => {
  it("builds a token-free HTTPS start link for official Telegram bounds", () => {
    const parameter = "a".repeat(64);
    expect(buildTelegramDeepLinkV1("ExampleSignalsBot", parameter)).toBe(
      `https://t.me/ExampleSignalsBot?start=${parameter}`,
    );
  });

  it("rejects @ prefixes, non-bot usernames, and unsafe start parameters", () => {
    expect(() =>
      buildTelegramDeepLinkV1("@ExampleSignalsBot", "preview"),
    ).toThrow(ProductFlowContractError);
    expect(() => buildTelegramDeepLinkV1("ExampleSignals", "preview")).toThrow(
      ProductFlowContractError,
    );
    expect(() =>
      buildTelegramDeepLinkV1("ExampleSignalsBot", "a".repeat(65)),
    ).toThrow(ProductFlowContractError);
    expect(() =>
      buildTelegramDeepLinkV1("ExampleSignalsBot", "bad=value"),
    ).toThrow(ProductFlowContractError);
  });
});
