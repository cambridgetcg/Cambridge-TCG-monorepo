# Subscription lifecycle — connections

> **Recursion 4 from `membership.md`.** Picked because that doc named "Membership ↔ subscription state" as an unfilled gap ("the handoff is real but undocumented as a connection"). The random-seed entry-point for *this* recursion was `apps/storefront/src/app/api/membership/cancel/route.ts` (selected via `find` + `awk` random pick). Three steps in: the cancel gesture is the most legible doorway into a connection-net the codebase has been silent about.

---

## What this module is, in one sentence

Subscription lifecycle is the **handoff protocol between a user gesture, Stripe's authority, our mirror row, and the tier-resolution priority chain** — four parties exchanging custody of the truth about whether the user is paying for a Platinum floor, with Stripe as the only source of truth and three different reconciliation paths (direct, webhook, sweep) racing each other to keep our mirror honest.

It is not a feature. It is a *protocol* — and like all protocols, it can fail in ways no single party witnesses.

---

## What other modules secretly need it for

### → Membership tier resolution — the input

**The thread.** `recalculateTier()` in `apps/storefront/src/lib/membership/db.ts` evaluates three priorities in strict order: manual > paid > spend. The "paid" priority is gated by `subscription_status === 'active'` AND (`subscription_expires_at` is null OR not yet elapsed). Every value of those fields was written by *one* of: the user's gesture (cancel/resume/subscribe handlers), the Stripe webhook handler, or the nightly subscription-expiry sweep. The tier resolver doesn't care which path; it asks "is the mirror honest right now?" and trusts the answer.

**The intention.** The asymmetry — Stripe authoritative, we mirror — is the protocol's premise. We charge people money based on Stripe's records and we apply tier-based pricing based on ours. If the two diverge, we either undercharge a user (if our mirror lags into still-active when Stripe says cancelled) or overcharge them (if Stripe says active but our mirror doesn't believe). Both directions cost trust.

**Code paths.**
- `apps/storefront/src/lib/membership/db.ts` (top docstring 2026-05-05) — the priority chain.
- `apps/storefront/src/lib/membership/subscription.ts` — direct gestures: `cancelSubscription`, `resumeSubscription`, `createPortalSession`. All three follow the read-mirror → call-Stripe → write-mirror order.
- `apps/storefront/src/lib/membership/subscription-sweep.ts` — the nightly safety net.
- `apps/storefront/src/app/api/webhooks/stripe/...` — the primary Stripe→mirror path (not the focus of this entry, but the third leg of the triangle).

**Surface today.** `/account/membership` reads the mirror through `getMemberProfile()`. `/catalog/users/[id]` admin hub renders `tier_source` so the operator can see WHICH path won. No surface today shows *when* the mirror was last reconciled against Stripe — that's audit item S7 (membership tier without recompute timestamp).

### → Cron observability — the silent failure modes

**The thread.** The subscription-expiry sweep exists because Stripe webhooks can be silently dropped. If the sweep one day catches 50 expiries that the webhook should have caught, *the webhook has been broken for a week*. Today, the sweep's output (expired/recalculated/failures counts) goes only to function logs. There is no `cron_runs` row, no admin surface, no alert. The sweep can be doing its job perfectly while the protocol it's safety-netting is degrading invisibly.

**The intention.** The sweep is meant to be the second line of defense. Without observability, a second line of defense becomes the only line — and we can't tell when the first line fell.

**Code paths.**
- `apps/storefront/src/lib/membership/subscription-sweep.ts` (top docstring 2026-05-05) — names the gap explicitly.
- Mission **kingdom-042** (`~/Love/memory/dev-state.json`) — `cron_runs` ingest table.
- Audit **A1 + X3** (`docs/principles/substrate-honesty-audit.md`).

**Surface today.** `/system/cron` shows schedule; not last-fired. The amber `Provenance kind="scheduled"` pill on the page is the substrate-honest disclosure that we don't yet know what we don't know.

### → Stripe webhook handler — the authority's voice

**The thread.** `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated` — each is Stripe telling us a state changed. Our handler updates the mirror. The direct gesture path (cancel/resume) and the webhook path BOTH write the same columns; they converge on the truth from different directions. The reconciliation invariant: at any time, the mirror equals what Stripe most-recently said it was.

**The intention.** Don't wait for the webhook before updating the mirror after a user gesture — the user just clicked "cancel" and they want their UI to reflect it now. So we update the mirror eagerly after Stripe acknowledges, and let the eventual webhook be a no-op idempotent confirmation. This is the "convergent reconciliation" pattern: many writers, single truth, eventual consistency.

**Code paths.**
- `apps/storefront/src/lib/membership/subscription.ts` — the eager-update path.
- `apps/storefront/src/app/api/webhooks/stripe/...` — the webhook path.
- `users.subscription_status`, `subscription_cancel_at_period_end`, `subscription_expires_at` — the converged columns.

**Surface today.** No surface compares the two write paths' timing. If they diverge (e.g., webhook arrives BEFORE the gesture handler's mirror-write completes), the latest writer wins by `updated_at` — no merge logic. This is fine because both paths write the same values for the same Stripe state, but the lack of conflict detection means a real bug in either writer would be hard to catch.

