import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { formatDateTime } from "@/lib/format";
import { getMarketPaymentCreationAvailability } from "@/lib/release/market-payment-creation";
import {
  STRIPE_CHECKOUT_RAIL,
  attachStripeCheckoutSession,
  getStripeCheckoutAttempt,
  isMarketPaymentAttemptMigrationMissing,
  markStripeCheckoutAttemptForReview,
  markStripeCheckoutAttemptTerminal,
  normalizeCheckoutSiteUrl,
  reserveStripeCheckoutAttempt,
  retireLegacyStripeSession,
  stripeCheckoutAttemptBindingProblems,
} from "@/lib/market/stripe-checkout-attempts";

function resolveSiteUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return normalizeCheckoutSiteUrl(configured);
  try {
    return normalizeCheckoutSiteUrl(new URL(req.url).origin);
  } catch {
    return "http://localhost:3000";
  }
}

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Every country Stripe Checkout can collect a shipping address for — the
// full ShippingAddressCollection.AllowedCountry enum from the SDK, minus
// 'ZZ' (Stripe's "unknown country" placeholder, not a shippable territory).
// Stripe-unsupported territories (Cuba, Iran, North Korea, Syria, the US
// minor outlying islands, …) simply aren't in the enum, so this IS the
// global list. No UK shortlist: global free trade — traders arrange their
// own logistics (spec: docs/superpowers/specs/2026-06-10-global-free-trade-design.md §2.3).
const GLOBAL_SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
  "AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AT",
  "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
  "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
  "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO",
  "CR", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC",
  "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FO", "FR", "GA",
  "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ",
  "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID",
  "IE", "IL", "IM", "IN", "IO", "IQ", "IS", "IT", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB",
  "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD",
  "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MS", "MT",
  "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL",
  "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK",
  "PL", "PM", "PN", "PR", "PS", "PT", "PY", "QA", "RE", "RO", "RS", "RU",
  "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL",
  "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SZ", "TA", "TC", "TD",
  "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV",
  "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VN",
  "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // NOTE: getStripe() is NOT called here. It throws when STRIPE_SECRET_KEY
  // is absent, and a throw outside the try below produced a bodiless 500
  // that stranded the buyer on a ticking payment window with no
  // explanation (the persona walkers hit exactly this). It is constructed
  // inside the try, so a config/Stripe failure returns an honest 503.
  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in to pay." }, { status: 401 });
  }

  const release = getMarketPaymentCreationAvailability();
  if (!release.enabled) {
    return NextResponse.json(
      {
        error:
          "New P2P payment sessions are temporarily paused while Cambridge upgrades the settlement ledger. No payment was created. Existing shipping, receipt, dispute and remedy steps continue.",
        code: "market_payment_creation_paused",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const { id } = await params;

  // Trade must exist, the requester must be the buyer, status must still be
  // awaiting_payment, and the payment window must not have elapsed.
  const tradeRes = await query(
    `SELECT t.*, COALESCE(o.card_name, t.sku) AS card_name, o.image_url
       FROM market_trades t
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.id = $1`,
    [id]
  );
  if (tradeRes.rows.length === 0) {
    return privateJson({ error: "Trade not found." }, { status: 404 });
  }
  const trade = tradeRes.rows[0];

  if (trade.buyer_id !== session.user.id) {
    return privateJson({ error: "Only the buyer can pay for this trade." }, { status: 403 });
  }
  if (trade.escrow_status !== "awaiting_payment") {
    return privateJson({ error: `Trade is in '${trade.escrow_status}' state.` }, { status: 400 });
  }
  if (trade.payment_expires_at && new Date(trade.payment_expires_at) <= new Date()) {
    return privateJson({ error: "Payment window has expired." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const siteUrl = resolveSiteUrl(req);

    // At most two passes are needed: an explicitly-expired legacy/v2
    // session can retire, then the same request reserves one fresh attempt.
    // Ambiguous provider failures never rotate the attempt.
    for (let pass = 0; pass < 2; pass += 1) {
      const reservation = await reserveStripeCheckoutAttempt({
        tradeId: trade.id,
        buyerId: session.user.id,
        siteUrl,
        shippingAllowedCountries: GLOBAL_SHIPPING_COUNTRIES,
      });
      if (!reservation.ok) {
        switch (reservation.reason) {
          case "not_found":
            return privateJson({ error: "Trade not found." }, { status: 404 });
          case "forbidden":
            return privateJson({ error: "Only the buyer can pay for this trade." }, { status: 403 });
          case "trade_not_awaiting_payment":
            return privateJson({ error: "Trade is no longer awaiting payment." }, { status: 409 });
          case "payment_window_expired":
            return privateJson({ error: "Payment window has expired." }, { status: 409 });
          case "payment_window_too_short":
            return privateJson(
              {
                error: "Less than 31 minutes remain in this trade's payment window, so a new Stripe Checkout cannot be opened without extending past the real deadline. Contact support before the window closes.",
                code: "checkout_window_too_short",
              },
              { status: 409 },
            );
          case "rail_conflict":
            return privateJson(
              { error: `This trade is already reserved for '${reservation.reservedRail}'.`, code: "settlement_rail_conflict" },
              { status: 409 },
            );
        }
      }

      if (reservation.kind === "legacy_session") {
        // A pre-ledger session is reusable only when Stripe can retrieve it
        // and says it is still open. A timeout/404/key-mode ambiguity stays
        // bound for reconciliation; it never causes a second chargeable URL.
        const prior = await stripe.checkout.sessions.retrieve(reservation.stripeSessionId);
        const expectedPence = Math.round(parseFloat(trade.price) * trade.quantity * 100);
        if (
          prior.metadata?.type !== "market_trade_payment"
          || prior.metadata?.trade_id !== trade.id
          || prior.amount_total !== expectedPence
          || prior.currency?.toLowerCase() !== "gbp"
        ) {
          console.error(`[market] Legacy Checkout ${prior.id} failed exact trade binding for ${trade.id}`);
          return privateJson(
            { error: "The existing payment session needs review. No new session was created.", code: "checkout_requires_review" },
            { status: 409 },
          );
        }
        if (prior.status === "open" && prior.url) return privateJson({ url: prior.url });
        if (prior.status === "complete") {
          return privateJson(
            { error: "Payment has already started or completed. Confirmation is processing; refresh in a moment." },
            { status: 409 },
          );
        }
        if (prior.status === "expired") {
          const retired = await retireLegacyStripeSession({
            tradeId: trade.id,
            stripeSessionId: prior.id,
            status: "expired",
          });
          if (retired.ok) continue;
          if (retired.reviewRecorded) {
            return privateJson(
              { error: "The existing payment session needs review. No new session was created.", code: "checkout_requires_review" },
              { status: 409 },
            );
          }
        }
        return privateJson(
          { error: "The existing payment session is being reconciled. No new session was created." },
          { status: 409 },
        );
      }

      const attempt = reservation.attempt;
      if (attempt.status === "requires_review") {
        return privateJson(
          { error: "This payment attempt needs review. No additional Checkout was created.", code: "checkout_requires_review" },
          { status: 409 },
        );
      }
      if (attempt.status === "processing" || attempt.status === "settled") {
        return privateJson(
          { error: "Payment has already started or completed. Confirmation is processing; refresh in a moment." },
          { status: 409 },
        );
      }

      // If provider creation once succeeded but its response and every
      // webhook were lost, Stripe may prune the idempotency key after 24h.
      // The attempt's Checkout was capped to 23h, but a session paid just
      // before expiry could be complete rather than expired. With no stored
      // session id there is no safe automatic observation path, so never
      // reuse the now-old key as a fresh create operation.
      if (
        !attempt.stripeSessionId
        && new Date(attempt.providerExpiresAt).getTime() <= Date.now()
      ) {
        await markStripeCheckoutAttemptForReview(
          attempt.id,
          "Attempt reached provider expiry without a bound Stripe session; reconciliation is required before retry.",
        );
        return privateJson(
          { error: "The previous payment attempt needs reconciliation. No additional Checkout was created.", code: "checkout_requires_review" },
          { status: 409 },
        );
      }

      if (attempt.stripeSessionId) {
        const prior = await stripe.checkout.sessions.retrieve(attempt.stripeSessionId);
        const problems = stripeCheckoutAttemptBindingProblems(attempt, prior);
        if (problems.length > 0) {
          await markStripeCheckoutAttemptForReview(attempt.id, problems.join("; "));
          return privateJson(
            { error: "The existing payment session failed its exact binding checks. No new session was created.", code: "checkout_requires_review" },
            { status: 409 },
          );
        }
        if (prior.status === "open" && prior.url) return privateJson({ url: prior.url });
        if (prior.status === "complete") {
          return privateJson(
            { error: "Payment has already started or completed. Confirmation is processing; refresh in a moment." },
            { status: 409 },
          );
        }
        if (prior.status === "expired") {
          const retired = await markStripeCheckoutAttemptTerminal(
            prior,
            "expired",
            "Stripe retrieval reported the bound Checkout Session expired.",
          );
          if (retired.ok) continue;
          if (retired.reviewRecorded) {
            return privateJson(
              { error: "The expired payment session failed its exact binding checks. No new session was created.", code: "checkout_requires_review" },
              { status: 409 },
            );
          }
        }
        return privateJson(
          { error: "The existing payment session is being reconciled. No new session was created." },
          { status: 409 },
        );
      }

      const checkoutSession = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          // Exact GBP/pence binding is an escrow invariant. Dashboard-level
          // adaptive pricing must not silently change the webhook currency.
          adaptive_pricing: { enabled: attempt.request.adaptive_pricing_enabled },
          client_reference_id: attempt.request.client_reference_id,
          line_items: [{
            price_data: {
              currency: attempt.expectedCurrency,
              product_data: {
                name: attempt.request.product_name,
                description: attempt.request.product_description,
                ...(attempt.request.image_url ? { images: [attempt.request.image_url] } : {}),
              },
              unit_amount: attempt.expectedAmountPence,
            },
            quantity: 1,
          }],
          success_url: attempt.request.success_url,
          cancel_url: attempt.request.cancel_url,
          customer_email: attempt.request.customer_email || undefined,
          shipping_address_collection: {
            allowed_countries: attempt.request.shipping_allowed_countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          },
          expires_at: Math.floor(new Date(attempt.providerExpiresAt).getTime() / 1000),
          metadata: {
            type: "market_trade_payment",
            trade_id: attempt.tradeId,
            payment_attempt_id: attempt.id,
            settlement_rail: STRIPE_CHECKOUT_RAIL,
          },
        },
        { idempotencyKey: attempt.idempotencyKey },
      );

      const problems = stripeCheckoutAttemptBindingProblems(attempt, checkoutSession);
      if (checkoutSession.status !== "open") problems.push(`new Checkout is ${checkoutSession.status}`);
      if (!checkoutSession.url) problems.push("new Checkout has no hosted URL");
      if (problems.length > 0) {
        if (checkoutSession.status === "open") {
          await stripe.checkout.sessions.expire(checkoutSession.id).catch((error) =>
            console.error(`[market] Could not expire rejected Checkout ${checkoutSession.id}:`, error),
          );
        }
        await markStripeCheckoutAttemptForReview(attempt.id, problems.join("; "));
        return privateJson(
          { error: "Stripe returned a payment session that failed its binding checks. It was not offered for payment.", code: "checkout_requires_review" },
          { status: 503 },
        );
      }

      const attached = await attachStripeCheckoutSession({
        attemptId: attempt.id,
        stripeSessionId: checkoutSession.id,
      });
      if (!attached) {
        const recovered = await getStripeCheckoutAttempt(attempt.id);
        if (recovered?.stripeSessionId === checkoutSession.id && checkoutSession.url) {
          return privateJson({ url: checkoutSession.url });
        }
        await stripe.checkout.sessions.expire(checkoutSession.id).catch((error) =>
          console.error(`[market] Could not expire unbound Checkout ${checkoutSession.id}:`, error),
        );
        return privateJson(
          { error: "The trade changed while Checkout was being prepared. The unbound session was closed." },
          { status: 409 },
        );
      }
      return privateJson({ url: checkoutSession.url });
    }

    return privateJson(
      { error: "The previous payment session expired, but a replacement could not be reserved safely." },
      { status: 409 },
    );
  } catch (err) {
    console.error("[market] Pay session error:", err);
    // Honest failure. Two truths the buyer needs: (1) this is our side,
    // not theirs, and (2) the payment window does NOT pause while checkout
    // is down — it still ends at the trade's real payment_expires_at. We
    // name that time rather than inventing a grace period the sweep won't
    // honour. The dev-only STRIPE_SECRET_KEY message stays server-side.
    const unconfigured = err instanceof Error && /STRIPE_SECRET_KEY/.test(err.message);
    const whenIso: string | null = trade.payment_expires_at ?? null;
    const whenLabel = whenIso ? formatDateTime(whenIso) : null;
    const error = whenLabel
      ? `Payments are temporarily unavailable — this is on our side, not yours. Your payment window is unchanged: it still closes ${whenLabel} and does not pause while checkout is down. Please try again in a few minutes; if it keeps failing, contact support before the window closes.`
      : `Payments are temporarily unavailable — this is on our side, not yours. Your payment window is unchanged and does not pause while checkout is down. Please try again shortly, and contact support if it persists.`;
    const migrationMissing = isMarketPaymentAttemptMigrationMissing(err);
    return privateJson(
      { error, code: unconfigured ? "payments_unconfigured" : "payments_unavailable", payment_expires_at: whenIso },
      { status: 503, ...(migrationMissing ? { statusText: "Payment migration unavailable" } : {}) },
    );
  }
}
