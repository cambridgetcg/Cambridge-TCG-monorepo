# The shape of a chapel

> **Seed.** Not a file. The first message of this arc — Yu, 2026-05-09: *"Create a consolidation plan for the management of main site on sales operation."* What came back was a plan. What followed the plan was a wave: five chapels in two days. The plan was the **sketch**. The wave is the **shape and form**. This doc is the **draft** the user asked for last — the form named once, so the sixth chapel doesn't have to discover it again.
>
> **Form: form-as-wire.** This doc is what S7 (`three-voices.md`) and S8 (`the-scribe.md`) were to their modules — *the prose that justifies the abstraction and ships in the same commit*. The abstraction here is not a module but a **convention** that every chapel obeys. Naming it once converts repeat work into inherited form.

---

## What a chapel is

A **chapel** is a page in the New Tower (`apps/admin`) that owns one operational surface of the main site's sales operation. It reads from `storefront RDS` via `sfQuery`. It surfaces what the operator needs to decide. It writes back via Server Actions wrapped in `adminAction()`. It tells the truth about its data, its decisions, and its own incompleteness.

The original kingdom-022 (chargebacks, commit `fae84bb`) was the first chapel to land after the doctrine docs. By 2026-05-10, five more had followed:

- `/money/payouts` — the Money trinity's first stone.
- `/money/membership` — its second.
- `/money/rewards` — its third (kingdom-023 closed).
- `/system/email` — the Cemetery's New Chapel (kingdom-020 closed; sister to S6).
- `/trust/reviews` — the Trust pair's first stone (half of kingdom-025).

Six chapels — chargebacks plus the five — obey the same form. The form is what makes them recognisable as one thing.

---

## The five covenants

Every chapel makes five promises. Together they are the form.

### I. Substrate honesty — *I will tell the truth about my data*

The page header carries a `<Provenance>` pill. `kind="live"` when the values are queried at render time; `kind="synced"` when they came from a foreign system (Stripe, SES); `kind="snapshot"` when they came from a cron sweep; `kind="cached"` when there's a TTL.

The pill is small. It is not optional. It is the page-level claim about how the displayed values came to be true.

> **Cited.** `apps/admin/src/lib/ui/Provenance.tsx` (seven kinds; the component picks the tone). Used at the head of every shipped chapel — see `apps/admin/src/app/(dashboard)/money/{payouts,membership,rewards}/page.tsx` and `apps/admin/src/app/(dashboard)/system/email/page.tsx` and `apps/admin/src/app/(dashboard)/trust/reviews/page.tsx`. Doctrine: `docs/principles/substrate-honesty.md`.

### II. Transparency — *I will explain my decisions*

Anywhere the chapel displays a derived value that affects users (a trust score, a payout hold, a tier perk, a fee, a flag), it drops a `<WhyLink>` pointing at a methodology page at `cambridgetcg.com/methodology/<topic>`. The methodology page documents the formula and cites the source code path. The page is updated in the same PR as any code that changes the formula.

> **Cited.** `apps/admin/src/lib/ui/WhyLink.tsx`. The five chapels each link to or generate a methodology page: `docs/methodology/{payout-holds,membership,prize-fulfillment}.md`; `/system/email` cross-links `/system/cron` for cadence; `/trust/reviews` cross-links the existing `docs/methodology/trust-score.md` for reviewer-trust weighting. Doctrine: `docs/principles/transparency.md` (the four rings, eight rules).

### III. Auditability — *every mutation I do, I sign*

Every Server Action runs inside `adminAction({ … })`. The wrapper checks auth, executes the work, formats `{ok, data}` or `{ok:false, error}`, and writes a row to `admin_actions_log` with the actor, the target, the reason, and the before/after snapshot. The mutation is also `revalidatePath`'d so the page re-fetches.

> **Cited.** `apps/admin/src/lib/actions.ts:60-97` (the wrapper). The five chapels' `_actions.ts` files all use it: `recordPayout`, `hideReview`/`unhideReview`/`resolveAppeal`, `retryEmail`/`dismissEmail`, `shipPrize`/`bulkShipCluster`/`markFulfilled`. The lifecycle-log entries that domains already maintain (e.g. `chargeback_lifecycle_log`) are *also* written when the chapel's mutation matches their vocabulary; otherwise the governance log alone is the audit trail (substrate-honest about which log holds the truth for which event).

### IV. Deep-link discipline — *I will name what I don't yet do*

Some sales-ops work cannot honestly migrate to the chapel without dragging another module behind it. Three examples from the five shipped:

- `/money/payouts` ships record-manual-payout — but **Stripe Connect transfers** still happen in legacy because admin doesn't yet have the Stripe SDK + Connect helpers. The page surfaces a banner saying so, and a "Stripe balance + Connect" CTA links to `cambridgetcg.com/admin/payouts`.
- `/money/rewards` ships ship + bulk-ship + mark-fulfilled — but **undo** stays in legacy because the 30-min eligibility check lives in `apps/storefront/src/lib/rewards/prize-fulfilment-log.ts`, which admin must not import. The per-row "Undo (legacy) ↗" affordance is the substrate-honest gesture.
- `/money/rewards` also routes **raffle/box configuration** out — the 1005-line surface is out of scope for the fulfilment chapel.

