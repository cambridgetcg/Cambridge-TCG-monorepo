import { describe, expect, it } from "vitest";
import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_CHANNELS,
  PRISM_SIGNALS_FUTURE_RAILS,
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_NON_CLAIMS,
  PRISM_SIGNALS_PREVIEW_NOTICE,
  PRISM_SIGNALS_SYNTHETIC_CARD,
  PRISM_SIGNALS_SYNTHETIC_SIGNAL,
  presentPrismOpportunitySignalV1,
} from "./presentation";
import { PRISM_SIGNALS_TELEGRAM_DEMO_TEXT } from "./telegram";

describe("PRISM Signals public presentation", () => {
  it("pins the brand and unmistakable preview disclosure", () => {
    expect(PRISM_SIGNALS_BRAND).toEqual({
      maker: "Cambridge TCG",
      name: "PRISM Signals",
      byline: "by Cambridge TCG",
      tagline: "Potential deals, with the risks attached.",
    });
    expect(PRISM_SIGNALS_PREVIEW_NOTICE).toBe(
      "Synthetic preview · no live market data · no payment",
    );
  });

  it("strictly validates one frozen public OpportunitySignalV1 fixture", () => {
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
    expect(Object.isFrozen(PRISM_SIGNALS_SYNTHETIC_SIGNAL.risk_codes)).toBe(true);

    const publicFixture = JSON.stringify(PRISM_SIGNALS_SYNTHETIC_SIGNAL);
    expect(publicFixture).not.toMatch(
      /asking_price_minor|estimated_gross_exit_minor|source_stated_at|source_url|seller_id|request_digest|policy_digest|evidence_bundle_digest|feature|weight|debug/i,
    );

    expect(() =>
      presentPrismOpportunitySignalV1({
        ...PRISM_SIGNALS_SYNTHETIC_SIGNAL,
        private_score: 0.99,
      }),
    ).toThrow(/opportunity-signal\/v1 output contract/);
  });

  it("derives only coarse synthetic readings and all six non-claims", () => {
    expect(PRISM_SIGNALS_SYNTHETIC_CARD.bands.map((band) => band.value)).toEqual([
      "£5.00–£14.99 band",
      "25.00%–49.99% band",
      "Medium evidence quality",
      "Unknown",
      "No live window",
    ]);
    expect(PRISM_SIGNALS_NON_CLAIMS).toHaveLength(6);
    expect(PRISM_SIGNALS_SYNTHETIC_CARD.riskCodes).toEqual(
      PRISM_SIGNALS_SYNTHETIC_SIGNAL.risk_codes,
    );
    expect(PRISM_SIGNALS_SYNTHETIC_CARD.nonClaimCodes).toEqual(
      PRISM_SIGNALS_SYNTHETIC_SIGNAL.does_not_include,
    );
    expect(PRISM_SIGNALS_SYNTHETIC_CARD.risks).toEqual(
      expect.arrayContaining([
        "Availability is not reserved",
        "Condition is not verified",
        "Authenticity is not verified",
        "Liquidity is unknown",
      ]),
    );
  });

  it("keeps Telegram risks, non-claims, and context links in parity with web", () => {
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

  it("keeps every commercial rail visibly off", () => {
    expect(PRISM_SIGNALS_CHANNELS.every((channel) => /no |test webhook/i.test(channel.currentStatus))).toBe(true);
    expect(PRISM_SIGNALS_FUTURE_RAILS.map((rail) => rail.status)).toEqual([
      "Test-only / configuration-gated",
      "Off in this preview",
      "Later / off",
    ]);
  });

  it("contains no live-data, exact-value, seller, or performance claim", () => {
    const serialized = JSON.stringify({
      card: PRISM_SIGNALS_SYNTHETIC_CARD,
      signal: PRISM_SIGNALS_SYNTHETIC_SIGNAL,
      channels: PRISM_SIGNALS_CHANNELS,
      rails: PRISM_SIGNALS_FUTURE_RAILS,
    });
    expect(serialized).not.toMatch(
      /real[- ]?time|last sold|source_url|seller_id|win rate|profit probability|guaranteed arbitrage/i,
    );
  });
});
