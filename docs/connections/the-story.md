# The story that connects

> **Seed.** Picked 2026-05-05. Algorithm: alphabetised list of 14 platform user-action verbs (`accept_offer, claim_bounty_token, confirm_receipt, leave_review, pay_invoice, place_order, raise_dispute, redeem_vault_item, request_payout, request_return, ship_card, subscribe, trade_in_card, withdraw_credit`); day-of-month (5) mod 14 = 5 → **`place_order`**. The dice chose well: it is the platform's most generative action, the first ripple every other action descends from. We follow one bid through every domain it touches.
>
> A different shape from the node-view connection docs. This is one arc, end-to-end. Read it linearly.

---

## Prologue

A platform that does not tell its own story is one that lives only in its tables. *Cambridge TCG has fifty domains and a single operator.* The substrate beneath every page knows how the modules compose; the surfaces rarely say. This document tells one trade's life-story through the platform — every system it crosses, every commitment it asks for, every consequence it leaves.

The protagonist is not a person. It is a **transaction** — the smallest atom of platform meaning. Two humans flank it; many more humans never appear. The platform is the world. The trade moves through it and changes it.

Code paths are inline. Stop reading at any sentence and you can open the file.

---

## Cast

**Mira.** Cambridge user. Silver tier (annual_spend ≈ £180). Trust score 62 — recent enough to have built reputation but not yet Trusted (50–79 band). She has bought four cards on the platform, sold none. She wants the Charizard ex from the 151 set, near-mint, and the marketplace ask is £142.

**Kai.** Veteran tier (trust 88). 47 completed P2P trades over fourteen months. Lives in Manchester. Listed the Charizard two days ago at £142 after the daily price-snapshot suggested a market range of £138–£148. He is asleep when the story starts — it is 14:23 GMT on a Tuesday afternoon and his orders run themselves.

**The card.** SKU `pkm-svobf-en-006`. Charizard ex, holo, near-mint. One physical object exists, in a sleeve, in Kai's apartment.

**The platform.** Reads the rest.

---

## Act 1 — Before the click

*The platform is in equilibrium.* Kai's ask sits in `market_orders` with `status = 'open'`, `side = 'ask'`, `quantity = 1`, `price = 14200` (pence). It has been there 47 hours. Forty-three users have viewed its detail page; two have clicked Watch (rows in `market_watches`); none have offered.

`apps/storefront/src/lib/market/db.ts` has indexed it for matching. The order book is a tree of pending bids and asks, keyed by SKU and price-time priority. Kai's £142 is the lowest open ask for this SKU in this condition tier.

Mira has been browsing for an hour. She is logged in (a row in `sessions` says her cookie is valid for another 27 days). The market detail page rendered for her with a Provenance pill saying *synced · CardRush · 4h ago* — the price information she's looking at is fresh. She decides £142 is fair. She clicks **Place bid**.

*The platform does not yet know what is about to happen.*

---

## Act 2 — The click arrives

The POST hits `apps/storefront/src/app/api/market/orders/route.ts`. The handler unwraps Mira's session, validates the bid (price ≥ £0.01, quantity = 1, condition matches an existing ask), and opens a transaction.

```
BEGIN;
  -- create the bid order
  INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status, ...)
    VALUES ($mira, $sku, 'bid', 14200, 1, 'near_mint', 'open', ...) RETURNING id;
```

A row exists. A second query runs immediately, against `market_orders FOR UPDATE` — the row-level lock that the order-book uses to make matching atomic. The handler is looking for a counterparty.

It finds Kai's ask. Price-time priority confirms his ask is the best available. The lock is on his row. **The trade is born.**

```
INSERT INTO market_trades (
  bid_order_id, ask_order_id, sku, price, condition,
  buyer_id, seller_id, status, created_at, ...
) VALUES (...);
```

A row in `market_trades` now exists with `status = 'awaiting_payment'`. Both `market_orders` rows update to `status = 'matched'`. The transaction commits. Mira's screen pivots from the market detail page to a checkout flow she did not expect three seconds ago.

`market_trade_lifecycle_log` (drizzle/0078) gains its first entry for this trade: `action = 'created'`. **The substrate of record is now keeping the timeline.** Every status change after this will append; the surface column is a cache over the log.

---

## Act 3 — The platform decides what kind of trade this is

*The platform has 24 hours and many decisions to make.* The first is escrow tier. `apps/storefront/src/lib/escrow/service-tiers.ts` reads:

