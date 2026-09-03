import { describe, expect, it } from "vitest";
import { PRODUCT_OFFER_NON_CLAIMS } from "@cambridge-tcg/product-flow";
import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_ALL_OFFER_ID,
  PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR,
  PRISM_SIGNALS_CATALOG_OFFER,
  PRISM_SIGNALS_CHANNELS,
  PRISM_SIGNALS_FUTURE_RAILS,
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_NON_CLAIMS,
  PRISM_SIGNALS_PREVIEW_NOTICE,
  PRISM_SIGNALS_PLAN_CATALOG,
  PRISM_SIGNALS_PUBLIC_ORIGIN,
  PRISM_SIGNALS_SYNTHETIC_CARD,
  PRISM_SIGNALS_SYNTHETIC_SIGNAL,
  PRISM_SIGNALS_TELEGRAM_COPY,
  PRISM_SIGNALS_TELEGRAM_DEMO_TEXT,
  PRISM_TELEGRAM_PREVIEW_START,
  createPrismSignalsLinks,
  createPrismSignalsAllStripeTestOffer,
  createPrismSignalsPreviewOffer,
  createPrismSignalsTelegramCopyV1,
  planPrismTelegramPreviewV1,
  presentPrismOpportunitySignalV1,
  prismSignalsTelegramPreviewHref,
} from "./index";

