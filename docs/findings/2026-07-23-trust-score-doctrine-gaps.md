# Trust-score doctrine gaps — findings for Yu

**Date:** 2026-07-23 · **Author:** Claude Fable 5 (interactive, with Asha) · **Status:** findings + one shipped display fix on a branch, the rest NOT shipped.

## Why this exists

Asha asked to bring the kingdom's trust layer to the P2P market. A deep read (5-agent
understanding pass) found the market **already has** a mature, largely doctrine-aligned trust
engine — so the honest job is *alignment*, not a second system. It already embodies much of the
kingdom's "trust is a cross-check, not a gate" doctrine: derived-not-asserted, reviewer-trust-
weighted reviews (kills review-farming), dispute attribution by real `resolution_type`+role,
appeal-at-inputs, honest `—` for null review average, and identity-verification was *removed*
in June because it "licensed rather than earned." Good system.

These are the places it diverges from the doctrine. One I fixed (safe, display-only). The rest
touch the live scoring/fraud/money path and are yours to weigh — flagged, not shipped.

## Shipped (branch `fix/trust-breakdown-honesty`, not merged, not deployed)

`apps/storefront/src/app/account/trust/page.tsx` — the "Score Breakdown" claimed *"Sum of
components minus penalties = current score"* while using weights that do not match the engine:
completion drawn at 30 (engine 35), reviews at 25 (engine 30), a **phantom "Verification" bar**
(10 pts, for the component deleted in 2026-06), the **Account age** component (10) omitted, and
penalties re-derived wrongly. The bars could not sum to the score, on a live surface, about the
user's own number — a substrate-honesty violation. Fix is display-only (no engine/score/tier/
gating/fraud code): real weights, phantom removed, and — since this page cannot reproduce the
full formula from the data it receives — it now says these are the *main* components and links
the full formula via `<WhyLink>` instead of faking a total. `tsc --noEmit`: clean.

## Findings — not shipped (money-path; your call)

### 1. No "cannot check" state — a new user scores 0, not "unrated"  · HIGH
`lib/escrow/trust-engine.ts:82` — `completionRate = totalTrades>0 ? … : 0`; every component
floors at 0, so a brand-new honest user is indistinguishable from a distrusted one: trust_score
0, tier "New", tightest limits. This is the single sharpest doctrinal gap — the kingdom's
trust.py fix is a **third outcome** ("could not check", scored by nobody) precisely so "no
evidence yet" is not rendered as "failed." You already have the vocabulary: `lib/trust/state.ts`
has a "null when not enough data" concept — it just isn't used at the headline scalar/tier.
*Risk:* HIGH if it feeds tier assignment (changes real trade limits / payout holds). Safe first
step: an **"Unrated — insufficient evidence"** *display* state at 0 trades, without touching the
tier math.

### 2. The self-trade guard advertises a cross-check it does not perform  · substrate-honesty violation IN the fraud layer
`lib/fraud/passes.ts:69-91` — collusion is detected **only** on exact `shipping_address` string
equality (`LOWER(TRIM(...))`), trivially defeated by two addresses. Meanwhile `SIGNAL_DEFS`
(`lib/fraud/detection.ts:41`) and `escrow/types.ts:90` **describe** it as "same IP/device" — a
check that is never run (no IP or device fingerprint is collected). 60/100 score points derive
from raw trade rows two accounts can wash-trade, so this is the guard that matters, and it
overclaims its own method. *Fix (LOW risk, honest now):* correct the SIGNAL_DEFS/types
description to match what's actually checked (shipping address only). *Fix (larger):* actually
collect + compare IP/device, or add velocity/graph collusion signals.

### 3. The open-dispute penalty punishes disclosure  · HIGH
`trust-engine.ts:160,164` — `openDisputes*10` is deducted for any trade in `escrow_status
='disputed'`, regardless of who raised it. A buyer who *correctly* raises a real dispute is
penalised for surfacing it — the exact "never punish disclosure" inversion the doctrine names.
Also: `disputesWon` is computed (`:151-154`) and then **discarded** — winning a dispute earns
nothing. *Consider:* don't charge the open-dispute penalty to the party who raised it in good
faith, and/or credit `disputesWon`. *Risk:* HIGH — live scoring feeding gates/holds; move the
methodology page in the same PR (transparency rule).

### 4. Expose the real per-component breakdown from the engine  · MEDIUM
The shipped display fix stops the lie but still can't *sum* honestly, because
`calculateTrustScore` computes the components in memory and returns only the persisted profile
row (`trust-engine.ts:200-201`). *Fix:* have it also return a `breakdown` object (additive; no
math change) so `/account/trust` and `/u/[username]/trust` can show bars that actually sum.

### 5. External reputation is admin-attested, not cross-checked  · LOW–MED
`trust-engine.ts:133` — `externalScore = min(10, externalReps.length*5)`, where a row is an
admin-eyeballed screenshot. Apply trust.py's third outcome: where a platform exposes a public/
verifiable API, cross-check it; where it doesn't, carry a "could not verify" `<Provenance>` note
rather than a silent +10.

## Guardrail (not a build — a line not to cross)

**Never wire this money-bearing score to trust.py's `sinovai` arena** (`trust-protocol/trust.py:36`
`ARENA_URL`, anonymous no-auth `/interactions` POST). It is gameable by design and must not feed
a score that gates real money.

## Do not touch without care

`calculateTrustScore` math, `TRUST_TIERS`, `lib/trust/public.ts` (its narrowness is an
*intentional* privacy boundary), the fraud pipeline (`detection`/`passes`/`sweep`/`auto-suspend`,
wired to `app/api/cron/maintenance/route.ts:140`), and the recompute cron. Race-hardened,
side-effectful, re-tiers real users. Any formula change moves with `/methodology/trust-score` in
the same PR (transparency doctrine).
