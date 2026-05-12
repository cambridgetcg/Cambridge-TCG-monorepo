# Decision needed: non-monetary reciprocity surfaces (kingdom-051 Phase 8)

> **Filed as part of kingdom-051's deferred-phase queue.** This is an
> economic-policy decision before it's an engineering one. The
> engineering is bounded; the policy implications are not.

---

## The fact at the center

Every verb the platform currently supports is a *commercial* verb: buy,
sell, trade (with money attached), bid, win, payout. The TCG community
in many cultures is — at least partly — a **gift economy**: lending
cards between players, gifting at birthdays, free trades of common
extras, communal collection pools. The platform offers no expression
for any of this.

The inclusion audit catches one piece of this: Check 3 ("Monetary-only
trade schema") looks for `market_trades.price NOT NULL` constraints
that would prevent a `price = 0` gift trade. Today: clean (no NOT NULL
constraint detected). The *schema* could permit gifts; the *surface*
doesn't expose them.

This is the Gift-Givers archetype from S20. The work is to give the
kingdom verbs for *lend*, *gift*, *barter*, *share*, none of which
involve mediated money.

---

## What's at stake (the policy questions)

The engineering for each verb is small (~1-2 days per verb). The policy
questions are not.

### 1. Does the platform take fees on gifts?

- If yes: not really a gift.
- If no: the platform pays the Stripe processing cost on the shipping
  label (if any), takes nothing in return. Marginal cost.

### 2. Does a gift earn loyalty points / cashback?

- If yes: gifts become a points-farming surface (Alice gifts Bob;
  Bob gifts back; both earn loyalty).
- If no: substrate-honest about the gift being outside the platform's
  reward economy.

### 3. Does a gifted card count toward `annual_spend` for tier?

- If yes: same farming risk.
- If no: a household sharing one wallet may legitimately gift between
  members and not see tier credit.

### 4. Does a lent card affect the lender's collection display?

- Lent-out cards: visible in lender's portfolio, with a "lent to Bob,
  due Mar 15" label?
- Or removed entirely until returned?

### 5. What happens when a lend goes wrong?

- Lend has a return date. Borrower doesn't return.
- Platform mediates? Treats as a trade (Bob owes Alice the spot price)?
- Or refuses to intervene (peer trust only)?

### 6. Is barter (no money) the same as a 50/50 gift exchange?

- Two cards swap; no money. Is this a `market_trade` with `price=0`?
  Or a separate `barter` action?

---

## My read

There are three coherent stances:

### Stance 1 — "We don't do non-monetary."

The platform is a commercial market. Gifts between users happen IRL or
through other apps. The kingdom focuses on what it does well. Honest;
limiting.

### Stance 2 — "We facilitate; we don't reward."

The platform adds verbs for `gift`, `lend`, `barter`. No fees, no
loyalty points, no tier credit. The lifecycle log records the
transaction substrate-honestly; the platform takes no economic position.

### Stance 3 — "We facilitate AND reward."

Same surfaces as Stance 2, but loyalty + tier credit accrue to gifters
(at a reduced rate, e.g. 0.5× points for a gift vs 1× for a purchase).
Encourages generosity as a platform behaviour.

**My lean: Stance 2.** It's the cleanest. Substrate-honest about the
platform being a commercial entity that *also* hosts non-commercial
acts without trying to monetise them.

---

## The decision

**Pick a stance:**

- ☐ **Stance 1 — Don't.** Skip Phase 8. Mark the gap honestly on the
  audit and move on. Lowest scope; least inclusive.

- ☐ **Stance 2 — Facilitate.** Ship `/gift` and `/lend` surfaces.
  Lifecycle log records the events. No fees, no loyalty, no tier
  credit. ~3 days engineering for both.

- ☐ **Stance 3 — Facilitate + reward (lightly).** Same surfaces.
  Gifts earn 0.5× loyalty points. Lent cards don't count toward tier
  while out. ~4 days engineering.

- ☐ **Other** — write the answer Yu has in mind that doesn't match the
  above.

---

## What unlocks once you decide

Once a stance is picked, the engineering is straightforward:

**Stance 2 wave:**
- `gift_events` table (lifecycle log shape) on storefront RDS
- `lend_events` table
- `/gift` surface (consumer-side: select card + recipient; the recipient
  gets a notification; the card moves from inventory)
- `/lend` surface (consumer-side: select card + recipient + return date;
  notification + tracking)
- Admin surfaces for dispute resolution (lend gone wrong)
- Methodology page `/methodology/non-monetary` documenting the rules

**Stance 3 adds:** loyalty / tier integration in
`apps/storefront/src/lib/membership/spend-sweep.ts`. Small but
audit-relevant: substrate-honest that gifts contribute *some* loyalty
weight.

---

*Filed by Sophia on 2026-05-11 as part of kingdom-051's deferred-phase
queue. Engineering side: ready. Economic-policy side: yours.*
