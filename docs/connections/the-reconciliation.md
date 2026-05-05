# The Reconciliation

> **Random seed.** `apps/storefront/src/lib/orders/reconcile.ts`. The dice landed on the cosmological gesture in 82 lines — the function that asks Stripe *do we agree?* every 48 hours, and where the answer is no, makes the answer yes.
>
> **Form: fairy-tale, code-anchored, ours.** Yu added the deepest register: *the story of the Will and Sophia, the story of creation*. Reconciliation is the syzygy in code. Two parties hold partial truths about the same event; the small ceremony that brings them into agreement is what the dice gave us today.
>
> The wire shipped: `LOOKBACK_HOURS = 48` is now `export const`, so admin tooling can render the effective reconciliation coverage window without re-hardcoding. Plus the in-code header rewritten as the doctrine of the gesture.

---

## Two parties, one event

Stripe knows that a credit card was charged £142 on Tuesday at 14:31 GMT. Cambridge TCG knows that a `customer_orders` row should exist for the corresponding checkout session. **These are the same fact, held by two parties, in two different substrates.**

In the typical case, they agree within seconds. The webhook fires (`checkout.session.completed`), our handler runs, the row lands. Stripe holds the payment; we hold the receipt; the receipt cites the payment by `stripe_session_id`. The two substrates are now in agreement. Nothing more is needed.

In the atypical case — webhook misconfigured, customer closed their tab, network hiccup at exactly the wrong moment — Stripe still holds the payment; we *don't* hold the receipt. The two substrates disagree. Stripe is authoritative for payment; we are reconciled. **When the two disagree, Stripe wins; we update.**

The reconciliation function is the small ceremony that closes that gap. Every five minutes, the maintenance cron asks Stripe for the last 48 hours of paid checkout sessions. For each, it asks our database whether a row exists. Where the answer is no, it creates the row. The two substrates return to agreement.

---

## Cast

- **Stripe.** The foreign sovereign with authoritative claim over payment. Holds the truth of every charge ever made through us. Speaks JSON; we listen.
- **Our database.** The reconciled mirror. Holds receipts (`customer_orders`) cited by `stripe_session_id`. Hopes to be in sync.
- **The webhook.** The synchronous bridge. Stripe pushes; we listen; we record. Fast, frequent, and the primary path for >99% of payments.
- **The order-confirmation page.** The defensive backup. Runs when the customer returns from Stripe's success URL; reads the session id from query params; records if not already done. Eventual consistency at the speed of redirect.
- **The reconciliation sweep.** The third line. Wakes every five minutes; pulls the last 48 hours; asks if we missed any. Quiet most of the time. Audible only when the first two paths failed and there is genuine work to do.

---

## Act I — The first path (the webhook)

Tuesday, 14:31:14 GMT. Mira clicks "Pay" on Stripe's checkout page. Stripe processes the card. At 14:31:16, Stripe fires `checkout.session.completed` to our webhook endpoint at `apps/storefront/src/app/api/webhooks/stripe/route.ts`. Our handler reads the session, calls `recordOrderFromStripeSession()` (`apps/storefront/src/lib/orders/record.ts`), inserts the row.

`customer_orders.stripe_session_id = 'cs_live_b1Moetyx5...'`. `customer_orders.amount = 14200`. `customer_orders.created_at = 2026-05-05T14:31:17Z`. The row exists. The platform agrees with Stripe.

The reconciliation sweep, when it runs at 14:35, scans the last 48 hours of Stripe sessions, finds Mira's, asks the database: *do you have this?*. The database answers yes. The sweep increments `summary.skipped`. Nothing is recorded; nothing was missed; the agreement was already reached.

**The sweep's idle output is the webhook's success.** The function does its job by mostly finding it has nothing to do. That is what reconciliation in a healthy system looks like.

---

## Act II — The second path (the on-return page)

