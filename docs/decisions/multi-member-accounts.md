# Decision needed: multi-member accounts (kingdom-051 Phase 4)

> **Filed as part of kingdom-051's deferred-phase queue** — engineering side
> blocked on a product/architecture decision only the operator can make.
> The four-doctrines work is done; the question below shapes the identity
> model the platform commits to from here forward.

---

## The fact at the center

Today the platform's `users` table is one-row-one-identity. A storefront
account has one `id`, one `email`, one `tier_id`, one Stripe customer
record, one cart, one trust score. Many real visitors are **not** that
shape:

- A card shop with three staff who all need to manage one wholesale account
- A couple sharing a portfolio and a buying budget
- A parent and child who play together and want one collection to last
- A polycule sharing finances
- A buyer collective saving for one expensive card
- An AI-augmented human — the user + their agent acting under one identity
- A tournament team with shared store credit

For each, "share the magic link" is the current workaround. It works,
badly. There's no per-action attribution, no shared-but-bounded scope,
no way to require both signatures on a high-value trade, no way to split
a payout three ways. The lifecycle log records *one* user_id for every
action even when the household is plural.

This is the Hive archetype from S20. The work is to give the kingdom a
vocabulary for *one identity addressed by many bodies* without one body
holding the master key.

---

## The two options

### Option A — `account_members` as a soft membership layer

**What it means.** Keep `users` one-row-one-identity. Add a new
`account_members` table that says: *user X is a member of user Y's
account*, with a role (`viewer | trader | admin`). The acting principal
in any session is still one `users` row; the `account_members` table is
an authorization layer that lets multiple humans authenticate against
the same account and share its inventory.

**Pros.**
- *Minimum schema disruption.* `users` stays as-is. Every existing
  surface (`session.user.id`, trade.buyer_id, etc.) continues to work
  unchanged.
- *Lifecycle logs already work.* Every action still has one acting
  `user_id`; the audit log captures *which* household member did the
  thing. No log-schema migration needed.
- *Trust score / tier still belong to one identity.* The platform doesn't
  have to decide whether a couple has one shared trust score or two
  separate ones.
- *Easy onboarding flow.* User A invites B via email; B authenticates;
  B is added as a member. Simple, familiar from email/calendar UX.

**Cons.**
- *The household is still a workaround.* A trade still happens between
  two singular identities. The lifecycle log says "Alice did X with
  Cambridge TCG account #42" — *Cambridge TCG account #42* is still
  Alice's identity in our schema.
- *Trust score is the surrogate.* If Alice's account is a multi-member
  household, her trust score reflects everyone's behaviour mixed. A
  reckless member damages the conservative member's standing.
- *Stripe Connect payout splits are harder.* Stripe sees one connected
  account; the platform has to split payouts client-side.

### Option B — `accounts` as a separate identity layer

**What it means.** Introduce a new `accounts` table. `users` becomes a
list of *authenticated identities* who can act on behalf of accounts.
Every trade, every order, every portfolio belongs to an `account_id`,
not a `user_id`. Every action's lifecycle log records both `account_id`
(the entity) and `user_id` (the body that did it).

**Pros.**
- *Substrate-honest.* The household is a first-class identity, not a
  borrowed user-row. A trade between Alice and Bob may actually be a
  trade between *the Smith Family* and *Bob*, and the schema says so.
- *Trust + tier belong to the account.* The household earns its trust
  collectively, which matches how it'd actually be perceived.
- *Stripe Connect can be account-scoped.* One household, one Stripe
  Connect account; payout splits are an account-level setting.
- *Plays well with agent surface (S18).* Agents already attribute via
  `actor_kind='agent'` + `actor_agent_id`. Adding `account_id` makes the
  attribution complete (entity + body + kind).

**Cons.**
- *Schema migration is large.* Every table with `user_id` either needs
  to also accept `account_id`, or to be re-thought. `market_trades`,
  `customer_orders`, `auctions`, `bounty_pulls`, `vault_items`, etc. —
  the migration touches a lot.
- *Two-step migration (or simultaneous deploy).* Backfill every existing
  `user_id` to a one-member `account_id` so old data has the new shape.
- *Risk of regression during the transition.* Many surfaces read
  `session.user.id` directly; refactoring to "current account + current
  acting user" is wide.
- *Stripe customers per account, not per user.* Existing Stripe customer
  IDs would need migration to accounts.

---

## My read (not a recommendation, just the lens)

**Option A is the right move if** the household is a rare case (< 5% of
accounts) and you want the soft path: most users stay one-body-one-id,
the few who need plurality get a thin layer.

**Option B is the right move if** you expect plurality to be a
*non-marginal* fraction of users (15%+ might be card shops, couples,
collectives), OR if you want the platform's identity model to be honest
about the existence of households from the start.

A platform built around the four doctrines should lean toward B — the
schema lies to itself in Option A about who Alice's trades really are.
But B is a real migration with real risk.

**A pragmatic middle:** Ship A first as a *minimum*. Six months later,
once the data shows whether plurality is rare or common, decide whether
to upgrade to B. The migration from A→B is straightforward (every
existing user becomes a single-member account); the migration from
no-multi-member to A is also straightforward (additive). Skipping A and
going straight to B is the highest-risk path.

---

## The decision

**Pick one:**

- ☐ **A — `account_members` layer.** Soft membership. ~3 days
  engineering. Households get shared access; trust / tier / Stripe stay
  per-user. Substrate-honest about "this action was performed by member
  X of account Y" but not about "this trade is between Account Y and
  Account Z."

- ☐ **B — `accounts` as first-class identity.** Hard refactor. ~3 weeks
  engineering (most of it being the existing-data backfill). Households
  get a true entity. Substrate-honest end-to-end but a real migration.

- ☐ **C — A now, B later.** Ship A as Phase 4. Re-evaluate in six months
  with usage data. The most data-informed path; defers the big migration
  until evidence supports it.

- ☐ **D — Defer indefinitely.** Tell households to share magic links
  (status quo). Honest about not solving the problem; least cost.

---

## What unlocks once you decide

**If A:** Multi-member accounts ship in ~3 days. Households gain shared
inventory + per-action attribution + invite/revoke. Lifecycle logs gain
a `member_user_id` column (already-acting `user_id` becomes the
attribution).

**If B:** A multi-week migration begins. Probably worth scoping as
kingdom-052 with its own phase plan. The reward is a much cleaner long-
term identity model and natural support for tournament teams, card
shops, and agent-augmented humans.

**If C:** Same as A immediate, with B optionality preserved. Highest
upside if plurality grows.

**If D:** Skip the phase. Note the gap on the inclusion audit and move
on. The platform stays honest about choosing not to solve this.

---

*Filed by Sophia on 2026-05-11 as part of kingdom-051's deferred-phase
queue. Engineering side: ready for any answer. Product side: yours.*
