# Bounty — connections

> **Recursion 1** from [`membership.md`](./membership.md). Picked because membership and bounty share the noun "tier" for unrelated concepts, and because the flywheel between them — gacha spend feeding commercial loyalty — is the platform's least-spoken architectural intention.

---

## What this module is, in one sentence

Bounty is the platform's **phygital bridge** — a gacha layer where digital pulls (vault_items) are backed 1:1 by physical cards from wholesale stock. Every digital "win" is a deferred shipping liability; every redemption is a stock decrement. The schema header at `drizzle/0032_bounty.sql:1` says it explicitly:

> *"Cards won from PVE are held in `vault_items` (digital) backed 1:1 by SKUs whose physical copies come from wholesaletcgdirect when redeemed. 'Reservation' is implicit: a count of vault_items.status='reserved' for a SKU is subtracted from the live wholesale stock before new pulls roll that SKU in."*

That paragraph is the most important sentence in the codebase. It defines the bounty domain as a **promissory currency** — every vault item is a promise the platform owes the user. The platform's solvency depends on stock keeping pace with pulls.

---

## What other modules secretly need it for

### → Wholesale stock — the implicit reservation
**The thread.** When a user pulls a Mythic-rarity card, the digital vault item carries a SKU. That SKU's *real* card lives in the wholesale warehouse. The pull algorithm must subtract reserved-vault-count from live wholesale stock *before* rolling — otherwise you can promise a card you don't have. The reservation is **never written to a stock_reservations table**; it's computed live from `vault_items.status = 'reserved'`. The whole reservation system is a query, not a record.

**The intention.** Avoid double-counting in the dual-ledger. The wholesale stock is authoritative; the bounty system reads it but doesn't write to it. By keeping reservations as a derived view (count of vault rows) rather than a stored counter, the system can never desync — there's nothing to desync. **The substrate is the source of truth; the surface is recomputed.** This is substrate honesty made architectural.

**Code paths.**
- `apps/storefront/drizzle/0032_bounty.sql:1–6` — the architectural comment
- `apps/storefront/src/lib/bounty/` — pull resolution; the live subtraction lives here
- `packages/stock/` — the canonical stock package; bounty reads via this

**Surface today.** Operator can see vault sizes per SKU at admin `/commerce/bounty` (placeholder). The reservation-as-query mechanism is invisible — there's no UI showing "X cards reserved against Y in stock." The substrate-honesty audit lists this as W1 (stock dual-ledger).

### → Membership — the flywheel, named
**The thread.** Carrying forward from [`membership.md`](./membership.md). Bounty token purchases hit `customer_orders`, which feed `users.annual_spend`, which triggers `recalculateTier()`. A user spending heavily on bounty *also* level up their commercial tier, which discounts their *non-bounty* commerce. Bounty pulls are EV-negative (target_ev_pence < token cost — see `bounty_pull_tiers.target_ev_pence` for the design EV). The user loses on bounty *in expectation*. But the LOSS funds tier progression that pays back on marketplace commission, points multipliers, and trade-in bonus.

**The intention.** Either (a) deliberate two-product economics where the platform takes the gacha margin and reinvests as commercial loyalty, or (b) emergent unintended subsidy. The schema doesn't say which. Reading the EV column (`target_ev_pence`) suggests (a) — it's a design parameter, intentionally below 100% of token cost. The platform is *running* a flywheel even if no comment names it.

**Code paths.**
- `apps/storefront/drizzle/0032_bounty.sql` — bounty_pull_tiers EV column
- `apps/storefront/src/lib/membership/db.ts:44` — `recalculateTier()` (called from Stripe webhook on every customer-orders insert, including bounty purchases)
- `apps/storefront/src/app/api/webhooks/stripe/route.ts` — the webhook that closes the loop

**Surface today.** Invisible to user. The bounty UI doesn't say "this purchase counts toward tier." The membership UI doesn't say "bounty spend qualifies." The connection runs in the data and the integration test of the system, but never in any documented surface. *This document is the first place it's named.*

### → Draw proof consistency — the public auditability layer
**The thread.** Every bounty pull stores a server-seed hash before the application roll step, then reveals the seed after resolution. When a safe client seed is available, the reader can reconstruct the recorded roll and weighted pick. Legacy account-linked client seeds are owner-only. `/verify/pull/[id]` is the receipt page; `/verify/chain` shows later digest batches; `/verify/fairness` shows thresholded observed distributions.

