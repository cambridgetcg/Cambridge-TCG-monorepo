import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import type { ProductFlowOpaqueRef } from "@cambridge-tcg/product-flow";

const NAMESPACE = /^[a-z][a-z0-9_-]{0,47}$/;

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

/** Random local correlation reference; raw account/provider ids use derive. */
export function newPrismStripeOpaqueRef(): ProductFlowOpaqueRef {
  return `pf_${randomBytes(24).toString("base64url")}` as ProductFlowOpaqueRef;
}