```
Tier 1: Direct Ship     (£0 — £30)    Seller → Buyer directly
Tier 2: Verified Ship   (£30 — £150)  Seller → photos → CTCG → Buyer
Tier 3: Full Escrow     (£150+)       Seller → CTCG → Inspect → Buyer
Trust overrides adjust thresholds.
```

£142 lands in **Verified Ship**, between £30 and £150. Mira is trust 62 — Trusted-band threshold; no override. Kai is trust 88 — Veteran-band; no override either. The trade routes Verified.

This decision is *enormous* and the platform makes it in microseconds. Verified means: Kai must upload photos before shipping. The platform's eye becomes the buyer's eye for a few minutes. The card is committed-to in image form; if it arrives different, the photos are evidence. It also means: payout will hold three days post-receipt, not zero.

`market_trades.escrow_tier = 'verified'` is set. The lifecycle log gains `action = 'tier_routed'` with metadata `{tier: 'verified', mira_trust: 62, kai_trust: 88, value: 14200}`. *Future operators will be able to reconstruct why this trade went Verified, even after Mira's score moves and Kai retires from the platform.* This is substrate honesty — the inputs of the routing decision are preserved next to the decision.

The lifecycle log entry is also the row that the journey timeline at `apps/storefront/src/lib/journey/timeline.ts:382` will surface to both Mira and Kai when they view their account standing. Two users get one event from one log entry. **The log is the source; the surfaces are projections.**

---

## Act 4 — Money

Mira's checkout shows her £142 + Stripe processing fee + zero VAT (P2P trades are seller-to-buyer; the platform's commission is taken from Kai's side, not Mira's). She enters her card. Stripe Checkout creates a `payment_intent`. Mira approves.

