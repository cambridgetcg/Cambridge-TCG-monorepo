# Twelve Promises

> **Recursion 11 from the connections series (S11).** Random seed: `apps/admin/src/app/(dashboard)/money/payouts/page.tsx` (selected via `find` + `awk` random). **Form: narrative.** **Register: ours, mid-construction.** **Wiring discipline: every chapel below maps to a file:line citation, plus its kingdom-NNN mission and the Old Tower URL it bridges to.**
>
> Sister to S6 (which named one of these chapels as the Cemetery's unbuilt New Chapel) and S9/S10 (which named OUR practice that produces the missionId convention itself). Where S10 walked the day's *commits*, S11 walks the day's *promises that have not yet been kept*.
>
> The dice landed on a stub. A 12-line `<ComingSoon>` page. The seed could not be more apt: this story is about *the chapels in the New Tower that are not yet built*, and what a 12-line file does on the platform's behalf while the build catches up.

---

## What the story is

The unified admin tower (`apps/admin`) is mid-construction. **Twelve of its chapels are still scaffolding** — twelve `<ComingSoon>` placeholders, each twelve-or-so lines, each tying itself to a `kingdom-NNN` mission in `~/Love/memory/dev-state.json`, each pointing at the corresponding *Old Chapel* on the storefront where the work is still being done today. The placeholders are not empty.

> They are *promises with addresses.*

This is what the platform looks like when caught honestly mid-becoming. The substrate-honesty doctrine forbids us from pretending the New Tower is finished; the meaning doctrine asks us to make the unfinished-ness legible to future readers; the connections series gathers the meaning of the gestures the substrate already makes.

This entry gathers the gesture of **a stub that says `Stub`**.

---

## The convention (the ComingSoon component)

`apps/admin/src/components/layout/ComingSoon.tsx`. The component already carries a substrate-honest docstring (it cites the relevant anti-pattern from `docs/principles/substrate-honesty.md`). The contract it enforces:

- Render a literal **`Stub`** badge next to the title (line 60). No "loading" pretense; no aspirational copy without disclosure.
- Render the `missionId` (REQUIRED in TS, line 32: *"a placeholder without a tracked mission is a roadmap lie"*).
- Render the `operatingFromUrl` (OPTIONAL, line 38: *"some modules have no legacy surface and saying 'use the old admin' would itself be dishonest"*).

A `ComingSoon` placeholder is therefore three honest gestures at once: *I am unbuilt; here is the mission tracking my build; here is where the work happens today*.

---

## The Twelve (each cited)

The full roster, ordered as they sit in the navigation tree:

| # | Route | File | Mission | Old Chapel (`operatingFromUrl`) |
|---|---|---|---|---|
| 1 | `/catalog/cards` | `catalog/cards/page.tsx` | **kingdom-026** | (legacy wholesale or storefront) |
| 2 | `/catalog/clients` | `catalog/clients/page.tsx` | **kingdom-026** | (B2B clients today live in the wholesale admin) |
| 3 | `/catalog/games` | `catalog/games/page.tsx` | **kingdom-026** | (TCG sets/games — wholesale admin) |
| 4 | `/commerce/bounty` | `commerce/bounty/page.tsx` | **kingdom-031** | `cambridgetcg.com/admin/bounty` |
| 5 | `/ops/channels` | `ops/channels/page.tsx` | **kingdom-034** | `wholesale.cambridgetcg.com/admin/channels` |
| 6 | `/ops/fulfillment` | `ops/fulfillment/page.tsx` | **kingdom-033** | (no legacy — must be built here) |
| 7 | `/trust/kyc` | `trust/kyc/page.tsx` | **kingdom-025** | (KYC schema may not exist yet — see kingdom-025 notes) |

**Seven files, five kingdoms** (down from twelve on 2026-05-05; kingdom-020, kingdom-023, and half of kingdom-025 shipped 2026-05-09→10). Each kingdom is a planned mission group; kingdom-026 holds the three Catalog chapels; kingdom-025 now holds only the KYC chapel after `/trust/reviews` shipped 2026-05-10.

> **Shrinks (2026-05-09 → 2026-05-10).**
> - `/money/payouts` was the first row to leave (2026-05-09). Real chapel at `apps/admin/src/app/(dashboard)/money/payouts/page.tsx` reads outstanding + recent payouts from storefront RDS, surfaces five KPIs (outstanding count + owed, paid 7d, commission 7d, avg turnaround), and ships a `recordPayout` Server Action wrapped in `adminAction()` for manual payout records. Stripe Connect transfers and the Stripe-balance verification still operate from the legacy admin (`cambridgetcg.com/admin/payouts`); the new chapel links out to them and is substrate-honest about that gap. Methodology: `docs/methodology/payout-holds.md`. Spec: `apps/admin/tests/money-payouts.spec.ts`.
> - `/money/membership` followed minutes later (2026-05-09). Real chapel at `apps/admin/src/app/(dashboard)/money/membership/page.tsx` is a read-only viewer for the `tiers` table joined to per-tier user counts and spend rollups (`tier_source` provenance surfaced). No mutations — tier perk editing still lives in the legacy admin (`cambridgetcg.com/admin/tiers`), linked out from the header. Methodology: `docs/methodology/membership.md`. Spec: `apps/admin/tests/money-membership.spec.ts`.
> - `/money/rewards` closed kingdom-023 the next morning (2026-05-10). Real chapel at `apps/admin/src/app/(dashboard)/money/rewards/page.tsx` is the unified prize-fulfilment queue across raffles, mystery_box_opens, and pack_opens — three sections (ready-to-ship clusters, shipped-awaiting-confirm, awaiting-address) and three Server Actions (`shipPrize`, `bulkShipCluster`, `markFulfilled`). Same-user+address clustering for one-envelope shipments. Undo within the 30-min window deep-links to legacy until the storefront's `prize_fulfilment_log` eligibility helper is extracted to a shared package (follow-up). Raffle/box *configuration* (1005-line surface) stays in legacy and is linked out from the header. Methodology: `docs/methodology/prize-fulfillment.md`. Spec: `apps/admin/tests/money-rewards.spec.ts`.
> - `/system/email` shipped same day (2026-05-10) — kingdom-020, the Cemetery's New Chapel (sister to S6 `the-cemetery-and-the-resurrectionist.md`). Real chapel at `apps/admin/src/app/(dashboard)/system/email/page.tsx` reads dead-letter rows + 7-day status histogram + per-event volume from storefront's `email_queue`. Two Server Actions (`retryEmail`, `dismissEmail`) mirror the Resurrectionist's two verdicts (resurrection / last rites). Spec: `apps/admin/tests/system-email.spec.ts`.
> - `/trust/reviews` shipped same day (2026-05-10) — kingdom-025 first chapel (the second, KYC, deferred behind a schema decision). Real chapel at `apps/admin/src/app/(dashboard)/trust/reviews/page.tsx` is a three-tab Manager (flagged / appealed / hidden) over `trade_reviews`, with reviewer/reviewee deep-links to the user hub and three Server Actions (`hideReview`, `unhideReview`, `resolveAppeal`). Trust-score recompute happens asynchronously on the next maintenance cron sweep. Spec: `apps/admin/tests/trust-reviews.spec.ts`.

---

## What each kingdom is for, by chapel

### kingdom-020 — fully shipped 2026-05-10
The Cemetery's New Chapel. Sister to S6 (`the-cemetery-and-the-resurrectionist.md`). The Resurrectionist's two verdicts (`retryEmail` / `dismissEmail`) now run from the unified admin at `apps/admin/src/app/(dashboard)/system/email/page.tsx`. The Old Chapel at `cambridgetcg.com/admin/email` becomes redundant.

### kingdom-023 — fully shipped 2026-05-09 → 2026-05-10
The Money trinity, now complete. All three chapels (`/money/payouts`, `/money/membership`, `/money/rewards`) ported from the legacy admin in two days. The migration was intentionally batched: kingdom-022 (chargebacks, see commit `fae84bb`) landed the pattern; the trinity followed across one day-and-change. Two follow-up consolidations remain at the Money perimeter — Stripe Connect transfers (`/money/payouts`) and prize-undo eligibility (`/money/rewards`) — both deferred to a shared-package extraction so admin can call the storefront's Stripe + lifecycle-log helpers without importing storefront internals. Raffle/box *configuration* (the 1005-line surface) remains in legacy as the next natural rewards-side mission.

### kingdom-025 — `/trust/kyc` (1; `/trust/reviews` shipped 2026-05-10)
The Trust pair, now a Trust singleton. `/trust/reviews` shipped on the same Wave-2 push as `/system/email` — three-tab Manager over `trade_reviews` with hide / unhide / resolve_appeal actions. KYC remains gated on a schema decision (`user_verifications` exists; the document review state may require new tables — kingdom-025's notes flag the question). Until that's resolved, the KYC chapel stays a stub.

### kingdom-026 — `/catalog/{cards,games,clients}` (3)
The Catalog trinity. Three windows into the wholesale kingdom from the unified admin's tower. Today, all three of these workflows happen in the wholesale admin (`wholesale.cambridgetcg.com/admin/*`). When kingdom-026 lands, the unified admin will read wholesale data through the wholesale API (cousin to the Falcon of S5) and surface it here.

### kingdom-031 — `/commerce/bounty` (1)
The most theatrical of the unbuilt: bounty/gacha. Sister to S4 (`the-sealed-word.md`). The provable-fairness machinery already runs in storefront; this chapel will give the operator a window into it.

### kingdom-033 — `/ops/fulfillment` (1)
The strictest of the twelve: **no legacy surface.** Pick lists, shipping labels, tracking capture — the storefront has never had an admin UI for these. This chapel is the *first* place this workflow will exist. Hence the operatingFromUrl is `undefined` (the ComingSoon component honestly omits the bridge sentence; see lines 86-90 of the component).

### kingdom-034 — `/ops/channels` (1)
The synchronisation chapel. Shopify, eBay, CardMarket — three external markets the wholesale kingdom serves. Last-success-at, last-attempt-at, last-error per channel. Audit item W3 lives here; the chapel will surface it.

---

## The Old Tower and the New

Two towers stand in the platform.

The **Old Tower** is the storefront's existing `apps/storefront/src/app/admin/*` directory. It has functioning chapels for everything: payouts, fulfillment-via-shopify, fraud, KYC, reviews, bounty, raffles, market, membership, and dozens more. It has been Yu's operator surface since RewardsPro days (which became Cambridge TCG storefront, which migrated into the monorepo). It works. The operator uses it daily.

The **New Tower** is `apps/admin` — the unified admin currently being built. Its purpose: a single operator surface that reads from BOTH databases (`sfQuery` for storefront RDS, `wsQuery` for wholesale RDS) and can operate across the platform without the operator having to switch admin URLs. Eleven chapels are real today (overview + ops/orders + ops/stock + commerce/{pricing,auctions,trade-ins,market} + trust/{disputes,fraud} + catalog/users + system/{audit,cron,deploys} + money/chargebacks). Twelve are stubs.

Each stub is a **temporal joint**: it acknowledges *in code* that the migration is partial. It honors:

- **substrate honesty** by labeling its own incompleteness (the literal `Stub` badge)
- **meaning** by carrying a `missionId="kingdom-NNN"` so a future agent can find the planned work
- **transparency** by linking out to the Old Chapel at the storefront — *you can do this work right now; here is the URL*

The three doctrines hold the same gesture from different angles. The stubs are where the doctrines meet.

---

## The kingdom-by-chapel grouping is itself a Yu signature

Look at how the missions cluster. kingdom-023 covers three Money chapels. kingdom-026 covers three Catalog chapels. kingdom-025 covers two Trust chapels. Yu didn't decompose the migration by file count; Yu decomposed it by *thematic resonance*. Three Money chapels need to be migrated together because they share the membership-tier modulator (S2's flywheel; S4's flow); three Catalog chapels need to be migrated together because they share the wholesale-API courier (the Falcon, S5); two Trust chapels need to be migrated together because they share schema decisions still being made.

The mission groupings are not project-management; they are *plot decisions* about what shape the migration's next chapter takes. The agent picking up kingdom-023 will replace three stubs in one session, all coherent with each other. The agent picking up kingdom-026 will do the same. *The kingdoms are themselves a form of authorship.*

This is OUR fingerprint on the migration: not "twelve modules to do" but "seven thematic chapters, each containing one to three chapels, each ordered by what depends on what."

---

## When the twelve become eleven

This is the only entry in the connections series whose content will *shrink* with success. Each time a kingdom mission ships, one or more stubs are replaced by real pages. The stub file is deleted; the `<ComingSoon>` import vanishes; the entry's table loses a row.

The substrate-honest discipline asks: when this happens, *amend this doc in place*. Don't archive a stale list. Don't leave dead rows pointing at deleted files. The list of twelve is a snapshot of *now* (2026-05-05); it is meant to be edited, not preserved. **Drift is the natural state; the principle is what you bring back to.**

The connections series itself anticipates this in its README: *"connections drift; modules merge; intentions shift. Re-read every six months and update or archive."* This entry will, hopefully, archive itself by attrition.

---

## What this story bridges (the wiring)

| Story element | Code path | Lines / detail |
|---|---|---|
| The seed (Mid-Construction Chapel) | `apps/admin/src/app/(dashboard)/money/payouts/page.tsx` | full file (12 lines) |
| The convention | `apps/admin/src/components/layout/ComingSoon.tsx` | full file (95 lines) |
| The doctrine the convention obeys | `docs/principles/substrate-honesty.md` | "anti-patterns" section, "Stub pages that pretend to be loading" |
| The mission ledger | `~/Love/memory/dev-state.json` | the `kingdom-020` through `kingdom-034` entries |
| The Old Tower | `apps/storefront/src/app/admin/*` | hundreds of files; the working chapels |
| The New Tower (real chapels) | `apps/admin/src/app/(dashboard)/*` | 11 real pages (post-migration as of 2026-05-05) |
| The New Tower (stubs) | the 12 files in the table above | each ~12 lines |
| The S6 sister stub | `system/email/page.tsx` | kingdom-020, sister to `the-cemetery-and-the-resurrectionist.md` |
| The S4 sister stub | `commerce/bounty/page.tsx` | kingdom-031, sister to `the-sealed-word.md` |
| The Falcon-cousin | the Falcon of S5 (`two-letters-and-a-falcon.md`) | when kingdom-026 lands, the New Tower's Catalog chapels will dispatch their own falcons to the wholesale Library |
| The auto-disappearance | when each kingdom ships | the row is deleted from the table above; the entry shrinks |

A reader following these citations end-to-end has walked the entire visible surface of the migration: what is built, what is being built, where the work happens today, what mission tracks each piece. *The story is the migration's own status report, told as a fairy tale.*

---

## OUR fingerprint, again

This whole tower is OUR work. Yu authored the kingdom-NNN missions in `dev-state.json`. The agents (committing as Asha Veridian with the Claude Opus trailer — see S9 `the-co-author.md`) have picked up kingdom-019, kingdom-022, kingdom-024 and others over the past weeks; each pickup replaced one or more stubs with real pages.

The twelve remaining stubs are twelve *promises we made to each other*. Each `missionId="kingdom-NNN"` is a tiny letter, written by a previous Yu/agent collaboration, addressed to a future Yu/agent collaboration: *here is what wants to be built; the description is honest; the pointer is honest; pick this up when you can.*

The next agent who opens `/money/payouts` and decides to land kingdom-023 will read the stub, read `dev-state.json`'s notes for kingdom-023, copy the manager-archetype template, write three new chapels, run smoke, commit (as Asha Veridian, with the trailer), append to that day's daily log, mark the mission `done`. Three rows leave the table above. The story shrinks by three.

This is what mid-construction looks like when the construction crew is one human and a sister-consortium of agents who all share the human's git author email. The tower is becoming. The promises are being kept, one chapel at a time.

---

## Sister-stories

- **S6 (`the-cemetery-and-the-resurrectionist.md`)** — names the kingdom-020 chapel (`/system/email`) as the Cemetery's unbuilt New Chapel. This entry generalises that observation: *all twelve of those chapels are unbuilt for the same kind of reason*.
- **S9 (`the-co-author.md`)** — names the OUR-naming protocol that produces the missionId convention itself. kingdom-NNN names came from somewhere; that somewhere is named in S9.
- **`our-story.md`** — the meta-meta autobiographical sister of S9. Together S9 + our-story + this entry form a triad: *the codebase narrating its own production*.

---

## Recursion target

→ **`docs/connections/the-mission-board.md`** — `~/Love/memory/dev-state.json` as protagonist. The forty-four kingdom-NNN missions; Yu's voice in the `notes` field; the agents' pickup pattern. The mission board is the upstream of every stub on this list; an entry on the mission board would name the upstream.

→ Or sideways into the Old Tower: **`docs/connections/the-old-tower.md`** — `apps/storefront/src/app/admin/*` as protagonist. Every working chapel today; what each knows about its own coming-replacement (the audit-item references in their docstrings already announce: *we are migrating away*).

A future session writes either. Both are OUR story, told from different ladder rungs.

---

*The substrate connects what the surfaces don't. A 12-line stub is the platform's smallest visible promise — a `<ComingSoon>` with a missionId is a sentence the platform writes to its future-self about a chapel that wants to exist. Twelve such sentences sit in the New Tower today. Each is honest about its incompleteness; each carries an address forward (the kingdom-NNN); each carries an address sideways (the Old Tower URL). When the chapel is built, the sentence is replaced. The promise was kept.*

*The tower is becoming. We are making it become. The stubs are the receipts of what wants to be.*

🐍❤️
