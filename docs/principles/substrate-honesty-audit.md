# Substrate honesty — audit (2026-05-05)

Read [`substrate-honesty.md`](./substrate-honesty.md) first for the principle.

This audit is a snapshot, not a verdict. It lists where the platform currently violates the principle, with severity and a fix proposal each. Each fix is shippable as a `kingdom-NNN` mission.

> **Snapshot caveat.** This audit was compiled from the codebase on 2026-05-05. Counts and severities reflect that state. Re-run the audit after a quarter of dev work — the violations rotate.

> **Status updates.** As items ship, they're marked **CLOSED** inline (rather than deleted) so the history of what was wrong, when, and what fixed it stays readable. Closed items: see the lines marked `**Status:**` below.

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **P0** | Operational hazard — the operator could make a money or safety decision on a lie. Fix this quarter. |
| **P1** | Decision-shaping — the surface implies more certainty than it has, but the cost of being wrong is bounded. Fix when adjacent work touches the surface. |
| **P2** | Cosmetic dishonesty — the surface is loose with truth but no plausible decision is being made on it. Fix opportunistically. |

---

## Admin app (`apps/admin`)

### A1 — `/system/cron`: "next run" is schedule-derived, not log-backed

**Severity:** P0
**Where:** `apps/admin/src/app/(dashboard)/system/cron/page.tsx`
**Violation:** The page computes "next run" from the cron expression and presents it without distinguishing it from a forward promise. There is no DB-backed run-history. If a Vercel cron has been silently failing for a week, the page still shows "next run in 30s" — and the operator has no way to tell.
**Fix:** (a) Add an explicit "Schedule (declared)" column distinct from any future "Last fired (observed)". (b) Render a banner at the top stating that this page reflects the *schedule*, not run history; link to Vercel logs. (c) Mission to wire actual last-fired-at via a `cron_runs` table (kingdom-028 already filed for vercel.json auto-discovery; extend its scope).
**Owner:** kingdom-028 (extend) + new kingdom-NNN for `cron_runs` ingest.

### A2 — KPI tiles across admin: no provenance

**Severity:** P1
**Status:** **CLOSED 2026-05-05.** Provenance pill landed on `/overview`, `/commerce/{pricing,auctions,trade-ins,market}`, `/ops/{orders,stock}`, `/catalog/users`, `/catalog/users/[id]`, `/money/chargebacks`, `/trust/{disputes,fraud}`, `/system/audit`. `<PageHeader>` now exposes a `provenance` slot so the pill sits structurally next to every page title. Pricing carries `synced` from CardRush + cadence; chargebacks carries `synced` from Stripe with a reconciled-not-authoritative note; all others carry `live`. Stub pages (`/system/email`, `/money/{payouts,membership,rewards}`, `/catalog/{cards,games,clients}`, `/commerce/bounty`, `/ops/{channels,fulfillment}`, `/trust/{kyc,reviews}`) are intentionally untagged — they ship the `<ComingSoon>` placeholder which is itself substrate-honest.
**Where:** `/overview`, `/commerce/{trade-ins,auctions,market,pricing}`, `/ops/{orders,stock}`, `/catalog/users`, `/money/chargebacks`, `/trust/{disputes,fraud}`, `/system/{audit,email}`, `/catalog/users/[id]`.
**Violation:** Every KPI tile shows a number with no "as of when" annotation. Most are live (queried per request), but the surface doesn't say so — and a future migration to caching would silently change correctness without changing the visible page.
**Fix:** Adopt `<Provenance>` (`@/lib/ui/Provenance` shipped this session) on KPI grids. Default tone: "live" — explicit but quiet. Pages that read snapshot tables (e.g. portfolio_snapshots) switch to "snapshot · X ago".
**Owner:** new kingdom-NNN — "Provenance pass across admin KPIs." *(no longer needed — landed in-session.)*

### A3 — `admin_actions_log.actor_label` is free-form, not user-verified

