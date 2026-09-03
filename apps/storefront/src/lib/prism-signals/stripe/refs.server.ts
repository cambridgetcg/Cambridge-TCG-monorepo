import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { ProductFlowOpaqueRef } from "@cambridge-tcg/product-flow";

const NAMESPACE = /^[a-z][a-z0-9_-]{0,47}$/;
const PRISM_STRIPE_PRICE_REF_NAMESPACE = "stripe_price" as const;
const STRIPE_PRICE_ID = /^price_[A-Za-z0-9]{8,64}$/;

function requireSecret(secret: string): void {
  if (secret.length < 32 || secret.length > 512) {
    throw new Error("PRISM Stripe reference secret must contain 32-512 characters.");
  }
}

/**
 * One-way, domain-separated mapping for auth/provider identifiers before they
 * cross the generic product-flow boundary. The raw value is never embedded.
 */
export function derivePrismStripeOpaqueRef(
  secret: string,
  namespace: string,
  rawValue: string,
): ProductFlowOpaqueRef {
  requireSecret(secret);
  if (!NAMESPACE.test(namespace)) {
    throw new Error("PRISM Stripe reference namespace is invalid.");
  }
  if (rawValue.length < 1 || rawValue.length > 512) {
    throw new Error("PRISM Stripe reference input length is invalid.");
  }
  const digest = createHmac("sha256", secret)
    .update(`${namespace.length}:`)
    .update(namespace)
    .update(`:${rawValue.length}:`)
    .update(rawValue)
    .digest("base64url");
  return `pf_${digest}` as ProductFlowOpaqueRef;
}

/** Canonical public/runtime identity for the configured Stripe Price. */
export function derivePrismStripePriceRef(
  secret: string,
  stripePriceId: string,
): ProductFlowOpaqueRef {
  if (!STRIPE_PRICE_ID.test(stripePriceId)) {
    throw new Error("PRISM Stripe Price id is invalid.");
  }
  return derivePrismStripeOpaqueRef(
    secret,
    PRISM_STRIPE_PRICE_REF_NAMESPACE,
    stripePriceId,
  );
}

/** Random local correlation reference; raw account/provider ids use derive. */
export function newPrismStripeOpaqueRef(): ProductFlowOpaqueRef {
  return `pf_${randomBytes(24).toString("base64url")}` as ProductFlowOpaqueRef;
}