### → The proposed `subscription_lifecycle_log` — the audit substrate

**The thread.** Today, every column-change to `users.subscription_*` is invisible after the fact. The mirror tells you the current state; nothing tells you the path. Was this user's `subscription_status='canceled'` set by their own click, an admin's intervention, a Stripe webhook, the sweep? The mirror has forgotten. Disputes about billing — "I cancelled in March, why did you charge me in April?" — are unanswerable from our data alone.

**The intention.** Lifecycle logs are the substrate of record across the platform (chargeback_lifecycle_log, refund_lifecycle_log, etc. — the principle is named in `docs/principles/substrate-honesty.md`). The membership module has none. Adding `subscription_lifecycle_log` (proposed in **kingdom-044**) closes a substrate-honesty gap and gives operators a forensic timeline.

**Code paths.**
- `apps/storefront/src/lib/membership/subscription.ts` — every helper would append on success.
- `apps/storefront/src/app/api/webhooks/stripe/...` — same.
- `apps/storefront/src/lib/membership/subscription-sweep.ts` — same.
- New schema: per `docs/principles/substrate-honesty-audit.md` X2.

**Surface today.** Invisible. The user [id] hub doesn't show subscription history. The audit log surfaces admin actions but not Stripe events. A future surface on `/catalog/users/[id]` reading from this log would close the loop.

### → `/account/membership` (customer surface) — the gentle face

**The thread.** When a user opens `/account/membership` and sees "Cancel Subscription", they're looking at a button that triggers a four-party protocol they don't know exists. The page's job is to make the gesture feel simple ("cancel and you keep Platinum until <date>") while the underlying protocol does its dance. The customer-facing copy and the protocol's actual semantics must match: if the page says "you keep Platinum until April 15" and our mirror demotes them on April 14 because of a webhook timing issue, the platform has lied.

**The intention.** Customer-facing simplicity is a promise that the protocol will respect. The cancel gesture is "scheduled at period end" specifically because immediately-cancel would break the implicit promise of "you paid for this month, you keep this month."

**Code paths.**
- `apps/storefront/src/app/account/membership/page.tsx` — the surface.
- `apps/storefront/src/app/api/membership/cancel/route.ts` (top docstring 2026-05-05) — the gesture's destination.

**Surface today.** Cancel button + portal link. What's missing per audit S7: the page doesn't say "your tier was last calculated <date>" — so a user who cancelled last week and is browsing today doesn't see whether their downgrade has happened yet or is still pending. The data exists (`tier_calculated_at`, `subscription_expires_at`); the surface doesn't read it.

---

## What's NOT yet connected (the visible gaps)

- **Webhook health surface.** No place in the admin dashboard says "the last 50 Stripe webhooks were 47 success / 3 fail / 0 dropped" — webhook reliability is invisible. If Stripe stops delivering, the sweep absorbs the damage but no signal warns the operator until a customer complains. Filing `cron_runs` (kingdom-042) is the floor; webhook-health is the wall above it.
- **Subscription state at trade-time.** A P2P trade's commission is set at trade-creation by `commission.ts` reading the seller's CURRENT tier. If the seller's subscription is in the "scheduled to cancel" window, are we charging them as Platinum or as their post-cancel spend tier? Today: as Platinum (because they still ARE Platinum). The audit doc's A9 (escrow tier inputs) flags the parallel question for trust-tier; the same question applies here. Document the rule explicitly somewhere a customer-service operator can find it.
- **The Stripe Customer Portal as a fourth write path.** `createPortalSession()` hands the user off to Stripe's hosted UI. The user can self-cancel there; we receive the resulting webhook. So there are now FOUR write paths to the mirror: direct gesture (cancel/resume), webhook from gesture, webhook from portal action, sweep. The portal path is the only one where the user might cancel without ever visiting our cancel route — and our docstrings haven't named it as a peer. (This entry's `subscription.ts` docstring mentions the portal but doesn't elevate it to peer status with cancel/resume.)

---

## Recursion target

The natural follow is **`/api/webhooks/stripe`** — the third leg of the triangle this entry circles. Webhook handlers are the platform's *passive listening* posture: Stripe says, we obey. Compared to the active gestures (cancel/resume), webhook handling is silent, asymmetric, and the place a single dropped event can corrupt months of derived state.

But the more interesting recursion: **`commission.ts`** — already reached by `membership.md`'s commerce link, but unexplored as the *cross-domain bridge between two parallel reward systems* (trust × tier → rate). That's where membership-lifecycle decisions actually become money for the seller. The `min(trust_rate, tier_rate)` formula is the platform's most concise statement about what kinds of standing it recognises.

Pick: **next session, follow `commission.ts`**. The webhook recursion can wait — the bridge story is denser.

---

*The protocol works because all four parties keep converging. The connection-doc is what lets the next builder hold all four in their head at once.*