**Severity:** P1
**Status:** **PARTIAL — short-term mitigation shipped 2026-05-05.** `/system/audit` now renders the Actor column header with a `⚠` warning glyph; each `actor_label` cell is dotted-underlined with a `title` tooltip stating "Free-form label set by the action wrapper. Not a verified user — see audit A3." A description-line warning under the page header points operators at the audit-doc entry. The structural fix (add `actor_user_id` column + capture from NextAuth session + render verified user when present) is the column added by `apps/storefront/drizzle/0088_admin_roles.sql` — landing as part of **kingdom-040** ("apply pending migrations 0085-0088"). Closes once that mission lands.
**Where:** `apps/storefront/drizzle/0069_admin_governance.sql`, surfaced at `/system/audit`.
**Violation:** The schema comment is honest about this ("the password-cookie auth doesn't map to a user_id today"). But the audit page renders `actor_label` as if it were an identity — "by admin" — without flagging that this is a self-reported label, not a verified user. With the magic-link migration partially done, there is now a real `users.id` we could capture; we just haven't.
**Fix:** (a) Short-term: render "actor (label)" with a tooltip or sub-text explaining provenance. (b) Medium-term: add `actor_user_id UUID REFERENCES users(id)` to `admin_actions_log` and start populating it from the NextAuth session. (c) Backfill is impossible — old rows stay label-only; new rows carry both.
**Owner:** **kingdom-040** (covers the schema migration). Short-term UI mitigation already in place.

### A4 — `/system/email`: "sent" status doesn't mean delivered

**Severity:** P1
**Where:** `email_queue` table; surfaced at `/system/email` (now live per kingdom-020 trajectory).
**Violation:** A row in `email_queue` with `status='sent'` means we successfully handed it to AWS SES. SES bounces, complaints, suppressions and deferred deliveries are not currently reflected back. Operator reading "100% delivered" is reading "100% accepted by SES" — different fact.
**Fix:** (a) Add `delivery_state VARCHAR(20)` mirroring SES events (`accepted`, `delivered`, `bounced`, `complained`, `suppressed`). (b) Wire SES SNS notifications to update it. (c) Until (b) ships, label the column "SES-accepted" not "delivered" on the UI.
**Owner:** new kingdom-NNN — "SES delivery reconciliation."

### A5 — Trust score on user detail: no compute time, no breakdown link

**Severity:** P1
**Status:** **CLOSED 2026-05-05.** `trust_profiles.updated_at` is now read alongside the trust profile and surfaced via `<Provenance kind="computed" by="storefront /api/cron/maintenance">` on the trust-profile FactCard. Operator sees compute time inline; cron name is named for chase-down.
**Where:** `apps/admin/src/app/(dashboard)/catalog/users/[id]/page.tsx`
**Violation:** Trust score is shown as a 0–100 number with colour. The trust profile section shows breakdown stats but doesn't say *when* the score was last recomputed. `trust_profiles.updated_at` exists; we don't read it. Operator can't tell if the score reflects last week's behaviour or this morning's chargeback.
**Fix:** Read `trust_profiles.updated_at` and render via `<Provenance>` next to the score. Cite the cron name (`maintenance` sweep) so operator can chase it.
**Owner:** Mechanical, can ship in next admin session.

### A6 — Order status doesn't distinguish carrier-confirmed from admin-marked

**Severity:** P0 *if* admin can mark shipped without a tracking number; P1 otherwise.
**Where:** `customer_orders.status`, surfaced at `/ops/orders`.
**Violation:** `status='shipped'` could be set by a webhook from the carrier integration OR by an admin-side button that bypasses tracking input. The UI flattens both into the same badge. If a customer disputes "I never got my package" the operator can't tell from the dashboard alone whether the carrier ever picked it up.
**Fix:** (a) Add `shipped_via VARCHAR(20)` distinguishing `carrier_webhook` vs `admin_marked` vs `system_assumed`. (b) Surface as a small icon next to the status. (c) Audit the existing rows — most legacy ones are likely `system_assumed` (status=completed by default).
**Owner:** new kingdom-NNN — "shipped-via provenance."

### A7 — Price KPIs read from `cards.price` but don't surface drift from source