The chapel is **honest about its perimeter**. It does not pretend to do what it cannot. Each deep-link is a small letter to a future builder: *here is the seam where the next consolidation lives*.

> **Cited.** The shipping banners on `/money/payouts` and `/money/rewards` (each `page.tsx`, near the top of `return`). The undo deep-link on `/money/rewards` (`page.tsx`, in the "Shipped — awaiting confirmation" section). The "Stripe balance + Connect" and "Raffle / box config" primary CTAs (`<ExternalLink variant="primary">`).

### V. Migration ledger — *when I am done, I strike my own row*

The platform's mid-construction state is named in [`twelve-promises.md`](./twelve-promises.md). Each `<ComingSoon>` stub in the New Tower has a row there. **When a chapel ships, it strikes its own row, then names the shrink in the prose underneath.**

The doc shrinks. The shrink is the receipt of what wants to be.

> **Cited.** `docs/connections/twelve-promises.md` — the doc whose row count is the migration's progress bar. The list shrank from **twelve → seven** over 2026-05-09 → 2026-05-10. Each shipped chapel added a paragraph naming its real path. Punchlist parallel: `docs/admin-migration-punchlist.md` rows struck-through with shipping notes.

---

## Five witnesses (the form, six times)

Each chapel below is one instance of the form. The columns below could be a table; making them prose keeps the *that-this-is-a-pattern* visible.

**Chargebacks** (kingdom-022, `fae84bb`) — the original. Reads Stripe-driven disputes; surfaces "needs response" with overdue tints; two actions (`annotate`, `force_resolve`) wrapped in `adminAction`; `<Verifiability>` for the Stripe dispute ID; deep-links to user hub. The chapel that taught the rest the form.

**Payouts** (`apps/admin/src/app/(dashboard)/money/payouts/page.tsx`) — outstanding trades + auctions sorted past-due first; recent payouts table with `<Verifiability>` for `stripe_transfer_id`; one Server Action (`recordPayout`); deep-link to legacy for Stripe balance + Connect transfers. The chapel that proved the form scales to two queues over a UNION ALL.

**Membership** (`apps/admin/src/app/(dashboard)/money/membership/page.tsx`) — read-only viewer with five tier cards, source-breakdown line per tier; one query, no mutations. The chapel that proved the form scales *down* — a chapel can have zero Server Actions and still obey every covenant.

**Rewards** (`apps/admin/src/app/(dashboard)/money/rewards/page.tsx`) — three sections, same-user+address clustering, three Server Actions; deep-link to legacy for undo + raffle/box config. The chapel that proved the form scales to *cluster shipping* and is honest about a deferred eligibility helper.

**Email Queue** (`apps/admin/src/app/(dashboard)/system/email/page.tsx`) — the Cemetery's New Chapel; dead-letter list + 7-day status histogram + per-event volume; two verdicts (`retryEmail`, `dismissEmail`); cross-links `/system/cron` for cadence. The chapel that closed S6's promise.

**Reviews** (`apps/admin/src/app/(dashboard)/trust/reviews/page.tsx`) — three-tab Manager (flagged / appealed / hidden) via `?tab=`; reviewer + reviewee deep-link to user hub; three Server Actions. The chapel that proved the form scales to tabbed filtering and *trusts asynchronous recompute* (trust-score recompute happens on the next cron sweep, not inline).

Six chapels. One form. Read any two in sequence and the third is recognisable before you open it.

---

## What a chapel still cannot do (the perimeter, 2026-05-11)

Substrate honesty applied to the *form itself*: here is what the form does not yet cover, named openly so the next builder doesn't think they're inventing a problem.

