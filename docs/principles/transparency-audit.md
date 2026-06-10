# Transparency — audit (2026-05-05)

Read [`transparency.md`](./transparency.md) first for the principle.

This audit lists where the platform currently makes user-affecting decisions without making them inspectable. Severity scale matches [`substrate-honesty-audit.md`](./substrate-honesty-audit.md): **P0** = the affected user has financial or safety stake and no recourse; **P1** = decision is opaque but stakes are bounded; **P2** = mild opacity, polish-grade.

> **Status updates.** As items ship, mark **CLOSED** inline with the date and PR/commit. Never delete — the history of what was wrong is itself part of the audit trail.

---

## Storefront (`apps/storefront`)

### T1 — Trust score has no methodology page or breakdown surface

**Severity:** P0
**Where:** `/u/[username]`, `/account/standing`. Formula in `apps/storefront/src/lib/escrow/trust-engine.ts:1–16`.
**Violation:** A user sees "Trust score: 73" with no explanation of what produced it. The trust score gates trade limits, escrow tier routing, and commission rates — material money decisions. The formula is fully documented in code (six positive components + four penalty types) but never surfaced to the user. No `/methodology/trust-score` page exists.
**Fix:** (a) Build `/methodology/trust-score` lifting the formula from the code, with a link to the source. (b) On `/account/standing`, render the user's own breakdown — completion rate, review score, age, verification, external rep, penalties — alongside their score. (c) Drop a `<WhyLink>` next to every place the score is displayed. (d) When the formula changes, append to `/methodology/changelog`.
**Owner:** new kingdom-NNN — "trust score methodology + breakdown."

### T2 — Membership tier rules aren't documented anywhere users can read

**Severity:** P0 (when downgrades happen) / P1 otherwise.
**Where:** `/membership`, `/account/membership`. Tier table in `tiers` (storefront DB).
**Violation:** Users land on Bronze/Silver/Gold/Platinum/OG without a public surface explaining the spend thresholds, the perks, or the recompute cadence. When a user is downgraded, they have no methodology to point at.
**Fix:** `/methodology/membership-tiers` — table of thresholds, perk matrix, recompute cadence. Add `<WhyLink>` from `/membership` and `/account/membership`.
**Owner:** new kingdom-NNN.

### T3 — Pricing has no public methodology

**Severity:** P1
**Where:** `/market/[sku]`, `/catalog/*`. Pricing engine at `apps/wholesale/src/lib/pricing.ts`.
**Violation:** A customer sees "£5.20" without any way to understand why. The wholesale pricing engine applies margin + flat fee + VAT to a CardRush JPY price; that derivation is invisible to the customer. (The admin retrofit ships freshness via `<Provenance>`, but the customer-facing surface has nothing.)
**Fix:** `/methodology/pricing` — explain the JPY → £ conversion path, the margin policy, the daily sync, link to the source. `<WhyLink>` next to displayed prices on key surfaces.
**Owner:** new kingdom-NNN.

### T4 — Escrow tier (Direct / Verified / Full) is shown but not explained

**Severity:** P1
**Where:** `/account/trades/[id]`, market pages. Routing in `apps/storefront/src/lib/escrow/service-tiers.ts`.
**Violation:** A user starting a trade gets routed to Direct, Verified, or Full escrow based on trust + value + counterparty trust + history. They see the resulting tier but not the rule that selected it. Trade execution feels arbitrary when the routing rule isn't visible.
**Fix:** `/methodology/escrow-tiers` — the routing decision tree with thresholds. On the trade detail page, show "Routed to Verified because ..." referencing the inputs.
**Owner:** new kingdom-NNN.

### T5 — Fraud signals against a user are invisible to that user

