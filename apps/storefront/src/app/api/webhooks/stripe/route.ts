import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { reportSale } from "@/lib/wholesale/client";
import { query } from "@/lib/db";
import { processOrderRewards } from "@/lib/membership/db";
import { postActivity, awardAchievement } from "@/lib/social/db";
import { getStripe } from "@/lib/stripe";
import {
  commitCartToSale,
  releaseHolder,
  holderForStripeSession,
} from "@/lib/stock/reservations";
import { recordOrderFromStripeSession } from "@/lib/orders/record";

export async function POST(request: Request) {
  // Order matters: gate the request on configuration + signature
  // BEFORE invoking Stripe. getStripe() throws when STRIPE_SECRET_KEY
  // is missing; reaching it on a no-signature request would surface
  // as 500 instead of the correct 400.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Subscription renewal — fires monthly/annually when Stripe collects the
  // recurring charge for a Platinum subscriber. Extends subscription_expires_at
  // so recalculateTier() keeps the user on Platinum.
  if (event.type === "invoice.payment_succeeded") {
    try {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
      const subId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription
            ? (invoice.subscription as { id?: string }).id ?? null
            : null;
      // Skip the first invoice — that's the initial checkout; the
      // checkout.session.completed handler already stamped expires_at.
      // Renewal invoices have billing_reason='subscription_cycle'.
      if (subId && invoice.billing_reason === "subscription_cycle") {
        // Period covered by this invoice tells us the new expiry. Stripe
        // gives us period_end on the line item.
        const periodEnd = invoice.lines.data[0]?.period?.end;
        if (periodEnd) {
          await query(
            `UPDATE users
                SET subscription_expires_at = to_timestamp($2),
                    subscription_status = 'active',
                    tier_calculated_at = NOW(),
                    updated_at = NOW()
              WHERE subscription_stripe_id = $1`,
            [subId, periodEnd]
          );
          // Recalc tier to honour the freshly extended subscription
          const u = await query(
            `SELECT id FROM users WHERE subscription_stripe_id = $1`,
            [subId]
          );
          if (u.rows[0]) {
            const { recalculateTier } = await import("@/lib/membership/db");
            await recalculateTier(u.rows[0].id).catch(() => {});
          }
          console.log(`[webhook] Platinum renewal: subscription ${subId} extended`);
        }
      }
    } catch (err) {
      console.error("[webhook] invoice.payment_succeeded error:", err);
    }
    return NextResponse.json({ received: true });
  }

  // Subscription updated — fires when:
  //   - Customer Portal cancels / un-cancels (cancel_at_period_end toggled)
  //   - Payment method changes
  //   - Plan changes / period rolls over
  //   - Status transitions (trialing → active → past_due → unpaid …)
  //
  // Mirrors the changes we care about onto the user row so the
  // /account/billing page reflects portal-side actions without polling.
  if (event.type === "customer.subscription.updated") {
    try {
      const sub = event.data.object as Stripe.Subscription;
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? null;
      // Capture payment method brand/last4 if the default just changed.
      let pmBrand: string | null = null;
      let pmLast4: string | null = null;
      try {
        if (sub.default_payment_method) {
          const pm = typeof sub.default_payment_method === "string"
            ? await stripe.paymentMethods.retrieve(sub.default_payment_method)
            : (sub.default_payment_method as Stripe.PaymentMethod);
          if (pm?.card) {
            pmBrand = pm.card.brand;
            pmLast4 = pm.card.last4;
          }
        }
      } catch (pmErr) {
        console.warn("[webhook] subscription.updated PM fetch:", pmErr);
      }

      await query(
        `UPDATE users
            SET subscription_status = $2,
                subscription_cancel_at_period_end = $3,
                subscription_expires_at = COALESCE(to_timestamp($4), subscription_expires_at),
                subscription_payment_brand = COALESCE($5, subscription_payment_brand),
                subscription_payment_last4 = COALESCE($6, subscription_payment_last4),
                tier_calculated_at = NOW(),
                updated_at = NOW()
          WHERE subscription_stripe_id = $1`,
        [
          sub.id,
          sub.status,
          sub.cancel_at_period_end,
          periodEnd,
          pmBrand,
          pmLast4,
        ]
      );
      console.log(`[webhook] subscription ${sub.id} updated: status=${sub.status} cancel_at_period_end=${sub.cancel_at_period_end}`);
    } catch (err) {
      console.error("[webhook] subscription.updated error:", err);
    }
    return NextResponse.json({ received: true });
  }

  // Subscription cancelled / lapsed — flip status, let recalculateTier drop
  // the user to their best spending-based tier on next profile fetch.
  if (event.type === "customer.subscription.deleted") {
    try {
      const sub = event.data.object as Stripe.Subscription;
      await query(
        `UPDATE users
            SET subscription_status = 'cancelled',
                tier_calculated_at = NOW(),
                updated_at = NOW()
          WHERE subscription_stripe_id = $1`,
        [sub.id]
      );
      const u = await query(
        `SELECT id FROM users WHERE subscription_stripe_id = $1`,
        [sub.id]
      );
      if (u.rows[0]) {
        const { recalculateTier } = await import("@/lib/membership/db");
        await recalculateTier(u.rows[0].id).catch(() => {});
      }
      console.log(`[webhook] Platinum subscription ${sub.id} cancelled`);
    } catch (err) {
      console.error("[webhook] subscription.deleted error:", err);
    }
    return NextResponse.json({ received: true });
  }

  // Stripe Connect: keep the local account state in sync with Stripe's view.
  // Fires when a seller completes onboarding, has a requirement come due,
  // or gets restricted/disabled.
  if (event.type === "account.updated") {
    try {
      const account = event.data.object as Stripe.Account;
      const { syncAccountFromStripe } = await import("@/lib/payouts/stripe-connect");
      await syncAccountFromStripe(account.id);
      console.log(`[webhook] Connect account ${account.id} synced (charges=${account.charges_enabled} payouts=${account.payouts_enabled})`);
    } catch (err) {
      console.error("[webhook] account.updated sync failed:", err);
    }
    return NextResponse.json({ received: true });
  }

  // Chargeback / dispute lifecycle. Stripe fires charge.dispute.created
  // when a buyer files a dispute with their bank, and charge.dispute.
  // updated / closed as the case progresses. All three route through
  // the same idempotent ingestion lib (stripe_dispute_id PK gates
  // duplicate inserts; status updates upsert).
  if (event.type === "charge.dispute.created"
      || event.type === "charge.dispute.updated"
      || event.type === "charge.dispute.closed") {
    try {
      const dispute = event.data.object as Stripe.Dispute;
      const { ingestChargeback } = await import("@/lib/payments/chargebacks");
      const result = await ingestChargeback({
        stripeDisputeId: dispute.id,
        stripePaymentIntent: typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? "",
        amountGbp: (dispute.amount ?? 0) / 100,
        currency: dispute.currency ?? "gbp",
        stripeStatus: dispute.status,
        stripeReason: dispute.reason ?? null,
        evidenceDueAt: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000)
          : null,
        source: "webhook",
      });
      console.log(
        `[webhook] dispute ${dispute.id} ${result.created ? "created" : (result.statusChanged ? "status-changed" : "duplicate")}` +
        ` (status=${dispute.status}, user=${result.userId ?? "unknown"})`,
      );

      // Side effects fan out only on first-time receipt with a
      // resolved owner. handleNewChargeback uses the chargebacks.
      // fraud_emitted column as the atomic gate so webhook re-
      // delivery + reconciler catch-up share one-shot semantics.
      if (result.userId) {
        const { handleNewChargeback } = await import("@/lib/payments/chargeback-effects");
        await handleNewChargeback({
          stripeDisputeId: dispute.id,
          userId: result.userId,
          amountGbp: (dispute.amount ?? 0) / 100,
          stripeReason: dispute.reason ?? null,
        }).catch((err) => console.error(`[webhook] chargeback effects failed:`, err));
      }
    } catch (err) {
      console.error(`[webhook] ${event.type} ingest failed:`, err);
      // Return 200 anyway — the alternative (5xx) makes Stripe retry
      // forever and a buggy ingest path becomes a queue overflow.
      // Reconciler cron (Phase D) catches anything we drop.
    }
    return NextResponse.json({ received: true });
  }

  // Refunds. Stripe fires charge.refunded when a charge gets refunded
  // (full or partial) and refund.updated as status transitions
  // (pending→succeeded, failed). Both route through the same idempotent
  // ingestRefund — stripe_refund_id PK gates duplicate inserts.
  if (event.type === "charge.refunded"
      || event.type === "refund.updated"
      || event.type === "charge.refund.updated") {
    try {
      const { ingestRefund } = await import("@/lib/payments/refunds");

      // charge.refunded gives a Charge with .refunds array; the others
      // give a single Refund. Normalise to a list of (refund, charge_id).
      type RefundEntry = { refund: Stripe.Refund; chargeId: string | null };
      const entries: RefundEntry[] = [];
      if (event.type === "charge.refunded") {
        const charge = event.data.object as Stripe.Charge;
        for (const r of charge.refunds?.data ?? []) {
          entries.push({ refund: r, chargeId: charge.id });
        }
      } else {
        const refund = event.data.object as Stripe.Refund;
        entries.push({
          refund,
          chargeId: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null,
        });
      }

      for (const { refund, chargeId } of entries) {
        const piId = typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id ?? "";
        const result = await ingestRefund({
          stripeRefundId: refund.id,
          stripePaymentIntent: piId,
          stripeCharge: chargeId,
          amountGbp: (refund.amount ?? 0) / 100,
          currency: refund.currency ?? "gbp",
          stripeStatus: refund.status ?? "pending",
          stripeReason: refund.reason ?? null,
          // Stripe-initiated for now; admin-initiated refunds set the
          // value at admin endpoint time (Phase C work).
          initiatedBy: "stripe",
          source: "webhook",
        });
        console.log(
          `[webhook] refund ${refund.id} ${result.created ? "created" : (result.statusChanged ? "status-changed" : "duplicate")}` +
          ` (status=${refund.status}, user=${result.userId ?? "unknown"})`,
        );

        // Phase C side effects fire only on first-time receipt of a
        // successful refund tied to a known user.
        if (result.created && result.userId && refund.status === "succeeded") {
          const { handleRefundReceived } = await import("@/lib/payments/refund-effects");
          await handleRefundReceived({
            stripeRefundId: refund.id,
            userId: result.userId,
            amountGbp: (refund.amount ?? 0) / 100,
          }).catch((err) => console.error(`[webhook] refund effects failed:`, err));
        }
      }
    } catch (err) {
      console.error(`[webhook] ${event.type} ingest failed:`, err);
    }
    return NextResponse.json({ received: true });
  }

  // Failed payments. Stripe fires payment_intent.payment_failed when
  // a PaymentIntent fails any attempt — the same PI may fire multiple
  // times if Stripe retries. ingestFailedPayment upserts on payment_
  // intent so attempt_count tracks retries; the FAILED_PAYMENT_BURST
  // signal fires when retries cluster (Phase C-equivalent).
  if (event.type === "payment_intent.payment_failed") {
    try {
      const pi = event.data.object as Stripe.PaymentIntent;
      const lastError = pi.last_payment_error;
      const { ingestFailedPayment, handleFailedPayment } = await import("@/lib/payments/failed-payments");
      const result = await ingestFailedPayment({
        stripePaymentIntent: pi.id,
        amountGbp: (pi.amount ?? 0) / 100,
        currency: pi.currency ?? "gbp",
        failureCode: lastError?.code ?? null,
        failureMessage: lastError?.message ?? null,
        source: "webhook",
      });
      console.log(
        `[webhook] failed payment ${pi.id} attempt=${result.attemptCount}` +
        ` (user=${result.userId ?? "unknown"})`,
      );
      if (result.userId) {
        await handleFailedPayment({
          stripePaymentIntent: pi.id,
          userId: result.userId,
        }).catch((err) => console.error(`[webhook] failed-payment effects failed:`, err));
      }
    } catch (err) {
      console.error("[webhook] payment_intent.payment_failed ingest failed:", err);
    }
    return NextResponse.json({ received: true });
  }

  // Released-by-Stripe abandonment. Stripe fires checkout.session.expired
  // when a session times out without payment (default 24h, configurable).
  // Release the matching reservation so the held stock returns to availability
  // before the cron sweep would have caught it via TTL.
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    try {
      const result = await releaseHolder(holderForStripeSession(session.id));
      if (result.ok) {
        console.log(
          `[webhook] session expired ${session.id} — released ${result.released} reservation(s)`,
        );
      } else {
        console.warn(
          `[webhook] session expired ${session.id} — release failed: ${result.message}`,
        );
      }
    } catch (e) {
      console.error(`[webhook] release on session.expired threw for ${session.id}:`, e);
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // B2B branch — wholesale consolidation Phase 2.2c. Detected via
    // metadata.b2b_channel === 'wholesale' (set by
    // apps/storefront/src/lib/b2b/checkout.ts). The B2B flow writes to
    // b2b_orders (not customer_orders), skips retail-only side-effects
    // (membership perks, store credit ledger, retail receipt email),
    // commits the stock reservation under the same holder the checkout
    // helper used, and clears the buyer's cart.
    if (session.metadata?.b2b_channel === "wholesale") {
      try {
        const { recordOrder } = await import("@/lib/b2b/orders");
        const { clearCart } = await import("@/lib/b2b/cart");
        const recorded = await recordOrder(session);
        console.log(
          `[webhook] B2B order ${session.id} ${recorded.created ? "recorded" : "already-existed"} (user ${recorded.userId})`,
        );

        const b2bSkusRaw = session.metadata.b2b_skus;
        const b2bItems: { sku: string; qty: number; price_pence: number }[] = b2bSkusRaw
          ? JSON.parse(b2bSkusRaw)
          : [];
        if (b2bItems.length > 0) {
          const commit = await commitCartToSale(
            holderForStripeSession(session.id),
            b2bItems.map((i) => ({ sku: i.sku, quantity: i.qty })),
            "wholesale",
          );
          if (!commit.ok) {
            console.error(
              `[webhook] B2B stock commit failed for ${session.id}: ${commit.message}`,
            );
          }
        }

        // Clear the buyer's cart. Idempotent on Stripe redelivery —
        // a second webhook just deletes-zero-rows.
        await clearCart(recorded.userId).catch((e) =>
          console.error(`[webhook] B2B cart clear failed for user ${recorded.userId}:`, e),
        );
      } catch (err) {
        console.error(`[webhook] B2B order recording failed for ${session.id}:`, err);
        return NextResponse.json({ error: "B2B recording failed" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
    }

    try {
      const skus: { sku: string; qty: number; price_gbp: number; name?: string }[] = session.metadata?.skus
        ? JSON.parse(session.metadata.skus)
        : [];

      // Report sale to wholesale
      if (skus.length > 0) {
        const ok = await reportSale({
          channel: "cambridgetcg.com",
          order_ref: session.id,
          items: skus.map((s) => ({
            sku: s.sku,
            qty: s.qty,
            price_gbp: s.price_gbp,
          })),
        });

        console.log(
          `[webhook] Order ${session.id} — reportSale ${ok ? "succeeded" : "failed"}`,
          { skus }
        );
      }

      // Record order in customer_orders. Idempotent on stripe_session_id;
      // /order-confirmation also calls this as a defensive backup, and the
      // hourly reconciliation cron sweeps any that slipped past both. See
      // apps/storefront/src/lib/orders/record.ts.
      const recorded = await recordOrderFromStripeSession(session);
      const { userId, email, totalGbp: total } = recorded;
      console.log(`[webhook] Order ${session.id} ${recorded.created ? "recorded" : "already-existed"} for ${email}`);

      // Commit the stock reservation into a sale movement. Idempotent on
      // Stripe redelivery via @cambridge-tcg/stock's (cardId, referenceId)
      // UNIQUE — duplicate events become no-ops.
      // See docs/architecture/storefront-checkout-flow.md.
      try {
        const commit = await commitCartToSale(
          holderForStripeSession(session.id),
          skus.map((s) => ({ sku: s.sku, quantity: s.qty })),
          "cambridgetcg.com",
        );
        if (!commit.ok) {
          console.error(
            `[webhook] stock commit failed for ${session.id}: ${commit.message}`,
          );
        } else {
          console.log(
            `[webhook] stock committed for ${session.id}: ${commit.committed} movement(s)`,
          );
        }
      } catch (e) {
        console.error(`[webhook] stock commit threw for ${session.id}:`, e);
      }

      // Social: activity feed + achievement
      if (userId) {
        postActivity(userId, "card_added", "Purchased cards from the store").catch(() => {});
        awardAchievement(userId, "first_purchase").catch(() => {});
      }

      // Debit applied store credit. The amount is in metadata (set by
      // /api/checkout) so we don't have to round-trip. Atomic via a
      // single UPDATE that refuses to go negative; if balance changed
      // mid-flight (concurrent debits, manual adjustments), the user
      // sees a partial debit and a ledger entry reflects what was
      // actually subtracted.
      const creditAppliedGbp = session.metadata?.credit_applied_gbp
        ? parseFloat(session.metadata.credit_applied_gbp)
        : 0;
      const creditUserId = session.metadata?.credit_user_id || userId;
      if (creditUserId && creditAppliedGbp > 0) {
        try {
          const debitRes = await query(
            `UPDATE users
                SET store_credit_balance = GREATEST(0, store_credit_balance - $2),
                    updated_at = NOW()
              WHERE id = $1
              RETURNING store_credit_balance::numeric AS balance`,
            [creditUserId, creditAppliedGbp.toFixed(2)]
          );
          if (debitRes.rows[0]) {
            await query(
              `INSERT INTO store_credit_ledger (user_id, amount, balance, type, description, reference_id)
               VALUES ($1, $2, $3, 'redeemed_checkout', $4, $5)`,
              [creditUserId, (-creditAppliedGbp).toFixed(2), debitRes.rows[0].balance,
               `Applied at checkout`, session.id]
            );
            console.log(`[webhook] Credit redeemed: £${creditAppliedGbp.toFixed(2)} for ${creditUserId}`);
          }
        } catch (creditErr) {
          console.error("[webhook] Credit debit failed:", creditErr);
        }
      }

      // Process membership rewards (points + cashback). `total` is the cash
      // amount Stripe actually collected — i.e. cart subtotal minus credit
      // and minus tier discount. So rewards naturally apply to "cash spent",
      // matching the marketing promise.
      if (userId && total > 0) {
        try {
          const rewards = await processOrderRewards(userId, total, session.id);
          console.log(`[webhook] Rewards: ${rewards.pointsEarned} points, £${rewards.cashbackAmount} cashback for ${email}`);
        } catch (rewardErr) {
          console.error("[webhook] Rewards processing failed (order still recorded):", rewardErr);
        }
      }
    } catch (err) {
      console.error("[webhook] Error processing order:", err);
    }

    // Handle Platinum subscription
    if (session.metadata?.type === "platinum_subscription" && session.metadata?.user_id) {
      try {
        const subUserId = session.metadata.user_id;
        const tierId = session.metadata.tier_id;
        const plan = session.metadata.plan;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.toString() || session.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        // Set expiry based on plan
        const expiresAt = new Date();
        if (plan === "annual") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);

        // Try to capture payment method details for display. Subscription
        // mode → default_payment_method on the subscription object after
        // checkout completes. Best-effort; UI tolerates nulls.
        let pmBrand: string | null = null;
        let pmLast4: string | null = null;
        try {
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId, {
              expand: ["default_payment_method"],
            });
            const pm = sub.default_payment_method as Stripe.PaymentMethod | string | null;
            if (pm && typeof pm !== "string" && pm.card) {
              pmBrand = pm.card.brand;
              pmLast4 = pm.card.last4;
            }
          }
        } catch (pmErr) {
          console.warn("[webhook] payment method fetch failed:", pmErr);
        }

        await query(
          `UPDATE users
              SET paid_tier_id = $2, tier_id = $2,
                  subscription_status = 'active',
                  subscription_stripe_id = $3,
                  subscription_expires_at = $4,
                  subscription_cancel_at_period_end = false,
                  subscription_plan = $5,
                  stripe_customer_id = COALESCE(stripe_customer_id, $6),
                  subscription_payment_brand = $7,
                  subscription_payment_last4 = $8,
                  tier_source = 'subscription',
                  tier_calculated_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [subUserId, tierId, subId, expiresAt.toISOString(), plan, customerId, pmBrand, pmLast4]
        );
        console.log(`[webhook] Platinum activated for user ${subUserId} (${plan})`);
      } catch (err) {
        console.error("[webhook] Platinum subscription error:", err);
      }
    }

    // Handle P2P market trade payments. Move the trade past awaiting_payment
    // and notify both parties. Tier decides whether the seller ships to the
    // buyer (direct/verified) or to CTCG (full_escrow); the email tells them.
    if (session.metadata?.type === "market_trade_payment" && session.metadata?.trade_id) {
      try {
        const tradeId = session.metadata.trade_id;
        // 'awaiting_shipment' if seller ships to buyer, 'paid' if shipping to CTCG
        // (admin will then mark received_by_ctcg). We default to awaiting_shipment
        // since the seller's next action is "ship", regardless of destination.
        const upd = await query(
          `UPDATE market_trades
              SET escrow_status = 'awaiting_shipment',
                  buyer_paid_at = NOW(),
                  stripe_session_id = $2,
                  stripe_payment_intent = $3,
                  updated_at = NOW()
            WHERE id = $1 AND escrow_status = 'awaiting_payment'
            RETURNING *`,
          [
            tradeId,
            session.id,
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
          ]
        );

        if (upd.rows.length > 0) {
          const trade = upd.rows[0];
          // Look up emails + card name and fire paid notifications
          const info = await query(
            `SELECT bu.email AS buyer_email, su.email AS seller_email,
                    COALESCE(o.card_name, t.sku) AS card_name
               FROM market_trades t
               JOIN users bu ON bu.id = t.buyer_id
               JOIN users su ON su.id = t.seller_id
               LEFT JOIN market_orders o ON o.id = t.bid_order_id
              WHERE t.id = $1`,
            [tradeId]
          );
          if (info.rows.length > 0) {
            const { sendBuyerPaidEmail, sendSellerPaidEmail } = await import("@/lib/market/email");
            const { formatPrice } = await import("@/lib/format");
            const { notify } = await import("@/lib/notifications/db");
            const r = info.rows[0];
            const total = parseFloat(trade.price) * trade.quantity;
            const tier = trade.escrow_tier || "full_escrow";
            sendBuyerPaidEmail({
              email: r.buyer_email,
              cardName: r.card_name,
              price: formatPrice(total),
              tier,
            }).catch((e) => console.error("[webhook] Buyer paid email failed:", e));
            sendSellerPaidEmail({
              email: r.seller_email,
              cardName: r.card_name,
              price: formatPrice(total),
              tier,
              shipsTo: trade.seller_ships_to || "ctcg",
              payout: formatPrice(parseFloat(trade.seller_payout)),
            }).catch((e) => console.error("[webhook] Seller paid email failed:", e));

            // In-app parity for the two emails. Buyer's copy is a
            // receipt + "what happens next"; seller's is the shipping
            // prompt. Dedup keys scope to the trade so webhook replays
            // don't produce double notifications.
            await notify({
              userId: trade.buyer_id,
              kind: "market.paid_buyer",
              title: `Payment confirmed for ${r.card_name}`,
              body: `${formatPrice(total)} paid. ${tier === "full_escrow"
                ? "The seller will ship to Cambridge TCG for verification."
                : "The seller will ship directly to you."}`,
              linkUrl: "/account/trades",
              referenceType: "market_trade",
              referenceId: `${tradeId}:paid_buyer`,
            });
            await notify({
              userId: trade.seller_id,
              kind: "market.paid_seller",
              title: `Buyer paid for ${r.card_name} — time to ship`,
              body: `Payout ${formatPrice(parseFloat(trade.seller_payout))} will release once the trade completes.`,
              linkUrl: "/account/trades",
              referenceType: "market_trade",
              referenceId: `${tradeId}:paid_seller`,
            });
          }
        }
        console.log(`[webhook] Market trade ${tradeId} marked paid`);
      } catch (err) {
        console.error("[webhook] Error processing market trade payment:", err);
      }
    }

    // Handle lot purchases (market_lot_payment)
    if (session.metadata?.type === "market_lot_payment" && session.metadata?.lot_trade_id) {
      try {
        const { markLotTradePaid } = await import("@/lib/market/lots");
        const tradeId = session.metadata.lot_trade_id;
        const paymentIntent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id || null;
        await markLotTradePaid(tradeId, session.id, paymentIntent);
        console.log(`[webhook] Lot trade ${tradeId} marked paid`);
      } catch (err) {
        console.error("[webhook] Error processing lot payment:", err);
      }
    }

    // Handle auction payments. Stamps escrow_status='awaiting_shipment'
    // so the post-win timeline lights up the "Paid" step and advances
    // the next actor role to 'seller' (see getCurrentActor in the
    // fulfilment-timeline module).
    if (session.metadata?.type === "auction_payment" && session.metadata?.auction_id) {
      try {
        const auctionId = session.metadata.auction_id;
        // RETURNING to confirm the UPDATE matched (status='ended' guard
        // means a re-delivered webhook for an already-paid auction is a
        // no-op — the lifecycle log fires only when we actually flipped).
        const flipped = await query(
          `UPDATE auctions
              SET status = 'paid',
                  escrow_status = 'awaiting_shipment',
                  stripe_session_id = $2,
                  stripe_payment_intent = $3,
                  paid_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1 AND status = 'ended'
            RETURNING id, winner_user_id, current_price, title`,
          [
            auctionId,
            session.id,
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
          ]
        );
        console.log(`[webhook] Auction ${auctionId} marked as paid`);

        if (flipped.rows.length > 0) {
          const a = flipped.rows[0];
          // Lifecycle log + trust recompute for the now-paying winner.
          // Atomic gate is already in the WHERE status='ended' check —
          // re-delivery returns 0 rows so this only fires once.
          void import("@/lib/auction/lifecycle-log").then(({ logAuctionTransition }) =>
            logAuctionTransition({
              auctionId: a.id,
              action: "paid",
              actorId: a.winner_user_id,
              reason: `Winner paid £${parseFloat(a.current_price ?? "0").toFixed(2)} for "${a.title}"`,
            }),
          );
          if (a.winner_user_id) {
            void import("@/lib/escrow/trust-engine").then(({ calculateTrustScore }) =>
              calculateTrustScore(a.winner_user_id).catch(() => { /* ignore */ }),
            );
          }
        }
      } catch (err) {
        console.error("[webhook] Error processing auction payment:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
