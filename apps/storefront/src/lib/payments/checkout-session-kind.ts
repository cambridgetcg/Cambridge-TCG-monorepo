import type Stripe from "stripe";

// Vercel deployment cambridgetcg-storefront-or8ab5c90 (production, SHA
// 555f9592, which contains shop-close commit 98468020) became READY at this
// instant. A Checkout Session created after this production boundary cannot
// belong to the retired till, even if a future flow omits its own type marker.
export const RETAIL_CHECKOUT_RETIRED_AT_UNIX = Math.floor(
  Date.parse("2026-07-06T14:04:27.000Z") / 1_000,
);

/**
 * The retired first-party shop is the only Checkout flow represented by
 * customer_orders. Its sessions were deliberately untyped. Every named flow
 * has its own ledger and must never be reconciled into the retail table.
 *
 * This is intentionally fail-closed for future metadata types: adding a new
 * Checkout integration cannot silently turn it into a shop order, a spend
 * signal, or email-derived payment ownership.
 */
export function isLegacyRetailCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "created" | "metadata">,
): boolean {
  const metadata = session.metadata;
  if (!metadata || !Number.isInteger(session.created)) return false;
  if (session.created > RETAIL_CHECKOUT_RETIRED_AT_UNIX) return false;

  // Presence, not truthiness: an empty marker is malformed evidence for a
  // named flow, not permission to fall into the retail writer.
  if (Object.prototype.hasOwnProperty.call(metadata, "type")) return false;
  if (Object.prototype.hasOwnProperty.call(metadata, "b2b_channel")) return false;

  // Positive evidence from the retired checkout contract. No current flow
  // should be able to enter customer_orders merely by forgetting metadata.
  if (typeof metadata.skus !== "string") return false;
  try {
    const skus = JSON.parse(metadata.skus) as unknown;
    return Array.isArray(skus)
      && skus.length > 0
      && skus.every((item) => {
        if (!item || typeof item !== "object") return false;
        const row = item as { sku?: unknown; qty?: unknown };
        return typeof row.sku === "string"
          && row.sku.trim().length > 0
          && typeof row.qty === "number"
          && Number.isInteger(row.qty)
          && row.qty > 0;
      });
  } catch {
    return false;
  }
}