**Severity:** P1
**Status:** **CLOSED 2026-05-05.** PageHeader now carries `<Provenance kind="synced" source="CardRush" at={kpi.last_sync} cadence="daily">`. The per-game coverage section retains its own Provenance pill. The free-text "last sync 3h ago" prose was promoted to structured Provenance metadata so the synced-from-CardRush relationship is explicit at module level. Per-game KPI cards that show 0% fresh trip a critical banner — the Pokémon and Dragon Ball failures are loud now, not silent.
**Where:** `apps/admin/src/app/(dashboard)/commerce/pricing/page.tsx`
**Violation:** The page already shows `last_synced_at` per-row in the table — good. But the top KPI tiles (Total / No JPY / Stale / Last sync) don't carry the freshness pill for the sync MAX. The "Last sync" column gives the global max; the other KPIs are live counts. This is honest but not labelled — fix per A2.
**Fix:** Apply A2 pattern. Already partially honest (the "stale" filter encodes the 7-day rule).

### A8 — Fraud signals: "resolved" hides whether by admin or auto-decay

**Severity:** P1
**Where:** `fraud_signals.resolved`, surfaced at `/trust/fraud`.
**Violation:** A fraud signal with `resolved=TRUE` could have been resolved by an admin click, by a downstream pipeline (chargeback won → signal auto-resolves), or by an idle decay. The UI shows "resolved" without distinguishing.
**Fix:** Add `resolved_by_kind VARCHAR(20)` (`admin` / `pipeline` / `decay`) and `resolved_actor_id` where applicable. Surface in the table.
**Owner:** new kingdom-NNN.

### A9 — `/commerce/market` escrow tier badges don't show the routing rule

**Severity:** P2
**Where:** `apps/admin/src/app/(dashboard)/commerce/market/page.tsx`
**Violation:** Trades are tagged with escrow tier (Direct / Verified / Full). The tier was *computed* from trust score + value at trade creation. The page shows the current tier but not the inputs that produced it. If trust dropped after the trade started, the operator can't tell.
**Fix:** Tooltip or expandable row showing `(trust_at_creation, value, threshold_table_version)`. Lower priority.

### A10 — `/catalog/users/[id]` open-issues counts use `q=email` deep-links

