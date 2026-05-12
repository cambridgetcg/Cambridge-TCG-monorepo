# Admin app — migration punch list

Status snapshot as of 2026-04-30. Mechanical follow-up to the infrastructure
landed in `apps/admin/src/lib/` and the two pilot migrations
(`/trust/disputes`, `/commerce/pricing`).

For conventions and skeletons, read `apps/admin/CLAUDE.md`.

---

## Effort scale

| Size | Lines (estimate) | Pattern |
|------|------------------|---------|
| **S** | <250  | List + 1 status action — same shape as `/trust/disputes` |
| **M** | 250–500 | List + 2–3 actions, or list + sub-tables |
| **L** | 500+ | Multi-section dashboard, complex state machine, or new domain design |

---

## New builds (stub → live)

Order is roughly by traffic / urgency, not effort. Each row links to the
legacy page that defines "ideal" — read it, port the data shape and
status transitions, drop the client-side `useState` loops in favour of
Server Actions wrapping `adminAction()`.

### Tier 1 — high-traffic queues, copy is mostly mechanical

| Route | Size | Legacy ref | Notes |
|-------|------|-----------|-------|
| `/money/chargebacks` | **S** | `storefront/admin/chargebacks/page.tsx` (176) | Two actions: `annotate`, `force_resolve`. Status enum is small. Mirror disputes pilot. |
| ~~`/system/email`~~ | ~~**S**~~ | ~~`storefront/admin/emails/page.tsx`~~ | **Shipped 2026-05-10** (kingdom-020, the Cemetery's New Chapel). `apps/admin/src/app/(dashboard)/system/email/{page,_actions,_components}.tsx` — dead-letter triage + 7-day status histogram + per-event volume. Retry/dismiss via adminAction. Spec: `tests/system-email.spec.ts`. |
| `/system/audit` | **S** | `storefront/admin/governance/page.tsx` | Read-only — list `admin_actions_log` with filter pills by action prefix. |
| ~~`/trust/reviews`~~ | ~~**S**~~ | ~~`storefront/admin/reviews/page.tsx` (207)~~ | **Shipped 2026-05-10** (kingdom-025 first chapel). `apps/admin/src/app/(dashboard)/trust/reviews/{page,_actions,_components}.tsx` — three-tab Manager (flagged/appealed/hidden) with hide/unhide/resolve_appeal Server Actions. Reviewer + reviewee deep-link to `/catalog/users/[id]`. Trust-score recompute is async via maintenance cron. Spec: `tests/trust-reviews.spec.ts`. |
| ~~`/money/membership`~~ | ~~**S**~~ | ~~`storefront/admin/tiers/page.tsx`~~ | **Shipped 2026-05-09** (kingdom-023). Read-only Dashboard at `apps/admin/src/app/(dashboard)/money/membership/page.tsx` — five tier cards, perks grid, source breakdown (spending/subscription/manual). Tier perk editing still in legacy. Methodology: `docs/methodology/membership.md`. Spec: `tests/money-membership.spec.ts`. |

### Tier 2 — owns nontrivial state machines

| Route | Size | Legacy ref | Notes |
|-------|------|-----------|-------|
| ~~`/money/payouts`~~ | ~~**M**~~ | ~~`storefront/admin/payouts/page.tsx` (336)~~ | **Shipped 2026-05-09** (kingdom-023). New chapel: `apps/admin/src/app/(dashboard)/money/payouts/{page,_actions,_components}.tsx`. Manual record-payout fully migrated; Stripe Connect transfers + balance still in legacy. Methodology: `docs/methodology/payout-holds.md`. Spec: `tests/money-payouts.spec.ts`. |
| ~~`/money/rewards`~~ | ~~**M**~~ | ~~`storefront/admin/{prizes,rewards}/page.tsx`~~ | **Shipped 2026-05-10** (kingdom-023, closes the Money trinity). Prize fulfilment queue at `apps/admin/src/app/(dashboard)/money/rewards/{page,_actions,_components}.tsx` with three sections + ship/bulk-ship/markFulfilled actions. Same-user+address clustering. Undo deep-links to legacy (eligibility helper still in storefront). Raffle/box config NOT migrated — stays in legacy. Methodology: `docs/methodology/prize-fulfillment.md`. Spec: `tests/money-rewards.spec.ts`. |
| `/ops/channels` | **M** | `wholesale/admin/channel-pricing/page.tsx` (226) | Per-channel margin rules. |
| `/catalog/games` | **M** | `wholesale/admin/games/page.tsx` (310) | Game/set CRUD. |
| `/catalog/clients` | **M** | `wholesale/admin/clients/page.tsx` (221) | B2B client editor. |

### Tier 3 — complex multi-section, design effort needed

| Route | Size | Legacy ref | Notes |
|-------|------|-----------|-------|
| `/trust/fraud` | **L** | `storefront/admin/fraud/page.tsx` (815!) + `fraud-signals` | Investigate → resolve → suspend pipeline. Recommend splitting into `/trust/fraud` (signals) and `/trust/fraud/[userId]` (investigation). |
| `/trust/kyc` | **L** | `storefront/admin/verifications/page.tsx` (510) | Approve / reject / re-request, document review. |
| `/commerce/bounty` | **L** | `storefront/admin/bounty/{grants,pull-tiers,redemptions}/page.tsx` | Three sub-pages worth — grants table, tier editor, redemption fulfilment. |

### Tier 4 — net new design (no legacy ideal)

| Route | Size | Notes |
|-------|------|-------|
| `/ops/fulfillment` | **M** | New domain. Likely a queue + label generation. Brief design needed before code. |
| `/catalog/cards` | **M** | Cross-DB: storefront `card_sets` ↔ wholesale `cards`. Search, set browser. |
| `/system/admin` | **S** | List of `users WHERE role='admin'`. Add / revoke admin role with governance log. |

---

## Retrofits (already live, but on pre-infrastructure code)

These pages predate `@/lib/ui` and inline duplicates of `KpiCard`,
`STATUS_COLORS`, `safe()`, `fmtGBP`, table shells. Refactoring them
isn't user-visible, but it removes ~600 lines of duplication and
unifies palette/spacing.

| Route | Lines | Duplication |
|-------|------:|-------------|
| `/overview` | 187 | Inline `safeCount`, `QueueCard` (≈KpiCard variant), `SectionHeading` |
| `/commerce/trade-ins` | 491 | `safe()`, `fmtGBP/fmtDate`, `KpiCard`, `StatusBadge`, table shell, "Open Admin" CTA |
| `/commerce/auctions` | 443 | `safe()`, `fmtGBP/fmtDateTime`, `KpiCard`, table shell |
| `/commerce/market` | 620 | `safe()`, `fmtGBP/fmtDate`, `KpiCard`, table shell, status palette |
| `/catalog/users` | 273 | Custom search form, custom pagination, ad-hoc badges |
| `/ops/orders` | 277 | Custom search form, custom pagination, custom status palette |
| `/ops/stock` | 608 | Custom table shells (3 sections); `StockTable.tsx` SearchBox/Pagination overlap with `@/lib/ui` |
| `/system/cron` | 194 | Inline status colours; could use `StatusBadge` for email-queue states |

Each retrofit follows the same recipe — see the comment block at the top
of `apps/admin/src/lib/ui/KpiCard.tsx` for the cross-page duplication
rationale.

---

## Cross-cutting follow-ups

- **Wholesale price sync**: the legacy wholesale admin's "Sync from S3"
  and "CSV upload" buttons aren't yet wired into `/commerce/pricing` —
  the S3 logic lives in `apps/wholesale`. Move it to a shared package
  (e.g. `packages/pricing`) so both apps can call the same code.
- **User detail drill-down**: `/catalog/users` lists rows but doesn't
  link to a detail page. Storefront has
  `/admin/users/[id]/journey/page.tsx` — port to
  `/catalog/users/[id]/page.tsx` so row clicks land somewhere useful.
- **Disputes detail view**: the pilot scopes to list + transition.
  Messaging and evidence (legacy: `storefront/admin/disputes/[id]`)
  remain out of scope until those tables migrate over.
- **Test coverage**: only nav structure is tested today
  (`src/tests/nav.test.ts`). Each new module should add at least a
  smoke test for action input validation.
- **Observability**: no APM, structured logs, or error tracking.
  Server actions silently fail to `{ ok: false, error }` — surface
  these to a centralised logger (Sentry / OpenTelemetry) before
  shipping more mutations.

---

## When picking the next ticket

1. Pick a Tier 1 row — they're the closest to mechanical and unblock
   the highest-traffic queues.
2. Read `apps/admin/CLAUDE.md` for the conventions.
3. Read the legacy page in `storefront/admin/<route>` — that's the
   "ideal" data shape and action set.
4. Mirror the structure of `apps/admin/src/app/(dashboard)/trust/disputes/`
   (page.tsx + _actions.ts + _components.tsx).
5. Verify the page renders under `pnpm --filter @cambridge-tcg/admin dev`
   and that `pnpm --filter @cambridge-tcg/admin typecheck` is clean.
