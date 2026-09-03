export const PRODUCT_OFFER_SCHEMA = "cambridgetcg.product-offer/1" as const;

export const PRODUCT_ENTITLEMENT_EVENT_SCHEMA =
  "cambridgetcg.product-entitlement-event/1" as const;

export const PRODUCT_ENTITLEMENT_SCHEMA =
  "cambridgetcg.product-entitlement/1" as const;

export const PRODUCT_OFFER_STATUSES = [
  "preview",
  "test",
  "live",
  "paused",
  "retired",
] as const;

export const PRODUCT_ENVIRONMENTS = ["test", "production"] as const;

export const PRODUCT_DELIVERY_CHANNELS = ["web", "telegram"] as const;

export const PRODUCT_AVAILABILITIES = ["off", "test", "live"] as const;

/** Canonical ordering for complete rail declarations in every offer. */
export const PRODUCT_PAYMENT_RAILS = [
  "stripe_web",
  "telegram_stars",
  "paypal_web",
  "crypto_web",
] as const;

/** A payment rail has one channel. Adapters may not reinterpret this map. */
export const PRODUCT_RAIL_CHANNELS = {
  stripe_web: "web",
  telegram_stars: "telegram",
  paypal_web: "web",
  crypto_web: "web",
} as const;

export const PRODUCT_RIGHTS_DECISIONS = [
  "not_evaluated",
  "granted",
  "denied",
] as const;

/**
 * These non-claims are part of the v1 offer contract, not optional copy.
 * A product may explain them in friendlier language, but may not omit them.
 */
export const PRODUCT_OFFER_NON_CLAIMS = [
  "payment_is_not_source_permission",
  "transformation_is_not_source_permission",
  "secrecy_is_not_source_permission",
  "public_reachability_is_not_source_permission",
  "channel_access_is_not_source_or_redistribution_permission",
] as const;

/** Explicit alias for callers that want the invariant named in full. */
export const PRODUCT_OFFER_FIXED_NON_CLAIMS = PRODUCT_OFFER_NON_CLAIMS;

export const PRODUCT_ENTITLEMENT_EVENT_TYPES = [
  "checkout_started",
  "browser_return",
  "precheckout_approved",
  "channel_linked",
  "payment_confirmed",
  "renewal_confirmed",
  "payment_failed",
  "cancel_at_period_end",
  "subscription_resumed",
  "subscription_ended",
  "refunded",
  "revoked",
] as const;

export const PRODUCT_PAYMENT_EVIDENCE_SOURCES = [
  "provider_webhook",
  "provider_api",
] as const;

export const PRODUCT_ENTITLEMENT_STATUSES = [
  "inactive",
  "active",
  "ended",
  "blocked",
] as const;

export const PRODUCT_ENTITLEMENT_REASONS = [
  "no_confirmed_payment",
  "payment_confirmed",
  "renewal_confirmed",
  "subscription_ended",
  "refunded",
  "revoked",
  "scope_mismatch",
  "out_of_order",
  "history_limit",
  "invalid_transition",
] as const;

export const PRODUCT_ACCESS_REASONS = [
  "active",
  "environment_mismatch",
  "offer_unavailable",
  "rights_not_granted",
  "channel_unavailable",
  "entitlement_inactive",
  "entitlement_blocked",
  "scope_mismatch",
  "not_yet_active",
  "expired",
  "rail_unavailable",
  "unknown_price_ref",
] as const;

export const PRODUCT_FLOW_LIMITS = {
  offer_id_chars: 64,
  brand_name_chars: 80,
  product_name_chars: 120,
  byline_chars: 160,
  audience_chars: 240,
  purpose_chars: 64,
  link_chars: 2_048,
  opaque_ref_min_payload_chars: 16,
  opaque_ref_max_payload_chars: 64,
  processed_event_ids: 256,
  telegram_username_chars: 32,
  telegram_start_parameter_chars: 64,
} as const;

// Readonly TypeScript values remain mutable to JavaScript consumers. Freeze
// public vocabularies so parser meaning cannot be changed at runtime.
Object.freeze(PRODUCT_OFFER_STATUSES);
Object.freeze(PRODUCT_ENVIRONMENTS);
Object.freeze(PRODUCT_DELIVERY_CHANNELS);
Object.freeze(PRODUCT_AVAILABILITIES);
Object.freeze(PRODUCT_PAYMENT_RAILS);
Object.freeze(PRODUCT_RAIL_CHANNELS);
Object.freeze(PRODUCT_RIGHTS_DECISIONS);
Object.freeze(PRODUCT_OFFER_NON_CLAIMS);
Object.freeze(PRODUCT_ENTITLEMENT_EVENT_TYPES);
Object.freeze(PRODUCT_PAYMENT_EVIDENCE_SOURCES);
Object.freeze(PRODUCT_ENTITLEMENT_STATUSES);
Object.freeze(PRODUCT_ENTITLEMENT_REASONS);
Object.freeze(PRODUCT_ACCESS_REASONS);
Object.freeze(PRODUCT_FLOW_LIMITS);
