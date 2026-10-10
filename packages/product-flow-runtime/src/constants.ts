import type {
  ProductDeliveryChannel,
  ProductPaymentRail,
} from "@cambridge-tcg/product-flow";

export const STRIPE_SUBSCRIPTION_MAPPING_SCHEMA =
  "cambridgetcg.product-flow-runtime.stripe-subscription-mapping/1" as const;

export const STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA =
  "cambridgetcg.product-flow-runtime.stripe-subscription-callback/1" as const;

export const TELEGRAM_STARS_MAPPING_SCHEMA =
  "cambridgetcg.product-flow-runtime.telegram-stars-mapping/1" as const;

export const TELEGRAM_STARS_CALLBACK_SCHEMA =
  "cambridgetcg.product-flow-runtime.telegram-stars-callback/1" as const;

export const PRODUCT_FLOW_RUNTIME_PROVIDER_STATUSES = [
  "normalizer_only",
  "disabled",
] as const;

export const PRODUCT_FLOW_RUNTIME_DUPLICATE_MATCHES = [
  "event_id",
  "provider_event_ref",
  "grant_identity",
] as const;

export const PRODUCT_FLOW_RUNTIME_EVENT_EFFECTS = [
  "observation_only",
  "entitlement_transition",
] as const;

/** Events which can never grant, extend, or end access. */
export const PRODUCT_FLOW_RUNTIME_OBSERVATION_EVENT_TYPES = [
  "checkout_started",
  "browser_return",
  "precheckout_approved",
  "channel_linked",
  "payment_failed",
] as const;

export const PRODUCT_FLOW_RUNTIME_LIMITS = Object.freeze({
  telegram_subscription_amount_stars: 10_000,
});

export interface ProductFlowRuntimeProviderRegistryEntryV1 {
  readonly provider:
    | "stripe_subscriptions"
    | "telegram_stars"
    | "paypal"
    | "crypto";
  readonly rail: ProductPaymentRail;
  readonly channel: ProductDeliveryChannel;
  readonly status: (typeof PRODUCT_FLOW_RUNTIME_PROVIDER_STATUSES)[number];
  readonly authority: "verified_host_callback_only" | "none";
  readonly deferred_callbacks: readonly string[];
}

/**
 * Capability catalogue only. `normalizer_only` does not mean configured,
 * connected, enabled, or permitted to charge. Hosts make those decisions.
 */
const PROVIDER_REGISTRY_ENTRIES: readonly ProductFlowRuntimeProviderRegistryEntryV1[] =
  [
    {
      provider: "stripe_subscriptions",
      rail: "stripe_web",
      channel: "web",
      status: "normalizer_only",
      authority: "verified_host_callback_only",
      deferred_callbacks: [],
    },
    {
      provider: "telegram_stars",
      rail: "telegram_stars",
      channel: "telegram",
      status: "normalizer_only",
      authority: "verified_host_callback_only",
      deferred_callbacks: ["bot_subscription_updated"],
    },
    {
      provider: "paypal",
      rail: "paypal_web",
      channel: "web",
      status: "disabled",
      authority: "none",
      deferred_callbacks: [],
    },
    {
      provider: "crypto",
      rail: "crypto_web",
      channel: "web",
      status: "disabled",
      authority: "none",
      deferred_callbacks: [],
    },
  ];

export const PRODUCT_FLOW_RUNTIME_PROVIDER_REGISTRY: readonly ProductFlowRuntimeProviderRegistryEntryV1[] =
  Object.freeze(
    PROVIDER_REGISTRY_ENTRIES.map((entry) =>
      Object.freeze({
        ...entry,
        deferred_callbacks: Object.freeze([...entry.deferred_callbacks]),
      }),
    ),
  );

Object.freeze(PRODUCT_FLOW_RUNTIME_PROVIDER_STATUSES);
Object.freeze(PRODUCT_FLOW_RUNTIME_DUPLICATE_MATCHES);
Object.freeze(PRODUCT_FLOW_RUNTIME_EVENT_EFFECTS);
Object.freeze(PRODUCT_FLOW_RUNTIME_OBSERVATION_EVENT_TYPES);