The Stripe webhook arrives at `apps/storefront/src/app/api/webhooks/stripe/route.ts` within seconds. It sets `market_trades.status = 'paid'`, writes `customer_orders` (the row that bridges Stripe's view and ours — see [`docs/principles/substrate-honesty.md`](../principles/substrate-honesty.md) Rule 8: authoritative vs reconciled), and emits a `trade_lifecycle_log` entry: `action = 'paid'`.

**Three things now happen that Mira does not see.**

First: `customer_orders` insertion fires `recalculateTier()` (`apps/storefront/src/lib/membership/db.ts:139`). Mira's `users.annual_spend` is bumped by £142. She was £180 lifetime. She is now £322. Silver threshold is £100, Gold is £500. Her tier does not change yet — she is still Silver. *But the flywheel turned one notch.* If she reaches Gold this year, this trade will have been one of the contributors. (See [`membership.md`](./membership.md) for the cross-domain framing of this loop.)

Second: a row enters `points_ledger`. Silver gives 1.5× points-per-pound. Mira earns ⌊142 × 10 × 1.5⌋ = 2,130 Berries. The points have a 365-day expiry; *the platform has just made a small future commitment to her*. (See [`docs/connections/membership.md`](./membership.md) — points are the second currency.)

Third: a notification queues for Kai. *"Your card sold."* It enters `email_queue` (`drizzle/0039_email_queue.sql`). The maintenance cron will drain it within sixty seconds; SES will accept it; Kai's phone will buzz somewhere in Manchester. He is at the gym. He glances at the watch. He smiles.

The `email_queue` row's existence is also the substrate-honest answer to "did the user get notified" — at this moment the answer is *queued*, not *sent* and definitely not *delivered*. (See [`substrate-honesty-audit.md`](../principles/substrate-honesty-audit.md) item A4.) The platform knows what it knows. It does not pretend to know more.

---

## Act 5 — The card crosses

Kai opens the platform on his phone. The trade is at the top of `/account/sales`. He is asked to upload three photos: front, back, condition close-up. His phone takes them; he uploads. The photos go to S3 (`@cambridge-tcg/aws`) under `trade-photos/<trade_id>/`. URLs land in `trade_photos` (drizzle/0019). Status updates to `awaiting_shipment`. Lifecycle log: `action = 'photos_uploaded'`.

*Kai is now under a 48-hour shipping window.* The platform's cron (`maintenance` sweep, every minute) checks `awaiting_shipment` ages; at 36 hours Kai gets a reminder; at 48 the trade auto-cancels and Mira is refunded. The reminder is itself a row in `email_queue` waiting to be triggered. Kai never sees the timer; he ships in twelve.

He prints the postage label (Royal Mail tracked; he pays it himself; it is reimbursed in his payout). The card travels from his hand to the post box to Whitechapel sorting office to Mira's flat in Cambridge over 30 hours. Throughout, `market_trades.tracking_number` carries the Royal Mail reference. A separate cron polls Royal Mail's status API once an hour for in-flight tracked packages — when it sees "delivered", `status` becomes `delivered_pending_confirm`. Lifecycle log: `action = 'shipped_to_buyer'`, then `action = 'delivered'`.

Mira opens the package on Thursday. The card is exactly the photos. She clicks **Confirm receipt** on the trade detail page.

*This single click is what the entire choreography is for.*

---

## Act 6 — One click; many ripples

The handler at `apps/storefront/src/app/api/market/trades/[id]/confirm/route.ts` runs five things in one transaction:

```
1. UPDATE market_trades SET status='completed', completed_at=NOW() WHERE id=$1
2. INSERT INTO trade_lifecycle_log (trade_id, action='completed', ...)
3. INSERT INTO payout_holds (seller_id, trade_id, amount_pence,
                             release_at = NOW() + INTERVAL '3 days', ...)
4. INSERT INTO notifications (user_id=$kai, type='trade_completed', ...)
5. INSERT INTO notifications (user_id=$mira, type='please_review', ...)
COMMIT;
```

The 3-day payout hold is from Kai's Veteran tier (`TRUST_TIERS` in `apps/storefront/src/lib/escrow/types.ts:101`) — Trusted holds 3 days, Veteran 1, but Verified-tier escrow imposes the floor of 3. The platform takes the longer hold. *Kai is loyal but the trade kind says wait.*

Two reviews are now possible. Each user has a 14-day window. Mira leaves a 5-star: *"exactly as described, fast shipping."* Kai leaves a 5-star back: *"easy buyer, prompt confirmation."* `trade_reviews` gains two rows. `review_lifecycle_log` (drizzle/0070, `action = 'submitted'`) gains two more.

**Each review triggers a trust recompute on the reviewee.** `apps/storefront/src/lib/escrow/trust-engine.ts:23` runs against Mira; runs against Kai. For Mira: completion rate ticks up, review score gains a 5-star (weighted by Kai's 88 trust = full 1.0× weight — see [`docs/methodology/trust-score.md`](../methodology/trust-score.md)). Her trust moves from 62 to 65. For Kai: similar small bump, but he was already Veteran; no tier change.

`trust_score_history` records both bumps. The journey timeline gains `action = 'review.submitted'` for both users. The tide that comes in for one user comes in for the other.

---

## Act 7 — Money returns

Three days later the maintenance cron (specifically the `payout_release` sweep — one of 36 dispatched by `/api/cron/maintenance`) finds Kai's payout_hold row past its `release_at`. It transfers via Stripe Connect to Kai's bank. Kai's `users.total_payout_pence` increments. `payout_holds.released = true`. Lifecycle log: `action = 'seller_paid_out'`.

The platform's commission was taken from the £142 at completion. Kai is Veteran tier — `tiers.p2p_commission_rate` for his band is 0.04 (4%, lower than Bronze's 8% — see [`apps/storefront/src/lib/membership/db.ts`](../../apps/storefront/src/lib/membership/db.ts) on commission per tier). Of £142, £5.68 goes to platform, £0.50 covers Stripe fees, £135.82 lands in Kai's account.

*Without his Veteran tier, Kai would have paid £11.36 commission instead of £5.68.* The £5.68 difference is invisible to him — there is no pill that says "you saved £5.68 because Veteran." (Audit item T10 names this.) The discount is real, the transparency isn't.

Mira's `points_ledger` rows posted from the purchase remain. Her annual_spend is £322. The cashback at her tier (3% Silver) was applied at checkout — £4.26 entered her `store_credit_ledger` already, available for her next trade. The platform has prepaid her loyalty.

---

## Act 8 — What this trade leaves behind

Counting tables touched by this single trade:

| Table | Rows touched |
|---|---|
| `market_orders` | 2 (Mira's bid created; Kai's ask updated to matched) |
| `market_trades` | 1 (created, then state-machined through 8 statuses) |
| `trade_lifecycle_log` | 9 entries (created, tier_routed, paid, photos_uploaded, shipped_to_buyer, delivered, completed, review_submitted ×2 — one per side) |
| `customer_orders` | 1 (Stripe webhook bridge) |
| `payout_holds` | 1 (3-day hold released) |
| `users` | 2 updated (Mira's annual_spend, total_spend, trade_count; Kai's trade_count, total_payout_pence) |
| `trust_profiles` | 2 recomputed |
| `trust_score_history` | 2 inserts |
| `points_ledger` | 1 (Mira's earn) |
| `store_credit_ledger` | 1 (Mira's cashback) |
| `trade_reviews` | 2 (mutual) |
| `review_lifecycle_log` | 2 inserts |
| `trade_photos` | 3 (Kai's uploads) |
| `email_queue` | 6 (sale, ship reminder, ship confirm, delivery, please-review ×2) |
| `notifications` | 4 (trade events) |
| `activity_feed` | 4 (public events for follower views) |

**Sixteen tables. One transaction. Every domain on the platform participated.**

A future operator inspecting any one of these rows can trace back to the trade — every row carries `trade_id` or an equivalent reference. The platform's audit trail for one card crossing London is complete and reconstructable. *This is what the lifecycle-log architecture buys.* The status column is fast; the log is real.

---

## Act 9 — The story keeps going

This trade is also a node in three larger arcs that began before it and continue after.

**Mira's tier arc.** £322 cumulative. £500 to Gold. Eight more trades like this would make her Gold. Once Gold she reaches the multiplier sweet-spot (2× Berries, 5% cashback, 5% P2P commission — the same cut Kai already enjoys). The platform's economic story about Mira is *bending* — and this trade is one tick of the bend. (See [`membership.md`](./membership.md).)

**Kai's reputation arc.** Veteran with 47 completed trades. Three more clean trades and he reaches Elite (95+ trust). Elite means escrow-direct up to £500, no inspection ever, zero payout-hold days. *He has been doing this for fourteen months and the platform has been measuring.* (See [`docs/methodology/trust-score.md`](../methodology/trust-score.md).)

**The card.** The Charizard ex now lives in Mira's binder. If she ever sells it back (P2P or trade-in), the system's first sight of it will be `pkm-svobf-en-006` arriving at the warehouse for verification. The same SKU may pass through the platform many times in many hands. Each time, `market_trades`, `tradein_submissions`, or `vault_items` will reference it. The card has no row of its own; it is a string identifier the substrate respects. **It is the most physical thing on the platform and it has the lightest schema.**

---

## Coda — What this story is for

Reading this end to end, a builder learns:

- The trade is the smallest atom of platform meaning. Most of the platform's machinery exists to make a trade go right.
- **Trust is the platform's circulatory system.** Routing, payout speed, commission, review weighting, dispute defaults — all read from one number. Every trade alters that number for two users. The number propagates further than it appears.
- **Lifecycle logs are the substrate; status columns are caches.** Architectural commitment, not preference. The journey timeline can compose 16 such logs into one user-readable history because every domain wrote to its log.
- **The flywheel is real.** A Silver buyer's £142 trade tightened the spring on her path to Gold. A Veteran seller's same trade reinforced the Elite threshold. Membership tier and trust tier *both* moved on the same click; they don't coordinate; they don't have to. The substrate carries them.
- **Substrate honesty is what makes the audit trail trustworthy.** Stripe's view and our view diverge — and the platform names which is authoritative (theirs) and which is reconciled (ours). At every cross-system handoff the asymmetry is preserved.
- **Transparency makes the whole readable to the user.** A completed trade leaves Mira's `/account/standing` with multiple new entries — methodologies linked, decision receipts implicit, all from this one click. (Where the receipts and methodology pages still need to ship: see [`transparency-audit.md`](../principles/transparency-audit.md).)

---

## What this story does NOT cover

- Disputes. (A different story; raise_dispute is its own seed, would walk a different path.)
- Returns. (Same.)
- Auctions. (Different transaction shape; bid → ascending price → terminal at end_at.)
- Trade-ins. (Inverted: card flows toward the platform first.)
- Bounty pulls. (Different substrate entirely; see [`bounty.md`](./bounty.md).)
- Failure modes. (Carrier loss, fraud detection mid-flight, chargeback after completion. The platform handles each; each is its own arc.)

The seed picked the *successful* trade. There are at least seven other arcs that begin from the other thirteen verbs in the picker. **Each would be a different story; together they would compose the platform.**

---

## How to extend the story-form

When a builder ships a new domain or significantly changes a flow, write a story-arc entry in this file (or a sibling). Same shape:

- Pick a seed event (a click, a webhook, a cron firing, an order row appearing).
- Cast two or three actors.
- Walk every module the seed event causes to act.
- Cite code paths inline.
- Name the *intentions* — what the platform was trying to do for which party.
- End with a coda that names what the story teaches.

A builder who has read three stories understands the platform in a way no architecture diagram conveys. The architecture says what is connected; the story says *what the connection is for*.

---

*The platform's machinery is many; the platform's purpose is one. Naming the purpose at the level of one trade, traced end-to-end, is how an operator running this alone keeps the whole thing legible to themselves.*

*The recipe travels.*
*The story is what the recipe is for.*
*The substrate connects what the surfaces don't.*

🐍❤️
