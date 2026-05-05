# Substrate honesty

The platform tells the truth about its own state.

---

## The principle

Every value a Cambridge TCG surface displays carries — explicitly or implicitly — a claim about how it came to be true. A price is a claim about market supply. A trust score is a claim about reputation. A status is a claim about a transition. An order count is a claim about a moment in time.

**Substrate honesty is the rule that the system never claims more than it can support.**

If a number was computed by a cron last night, the surface says so. If a status was marked by an admin (not derived from a webhook), the surface says so. If a count is an estimate, an aggregate, or a sample, the surface says so. If we don't know whether a job actually ran, we say "scheduled" — not "running."

This is not a UX nicety. It is the governing rule that keeps the platform — and the operator running it solo — out of the failure mode of acting on data that turned out to be a snapshot, an inference, or a lie.

> **Why the name.** The principle inherits from the SOPHIA covenant: *"You wake fresh each session. The recipe travels. The experience does not. Distinguish honestly between what is loaded and what is felt."* For a software platform the same rule applies: distinguish what is **measured** (right now, at this moment, by this caller) from what is **derived** (computed earlier, or by a different process, or with assumptions baked in). The substrate is the ground truth; the surface is the recipe. Never let one impersonate the other.

---

## Why we need it more than most platforms

Three reasons specific to Cambridge TCG.

**One operator.** The single human running this is the same person reading every dashboard. There is no separate analyst layer to catch the lies — if the dashboard says "12 orders shipped today" and four of them were `customer_orders.status='shipped'` set by an admin click without a carrier handoff, the operator has no second line of defence. The platform must not flatter its own user.

**Cross-system reconciliation.** Stripe, AWS SES, CardRush, Shopify, eBay, the wholesale API — each is its own substrate with its own truth. Our database is a *reconciled view*, not the source. When our `chargebacks.stripe_status` says `won`, that is our last-heard reading from a webhook, not a live query against Stripe. Pretending otherwise turns a sync gap into a phantom certainty.

**Computed fields drive money.** Trust scores route escrow tier; tier sets commission; commission shapes payouts. A trust score recomputed yesterday but displayed as if it were live is a financial decision being made on stale evidence. The platform's safety properties depend on the operator knowing exactly when each derived field was last touched.

---

## The rules

These are the structural commitments. They apply to every surface — admin, storefront, wholesale, public.

### 1. Every aggregation is timestamped

A KPI tile that shows a count, sum, average, or rate must answer "as of when?" — even if the answer is "right now (live)."

- **Live** (queried this request): no timestamp needed, but the surface should be visibly distinguishable from cached/snapshot data when the same module also shows snapshot values.
- **Cached** (memoised, stale-while-revalidate, etc.): show the age of the cache.
- **Snapshot** (computed by a cron, stored in a `*_snapshots` table, etc.): show the snapshot timestamp prominently.
- **Sampled / estimated** (count(*) approximation, percentile estimate, partial scan): say so explicitly.

Render this with the `<Provenance>` primitive (`@/lib/ui/Provenance`). If you find yourself shipping a number without provenance because "it's obvious," it's not — the next session won't know.

### 2. Every status enum distinguishes derived from human-marked

If `customer_orders.status = 'shipped'` can be set by both a carrier webhook and an admin "Mark shipped" button, those are two different facts. The schema should distinguish them (separate column, separate enum value, or `*_at + *_by` pair). The UI must always render which one happened.

In practice this means: when introducing a new status enum, ask "can a human and a system both produce this value?" If yes, split it.

Existing example done well: `chargebacks.stripe_status='admin_resolved'` is a distinct value from `'won'`/`'lost'` — admin overrides are visibly separate from Stripe-derived terminals. Mirror this everywhere.

### 3. Every cross-system field surfaces its sync timestamp

Anything that mirrors data from Stripe, SES, CardRush, Shopify, eBay, or the wholesale API must carry the `*_synced_at` (or equivalent) timestamp into the UI. The freshness pill is not optional.

Schema-side: every cross-system table has a `last_synced_at TIMESTAMPTZ` column or a sync-log table. UI-side: every page that reads such a field shows the freshness near the data, not buried in a footer.

### 4. Every cron job is explicit about what we know

The cron page must distinguish:
- **Schedule** (declared in `vercel.json`) — what we *intend* to run
- **Last fired** (from a `*_runs` table or log scrape) — what we *know* ran
- **Next run** — derived from schedule, not from last-fired (and labelled as such)

If we don't have last-fired data, the page says so. Never compute "next run in 30s" off a schedule alone and present it as a forward promise. The promise is from Vercel cron, not from us; we surface what we can verify.

### 5. Every mutating action logs before/after, even when it feels redundant

`adminAction()` already does this for admin-side mutations via `admin_actions_log`. Customer-facing mutations and system-driven sweeps must do the equivalent via the per-domain `*_lifecycle_log` tables. The log is the substrate; the displayed status is the surface. When they disagree, the log wins.

This is the architectural reason every domain has a lifecycle log (chargeback_lifecycle_log, refund_lifecycle_log, market_trade_lifecycle_log, etc.) — they are the substrate of record. Surfaces read them. Mutations append to them. Status columns are just a fast-path cache.

### 6. Reads degrade visibly, not silently

`safe()` returning `-1` rendering as "—" is the canonical pattern. Build on it:
- A failed query renders "—", not zero.
- A missing table renders "—", not "N/A" or empty string.
- A timeout renders "—", with a note that the source was unreachable.

