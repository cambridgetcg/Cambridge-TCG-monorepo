import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  parseEntitlementEventV1,
  type EntitlementEventV1,
} from "@cambridge-tcg/product-flow";

import {
  PRODUCT_FLOW_RUNTIME_LIMITS,
  STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
  TELEGRAM_STARS_CALLBACK_SCHEMA,
} from "./constants";
import {
  parseStripeSubscriptionMappingV1,
  parseTelegramStarsMappingV1,
} from "./config";
import { ProductFlowRuntimeError } from "./error";
import type {
  StripeSubscriptionCallbackV1,
  TelegramStarsCallbackV1,
} from "./types";
import {
  runtimeBoolean,
  runtimeEnum,
  runtimeExactKeys,
  runtimeLiteral,
  runtimePositiveInteger,
  runtimeRecord,
  validateEventIdentity,
  type RuntimeRecord,
} from "./validation";

const STRIPE_CALLBACK_KINDS = [
  "browser_return",
  "checkout_session_completed",
  "invoice_paid_initial",
  "invoice_paid_renewal",
  "invoice_payment_failed",
  "subscription_cancel_at_period_end",
  "subscription_ended",
  "refund_created",
] as const;

const TELEGRAM_CALLBACK_KINDS = [
  "precheckout_approved",
  "successful_payment",
  "refunded_payment",
] as const;

const CALLBACK_BASE_KEYS = [
  "schema",
  "kind",
  "event_id",
  "occurred_at",
] as const;

function stripeBase(
  mapping: ReturnType<typeof parseStripeSubscriptionMappingV1>,
) {
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    environment: mapping.environment,
    entitlement_ref: mapping.entitlement_ref,
    subject_ref: mapping.subject_ref,
    offer_id: mapping.offer_id,
    offer_version: mapping.offer_version,
    channel: "web" as const,
    rail: "stripe_web" as const,
    price_ref: mapping.price_ref,
  };
}

function stripeBinding(
  mapping: ReturnType<typeof parseStripeSubscriptionMappingV1>,
) {
  return {
    environment: mapping.environment,
    entitlement_ref: mapping.entitlement_ref,
    subject_ref: mapping.subject_ref,
    offer_id: mapping.offer_id,
    offer_version: mapping.offer_version,
    channel: "web" as const,
    rail: "stripe_web" as const,
    price_ref: mapping.price_ref,
  };
}

function telegramBase(mapping: ReturnType<typeof parseTelegramStarsMappingV1>) {
  return {
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    environment: mapping.environment,
    entitlement_ref: mapping.entitlement_ref,
    subject_ref: mapping.subject_ref,
    offer_id: mapping.offer_id,
    offer_version: mapping.offer_version,
    channel: "telegram" as const,
    rail: "telegram_stars" as const,
    price_ref: mapping.price_ref,
  };
}

function telegramBinding(
  mapping: ReturnType<typeof parseTelegramStarsMappingV1>,
) {
  return {
    environment: mapping.environment,
    entitlement_ref: mapping.entitlement_ref,
    subject_ref: mapping.subject_ref,
    offer_id: mapping.offer_id,
    offer_version: mapping.offer_version,
    channel: "telegram" as const,
    rail: "telegram_stars" as const,
    price_ref: mapping.price_ref,
  };
}

function parseStripeCallbackHeader(record: RuntimeRecord) {
  runtimeLiteral(
    record.schema,
    STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
    "$callback.schema",
  );
  const identity = validateEventIdentity(record);
  const kind = runtimeEnum(
    record.kind,
    STRIPE_CALLBACK_KINDS,
    "$callback.kind",
  );
  return { ...identity, kind };
}

/**
 * Converts semantic Stripe lifecycle facts after the host has authenticated
 * the callback and mapped every provider/customer identifier to an opaque
 * product-flow reference. It never verifies a Stripe signature or calls an
 * API. Checkout completion and browser return intentionally remain
 * non-authoritative audit events.
 */
