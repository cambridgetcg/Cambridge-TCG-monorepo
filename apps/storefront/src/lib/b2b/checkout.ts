/**
 * B2B checkout — Stripe Checkout Session builder.
 *
 * Phase 2.2b of the wholesale consolidation. Loads the buyer's cart
 * from b2b_cart_items, resolves CURRENT wholesale prices via the
 * Falcon, reserves stock, and creates a Stripe Checkout Session.
 *
 * Substrate-honesty:
 *   - The session is created with line items priced at the moment of
 *     checkout, not at add-to-cart time. If a price moved between
 *     those two moments, the buyer pays the new price.
 *   - Stock reservation is all-or-nothing. A line with insufficient
 *     stock aborts the whole checkout — the buyer adjusts quantities
 *     in the cart and retries.
 *   - The Stripe metadata tags the session as B2B (b2b_user_id +
 *     b2b_channel='wholesale'). The webhook handler reads this tag
 *     to route the order to b2b-aware persistence (Phase 2.2c).
 *
 * What's NOT here (vs the retired retail checkout — the consumer shop
 * closed 2026-07-06, collectors-first decision):
 *   - No tier discount (B2B has no per-buyer pricing per Yu's directive)
 *   - No store credit (was retail-only)
 *   - No membership perks (was retail-only)
 *
 * Companion to:
 *   - apps/storefront/src/lib/b2b/cart.ts — the cart layer
 *   - apps/storefront/src/lib/stock/reservations.ts — the reserver
 *   - apps/storefront/src/lib/wholesale/client.ts — the Falcon (B2B key)
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { fetchCard, type PriceItem } from "@/lib/wholesale/client";
import { loadCartRows } from "@/lib/b2b/cart";
import {
  reserveCartItems,
  holderForStripeSession,
} from "@/lib/stock/reservations";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");

export type CheckoutFailure =
  | { ok: false; reason: "empty_cart"; message: string }
  | { ok: false; reason: "unknown_sku"; sku?: string; message: string }
  | { ok: false; reason: "out_of_stock"; sku?: string; message: string }
  | { ok: false; reason: "missing_card"; sku: string; message: string }
  | { ok: false; reason: "price_unavailable"; sku: string; message: string }
  | { ok: false; reason: "stripe_error"; message: string };

export interface CheckoutSuccess {
  ok: true;
  url: string;
  sessionId: string;
  totalPence: number;
  itemCount: number;
}

interface ResolvedLine {
  sku: string;
  quantity: number;
  card: PriceItem;
  unitPence: number;
}

export async function startCheckout(
  userId: string,
  userEmail: string | null,
): Promise<CheckoutSuccess | CheckoutFailure> {
  const rows = await loadCartRows(userId);
  if (rows.length === 0) {
    return { ok: false, reason: "empty_cart", message: "Your cart is empty." };
  }

  // Resolve current wholesale prices in parallel. A missing card
  // aborts checkout — the buyer must remove it first.
  const resolutions = await Promise.all(
    rows.map(async (r): Promise<ResolvedLine | { missingSku: string } | { unavailableSku: string }> => {
      const card = await fetchCard(r.sku, "wholesale");
      if (!card) return { missingSku: r.sku };
      const unit = card.channel_price ?? card.price_gbp;
      if (unit === null) return { unavailableSku: r.sku };
      return {
        sku: r.sku,
        quantity: r.quantity,
        card,
        unitPence: Math.round(unit * 100),
      };
    }),
  );

  const missing = resolutions.find((r): r is { missingSku: string } => "missingSku" in r);
  if (missing) {
    return {
      ok: false,
      reason: "missing_card",
      sku: missing.missingSku,
      message: `Card ${missing.missingSku} is no longer in the catalog. Remove it from your cart and retry.`,
    };
  }

  const unavailable = resolutions.find(
    (r): r is { unavailableSku: string } => "unavailableSku" in r,
  );
  if (unavailable) {
    return {
      ok: false,
      reason: "price_unavailable",
      sku: unavailable.unavailableSku,
      message: `Price publication for ${unavailable.unavailableSku} is paused pending source-rights review.`,
    };
  }

  const lines = resolutions as ResolvedLine[];

  const stripe = getStripe();

  // Build line items first so we can compute totals + provide them to
  // metadata. The session is created LAST (after reservation) so that
  // a reservation failure doesn't leave an orphan Stripe session.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = lines.map((l) => ({
    price_data: {
      currency: "gbp",
      product_data: {
        name: l.card.name_en || l.card.name || l.sku,
        ...(l.card.image_url ? { images: [l.card.image_url] } : {}),
        metadata: {
          sku: l.sku,
          card_number: l.card.card_number,
          set_code: l.card.set_code ?? "",
          channel: "wholesale",
        },
      },
      unit_amount: l.unitPence,
    },
    quantity: l.quantity,
  }));

  const totalPence = lines.reduce((sum, l) => sum + l.unitPence * l.quantity, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  // Reservation key: at this point we don't have a Stripe session id
  // yet, so we generate a provisional holder and rebind after the
  // session is created. The reserver supports two-phase rebinding via
  // re-reserve under the new holder; for the minimal Phase 2.2b path
  // we use a single holder derived from a placeholder + reserve only
  // AFTER the Stripe session exists (so retail's holderForStripeSession
  // contract holds end-to-end). The cost: a partial Stripe session
  // exists for a moment before reservation. That's acceptable — the
  // buyer hasn't paid yet.
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${SITE_URL}/account/b2b/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/account/b2b/cart`,
      customer_email: userEmail || undefined,
      shipping_address_collection: {
        allowed_countries: ["GB", "US", "CA", "AU", "DE", "FR", "NL", "JP"],
      },
      metadata: {
        b2b_channel: "wholesale",
        b2b_user_id: userId,
        b2b_skus: JSON.stringify(
          lines.map((l) => ({ sku: l.sku, qty: l.quantity, price_pence: l.unitPence })),
        ),
      },
    });
  } catch (err) {
    return {
      ok: false,
      reason: "stripe_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Reserve stock under the Stripe session's holder. On failure,
  // expire the Stripe session so the buyer can't accidentally pay
  // for a reservation we couldn't grant.
  const reservation = await reserveCartItems(
    holderForStripeSession(session.id),
    lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
  );

  if (!reservation.ok) {
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch {
      // Best-effort; if expire fails the abandoned session times out
      // on Stripe's side within 24h anyway.
    }
    if (reservation.reason === "out_of_stock") {
      return {
        ok: false,
        reason: "out_of_stock",
        sku: reservation.sku,
        message: reservation.message,
      };
    }
    if (reservation.reason === "unknown_sku") {
      return {
        ok: false,
        reason: "unknown_sku",
        sku: reservation.sku,
        message: reservation.message,
      };
    }
    return {
      ok: false,
      reason: "stripe_error",
      message: reservation.message,
    };
  }

  return {
    ok: true,
    url: session.url ?? `${SITE_URL}/account/b2b/cart`,
    sessionId: session.id,
    totalPence,
    itemCount,
  };
}