**Severity:** P0 (when auto-suspend fires) / P1 otherwise.
**Where:** `fraud_signals` table; surfaced only at admin `/trust/fraud`.
**Violation:** When a fraud signal raises (and especially when it auto-suspends the account), the user has no surface that names the signal type or category. They get a "your account has been suspended" wall. Some opacity is legitimate (don't teach circumvention) but the user is owed at least the *category* that fired (e.g. "payment-pattern signal" / "rapid-trade signal" / "external-source flag") and a path to appeal.
**Fix:** `/account/standing` shows fraud-flag *categories* (not full signal details) with appeal CTAs. Methodology page `/methodology/fraud-categories` lists the categories at the granularity safe to publish. Account-suspended users see this surface even when locked out (read-only, accessible from the sign-in error page).
**Owner:** new kingdom-NNN — coordinate with security policy.

### T6 — Trade-in grading: no per-grade methodology

**Severity:** P1
**Where:** `/account/trade-ins/[id]`, admin `/commerce/trade-ins`.
**Violation:** A user sends cards in, admin grades them, the user sees a number. The grading rubric (Mint / Near Mint / Played / Damaged thresholds) lives in the admin's head and possibly some scattered comments. No `/methodology/trade-in-grading` page. Disputes go to email.
**Fix:** Public grading rubric at `/methodology/trade-in-grading` — what each grade means, photo examples, payout multiplier. On the trade-in detail surface, show "Graded as Near Mint based on <reason>."
**Owner:** new kingdom-NNN.

### T7 — Returns / refund decline reasons aren't structured

**Severity:** P1
**Where:** `/account/returns`, market trade detail.
**Violation:** When a return is declined, the seller and buyer see free-form text. There's no structured reason taxonomy. Users can't tell whether their return was declined for a policy reason vs a discretion reason vs a documentation reason.
**Fix:** Add `decline_reason_kind ENUM` (policy / documentation / discretion / other) plus the existing free-text. Surface the kind explicitly. Document at `/methodology/returns-policy`.
**Owner:** new kingdom-NNN.

### T8 — Bounty pull odds aren't surfaced from the verify pages

**Severity:** P2 — `/verify/*` pages are exemplary already, but the *odds table* (rarity weights per tier) is not linked from the bounty pull experience.
**Where:** `/bounty`, `/account/vault`, `/verify/pull/[id]`.
**Violation:** Users can verify a *specific* pull's fairness (commit-reveal). They cannot easily inspect the prior-probability weights that define the experience as a whole.
**Fix:** `/methodology/bounty-odds` — weight tables per tier, last-changed date, link to source. Linked from `/bounty` and from each `/verify/pull/[id]` page.
**Owner:** Mechanical.

### T9 — Recommendation / featured-listing logic is unmarked

**Severity:** P2
**Where:** `/market`, `/catalog`, search results.
**Violation:** When the platform features or surfaces a listing, that's a decision affecting both the buyer (what they see) and the seller (whose listing gets visibility). No surface describes how listings are ordered.
**Fix:** `/methodology/listing-order` — explain the ranking inputs (price, freshness, seller trust, distance to median). Even a partial answer beats silence.
**Owner:** Lower priority; defer until ranking matters more.

### T10 — Fee structure isn't a single-page reference

**Severity:** P1
**Where:** Scattered across `/auctions/sell`, `/account/payouts`, market trade flow.
**Violation:** Selling fees, escrow fees, payout fees, currency conversion charges — these exist and are applied, but there's no `/methodology/fees` summarising them in one place.
**Fix:** Single `/methodology/fees` page. All fee-applying surfaces link to it.
**Owner:** new kingdom-NNN.

---

## Wholesale (`apps/wholesale`)

### W1-T — B2B pricing methodology not exposed to clients

**Severity:** P1
**Where:** wholesale storefront / client portal.
**Violation:** B2B clients see prices and discounts but no public surface explains the margin formula, the per-channel pricing, or the discount tier mechanics. A client renegotiating their tier has no published reference.
**Fix:** `/methodology/wholesale-pricing` (on the wholesale domain) — formula, channel mapping, discount tiers, sync cadence.
**Owner:** new kingdom-NNN.

### W2-T — Channel parity rules invisible

**Severity:** P2
**Where:** wholesale ↔ Shopify ↔ eBay sync.
**Violation:** When prices on different channels diverge or align, the client doesn't know the rule. Cross-channel parity is a real concern for marketplace partners.
**Fix:** Document the parity policy (e.g. eBay = wholesale × 1.05, Shopify = wholesale × 1.0).

---

## Admin (`apps/admin`)

### A1-T — Admin actions on a user are visible to admins but not the affected user

**Severity:** P1
**Where:** `admin_actions_log` reads at `/system/audit` (admin-side); journey timeline at `/account/standing` (user-side, via storefront).
**Violation:** The journey timeline already surfaces a curated subset of admin actions to the user (suspend, unsuspend, trust override, chargeback received). But the curation is a hard-coded enum (`fetchAdminActions` in `apps/storefront/src/lib/journey/timeline.ts`) and it doesn't include newer action types (e.g. `chargeback.force_resolve`, `dispute.transition.*`). New action types added to admin should automatically be considered for journey inclusion.
**Fix:** Replace the hard-coded enum with a `customer_visible BOOLEAN` column on `admin_actions_log` (default false; explicit opt-in). Action authors decide visibility at write time. Backfill the existing visible-set.
**Owner:** new kingdom-NNN.

### A2-T — Stub pages link to legacy admin without explaining migration state

**Severity:** P2
**Where:** `<ComingSoon>` placeholders across admin.
**Violation:** A `<ComingSoon>` page says "this is a placeholder" (substrate-honest) but doesn't say *why* the legacy page is the canonical surface today, or which migration mission tracks the work. Future operators reading the admin won't know what comes next.
**Fix:** Extend `<ComingSoon>` to link to the relevant `kingdom-NNN` mission entry (where defined). Document this on the placeholder.
**Owner:** Mechanical.

### A3-T — Trust profile breakdown shown to admin but not the user

**Severity:** P0 (asymmetric transparency)
**Where:** `apps/admin/src/app/(dashboard)/catalog/users/[id]/page.tsx` Trust Profile FactCard.
**Violation:** The admin user-detail hub shows trust breakdown (buyer score, seller score, completed/cancelled/disputed trades, reviews, volume, limits, suspension reason). These are facts about the user. The user themselves cannot see most of this on `/account/standing` today.
**Fix:** Mirror the breakdown to `/account/standing`. The user should see at least everything the operator sees about *them*. (Caveat: counterparty PII in dispute history stays masked.)
**Owner:** new kingdom-NNN.

---

## Cross-cutting

### X1-T — No `/methodology` index exists

**Severity:** P1
**Where:** Site information architecture.
**Violation:** Even when individual methodology pages ship, there's no parent index. Users have no entry point to "what does this platform document about its decisions?"
**Fix:** Build `/methodology` (storefront) — list of all methodology surfaces, last-updated date per page, link to changelog. The index *is* the public commitment to transparency.
**Owner:** Land alongside the first methodology page.

### X2-T — No methodology changelog

**Severity:** P1
**Where:** Future state.
**Violation:** When formulas, fees, or thresholds change, today there's no versioned record. A user noticing "my score dropped 5 points overnight with no behavior change" has no way to confirm a formula update.
**Fix:** `/methodology/changelog` — append-only, dated entries per change. Update simultaneously with code change as a CI check (lint rule: `methodology/*.md` and the corresponding source file must be touched in the same PR).
**Owner:** Land with the methodology system.

### X3-T — `<WhyLink>` lives in admin only

**Severity:** P1
**Where:** `apps/admin/src/lib/ui/WhyLink.tsx` (this commit). Storefront and wholesale don't have it yet.
**Violation:** The principle applies platform-wide; the primitive only ships in admin.
**Fix:** Same as substrate audit X1 — extract to a shared primitive or copy-paste per app. Document the pattern in each CLAUDE.md.

### X4-T — Decision receipts pattern not yet implemented

**Severity:** P1
**Where:** Future state. `/account/standing` is the natural home.
**Violation:** No standard surface that says "here is decision X the platform made about you on date Y, here are the inputs, here is the methodology, here is your appeal path."
**Fix:** `<DecisionReceipt>` component + dedicated section on `/account/standing`. Bind to `*_lifecycle_log` rows where the affected user has a stake.
**Owner:** new kingdom-NNN — depends on T1 + T5 landing first to give it content.

---

## What this audit does NOT cover

- **Privacy / data retention** — adjacent concern, separate audit.
- **GDPR / right-to-be-forgotten** — separate compliance concern (but transparency is supportive: a user who can see what's recorded about them can meaningfully exercise data rights).
- **Open-source the platform** — out of scope. Methodology pages link to source; the source itself doesn't have to be public.
- **Pricing-comparison transparency** ("we are X% cheaper than competitor Y") — marketing, not platform transparency.

---

## Roadmap

In priority order:

1. **T1** — trust score methodology + breakdown (the pillar; everything else mirrors this pattern)
2. **X1-T + X2-T** — `/methodology` index + changelog (the scaffolding)
3. **T2** — membership tier rules
4. **T5** — fraud category visibility + appeal path
5. **A3-T** — mirror admin trust breakdown to user
6. **T4** — escrow tier methodology
7. **T3** — pricing methodology (consumer-side; admin side already substrate-honest)
8. **T10** — fee structure single-page reference
9. **T6** — trade-in grading rubric
10. **A1-T** — `customer_visible` on admin_actions_log
11. **X4-T** — decision receipts component + integration
12. **T7, T8, T9, W1-T, W2-T, A2-T** — polish and complete

Items 1–5 are the operator-credibility floor. Below that line is polish.

---

*Re-run the audit quarterly. Drift is the natural state — the principle is what you bring back to.*

---

## Appendix — by-ring findings (Ring 1, 3, 4)

The findings above are organized by app/surface. The doctrine's [four-rings frame](./transparency.md#the-four-rings) calls out a perpendicular view: who is the audience, where is their access path. Most audit findings above are **Ring 2** (subject-side methodology pages, decision receipts). The findings below cover Ring 1 / 3 / 4 gaps that don't fit the by-app structure.

### Ring 1 — Self-transparency (the operator)

**R1-1 — Per-user forensic timeline is in code, not in DB-as-view**
*Severity:* P1.
*Where:* `apps/storefront/src/lib/journey/timeline.ts` (16 sources merged in TS).
*Violation:* The aggregation logic that produces a user's full timeline is application code. To answer "what did the platform do to user X" externally, an auditor must run the same code we ran. There is no SQL view they can replay independently.
*Fix:* Define `vw_user_timeline` materialised view that UNIONs the same 16 sources. Application code consumes the view; auditors can re-run identical queries.

**R1-2 — Admin governance log has no immutability proof**
*Severity:* P1 (P0 if threat model includes admin-side rewrite).
*Where:* `admin_actions_log`.
*Violation:* Append-only by convention, not by enforcement. A row could be edited or deleted without external observers detecting it. With one operator, the operator is also the only person who could detect their own mistakes — there's nobody else to notice.
*Fix:* Daily Merkle root over the day's `admin_actions_log` rows, signed and published at `/verify/governance/<date>`. Future tampering becomes externally detectable.

### Ring 3 — External transparency (the auditor)

**R3-1 — `/verify/*` covers bounty + raffle, missing for auctions / trades / governance**
*Severity:* P1.
*Where:* `apps/storefront/src/app/verify/`.
*Violation:* Provable-fair surface is gold for bounty pulls and raffle draws. Auctions (anti-snipe enforcement, max-bid resolution), market trades (escrow integrity, dispute outcomes), and governance (admin actions over time) have no equivalent.
*Fix:* Build `/verify/auction/[id]`, `/verify/trade/[id]`, `/verify/governance/<date>`. Each adopts the existing commit-reveal + Merkle pattern from `apps/storefront/src/lib/bounty/verify-client.ts` and `apps/storefront/src/lib/rewards/provable-fair.ts`. Split per domain.

**R3-2 — Aggregate fairness page is bounty-only**
*Severity:* P1.
*Where:* `/verify/fairness`.
*Violation:* Chi-squared drift over published rarity weights — exemplary for bounty. No equivalent for: auction snipe-rate, dispute resolution split (favoured-buyer vs favoured-seller), trust-score tier distribution, fraud false-positive rate.
*Fix:* Per-domain fairness panels. Same chi-squared / cumulative-distribution / time-series-of-deltas patterns. Land iteratively.

**R3-3 — Platform aggregate claims have no public proof artifact**
*Severity:* P1.
*Where:* Marketing copy / onboarding pages may make platform-level claims.
*Violation:* Even if accurate, claims with no external data path are non-falsifiable from outside.
*Fix:* Daily aggregates JSON at `/verify/aggregates/<date>` — counts, sums, rates by domain, signed. Auditors can replay deltas day-over-day.

### Ring 4 — Cross-system transparency (the source of authority)

**R4-1 — Stripe IDs in DB but not surfaced in admin UI as Verifiability**
*Severity:* P1.
*Where:* `chargebacks` table has `stripe_dispute_id` + `stripe_payment_intent`; `/money/chargebacks` displays the dispute ID as truncated text but doesn't link to Stripe Dashboard.
*Violation:* Operator force-resolving a chargeback should be one click from the source-of-authority record. Today they copy-paste.
*Fix:* `<Verifiability source="Stripe" id={stripe_dispute_id} href={`https://dashboard.stripe.com/disputes/${stripe_dispute_id}`} />` on every chargeback row.
*Status:* Partially shipping with the same commit as this audit appendix — see `/money/chargebacks` row Verifiability column.

**R4-2 — Shopify + eBay channel sync proofs**
*Severity:* P1 once those channels live (kingdom-034).
*Where:* `/ops/channels` (planned).
*Violation:* Future risk: when channel syncs ship, operators must see channel-side IDs (Shopify order ID, eBay listing ID) and per-channel last-success-at. Build it in from day one.
*Fix:* Bake into the kingdom-034 spec — sync rows include channel-foreign IDs as `<Verifiability>` references.

**R4-3 — SES delivery state not reconciled**
*Severity:* P1.
*Cross-ref:* Substrate-honesty A4.
*Violation:* `email_queue.status='sent'` means handed to SES; the SES message ID is not stored, and bounce/complaint events don't flow back. Operator cannot follow the message into SES's authoritative record.
*Fix:* Add `ses_message_id` column on `email_queue`; render via `<Verifiability source="SES" id={ses_message_id} cite />`. Wire SES SNS notifications for delivery state.

---

## Addendum — 2026-06-10: The Daily Flame surfaces (visit-rewards kingdom)

New user-affecting decision surfaces shipped with the visit-rewards loop ([`docs/connections/the-daily-flame.md`](../connections/the-daily-flame.md)). Wire: `packages/visit/` (rules + reward table), `apps/storefront/src/lib/visit/db.ts`, `drizzle/0103_daily_flame.sql`. Compliance assessed against the eight rules at ship time, not retrofitted:

**Compliant from day one:**

- **Daily pack outcome** — every draw runs through the provable-draw substrate with kind `'daily_pack'` (`apps/storefront/src/lib/provable-draw/index.ts:28–34`), landing a `verifiable_draws` row; the pack deliberately has no table of its own, so the proof row IS the record. "Why did I get this reward?" answers with a link to `/verify/draw/[id]` — full commit-reveal replay, and the verify surfaces gained the `daily_pack` label in the same commit (`app/verify/draw/[id]/page.tsx`, `app/verify/fairness/page.tsx`). This is the first RNG surface to *launch* with Ring 2 + Ring 3 transparency rather than acquire it by migration.
- **Published odds** — `/rewards/rules` renders `DAILY_PACK_TABLE` (`packages/visit/src/index.ts`, integer weights per thousand); `dailyPackWeights()` derives the committed weights from the same array. Single source of truth; published odds and drawn odds cannot drift (the structural closure of the T8 failure shape — odds surfaced at launch, byte-for-byte). When weights change, the page changes in the same commit by construction.
- **Badge provenance** — `visit_badges.draw_id` FKs the badge to the verifiable draw that earned it; the inspection path is a schema column, not UI discipline.
- **Streak rules** — check-in cadence, ember mechanics (one per ISO week, automatic), and the reset rule are documented in plain language on `/rewards/rules` (legible-standard style: We hold / the rules / the odds / the test), linked from the flame surfaces. No purchase affects any of them; the page says so: *the flame is for joy, not obligation — it never costs you anything to lose it.*

**Filed this round:**

### T-DF1 — Ember consumption needs a decision-receipt line

**Severity:** P2
**Where:** `advanceFlame()` (`packages/visit/src/index.ts`) returns the named event `ember_spent`, but `saveFlame()` persists only the resulting state — the event itself is dropped after the response.
**Violation:** The ember is consumed *automatically* when a day is missed — a decision the platform makes about the user without a click. The user can see their remaining ember and (once) the `ember_saved` badge, but the historical fact "an ember was used on <date> to hold your flame" is not durably inspectable afterwards.
**Fix:** Persist flame events (or at least ember spends) and render them as explicit lines in a flame history; consider the journey timeline once the flame emits lifecycle events. Pattern: X4-T decision receipts. The rules half is already done — the event is *named* in the type; persistence is the missing half.
**Owner:** Next rewards iteration (named as recursion target in `the-daily-flame.md`).

### T-DF2 — Quest completion determination is server-judged

**Severity:** P2
**Where:** `WEEKLY_QUESTS` (`packages/visit/src/index.ts`); progress accrues via route-reported events matched by `questsForEvent()`, persisted as counters in `visit_quests.progress`.
**Violation:** "Browse three sets" / "price-check a card" completion is determined by server-side event matching; the user sees progress and done/not-done but not which events counted. Bounded stakes (quests gate shards and badges, not money), but the inputs should be inspectable on the quest detail surface.
**Fix:** Per-quest progress detail listing the counted events with timestamps.
**Owner:** Next rewards iteration.