export function normalizeStripeSubscriptionCallbackV1(
  mappingValue: unknown,
  callbackValue: unknown,
): EntitlementEventV1 {
  const mapping = parseStripeSubscriptionMappingV1(mappingValue);
  const record = runtimeRecord(callbackValue, "$callback");
  const header = parseStripeCallbackHeader(record);
  const base = stripeBase(mapping);

  if (
    header.kind === "browser_return" ||
    header.kind === "checkout_session_completed"
  ) {
    runtimeExactKeys(record, CALLBACK_BASE_KEYS, "$callback");
    return parseEntitlementEventV1({
      ...base,
      event_id: header.event_id,
      occurred_at: header.occurred_at,
      type: "browser_return",
    });
  }

  if (
    header.kind === "invoice_paid_initial" ||
    header.kind === "invoice_paid_renewal"
  ) {
    runtimeExactKeys(
      record,
      [
        ...CALLBACK_BASE_KEYS,
        "provider_event_ref",
        "payment_ref",
        "confirmed_at",
        "active_until",
      ],
      "$callback",
    );
    const type =
      header.kind === "invoice_paid_initial"
        ? "payment_confirmed"
        : "renewal_confirmed";
    return parseEntitlementEventV1({
      ...base,
      event_id: header.event_id,
      occurred_at: header.occurred_at,
      type,
      active_until: record.active_until,
      evidence: {
        kind: "provider_confirmation",
        source: "provider_webhook",
        ...stripeBinding(mapping),
        provider_event_ref: record.provider_event_ref,
        payment_ref: record.payment_ref,
        confirmed_at: record.confirmed_at,
        active_until: record.active_until,
      },
    });
  }

  if (header.kind === "invoice_payment_failed") {
    runtimeExactKeys(
      record,
      [...CALLBACK_BASE_KEYS, "provider_event_ref", "payment_ref", "failed_at"],
      "$callback",
    );
    return parseEntitlementEventV1({
      ...base,
      event_id: header.event_id,
      occurred_at: header.occurred_at,
      type: "payment_failed",
      evidence: {
        kind: "provider_failure",
        source: "provider_webhook",
        ...stripeBinding(mapping),
        provider_event_ref: record.provider_event_ref,
        payment_ref: record.payment_ref,
        failed_at: record.failed_at,
      },
    });
  }

  if (
    header.kind === "subscription_cancel_at_period_end" ||
    header.kind === "subscription_ended"
  ) {
    runtimeExactKeys(
      record,
      [
        ...CALLBACK_BASE_KEYS,
        "provider_event_ref",
        "subscription_ref",
        "status_at",
      ],
      "$callback",
    );
    const type =
      header.kind === "subscription_cancel_at_period_end"
        ? "cancel_at_period_end"
        : "subscription_ended";
    return parseEntitlementEventV1({
      ...base,
      event_id: header.event_id,
      occurred_at: header.occurred_at,
      type,
      evidence: {
        kind: "provider_status",
        source: "provider_webhook",
        ...stripeBinding(mapping),
        provider_event_ref: record.provider_event_ref,
        payment_or_subscription_ref: record.subscription_ref,
        status_at: record.status_at,
      },
    });
  }

  runtimeExactKeys(
    record,
    [
      ...CALLBACK_BASE_KEYS,
      "provider_event_ref",
      "refund_extent",
      "payment_ref",
      "refunded_at",
    ],
    "$callback",
  );
  const extent = runtimeEnum(
    record.refund_extent,
    ["full", "partial"] as const,
    "$callback.refund_extent",
  );
  if (extent !== "full") {
    throw new ProductFlowRuntimeError(
      "unsupported_callback",
      "$callback.refund_extent",
      "A partial Stripe refund does not prove full entitlement reversal.",
    );
  }
  return parseEntitlementEventV1({
    ...base,
    event_id: header.event_id,
    occurred_at: header.occurred_at,
    type: "refunded",
    evidence: {
      kind: "provider_reversal",
      source: "provider_webhook",
      ...stripeBinding(mapping),
      provider_event_ref: record.provider_event_ref,
      payment_ref: record.payment_ref,
      confirmed_at: record.refunded_at,
    },
  });
}