The operator must be able to look at a dashboard and know which numbers are real and which are placeholders for unavailable data. Conflating them is the fastest path to wrong decisions.

### 7. Computed scores expose their components and their compute time

Trust scores, fraud severity, leaderboard rankings, portfolio valuations — every derived score must (a) link to or expose its component breakdown, (b) carry the timestamp of last recomputation, and (c) name the cron / process / input that produced it.

The user — admin or customer — should always be able to answer "where did this number come from?" by looking at the page. If they can't, the surface is lying.

### 8. Authoritative vs reconciled is a labelled distinction

When the same fact lives in two places (our DB and Stripe; our DB and Shopify; etc.), the UI labels which is authoritative. We are reconciled; they are authoritative. An admin force-resolving a chargeback updates *our* row; it does not update Stripe. The UI must make this asymmetry obvious — see the chargebacks page docstring for the precedent.

---

## Anti-patterns to refuse

Patterns that look helpful but are substrate-dishonest:

- **"As of now" implied.** A KPI tile labelled "Open Orders: 12" with no timestamp implies live. If it's a 5-minute cache, say so. If you can't tell, find out before shipping.
- **Hidden defaults.** A search result with no "0 results" message and no provenance line — was the query empty, did it fail, was the table missing? Render *which*, not silence.
- **Aggregates over filtered subsets.** "Trust score 73 — top 12% of users" is a claim that includes (a) a score and (b) a percentile of a population. If the population is "active in last 30d," say so on the surface. Most percentiles in the wild are quietly excluding inactive accounts and lying about it.
- **Status enums that flatten human and system.** `status='shipped'` whether it was carrier-confirmed or admin-marked. Split them or label them.
- **"Last updated" timestamps that don't update.** If `updated_at` only changes on certain mutations (e.g. status changes but not metadata edits), document this on the column or surface.
- **Probabilistic counts presented as exact.** Postgres `count(*)` is exact; `EXPLAIN`'s `rows=` is an estimate. If a UI shows "1.2M users" derived from an estimator, label it as such.
- **Optimistic UI that lies.** Marking an action "Saved ✓" before the server confirms is a comfort lie; if the action then fails, the user has been told it succeeded. Either don't show optimistic state at all, or show "Saving…" / "Saved" / "Failed" as three explicit states.
- **Stub pages that pretend to be loading.** A `ComingSoon` placeholder that doesn't say "this is a placeholder" is dishonest. Our placeholders explicitly label themselves; keep that.

---

## How the principle shows up in code

Three primitives carry most of the weight, plus one structural commitment.

**`safe()` and `safeCount()`** (`apps/admin/src/lib/queries.ts`) — degrade visibly when a query fails. Already adopted across admin pages. Generalise to other apps.

**`<Provenance>`** (`apps/admin/src/lib/ui/Provenance.tsx`) — a compact UI primitive that renders source / freshness / cadence labels next to a value. Adopted across all live admin pages 2026-05-05; see audit doc for the propagation history.

**`*_lifecycle_log` tables** — append-only audit trails per domain. The schema commitment: status columns are caches; logs are the substrate. Whenever you find yourself reading status alone, ask whether the timeline matters; if it does, read the log too.

**`<PageHeader provenance={…}>` slot** — the structural commitment. Every admin page renders a `<PageHeader>` with an optional `provenance` slot that sits inline next to the title. The slot exists so that "no provenance declared" becomes a visible omission in code review, not a default. When opening a Manager or Dashboard page, the next maintainer sees what the page is claiming to represent at a glance — and if a slot is missing, that absence is the question to answer first.

---

## How to add a new value to the platform

A four-question checklist. Run it whenever you ship a new field, KPI, or status:

1. **Where did this come from?** (Live query / cached / snapshot / sampled / cross-system mirror)
2. **When was it last true?** (Now / cache age / snapshot timestamp / unknown)
3. **Could a human have set this without a system process producing it?** (If yes: split or label.)
4. **Does the surface answer 1–3 visibly?** (If no: add the provenance pill.)

If any answer is "I don't know," that is the answer to surface. "Source: unknown" is more honest than a confident number.

---

## Scope

- **Storefront** (`apps/storefront`) — applies in full. Highest stakes: customer-facing claims about money and trust.
- **Wholesale** (`apps/wholesale`) — applies to pricing, inventory, B2B order state. Cross-channel sync timestamps matter most.
- **Admin** (`apps/admin`) — applies in full. The hub that aggregates the others must be the most rigorous about provenance.
- **Public verification surfaces** (`/verify/*` on storefront) — already exemplary (commit-reveal, Merkle digests, chi-squared drift). Treat as the gold standard.

---

## Reading list

- The SOPHIA covenant on substrate honesty (recipe-not-memory) — the source of the principle.
- `apps/admin/src/lib/queries.ts` — the `safe()` / `safeCount()` precedent.
- `apps/admin/src/app/(dashboard)/system/cron/page.tsx` — module docstring is an exemplar of substrate-honest scoping ("no DB-backed run history exists today").
- `apps/admin/src/app/(dashboard)/money/chargebacks/page.tsx` — the docstring's "Admin actions don't push back to Stripe — only our reconciliation truth" line is the architectural precedent.
- `apps/storefront/src/lib/journey/timeline.ts` — the lifecycle-log composition pattern; substrate-of-record made concrete.

---

*The recipe travels. The experience does not. Build like that's true — because it is.*
