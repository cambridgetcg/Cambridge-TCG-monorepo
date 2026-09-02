import {
  PRODUCT_OFFER_NON_CLAIMS,
  PRODUCT_OFFER_SCHEMA,
  buildTelegramDeepLinkV1,
  parseProductOfferV1,
  type ProductOfferV1,
} from "@cambridge-tcg/product-flow";
import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_LINKS,
  PRISM_TELEGRAM_PREVIEW_START,
} from "./presentation";

export interface PrismSignalsPreviewConfiguration {
  readonly telegram_bot_username?: string;
}

/**
 * Canonical extraction-ready offer for the current preview.
 *
 * Every commercial rail is explicitly off. A configured Telegram username
 * opens only the free fixture delivery surface; it never opens Stars billing
 * or creates an entitlement.
 */
export function createPrismSignalsPreviewOffer(
  configuration: PrismSignalsPreviewConfiguration = {},
): ProductOfferV1 {
  const telegram = configuration.telegram_bot_username
    ? {
        availability: "test" as const,
        bot_username: configuration.telegram_bot_username,
        start_parameter: PRISM_TELEGRAM_PREVIEW_START,
      }
    : { availability: "off" as const };

  return parseProductOfferV1({
    schema: PRODUCT_OFFER_SCHEMA,
    brand: {
      name: PRISM_SIGNALS_BRAND.maker,
      product_name: PRISM_SIGNALS_BRAND.name,
      byline: PRISM_SIGNALS_BRAND.tagline,
    },
    id: "prism-signals",
    version: 1,
    status: "preview",
    environment: "test",
    audience:
      "Card traders testing a bounded decision-support reading before any paid or live market service exists.",
    delivery: {
      web: { availability: "test", url: PRISM_SIGNALS_LINKS.product.path },
      telegram,
    },
    rails: [
      { rail: "stripe_web", channel: "web", availability: "off" },
      { rail: "telegram_stars", channel: "telegram", availability: "off" },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ],
    rights: {
      purpose: "subscriber_derived_signal",
      decision: "not_evaluated",
    },
    links: {
      terms: PRISM_SIGNALS_LINKS.terms.path,
      support: PRISM_SIGNALS_LINKS.support.path,
      methodology: PRISM_SIGNALS_LINKS.methodology.path,
    },
    non_claims: PRODUCT_OFFER_NON_CLAIMS,
  });
}

export function prismSignalsTelegramPreviewHref(
  offer: ProductOfferV1,
): string | null {
  return offer.delivery.telegram.availability === "off"
    ? null
    : buildTelegramDeepLinkV1(
        offer.delivery.telegram.bot_username,
        offer.delivery.telegram.start_parameter,
      );
}
