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

export const PRISM_SIGNALS_PLAN_CATALOG_SCHEMA =
  "cambridgetcg.prism-signals-plan-catalog/1" as const;
export const PRISM_SIGNALS_ALL_OFFER_ID = "prism-signals-all" as const;
export const PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR = 500 as const;

export type PrismSignalsPlan =
  | {
      readonly id: "free";
      readonly name: "Free";
      readonly offer_id: "prism-signals";
      readonly billing: {
        readonly kind: "none";
      };
      readonly access: {
        readonly surface: "public_synthetic_preview";
        readonly live_market_signals: false;
      };
    }
  | {
      readonly id: "all";
      readonly name: "All";
      readonly offer_id: typeof PRISM_SIGNALS_ALL_OFFER_ID;
      readonly billing: {
        readonly kind: "stripe_test_subscription";
        readonly test_amount_minor: typeof PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR;
        readonly currency: "GBP";
        readonly interval: "month";
        readonly live_price: false;
      };
      readonly access: {
        readonly surface: "owner_synthetic_fixture";
        readonly live_market_signals: false;
      };
    };

export interface PrismSignalsPlanCatalogV1 {
  readonly schema: typeof PRISM_SIGNALS_PLAN_CATALOG_SCHEMA;
  readonly product_id: "prism-signals";
  readonly version: 1;
  readonly posture: "free_and_all_stripe_sandbox";
  readonly plans: readonly [PrismSignalsPlan, PrismSignalsPlan];
  readonly notice: string;
}

function deepFreezeCatalog<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreezeCatalog(nested);
  return Object.freeze(value);
}

/**
 * Public plan names and sandbox economics. The £5 amount is deliberately
 * modelled as a test amount, never as a published production price.
 */
export const PRISM_SIGNALS_PLAN_CATALOG: PrismSignalsPlanCatalogV1 =
  deepFreezeCatalog({
    schema: PRISM_SIGNALS_PLAN_CATALOG_SCHEMA,
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
    notice:
      "All is a Stripe sandbox subscription using a £5 monthly test amount. It is not a live price, charge, or live-signal promise.",
  });

/**
 * Creates the canonical extraction-ready preview offer.
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
      {
        rail: "telegram_stars",
        channel: "telegram",
        availability: "off",
      },
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

/** The closed catalog entry before any host-specific channel configuration. */
export const PRISM_SIGNALS_CATALOG_OFFER =
  createPrismSignalsPreviewOffer();

export interface PrismSignalsAllStripeTestConfiguration {
  /** Host-mapped product-flow reference; never a raw Stripe Price id. */
  readonly price_ref: `pf_${string}`;
}

/**
 * Creates the only paid-looking PRISM offer permitted in this slice.
 * It is test/test and models an All-labelled owner projection around the
 * already-public fixed synthetic fixture. It does not make that fixture
 * exclusive. Only Stripe's web sandbox rail is enabled.
 */
export function createPrismSignalsAllStripeTestOffer(
  configuration: PrismSignalsAllStripeTestConfiguration,
): ProductOfferV1 {
  return parseProductOfferV1({
    schema: PRODUCT_OFFER_SCHEMA,
    brand: {
      name: PRISM_SIGNALS_BRAND.maker,
      product_name: `${PRISM_SIGNALS_BRAND.name} All`,
      byline: PRISM_SIGNALS_BRAND.tagline,
    },
    id: PRISM_SIGNALS_ALL_OFFER_ID,
    version: 1,
    status: "test",
    environment: "test",
    audience:
      "Invited account holders testing a monthly Stripe sandbox subscription and owner access projection around the fixed public PRISM synthetic fixture.",
    delivery: {
      web: { availability: "test", url: "/prism-signals/account" },
      telegram: { availability: "off" },
    },
    rails: [
      {
        rail: "stripe_web",
        channel: "web",
        availability: "test",
        price_ref: configuration.price_ref,
      },
      {
        rail: "telegram_stars",
        channel: "telegram",
        availability: "off",
      },
      { rail: "paypal_web", channel: "web", availability: "off" },
      { rail: "crypto_web", channel: "web", availability: "off" },
    ],
    rights: {
      purpose: "synthetic_fixture_delivery",
      decision: "granted",
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