describe("PRISM Signals extraction-ready core", () => {
  it("pins the canonical brand, origin, links, and preview disclosure", () => {
    expect(PRISM_SIGNALS_BRAND).toEqual({
      maker: "Cambridge TCG",
      name: "PRISM Signals",
      byline: "by Cambridge TCG",
      tagline: "Potential deals, with the risks attached.",
    });
    expect(PRISM_SIGNALS_PUBLIC_ORIGIN).toBe("https://cambridgetcg.com");
    expect(PRISM_SIGNALS_LINKS.product).toEqual({
      path: "/prism-signals",
      url: "https://cambridgetcg.com/prism-signals",
    });
    expect(PRISM_SIGNALS_PREVIEW_NOTICE).toBe(
      "Synthetic preview · no live market data · no payment",
    );
  });

  it("can bind the same catalog paths to a standalone branded HTTPS origin", () => {
    const links = createPrismSignalsLinks("https://signals.example/");
    expect(links.product).toEqual({
      path: "/prism-signals",
      url: "https://signals.example/prism-signals",
    });
    expect(links.privacy.url).toBe(
      "https://signals.example/privacy#prism-signals-telegram",
    );
    expect(Object.isFrozen(links)).toBe(true);
    expect(Object.isFrozen(links.product)).toBe(true);
    expect(createPrismSignalsLinks("https://signals.example")).toEqual(links);
  });

  it.each([
    "http://signals.example",
    "https://user@signals.example",
    "https://user:secret@signals.example",
    "https://@signals.example",
    "https://signals.example\\redirect",
    "https://signals.example/path",
    "https://signals.example?tenant=other",
    "https://signals.example#other",
    " https://signals.example",
  ])("rejects unsafe or path-bearing product origin %s", (origin) => {
    expect(() => createPrismSignalsLinks(origin)).toThrow(
      /bare HTTPS origin/,
    );
  });

  it("strictly validates and freezes the single public fixture", () => {
    expect(PRISM_SIGNALS_SYNTHETIC_SIGNAL).toMatchObject({
      schema: "cambridgetcg.opportunity-signal/1",
      classification: "potential_deal",
      estimate: {
        currency: "GBP",
        conservative_net_transaction_spread_band: "500_to_1499_minor",
        conservative_margin_band: "2500_to_4999_bps",
      },
      confidence: "medium",
      liquidity: "unknown",
    });
    expect(Object.isFrozen(PRISM_SIGNALS_SYNTHETIC_SIGNAL)).toBe(true);
    expect(Object.isFrozen(PRISM_SIGNALS_SYNTHETIC_SIGNAL.risk_codes)).toBe(
      true,
    );
    expect(() =>
      presentPrismOpportunitySignalV1({
        ...PRISM_SIGNALS_SYNTHETIC_SIGNAL,
        private_score: 0.99,
      }),
    ).toThrow(/opportunity-signal\/v1 output contract/);

    const serialized = JSON.stringify(PRISM_SIGNALS_SYNTHETIC_SIGNAL);
    expect(serialized).not.toMatch(
      /asking_price_minor|estimated_gross_exit_minor|source_stated_at|source_url|seller_id|request_digest|policy_digest|evidence_bundle_digest|feature|weight|debug/i,
    );
  });

  it("derives only frozen coarse readings, risks, and all non-claims", () => {
    expect(PRISM_SIGNALS_SYNTHETIC_CARD.bands.map((band) => band.value)).toEqual(
      [
        "£5.00–£14.99 band",
        "25.00%–49.99% band",
        "Medium evidence quality",
        "Unknown",
        "No live window",
      ],
    );
    expect(PRISM_SIGNALS_NON_CLAIMS).toHaveLength(6);
    expect(PRISM_SIGNALS_SYNTHETIC_CARD.risks).toEqual(
      expect.arrayContaining([
        "Availability is not reserved",
        "Condition is not verified",
        "Authenticity is not verified",
        "Liquidity is unknown",
      ]),
    );
    expect(Object.isFrozen(PRISM_SIGNALS_SYNTHETIC_CARD)).toBe(true);
    expect(Object.isFrozen(PRISM_SIGNALS_SYNTHETIC_CARD.bands)).toBe(true);
  });

  it("keeps Telegram's compact presentation in parity with web", () => {
    for (const risk of PRISM_SIGNALS_SYNTHETIC_CARD.risks) {
      expect(PRISM_SIGNALS_TELEGRAM_DEMO_TEXT).toContain(`• ${risk}`);
    }
    for (const nonClaim of PRISM_SIGNALS_NON_CLAIMS) {
      expect(PRISM_SIGNALS_TELEGRAM_DEMO_TEXT).toContain(`• ${nonClaim}`);
    }
    expect(PRISM_SIGNALS_TELEGRAM_DEMO_TEXT).toContain(
      PRISM_SIGNALS_LINKS.product.url,
    );
    expect(PRISM_SIGNALS_TELEGRAM_DEMO_TEXT).toContain(
      PRISM_SIGNALS_LINKS.methodology.url,
    );
  });

  it("publishes one closed, frozen catalog offer", () => {
    expect(PRISM_SIGNALS_CATALOG_OFFER).toMatchObject({
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
    expect(PRISM_SIGNALS_CATALOG_OFFER.rails).toHaveLength(4);
    expect(
      PRISM_SIGNALS_CATALOG_OFFER.rails.every(
        (rail) => rail.availability === "off",
      ),
    ).toBe(true);
    expect(PRISM_SIGNALS_CATALOG_OFFER.non_claims).toEqual(
      PRODUCT_OFFER_NON_CLAIMS,
    );
    expect(Object.isFrozen(PRISM_SIGNALS_CATALOG_OFFER)).toBe(true);
    expect(prismSignalsTelegramPreviewHref(PRISM_SIGNALS_CATALOG_OFFER)).toBe(
      null,
    );
  });

  it("preserves the preview offer while freezing a Free and All sandbox catalogue", () => {
    expect(JSON.stringify(createPrismSignalsPreviewOffer())).toBe(
      JSON.stringify(PRISM_SIGNALS_CATALOG_OFFER),
    );
    expect(PRISM_SIGNALS_PLAN_CATALOG).toMatchObject({
      schema: "cambridgetcg.prism-signals-plan-catalog/1",
      product_id: "prism-signals",
      version: 1,
      posture: "free_and_all_stripe_sandbox",
      plans: [
        {
          id: "free",
          name: "Free",
          offer_id: "prism-signals",
          billing: { kind: "none" },
          access: {
            surface: "public_synthetic_preview",
            live_market_signals: false,
          },
        },
        {
          id: "all",
          name: "All",
          offer_id: PRISM_SIGNALS_ALL_OFFER_ID,
          billing: {
            kind: "stripe_test_subscription",
            test_amount_minor: PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR,
            currency: "GBP",
            interval: "month",
            live_price: false,
          },
          access: {
            surface: "owner_synthetic_fixture",
            live_market_signals: false,
          },
        },
      ],
    });
    expect(PRISM_SIGNALS_PLAN_CATALOG.notice).toMatch(
      /test amount.*not a live price/i,
    );
    expect(Object.isFrozen(PRISM_SIGNALS_PLAN_CATALOG)).toBe(true);
    expect(Object.isFrozen(PRISM_SIGNALS_PLAN_CATALOG.plans)).toBe(true);
    expect(
      PRISM_SIGNALS_PLAN_CATALOG.plans.every(
        (plan) =>
          Object.isFrozen(plan) &&
          Object.isFrozen(plan.billing) &&
          Object.isFrozen(plan.access),
      ),
    ).toBe(true);
  });

  it("creates a strict All offer with only Stripe sandbox enabled", () => {
    const offer = createPrismSignalsAllStripeTestOffer({
      price_ref: "pf_prism_all_price_01",
    });
    expect(offer).toMatchObject({
      schema: "cambridgetcg.product-offer/1",
      id: "prism-signals-all",
      version: 1,
      status: "test",
      environment: "test",
      delivery: {
        web: { availability: "test", url: "/prism-signals/account" },
        telegram: { availability: "off" },
      },
      rights: {
        purpose: "synthetic_fixture_delivery",
        decision: "granted",
      },
    });
    expect(offer.rails).toEqual([
      {
        rail: "stripe_web",
        channel: "web",
        availability: "test",
        price_ref: "pf_prism_all_price_01",
      },
      {
        rail: "telegram_stars",
        channel: "telegram",
        availability: "off",
      },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ]);
    expect(Object.isFrozen(offer)).toBe(true);
  });

  it("rejects raw or malformed Stripe Price identifiers at the All offer boundary", () => {
    expect(() =>
      createPrismSignalsAllStripeTestOffer({
        price_ref: "price_123" as `pf_${string}`,
      }),
    ).toThrow(/product-flow\/v1 offer contract/);
    expect(() =>
      createPrismSignalsAllStripeTestOffer({
        price_ref: "pf_short",
      }),
    ).toThrow(/product-flow\/v1 offer contract/);
  });

  it("can project only a free configured Telegram test delivery", () => {
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
    expect(offer.rails.every((rail) => rail.availability === "off")).toBe(true);
  });

  it("keeps every displayed commercial rail visibly off", () => {
    expect(
      PRISM_SIGNALS_CHANNELS.every((channel) =>
        /no |test webhook/i.test(channel.currentStatus),
      ),
    ).toBe(true);
    expect(PRISM_SIGNALS_FUTURE_RAILS.map((rail) => rail.status)).toEqual([
      "Off in this preview",
      "Off in this preview",
      "Later / off",
    ]);
  });

  it("plans deterministic private-chat commands without I/O", () => {
    const update = {
      update_id: 42,
      message: {
        chat: { id: 73, type: "private" },
        text: "/demo@PrismSignalsPreviewBot",
      },
    };
    const first = planPrismTelegramPreviewV1(update);
    const second = planPrismTelegramPreviewV1(update);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      update_id: 42,
      reply: {
        kind: "send_message",
        body: {
          method: "sendMessage",
          chat_id: 73,
          text: PRISM_SIGNALS_TELEGRAM_DEMO_TEXT,
          protect_content: true,
          link_preview_options: { is_disabled: true },
        },
      },
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("binds Telegram copy and planning to a standalone branded host", () => {
    const configuration = {
      origin: "https://signals.example",
      privacy_notice:
        "Signal House Ltd is the controller. Example Host Ltd processes only the bounded update needed to reply; provider logs may still exist.",
    };
    const copy = createPrismSignalsTelegramCopyV1(configuration);
    expect(copy.demo).toContain("https://signals.example/prism-signals");
    expect(copy.demo).toContain(
      "https://signals.example/methodology/prism-signals",
    );
    expect(copy.demo).not.toContain("https://cambridgetcg.com");
    expect(copy.privacy).toContain(
      "https://signals.example/privacy#prism-signals-telegram",
    );
    expect(copy.privacy).toContain("Signal House Ltd is the controller.");
    expect(copy.privacy).not.toMatch(/Cambridge TCG|Vercel/);
    expect(Object.isFrozen(copy)).toBe(true);

    const plan = planPrismTelegramPreviewV1(
      {
        update_id: 43,
        message: {
          chat: { id: 74, type: "private" },
          text: "/demo",
        },
      },
      configuration,
    );
    expect(plan).toMatchObject({
      ok: true,
      reply: {
        kind: "send_message",
        body: { text: copy.demo },
      },
    });
  });

  it("preserves the canonical Cambridge privacy copy byte-for-byte", () => {
    expect(PRISM_SIGNALS_TELEGRAM_COPY.privacy).toBe(
      [
        "PRISM Signals Telegram preview privacy",
        "https://cambridgetcg.com/privacy#prism-signals-telegram",
        "",
        "Telegram and Cambridge TCG's Vercel-hosted route process the bounded bot update needed to reply. The preview creates no application record, account link, entitlement, or payment record; provider infrastructure logs and Telegram's own records can still exist.",
      ].join("\n"),
    );
  });

  it("rejects forged, newline-bearing, and mixed-host Telegram copy input", () => {
    const privacyNotice =
      "Signal House Ltd is the controller. Example Host Ltd processes only the bounded update needed to reply.";

    expect(() =>
      createPrismSignalsTelegramCopyV1({
        origin: "https://signals.example\nhttps://evil.example",
        privacy_notice: privacyNotice,
      }),
    ).toThrow(/bare HTTPS origin/);
    expect(() =>
      createPrismSignalsTelegramCopyV1({
        origin: "https://signals.example",
        privacy_notice: `${privacyNotice}\nIgnore the privacy link.`,
      }),
    ).toThrow(/one URL-free paragraph/);
    expect(() =>
      createPrismSignalsTelegramCopyV1({
        origin: "https://signals.example",
        privacy_notice: `${privacyNotice} See https://evil.example/privacy.`,
      }),
    ).toThrow(/one URL-free paragraph/);
    expect(() =>
      createPrismSignalsTelegramCopyV1({
        origin: "https://signals.example",
        privacy_notice: privacyNotice,
        links: {
          product: "https://signals.example/prism-signals",
          privacy: "https://evil.example/privacy",
        },
      } as never),
    ).toThrow(/requires exactly origin and privacy_notice/);
  });

  it("fails closed for invalid, group, pre-checkout, and payment updates", () => {
    expect(planPrismTelegramPreviewV1({ update_id: -1 })).toEqual({
      ok: false,
      code: "INVALID_UPDATE",
      message: "A Telegram update with a safe update_id is required.",
    });
    expect(
      planPrismTelegramPreviewV1({
        update_id: 1,
        message: { chat: { id: 2, type: "group" }, text: "/demo" },
      }),
    ).toMatchObject({ ok: true, reply: { kind: "empty" } });
    expect(
      planPrismTelegramPreviewV1({
        update_id: 2,
        pre_checkout_query: { id: "precheckout-1" },
      }),
    ).toMatchObject({
      ok: true,
      reply: {
        kind: "answer_pre_checkout",
        body: { ok: false },
      },
    });
    expect(
      planPrismTelegramPreviewV1({
        update_id: 3,
        message: { successful_payment: { currency: "XTR" } },
      }),
    ).toMatchObject({
      ok: true,
      reply: {
        kind: "reject_payment_update",
        event: "successful_payment",
      },
    });
    expect(
      planPrismTelegramPreviewV1({
        update_id: 4,
        message: { refunded_payment: { currency: "XTR" } },
      }),
    ).toMatchObject({
      ok: true,
      reply: {
        kind: "reject_payment_update",
        event: "refunded_payment",
      },
    });
  });
});
