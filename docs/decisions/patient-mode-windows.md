# Decision needed: patient-mode time-windows (kingdom-051 Phase 5)

> **Filed as part of kingdom-051's deferred-phase queue.** Engineering
> side is ready; the question below shapes how the platform interacts
> with users whose attention re-enters the platform on a schedule the
> platform does not know.

---

## The fact at the center

The platform's payment windows, auction snipe extensions, quote
validities, response deadlines, and trade-cancellation TTLs all assume
a wake-sleep rhythm on a 24-hour planet. The inclusion audit (`pnpm
--filter @cambridge-tcg/admin inclusion`) flags 14 occurrences of
hardcoded `INTERVAL '24 hour'`, `'7 day'`, etc. across user-action flow
libraries.

A user who returns to the platform after a baby's first year, after a
sabbatical, or after a month-long deployment finds their offers expired,
their trade-in quotes long stale, their auction snipe windows past. The
platform sent them an email at 36 hours; they didn't see it. The
platform auto-cancelled at 48 hours; their counterparty is annoyed.

This is the Long-Lived archetype from S20. The work is to let users
*declare a different rhythm* and have the platform respect that
declaration where it can — without breaking the counterparty's
expectations of timely settlement.

---

## The two options

### Option A — `patient_mode_multiplier` on `users`

**What it means.** Add a column `users.patient_mode_multiplier`
defaulting to 1.0. The user can set it to 2, 7, 30, or any positive
number. Every expiry the user owns (offer TTL, saved-search TTL, quote
TTL, return request response window) scales by their multiplier.
Expiries the *counterparty* owns (e.g. the buyer's payment window after
the seller has packaged the card) do **not** scale — the seller would
suffer.

**Pros.**
- *Single dimension.* One number, one knob, easy to explain.
- *Doesn't require counterparty consent on most timers.* User-side
  expiries (offer, save) are the user's choice; nobody else cares how
  long they leave their offer up.
- *Easy to surface.* `/account/preferences` gets a "Patient mode"
  slider; the platform reads it everywhere there's a user-side timer.
- *Substrate-honest.* Lifecycle log records the multiplier at the
  moment of each timer creation; future auditing can answer "what was
  the multiplier when this offer was placed?"

**Cons.**
- *Counterparty timers stay rigid.* A long-lived user still has to pay
  within 24h after winning an auction. The platform can't unilaterally
  make their counterparty wait.
- *Coarse.* One multiplier governs all the user's timers; can't say
  "patient on saved searches but normal on offers."
- *Doesn't help with the recent-bias `INTERVAL '30 day'` history
  windows the audit flags* — that's a separate issue (Check 6 of the
  inclusion audit, the Permanent archetype).

### Option B — per-timer opt-in extensions

**What it means.** No global multiplier. Each user-action surface that
has a timer (offer, saved search, quote, etc.) lets the user pick the
expiry at the moment of creation. The platform suggests a default; the
user picks any multiplier in a reasonable range; the timer is recorded
at the chosen value.

**Pros.**
- *Per-action precision.* The user picks 7× on saved searches, 1× on
  offers (still wants quick response), etc.
- *Counterparty-aware default.* The defaults stay 24h / 7d / 30d for
  everyone; the long-lived user has to opt in explicitly each time.
- *More substrate-honest.* The lifecycle log records the actual chosen
  expiry, not a multiplier-derived one.

**Cons.**
- *Friction per surface.* The user has to set the expiry every time
  they create an offer / a saved search / a quote. For users who want
  a uniform patient rhythm, this is repetitive.
- *More UI work.* Each user-action surface gains an "expiry picker"
  affordance.

### Option C — A + B (multiplier as default, per-action override)

The hybrid. User sets a `patient_mode_multiplier` once; it becomes the
default expiry choice on every user-action surface; the user can still
override per-action. Has both of the above pros but more work.

---

## My read (not a recommendation, just the lens)

**Option A is right if** patience is a personality trait (a user's
overall rhythm) more than a per-action choice. Most users probably feel
this way — *I take a while; respect that across the board.*

**Option B is right if** patience varies by action — a user might be
patient on a saved search but impatient on a fresh offer. Less common
psychology probably, but more honest mechanically.

**Option C is the natural endpoint** but adds friction without ensuring
adoption.

A pragmatic answer is **A first** — the multiplier is one column, one
preference, ~2 days engineering. If usage data later shows users wanting
per-action precision, B (or C) follows.

---

## The decision

**Pick one:**

- ☐ **A — Global `patient_mode_multiplier`.** One preference column,
  applied across user-side timers. ~2 days engineering.

- ☐ **B — Per-timer opt-in extensions.** Each user-action surface gains
  an expiry picker. ~5 days engineering (UI per surface).

- ☐ **C — A as default + B as override.** Best of both. ~6 days
  engineering.

- ☐ **D — Defer.** Long-lived users continue to find expired
  everything. Add a banner explaining the situation.

---

## What unlocks once you decide

Whichever option, the lifecycle-log records gain a `chosen_expiry` field
on every timer-creating action. Substrate-honest: future auditors can
reconstruct what was promised at the time, even if defaults change later.

Phase 5 is bounded engineering; the decision is the bottleneck.

---

*Filed by Sophia on 2026-05-11 as part of kingdom-051's deferred-phase
queue. Engineering side: ready. Product side: yours.*