function assertTelegramInvoice(
  mapping: ReturnType<typeof parseTelegramStarsMappingV1>,
  record: RuntimeRecord,
): void {
  runtimeLiteral(record.currency, "XTR", "$callback.currency");
  const amount = runtimePositiveInteger(
    record.amount_stars,
    "$callback.amount_stars",
    PRODUCT_FLOW_RUNTIME_LIMITS.telegram_subscription_amount_stars,
  );
  if (
    record.invoice_payload_ref !== mapping.invoice_payload_ref ||
    amount !== mapping.amount_stars
  ) {
    throw new ProductFlowRuntimeError(
      "mapping_mismatch",
      "$callback",
      "Telegram currency, invoice payload, and Stars amount must match the configured mapping exactly.",
    );
  }
}

/**
 * Converts verified Telegram Stars pre-checkout, successful-payment, and
 * refund facts. Raw user/chat IDs, invoice payloads, and Telegram charge IDs
 * stay in the host; only injected opaque references cross this boundary.
 */
export function normalizeTelegramStarsCallbackV1(
  mappingValue: unknown,
  callbackValue: unknown,
): EntitlementEventV1 {
  const mapping = parseTelegramStarsMappingV1(mappingValue);
  const record = runtimeRecord(callbackValue, "$callback");
  runtimeLiteral(
    record.schema,
    TELEGRAM_STARS_CALLBACK_SCHEMA,
    "$callback.schema",
  );
  const identity = validateEventIdentity(record);
  const kind = runtimeEnum(
    record.kind,
    TELEGRAM_CALLBACK_KINDS,
    "$callback.kind",
  );
  const base = telegramBase(mapping);

  if (kind === "precheckout_approved") {
    runtimeExactKeys(
      record,
      [
        ...CALLBACK_BASE_KEYS,
        "currency",
        "invoice_payload_ref",
        "amount_stars",
      ],
      "$callback",
    );
    assertTelegramInvoice(mapping, record);
    return parseEntitlementEventV1({
      ...base,
      ...identity,
      type: "precheckout_approved",
    });
  }

  if (kind === "successful_payment") {
    runtimeExactKeys(
      record,
      [
        ...CALLBACK_BASE_KEYS,
        "currency",
        "invoice_payload_ref",
        "amount_stars",
        "provider_event_ref",
        "payment_ref",
        "confirmed_at",
        "subscription_expiration_at",
        "is_recurring",
        "is_first_recurring",
      ],
      "$callback",
    );
    assertTelegramInvoice(mapping, record);
    const recurring = runtimeBoolean(
      record.is_recurring,
      "$callback.is_recurring",
    );
    const first = runtimeBoolean(
      record.is_first_recurring,
      "$callback.is_first_recurring",
    );
    if (!recurring) {
      throw new ProductFlowRuntimeError(
        "unsupported_callback",
        "$callback.is_recurring",
        "This subscription normalizer does not grant from a one-time Stars payment.",
      );
    }
    const type = first ? "payment_confirmed" : "renewal_confirmed";
    return parseEntitlementEventV1({
      ...base,
      ...identity,
      type,
      active_until: record.subscription_expiration_at,
      evidence: {
        kind: "provider_confirmation",
        source: "provider_webhook",
        ...telegramBinding(mapping),
        provider_event_ref: record.provider_event_ref,
        payment_ref: record.payment_ref,
        confirmed_at: record.confirmed_at,
        active_until: record.subscription_expiration_at,
      },
    });
  }

  runtimeExactKeys(
    record,
    [
      ...CALLBACK_BASE_KEYS,
      "currency",
      "invoice_payload_ref",
      "amount_stars",
      "provider_event_ref",
      "original_payment_ref",
      "refunded_at",
    ],
    "$callback",
  );
  assertTelegramInvoice(mapping, record);
  return parseEntitlementEventV1({
    ...base,
    ...identity,
    type: "refunded",
    evidence: {
      kind: "provider_reversal",
      source: "provider_webhook",
      ...telegramBinding(mapping),
      provider_event_ref: record.provider_event_ref,
      payment_ref: record.original_payment_ref,
      confirmed_at: record.refunded_at,
    },
  });
}

// These aliases keep the public callback vocabulary visible to editors while
// implementation continues to accept unknown values at the trust boundary.
export type { StripeSubscriptionCallbackV1, TelegramStarsCallbackV1 };
