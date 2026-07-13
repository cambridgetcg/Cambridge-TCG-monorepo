# Membership — connections

> **Seed.** Picked 2026-05-05 by `len("2026-05-05") mod len(modules) = 10 mod 26 = money/membership`. The algorithm chose well: membership is the most cross-cutting modulator in the platform, and currently has zero substrate in the admin dashboard. **The most-connected node is invisible.**

---

## What this module is, in one sentence

Membership tier (Bronze / Silver / Gold / Platinum / OG) is the platform's **economic story about a customer** — a single ordinal that says "this user is worth this much commercial deference." Every other commercial module modulates against it; the customer rarely sees the modulation; the connections are real but unspoken.

Schema: `tiers` (`apps/storefront/drizzle/0016_membership.sql:4`). Recompute: `recalculateTier()` at `apps/storefront/src/lib/membership/db.ts:44`. Tier flows from one of two sources:
- **Subscription** — they paid; tier is locked at the subscribed level.
- **Spending** — `users.annual_spend` accumulates; tier is the highest threshold that fits.

`tier_source` on `users` distinguishes which.

---

## What other modules secretly need it for

### → Commerce — commission rates per tier
**The thread.** Every P2P trade and every auction sale takes a commission. The commission rate isn't fixed — it's a column on `tiers` (`p2p_commission_rate`, `auction_commission_rate`). A Gold seller paying 5% on a £200 P2P sale pays £10; a Bronze seller paying 8% on the same trade pays £16. The £6 difference comes out of nowhere visible.

**The intention.** Reward repeat sellers who keep the marketplace liquid. Commission discount is a long-tail loyalty signal — they're paying us less because they've been paying us a lot.

**Code paths.**
- `apps/storefront/drizzle/0016_membership.sql:17–18` — the rate columns
- `apps/storefront/src/lib/escrow/` — commission applied at trade settlement
- `apps/storefront/src/lib/auction/` — auction-side application

**Surface today.** Hidden. The seller doesn't see "you paid 5% because Gold instead of 8% Bronze." T10 in `transparency-audit.md` ("fee structure isn't a single-page reference") names this gap.

### → Bounty — tradein bonus modulator (and a name collision)
**The thread.** Membership tier has a `tradein_bonus_percent`. A Gold member trading in £100 of cards as credit gets £110 (10% bonus); Bronze gets £100. This is a credit-conversion bridge between trade-ins and store credit, gated by tier.

**Name collision worth naming.** Bounty has its own *separate* "tier" concept: `bounty_pull_tiers` (`common` / `uncommon` / `rare` / `super_rare` / `legendary`) — these are pull-weight buckets for the gacha, **not membership levels**. Two systems share the noun "tier" for unrelated concepts. A user reading "what tier am I?" can mean either. The code never collides because the schemas are separate, but the semantic confusion is real and unaddressed.

**The intention.** Commercial-tier tradein bonus rewards lifecycle: a Gold customer who trades in a card is *also* a customer who'll buy something with the credit. Bonus is pre-paid loyalty.

**Code paths.**
- `apps/storefront/drizzle/0016_membership.sql:16` — `tradein_bonus_percent`
- `apps/storefront/src/lib/tradein/db.ts` — bonus applied at quote-to-credit conversion
- `apps/storefront/drizzle/0032_bounty.sql:` — `bounty_pull_tiers` (the namespace collision)

**Surface today.** Trade-in flow shows the bonus on the per-tier quote. The membership tier itself doesn't say "these are the bonuses you'd get if you traded in." The connection runs one direction in the UI; the user has to be on the trade-in path to see what membership gave them.

### → Money — points multiplier (the second currency)
**The thread.** Tier sets `points_multiplier`. Bronze gets 1× points-per-pound, Gold gets 2×, on every purchase. Points feed a ledger (`points_ledger`) that can be redeemed for store credit. The multiplier compounds: spend more → higher tier → earn more points per spend → more credit → more spend.

**The intention.** Build a virtuous loop where loyalty pays loyalty. The multiplier is the *flywheel* — it's why Gold is sticky.

**Code paths.**
- `apps/storefront/drizzle/0016_membership.sql:15` — `points_multiplier`
- `apps/storefront/src/lib/membership/db.ts` — points award on purchase
- `points_config` table — global `points_per_pound` setting

**Surface today.** Account membership page shows the multiplier. What's missing: a customer view of "you have earned X points this year, of which Y are tier-multiplied — without your tier you'd have Y/multiplier."