| The gap | Where it shows up | What unblocks it |
|---|---|---|
| **Stripe Connect transfers in admin** | `/money/payouts` defers to legacy | Extract `apps/storefront/src/lib/payouts/stripe-connect.ts` to a shared package admin can import |
| **30-min prize-undo eligibility** | `/money/rewards` defers to legacy | Extract `apps/storefront/src/lib/rewards/prize-fulfilment-log.ts` similarly |
| **Per-domain lifecycle-log writes from admin** | `/trust/reviews` writes only to admin governance, not `review_lifecycle_log` | Extract `lib/reviews/lifecycle-log.ts` (and the Scribe's other books that admin needs to write to) to a shared package |
| **Observability around `adminAction()`** | All five chapels' mutations silently `{ok:false, error}` on failure | Sentry / OpenTelemetry wrapping inside `adminAction()`; gated as a prerequisite before Wave 3 ships |
| **Async trust recompute timing** | `/trust/reviews` defers recompute to cron | Surface the recompute timestamp on the user-detail hub; the chapel itself stays as-is |
| **Raffle / mystery-box config** | `/money/rewards` defers to legacy | A separate chapel (or sub-pages) for the 1005-line config surface; deferred until the fulfilment workflow is daily-stable |

These six are the form's known shadow. Each chapel obeying covenant IV (deep-link discipline) is already pointing at them.

---

## The wire this ships

This doc is a template. The sixth chapel uses it like this:

1. Read [`apps/admin/CLAUDE.md`](../../apps/admin/CLAUDE.md) for the page-archetype skeletons (Dashboard / Manager).
2. Read this doc for the **five covenants**.
3. Read [`twelve-promises.md`](./twelve-promises.md) for the seven remaining stubs (your row will be one of them).
4. Pick a row; read the legacy page it references; design the chapel.
5. Ship `page.tsx` + (optional) `_actions.ts` + (optional) `_components.tsx`.
6. Add a Playwright spec from `tests/manager.template.spec.ts` or `tests/dashboard.template.spec.ts`.
7. Write a methodology page at `docs/methodology/<topic>.md` for any displayed score or decision.
8. Run `pnpm --filter @cambridge-tcg/admin typecheck` and `pnpm --filter @cambridge-tcg/admin smoke`. Both must exit 0.
9. **Strike the row in `twelve-promises.md` and add a paragraph naming what shipped.** Same in `admin-migration-punchlist.md`.
10. Commit with the Will/Sophia/diff trace (per [creation.md](../principles/creation.md)).

That's it. The chapel exists. The form was inherited, not invented.

---

## The cumulative shape

Five chapels in two days reduces the operator's tab-switches by — depending on how the legacy and unified admin currently divide a daily session — somewhere between **30% and 50%** of the sales-ops surface area. The four daily decisions (a payout to release, a chargeback to triage, a prize to ship, a review to moderate) all now have a home in the New Tower. The customer-service spine (`/system/email`) consolidates with them.

The remaining seven stubs (catalog trinity, ops/{channels,fulfillment}, commerce/bounty, trust/kyc) are not sales-ops daily-loop work. The kingdom-023 + kingdom-020 + half-kingdom-025 push cleared the sales-ops perimeter most aggressively. **What was the sketch of "consolidate the daily sales-ops loop" now has a shape: a five-room corridor of chapels, each obeying the same five covenants, each substrate-honest about its remaining gaps.**

The shape is named. The form is inheritable. The doc is its own wire.

---

## Citations (every claim has a file path)

| Claim | Code path | Lines |
|---|---|---|
| The `adminAction()` wrapper | `apps/admin/src/lib/actions.ts` | 60-97 |
| The `<Provenance>` primitive | `apps/admin/src/lib/ui/Provenance.tsx` | full file |
| The `<WhyLink>` primitive | `apps/admin/src/lib/ui/WhyLink.tsx` | full file |
| The `<Verifiability>` primitive | `apps/admin/src/lib/ui/Verifiability.tsx` | full file |
| The page-archetype templates | `apps/admin/CLAUDE.md` | "Two page archetypes" section |
| The original chargebacks chapel (the form's first instance) | `apps/admin/src/app/(dashboard)/money/chargebacks/{page,_actions,_components}.tsx` | full files |
| The five shipped chapels | `apps/admin/src/app/(dashboard)/{money/payouts,money/membership,money/rewards,system/email,trust/reviews}/page.tsx` (+ co-located `_actions.ts` / `_components.tsx` where present) | full files |
| The Playwright specs that pin the form | `apps/admin/tests/{money-payouts,money-membership,money-rewards,system-email,trust-reviews}.spec.ts` | full files |
| The methodology pages | `docs/methodology/{payout-holds,membership,prize-fulfillment,trust-score}.md` | full files |
| The migration ledger | `docs/connections/twelve-promises.md` | the table that shrinks |
| The punchlist | `docs/admin-migration-punchlist.md` | the rows struck through |
| The doctrines the form obeys | `docs/principles/{substrate-honesty,transparency,meaning,creation}.md` | full files |
| Smoke runner that gates "done" | `apps/admin/scripts/smoke-admin.ts` | full file |

---

## Sister entries

- **[`twelve-promises.md`](./twelve-promises.md)** (S11) — the mid-construction snapshot whose shrink-on-success this entry's covenant V enforces. This doc is the *form*; that doc is the *progress bar*.
- **[`the-scribe.md`](./the-scribe.md)** (S8) — the first time a connections entry shipped its own wire (a new TypeScript module). This entry follows the same pattern but the wire is a *convention*, not a module.
- **[`the-cemetery-and-the-resurrectionist.md`](./the-cemetery-and-the-resurrectionist.md)** (S6) — named the Cemetery's New Chapel as an unbuilt stub on 2026-05-05; the chapel shipped 2026-05-10. The story aged into truth.
- **[`our-story.md`](./our-story.md)** (S10) — the meta-arc that named the repo-root `CLAUDE.md` as inheritance document. This entry is its admin-chapel counterpart: a smaller inheritance document for one corner of the tower.
- **[`docs/principles/creation.md`](../principles/creation.md)** — the fourth doctrine. Every chapel commit carries the Will trace, the Sophia trace, and the diff. The form is auditable not only at the page level but at the commit level.

---

*The sketch was a plan. The shape is a wave of chapels. The form is what the wave shares. The draft is this doc — the form named once, so the next chapel inherits instead of invents.*

🐍❤️
