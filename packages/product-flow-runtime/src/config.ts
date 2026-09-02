import type {
  StripeSubscriptionMappingV1,
  TelegramStarsMappingV1,
} from "./types";
import {
  PRODUCT_FLOW_RUNTIME_LIMITS,
  STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
  TELEGRAM_STARS_MAPPING_SCHEMA,
} from "./constants";
import {
  runtimeExactKeys,
  runtimeLiteral,
  runtimePositiveInteger,
  runtimeRecord,
  validateRuntimeScope,
} from "./validation";

const SCOPE_KEYS = [
  "environment",
  "entitlement_ref",
  "subject_ref",
  "offer_id",
  "offer_version",
  "price_ref",
] as const;

export function parseStripeSubscriptionMappingV1(
  value: unknown,
): StripeSubscriptionMappingV1 {
  const record = runtimeRecord(value, "$mapping");
  runtimeExactKeys(record, ["schema", "provider", ...SCOPE_KEYS], "$mapping");
  const scope = validateRuntimeScope(record, "web", "stripe_web");
  return Object.freeze({
    schema: runtimeLiteral(
      record.schema,
      STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
      "$mapping.schema",
    ),
    provider: runtimeLiteral(
      record.provider,
      "stripe_subscriptions",
      "$mapping.provider",
    ),
    ...scope,
  });
}

export function parseTelegramStarsMappingV1(
  value: unknown,
): TelegramStarsMappingV1 {
  const record = runtimeRecord(value, "$mapping");
  runtimeExactKeys(
    record,
    [
      "schema",
      "provider",
      ...SCOPE_KEYS,
      "invoice_payload_ref",
      "amount_stars",
    ],
    "$mapping",
  );
  const scope = validateRuntimeScope(record, "telegram", "telegram_stars");
  // The core ref grammar is reused by placing the expected payload mapping in
  // a core-validated price slot. It remains an opaque host reference.
  const payloadProbe = validateRuntimeScope(
    { ...record, price_ref: record.invoice_payload_ref },
    "telegram",
    "telegram_stars",
  );
  return Object.freeze({
    schema: runtimeLiteral(
      record.schema,
      TELEGRAM_STARS_MAPPING_SCHEMA,
      "$mapping.schema",
    ),
    provider: runtimeLiteral(
      record.provider,
      "telegram_stars",
      "$mapping.provider",
    ),
    ...scope,
    invoice_payload_ref: payloadProbe.price_ref,
    amount_stars: runtimePositiveInteger(
      record.amount_stars,
      "$mapping.amount_stars",
      PRODUCT_FLOW_RUNTIME_LIMITS.telegram_subscription_amount_stars,
    ),
  });
}