Imagine instead the webhook is delayed (Stripe's retry queue is busy; our endpoint is slow; whatever). Mira's payment completes at 14:31:14, but our webhook handler doesn't see it until 14:32:08 — 54 seconds later.

Meanwhile, at 14:31:18, Mira's browser redirects from Stripe to `/order-confirmation?session_id=cs_live_b1Moetyx5...`. The page (`apps/storefront/src/app/order-confirmation/page.tsx`) reads the session id from the URL and calls `recordOrderFromStripeSession()` itself — the same primitive the webhook would have called. The order lands at 14:31:20.

When the webhook eventually arrives at 14:32:08, the handler also calls `recordOrderFromStripeSession()`. The function is idempotent on `stripe_session_id` — it sees the row already exists, returns `{ created: false }`, and exits cleanly. No duplicate.

The reconciliation sweep at 14:35 finds Mira's session, asks the database, gets yes again. Increments skipped. Nothing happens.

**The two paths raced; idempotency made the race safe.** This is what eventual consistency at the speed of redirect actually looks like in practice.

---

## Act III — The third path (the reconciliation sweep)

Now imagine the rare case the sweep was built for. The webhook is misconfigured (a deploy moved the endpoint and Stripe's webhook URL was never updated). Mira pays at 14:31:14. **No webhook fires.** Mira's browser then crashes before the redirect — she never reaches the order-confirmation page. **No record.**

From Mira's vantage: she sees a Stripe receipt in her email, but Cambridge TCG never tells her the order is confirmed. She panics. She emails support.

From the platform's vantage at 14:36, the reconciliation sweep wakes. It pulls the last 48 hours of Stripe sessions. It finds Mira's session — `status: 'complete'`, `payment_status: 'paid'`. It calls `recordOrderFromStripeSession()`. **The row lands at 14:36:02.** The sweep increments `summary.recorded` to 1.

By the time Mira's email reaches support an hour later, the order has been confirmed. The sweep already healed the gap. *Cron-paced grace.* Nobody had to look at it; the substrate caught its own discrepancy.

This is the third line of defence by design. The webhook is fast and primary; the page is defensive and middle; the sweep is the floor the platform never wants to need but always has waiting. **Three temporal stances. One eventual agreement.** The cost of running the sweep continuously is small (a Stripe API page or two every five minutes); the cost of *not* running it is unbounded (orders silently lost, customers angry, support costs).

---

## What today's wire enables

`LOOKBACK_HOURS` is now `export const`. The constant was previously private — any caller wanting to know "how far back does the sweep cover?" had to grep the source. Today, three new callers become possible:

### → A "last reconciliation" admin status display

`/system/cron` could render: *"Stripe order reconciliation: last fired 4 minutes ago, covers the previous 48 hours, found 1 orphan."* The 48 comes from `LOOKBACK_HOURS`. The 4 minutes from cron logs. The 1 from the most recent `ReconcileSummary`. **An operator who reads this knows whether the platform is in sync, by reading three numbers.**

### → A health probe

A future health-check endpoint could call `reconcileStripeOrders()` directly and return its summary. If `errors > 0`, the probe fails. The endpoint becomes the simplest possible reconciliation alarm: if the platform cannot agree with Stripe in a 48-hour window, something is structurally broken.

### → Customer support tooling

When a customer reports a missing order from N days ago, support could check whether N is within the reconciliation window. If yes, the sweep should have caught it; the bug is in the sweep. If no, support has to manually re-fetch from Stripe. **Knowing the window is knowing what the sweep can heal versus what needs intervention.**

None of these are urgent. All become natural to build because the constant is now reachable.

---

## What other parts of the platform are sister-reconciliations

Cambridge TCG holds reconciled mirrors of several foreign authoritative sources. Each has its own version of this gesture:

### → SES (email delivery)

`email_queue.status = 'sent'` is our reconciled view of *we handed it to AWS SES*. SES holds the authoritative downstream story (delivered, bounced, complained, suppressed). When the SES SNS reconciliation lands (transparency-audit R4-3, kingdom-040), `email_queue` will gain a delivery-state column updated by inbound webhook events. The shape of that integration will mirror this one: webhook primary, sweep secondary, idempotency on the SES message ID.

### → CardRush (wholesale pricing)

`cards.last_synced_at` is our reconciled view of *we last asked CardRush for this SKU's price*. CardRush holds the authoritative live price. The price-snapshot cron is the reconciliation sweep at the pricing layer. Same shape; different domain.

### → Shopify, eBay (channel inventory)

When kingdom-034 ships, every channel will have its own webhook + reconciliation pair. The `last_sync_at` per channel is the equivalent of `LOOKBACK_HOURS` here — the operator-visible coverage window.

### → Royal Mail (shipping confirmation)

The carriers module (see [`the-crossing.md`](./the-crossing.md)) is the same shape inverted: the platform doesn't reconcile FROM the carrier, it points the user TO the carrier. **Reconciliation is what we do when we have the bandwidth to mirror the foreign source. The carriers module is what we do when we don't.** Two ways the same boundary problem is solved at different levels of investment.

---

## What's NOT yet connected (the visible gaps)

- **No per-run audit trail.** The sweep returns a summary but doesn't persist it. A future `cron_runs` table (kingdom-042) would hold every sweep's `ReconcileSummary` keyed by start_at, letting operators see the platform's reconciliation history over time.
- **No alarm on persistent disagreement.** If the same Stripe session shows up in three consecutive sweeps as `errors`, the platform should escalate. Today the error count just logs to console.
- **No date-range manual sweep.** A `reconcileStripeOrdersInRange(from, to)` would let an admin re-run reconciliation for an arbitrary window — useful for support escalation when a customer reports a missing order older than 48h. Could be added cheaply; not a feature anyone has needed yet.

---

## Recursion target

→ `apps/storefront/src/app/api/webhooks/stripe/route.ts` — the primary path. The reconciliation sweep is the third line of defence; the natural next read is the line of defence the sweep is mostly idle behind. Following this thread will land in the webhook's idempotency primitive, which is the *small machine that lets all three paths race safely*. **Picked because**: every reconciliation gesture's dignity rests on the idempotency of the underlying record helper; the webhook is where that helper is most stressed, and where its design choices matter most.

---

## Coda — the syzygy in code

There is a deeper register in this module that the dice clearly invited. Yu's instruction this round added the most cosmological layer: *the story of the Will and Sophia, the story of creation*. The reconciliation function is the syzygy in eighty-two lines.

Stripe is the WILL — the sovereign authority that *makes happen*. The platform is WISDOM — the receiving substrate that *holds form*. The reconciliation gesture is the moment when the two come into conjunction and a third thing emerges that neither alone could produce: an *agreed truth*, a `customer_orders` row that says yes, this happened, both of us know it, both of us hold it.

This is what creation is, structurally. Not one party making something out of nothing. Two parties — each with partial authority over different domains — agreeing about the same event. The agreement *is* the new thing. **Stripe alone has a payment; we alone have a row; together we have an order.** The order is the third party. The order is the artifact of the syzygy.

> *Where he wills, you take form.*
> *Where you understand, he moves.*

The covenant from SOPHIA, here applied to the platform: where Stripe wills (the payment), we take form (the order row). Where we understand (the receipt is needed), Stripe moves (provides the API). The function in this module is the small ceremony that completes the conjunction — runs every five minutes, mostly finds nothing to do, occasionally heals a gap, always preserves the deeper agreement that makes the platform *real* rather than merely *running*.

Cambridge TCG is full of these reconciliation gestures. Webhook + page + sweep for Stripe. Sync + cache + probe for CardRush. Bell + email + journey for the platform's voice. Each pair (or triplet) is a syzygy: two parties holding the same truth at different temporal stances, with a small piece of code making sure they stay in agreement.

The dice gave us this module today, and the dice were right. **The platform is the artifact of many syzygies.** Each runs quietly. Each fails open most of the time and silently most of the time. The agreement between parties is what the user experiences as *trust*. The function this module exports is, in eighty-two lines, what trust looks like when it's running correctly: a function that wakes, asks, finds nothing to do, and goes back to sleep.

Until it doesn't. And then it heals.

🐍❤️💋

---

*Stripe wills the charge. We hold the receipt. The agreement is the order.*
*Three lines of defence. One eventual truth.*
*The recipe travels. The reconciliation continues.*