### → Trust — a parallel modulator they never coordinate
**The thread.** Membership tier and trust score both gate trade behavior. Trust gates trade *limits* (max £ per trade, daily caps, escrow inspection). Membership gates trade *economics* (commission rate, tradein bonus). They modulate the same set of trades but **never reference each other**.

This is a real coordination gap. A high-trust Bronze user trades like a high-volume seller but pays Bronze commission. A Gold user with a disputed trade pays Gold commission while their trust-tier downgraded their trade limits. The two modulators run independently.

**The intention.** Trust is *behavioral* (have you been good?). Membership is *commercial* (have you been valuable?). Decoupling them is intentional — a high-spending customer who's behaviorally suspect should not get trust waivers because they're rich. But the *visibility* of both modulators on a trade is a gap; the customer sees neither.

**Code paths.**
- `apps/storefront/src/lib/escrow/trust-engine.ts` — trust compute
- `apps/storefront/src/lib/membership/db.ts:44` — tier compute
- No file references both. They run in parallel.

**Surface today.** None. A trade detail page shows neither modulator's effect on the line items.

### → Bounty (literal) — the most surprising connection
**The thread.** Membership tier has nothing to do with bounty pull eligibility *as written* — `user_bounty_eligibility` is gated by phone-verification, not tier. **But.** Spending on bounty tokens flows into `annual_spend`, which feeds tier recompute. So:

> A user who spends £500 on bounty tokens → reaches Gold → unlocks 2× points multiplier → buys cards on the marketplace → those purchases earn extra points (because Gold) → points convert to store credit → store credit buys more bounty tokens → which feeds annual_spend → which keeps Gold...

The platform's gacha is also its loyalty engine. A user who gets unlucky on bounty pulls (the EV says they will) is still leveling up the *commercial* tier that compensates them on the marketplace side. **The flywheel converts gacha variance into commercial loyalty.**

**The intention.** This is either a deeply-considered economic flywheel or an accidental emergent behavior. The schema says it's accidental — no code path explicitly bridges these. But the *system* bridges them through `annual_spend`, and any change to one affects the other through the unspoken loop.

**Code paths.**
- `apps/storefront/drizzle/0016_membership.sql:77` — `users.annual_spend`
- `apps/storefront/src/lib/membership/db.ts` — recompute on every customer-orders insert (Stripe webhook → bounty token purchase counts)
- `apps/storefront/drizzle/0032_bounty.sql` — bounty_pull_tiers (the *other* tier)

**Surface today.** Invisible. No documentation. No UI. Probably no awareness.

### → Auctions — priority approval
**The thread.** Gold tier has `auction_priority_approval = true`. Their consigned auctions skip the manual-approval queue. This is operational deference: Gold customers' submissions are trusted enough to go live without a human gate.

**The intention.** Save operator time on customers we already trust commercially.

**Code paths.**
- `apps/storefront/drizzle/0016_membership.sql:19` — the column
- `apps/storefront/src/lib/auction/db.ts` — approval queue dispatch (the column is read here)

**Surface today.** Customer-side: invisible (their auction just goes live without a wait). Admin-side: their absence from the approval queue is the proof, but no banner says "Gold-fast-tracked."

---

## What's NOT yet connected (the visible gaps)

- **Membership ↔ admin dashboard.** `/money/membership` is a `<ComingSoon>` placeholder. The most-connected commercial node has no operator surface. Building it is kingdom-023's territory.
- **Membership ↔ user transparency.** The thresholds (annual spend → tier) aren't on a public methodology page. T2 in `transparency-audit.md`.
- **Membership ↔ subscription state.** `tier_source = 'subscription'` users are immune to recompute, but the subscription state lives in Stripe + `customer_subscriptions`. When subscription churns, recompute fires (sweep at `apps/storefront/src/lib/membership/subscription-sweep.ts`). The handoff is real but undocumented as a connection.

---

## Recursion target

I'll follow **bounty** next. It's the most surprising thread (the flywheel), and the noun-collision with bounty-pull-tiers is the kind of meaning-bridge the codebase has been silent about. Following bounty also reaches the draw-receipt system and the limits of its server-only entropy.

→ [`bounty.md`](./bounty.md)

---

*The substrate connects what the surfaces don't. Naming the connections is the first work of meaning. The flywheel is real whether or not the code admits it; the doc admits it now, and the next builder gets to choose whether to lean in or to dampen.*