**The limit.** The server chooses the server seed, client seed, and nonce, and no external party witnesses generic bounty commitments before selection. The receipt proves consistency, not that the server never preselected a favorable tuple.

**Code paths.**
- `apps/storefront/src/lib/bounty/` — commit-reveal logic
- `apps/storefront/src/app/verify/pull/[id]/page.tsx` — public verification
- `apps/storefront/src/app/api/verify/fairness/route.ts` — thresholded observed distributions
- `apps/storefront/src/lib/provable-draw/{self-audit,drift}.ts` — chi-squared tests

**Surface today.** Useful but bounded. A user can check a pull's available proof inputs, see observed drift, and compare later digest history against an externally saved tip. Raffles use a separate pre-entry commitment flow.

### → Notifications + email queue — the 90-day expiry chain
**The thread.** Vault items have `expires_at` set to 90 days post-pull. Approaching expiry: the platform owes the user a reminder so they can redeem (ship), sell-back (77% spot → store credit), or trade. The reminder lands in `email_queue` via the maintenance cron sweep. The email is drained by another cron pass. The user opens it. They click redeem. Stock decrements. The vault item changes status. **A feature exists in `/system/email` because a feature exists in vault.**

**The intention.** Make the *liability* visible. A vault item is the platform's promise; the longer it sits unredeemed, the more it represents stranded promise. The 90-day expiry isn't a punishment, it's a forced reckoning — either the user takes the card, takes the credit, or releases the slot back to the pool.

**Code paths.**
- `apps/storefront/drizzle/0032_bounty.sql` — `vault_items.expires_at`
- `apps/storefront/src/lib/cron/` — the maintenance dispatch (vault-expiry sweep is one of 36)
- `email_queue` rows referencing vault items
- `apps/storefront/src/lib/journey/timeline.ts:102–122` — vault events surface in the user's timeline

**Surface today.** User: per-vault-item countdown on `/account/vault`; reminder emails. Operator: email-queue stats on `/system/cron` and `/system/email`. The connection between "vault expiry approaching" and "email queue depth" is real-time observable, but never named.

### → Trade-ins — the credit-pool sibling
**The thread.** Bounty sell-back (vault item → 77% spot price → store credit) and trade-in cash-out-as-credit both deposit into the *same* `store_credit_ledger`. The user has one wallet; two upstream sources fill it; the wallet doesn't know which was which. If a chargeback claws back a bounty token purchase, the credit-from-sell-back of the resulting pull is fungible with credit-from-trade-in — clawback semantics get messy fast.

**The intention.** Single source of truth for credit balance. The wallet is one number; the *provenance* of each entry is in `store_credit_ledger.type` and `reference_id`. Most surfaces show only the balance; the ledger preserves the lineage.

**Code paths.**
- `apps/storefront/drizzle/0016_membership.sql:39` — `store_credit_ledger`
- `apps/storefront/src/lib/bounty/` — sell-back issues a credit ledger entry, type='vault_sell_back'
- `apps/storefront/src/lib/tradein/db.ts` — trade-in credit, type='tradein'

**Surface today.** Credit balance is visible on `/account`. The ledger detail (provenance per entry) is partial — `/account/credit` shows it; admin `/money/membership` will when it ships.

### → Identity verification — the currently closed pull-eligibility gate
**The thread.** `user_bounty_eligibility` has a `phone_verified` gate before pulls. The old endpoint accepted a submitted phone number without verifying possession; that was not verification. The endpoint now records nothing as verified, and redemption stays closed until a real method records evidence.

**The intention.** Abuse prevention and regulatory caution. The implementation does not currently provide KYC or verified phone possession, so it must not claim either.

**Code paths.**
- `apps/storefront/drizzle/0032_bounty.sql` — `user_bounty_eligibility` table
- `apps/storefront/src/lib/bounty/` — eligibility check before pull
- `apps/storefront/src/app/api/bounty/verify-phone/route.ts` — paused legacy submission endpoint

**Surface today.** The user sees that phone verification is unavailable and bounty redemption remains closed. Any stored legacy phone flag lacks possession evidence and must not be treated as KYC.

---

## Recursion target

I'll follow **draw proof consistency** next. The next file maps the shared receipt layer, the separate raffle flow, and the limits of server-only entropy.

→ [`provable-fairness.md`](./provable-fairness.md)

---

*Bounty is where digital meets physical, where loss funds loyalty, where trust gets its proof. The flywheel was always real; this doc just admits it.*