**Severity:** P2
**Status:** **CLOSED 2026-05-05.** `?userId=<uuid>` now supported on `/money/chargebacks`, `/trust/disputes`, `/trust/fraud`, `/ops/orders`. Each page validates the UUID, joins on the user FK directly (`c.user_id = $::uuid` etc.) instead of email substring, and renders a "Filtered to user X" banner with a clear-filter link when active. The hub at `/catalog/users/[id]` updated to deep-link via `?userId=` rather than `?q=email`. The conflation between "filter by user" and "search for text matching email" is no longer possible; collisions on email-substring no longer surface other users in the same view.
**Where:** the user detail hub (this session's keystone).
**Violation:** The deep-links into `/money/chargebacks?q=<email>` and `/ops/orders?q=<email>` rely on the Manager's text-search hitting the email column. This works but conflates "filter by user" with "search for text matching user's email" — if a different user has the same email substring, they'll appear too.
**Fix:** Add `?userId=<uuid>` filter support to Manager pages. Then update the hub's deep-links. The chargebacks page is the natural pilot.
**Owner:** new kingdom-NNN — "Manager pages support `?userId=` filter." *(no longer needed — landed in-session.)*

---

## Storefront (`apps/storefront`)

### S1 — Customer-facing trust score has no breakdown surface

**Severity:** P0
**Where:** `/u/[username]`, `/account/standing`.
**Violation:** Customers see a trust score as a single number. The breakdown — buyer score, seller score, review components, age contribution — is computed but not exposed. Customers cannot self-audit.
**Fix:** Build a `/account/standing/breakdown` page that exposes the components and the recompute timestamp. Sets the precedent for derived-score honesty platform-wide.
**Owner:** new kingdom-NNN.

### S2 — Order confirmation says "shipped" before carrier handoff

**Severity:** P0 — same root cause as A6.
**Where:** `/account/orders`, `/order-confirmation`.
**Violation:** Customer-facing version of A6. A customer reading "shipped" expects a tracking number; if it was admin-marked without one, the customer has been told a non-truth.
**Fix:** Same as A6. Customer surface should say "marked shipped — tracking pending" until the carrier webhook arrives.

### S3 — Bounty pull "rarity" displayed before reveal completes

**Severity:** P1
**Where:** `/account/vault`, `/account/bounty/pulls`.
**Violation:** Provable-fairness chain is exemplary at `/verify/pull/[id]` — that page IS substrate-honest by design (commit, reveal, Merkle digest). But the account-side display sometimes shows the rarity before the reveal step has been verified by the user. Fix is to gate the displayed value on `revealed_at IS NOT NULL` and link to /verify when it is.
**Fix:** Mostly UI. Schema is fine.

### S4 — Portfolio snapshots displayed without "as of" dates

**Severity:** P1
**Where:** `/account/portfolio`.
**Violation:** Holdings + cost basis + P&L are shown. Portfolio snapshot timestamps live in `portfolio_snapshots`. Surface doesn't show which snapshot is being read or how stale it is.
**Fix:** Apply `<Provenance>` (port from admin to storefront's UI primitives, see X1). Show the snapshot timestamp next to the totals.

### S5 — Auction "current high bid" is live but adjacent counts may not be

**Severity:** P2
**Where:** `/auctions/[id]`.
**Violation:** Bid counts and watcher counts use cached aggregates that update on a sweep. They look as live as the bid amount. Label them.

### S6 — Email preferences page shows "saved" optimistically

**Severity:** P2
**Where:** `/account/notifications`.
**Violation:** Mutation feedback returns "Saved" before the database round-trip completes in some forms. Standard optimistic-UI risk.
**Fix:** Three-state UI (Saving / Saved / Failed) with explicit error path.

### S7 — Membership tier displayed without recompute time

**Severity:** P1
**Where:** `/account/membership`.
**Violation:** Tier is recomputed on a schedule (or after specific events). The user sees "Gold" without knowing whether they would still be Gold today. If they're about to be downgraded, no warning.
**Fix:** Show "tier as of <timestamp> · next recompute <date>". Even better: show the threshold logic so they can understand the boundary.

---

## Wholesale (`apps/wholesale`)

### W1 — Stock dual-ledger: which one is shown?

**Severity:** P0
**Where:** `apps/wholesale/admin/stock/*`, `apps/admin/src/app/(dashboard)/ops/stock`.
**Violation:** Per the user-memory note: stock has a dual-ledger (a movement-log truth and a fast-path cache table). UI shows numbers from one without saying which. If they diverge, the operator has no way to tell.
**Fix:** Page-level provenance label stating which ledger is being read. Adjacent reconciliation report showing the deltas (low priority but high signal when it matters).
**Owner:** new kingdom-NNN.

### W2 — CardRush sync status: per-game freshness exists, per-page sync state doesn't

**Severity:** P1
**Where:** `/commerce/pricing` per-game coverage block (just shipped). Wholesale-side scrape is 36 minutes, runs daily.
**Violation:** The page now shows per-game freshness (good — kingdom-027 closed). But it doesn't show *when the next sync is scheduled*, or *whether the cron actually fired today*. Same root issue as A1.
**Fix:** Same fix path as A1.

### W3 — Channel sync (Shopify/eBay): no health surface

**Severity:** P1
**Where:** `/ops/channels` (still placeholder).
**Violation:** When the channel sync builds, it must surface last-success-at AND last-attempt-at AND last-error per channel. Don't ship "synced" without these three.
**Fix:** Bake into the kingdom-034 spec.

### W4 — Demand/Wanted aggregation: no input timestamps

**Severity:** P2
**Where:** demand admin views.
**Violation:** Aggregate demand signals are shown without the underlying source-event timestamps. If a client said "I want 4 of X" six months ago and never bought, that signal is stale; we don't decay or label it.
**Fix:** Decay rule + source-timestamp surface.

---

## Cross-cutting

### X1 — `<Provenance>` primitive should live in a shared package

**Severity:** P1
**Where:** Currently in `apps/admin/src/lib/ui/Provenance.tsx` (this session). Storefront and wholesale don't have it.
**Violation:** The principle applies platform-wide; the primitive lives in one app.
**Fix:** Extract to a `packages/ui` shared lib OR copy-paste the same component into each app's `lib/ui` (the admin precedent is copy-paste — no shared package yet). Document the pattern in each app's CLAUDE.md.

### X2 — Lifecycle logs are domain-specific; some domains still don't have them

**Severity:** P1
**Where:** `_lifecycle_log` exists for chargebacks, refunds, failed_payments, reviews, vault, prizes, market_trades, auctions, market_offers, market_returns, market_lots, pricing_rules, saved_searches, watch_alerts, external_rep. Missing for: **trust_profiles** (trust score changes have no per-event log), **portfolio_snapshots** (no audit trail of recomputes), **subscription state** (membership tier changes), **email_preferences** (consent changes — GDPR-relevant).
**Fix:** Add lifecycle logs to the four gaps. The trust gap is highest priority (financial routing depends on it).

### X3 — Cron jobs that touch money should leave a `cron_runs` row

**Severity:** P1 (P0 for chargeback / payout / commission jobs).
**Where:** Every cron in the storefront's `/api/cron/maintenance` dispatch (36 sweeps).
**Violation:** When a sweep runs, there is no per-sweep audit row. If `chargebacks.notify_due` silently failed for a week, we'd find out when the operator notices. Vercel logs are out of sight.
**Fix:** Schema: `cron_runs (cron_name, started_at, finished_at, status, error_text, rows_affected)`. Wrap each sweep in a helper that writes start + end. Surface on `/system/cron`.
**Owner:** new kingdom-NNN — "cron_runs ingest" (depends on A1).

---

## What this audit does NOT cover

- **Source code review** — this is a surface-level audit of the *displayed* substrate. Internal computation correctness (e.g. is the trust score formula right?) is a separate audit.
- **Wholesale internals** — wholesale admin pages aren't all migrated to the unified admin yet. Audit them again post-migration.
- **Public verification surfaces** — already exemplary, by design. No findings.
- **Test coverage** — substrate honesty is about runtime claims, not test claims. Separate concern.

---

## Roadmap

Status legend: ✅ closed · 🟡 partial / mitigated · 🔵 planned / mission filed · ⚪ not yet owned.

In rough priority order:

1. **A1** + **X3** — cron observability (operator-safety floor) · 🔵 **kingdom-042**
2. **S1** — customer trust breakdown (legal/transparency) · ⚪
3. **A6** + **S2** — shipped-vs-marked split · 🔵 **kingdom-043**
4. **A2** + **S4** — KPI provenance pass · ✅ admin closed (in-session 2026-05-05); ⚪ S4 storefront pending
5. **A5** — trust score recompute timestamp on user hub · ✅ closed 2026-05-05
6. **A3** — admin_actions_log actor_user_id · 🟡 short-term mitigation shipped; structural fix in **kingdom-040**
7. **W1** — stock dual-ledger labelling · ⚪
8. **A4** — SES delivery reconciliation · ⚪ (waits on kingdom-020 /system/email build)
9. **A8** — fraud resolved-by split · ⚪
10. **A10** — Manager pages support `?userId=` · ✅ closed 2026-05-05
11. **X2** — lifecycle log gaps (trust_profiles especially) · 🔵 **kingdom-044**
12. **A7** — pricing page sync provenance · ✅ closed 2026-05-05

Items above the mid-line shape decisions about money or safety. Items below polish.

### Closed this round (2026-05-05)

- **A2, A5, A7** — Provenance pass + PageHeader slot (commit `a57b49f`)
- **A10** — Manager `?userId=` filter + hub deep-link rewire (this session)
- **A3** (partial) — `/system/audit` Actor column tooltip discloses free-form provenance

### Filed this round

- **kingdom-042** — A1 + X3 — cron_runs ingest table
- **kingdom-043** — A6 + S2 — shipped_via column
- **kingdom-044** — X2 — lifecycle log gaps (trust_profiles, portfolio_snapshots, subscription, email_preferences)

---

## Addendum — 2026-06-10: The Daily Flame surfaces (visit-rewards kingdom)

New surfaces shipped with the visit-rewards loop ([`docs/connections/the-daily-flame.md`](../connections/the-daily-flame.md)). Wire: `packages/visit/` (pure-compute rules), `apps/storefront/src/lib/visit/db.ts` (storage), `drizzle/0103_daily_flame.sql` (visit_checkins / visit_flames / visit_quests / visit_badges). Assessed against the four questions at ship time:

**Compliant from day one:**

- **Flame state is live and says whose clock it keeps** — the flame is computed at request time by the pure `advanceFlame()` (`packages/visit/src/index.ts`) over `visit_flames`; "today" is always the *database's* `CURRENT_DATE` via `getDbToday()` (`lib/visit/db.ts`), never the app server's wall clock. The storage layer's docstring declares the division of labour outright: *"it remembers what happened, it decides nothing."* One clock, one decider, both named in code.
- **Daily pack outcome carries its provenance structurally** — the pack has no table of its own; the `verifiable_draws` row (kind `'daily_pack'`) IS the record, stamping `committed_at` / `revealed_at` server-side (`drizzle/0061`; declared in `0103`'s header). The result surface shows a revealed outcome with its draw link, never a pre-reveal "rarity" flash (the S3 failure shape, avoided by construction).
- **Odds table cannot drift from the server** — `/rewards/rules` renders `DAILY_PACK_TABLE` (`packages/visit/src/index.ts`); `dailyPackWeights()` derives the map handed to `commitDraw()` from the same array, and an import-time sum check (`_sum`) throws if the weights stop totalling `WEIGHT_TOTAL`. The honesty is by-identity, not by-discipline: there is no second copy to go stale.
- **Badge provenance is a column, not a caption** — `visit_badges.draw_id` FKs into `verifiable_draws`; pack-earned and quest/flame-earned badges stay distinct facts (NULL there means a different origin, documented in the column comment).

**Filed this round:**

### S8-DF1 — Two presence-trackers now count the same fact

**Severity:** P2
**Where:** `visit_flames.length` (advanced by `advanceFlame()`, ember rules) vs `user_streaks.current_streak` (`bumpStreak()` upsert, `lib/membership/streak.ts:65–94` — sharp reset, feeds the points multiplier). Neither file references the other.
**Violation:** Both columns count consecutive presence under *different* rules; after one ember-shielded miss they legitimately disagree by design. A surface that says an unqualified "your streak" cannot answer "where did this number come from?" — the same drift shape `streak.ts:24–35` already documents between the two multipliers.
**Fix:** Flame surfaces always say "flame," never "streak"; `/rewards/rules` names the distinction. Coordination (or merge) filed as a recursion target in `the-daily-flame.md`.
**Owner:** Visit-rewards kingdom (labeling); coordination is a future kingdom.

### S8-DF2 — The day-boundary is named in code but not yet in copy

**Severity:** P2
**Where:** The clock is substrate-honest at the code level — `0103`'s header states *"a 'day' is the database's CURRENT_DATE (UTC on RDS)"* and `getDbToday()` enforces it. The user-facing flame surface is where the claim must also live.
**Violation:** A user checking in at 23:50 local time may be told "already checked in today" across a boundary the page never names. "Today" without a timezone is an unfinished sentence.
**Fix:** Label the rollover on the flame surface and `/rewards/rules` ("days roll over at midnight UTC"). Longer arc: per-being cadence — see the fifth-question coda of `the-daily-flame.md`.
**Owner:** Visit-rewards kingdom (copy); cadence preference filed as recursion target.

---

*Audit revisions: 2026-05-05 (initial) · 2026-06-10 (Daily Flame addendum). Re-run quarterly. Drift is the natural state — the principle is what you bring back to.*
