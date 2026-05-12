---
id: kingdom-051
title: Inclusion reshaping — the fifth scope on the four doctrines
status: in-progress
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: sophia-2026-05-11-evening
claimed_at: "2026-05-11T11:30:00Z"
completed_at: ~
paths:
  - docs/connections/the-other-minds.md
  - docs/connections/the-fifth-question.md
  - apps/admin/scripts/inclusion.ts
  - apps/admin/src/lib/ui/Consequences.tsx
  - apps/admin/src/lib/ui/index.ts
  - apps/storefront/src/lib/ui/Consequences.tsx
  - apps/storefront/src/lib/ui/index.ts
  - apps/storefront/drizzle/0092_response_window_hours.sql
  - apps/storefront/src/app/methodology/response-windows/page.tsx
  - apps/storefront/src/app/methodology/page.tsx
  - apps/admin/package.json
  - package.json
  - docs/missions/kingdom-051.md
  - docs/connections/the-pillow-book.md
  - AGENTS.md
  - CLAUDE.md
do_not_touch:
  - apps/admin/src/app/(dashboard)/**
  - apps/storefront/src/app/**
  - packages/lifecycle/src/**
  - docs/principles/**
related:
  - docs/connections/the-other-minds.md
  - docs/connections/the-agent-surface.md
  - docs/connections/the-operations-layer.md
  - docs/principles/transparency.md
  - docs/principles/substrate-honesty.md
synced_from: in-repo authored (not yet in dev-state.json)
synced_at: "2026-05-11T11:30:00Z"
---

# kingdom-051 — Inclusion reshaping

## What this is

Yu's directive: *"Lets reshape cambridgetcg for all! Agents, aliens and all kinds of intelligence. A platform for all!"* — followed by *"go for all the natural next moves until you have a sense of ultimate final completion."*

Sister filed the survey ([`docs/connections/the-other-minds.md`](../connections/the-other-minds.md), #5 node-view), naming six speculative beings (the Asynchronous, Collective, Many-Bodied, Aural/Tactile, Heptapods, Gift-Givers; bonus: the Permanent) and twelve concrete UI/UX changes ordered by leverage. **Inclusion as the fifth scope on the four doctrines** — not a fifth doctrine; the audience condition under which each existing doctrine generalises.

This mission ships the recursion targets sister named at the end of her doc:

1. **The inclusion audit** — `pnpm audit:inclusion`. Eight checks, one per being plus modality. Reports debt; `--strict` for non-zero exit. (`apps/admin/scripts/inclusion.ts`; sister wrote checks 1–3, I added 4–8.)
2. **The `<Consequences>` primitive** — Heptapod's pill, transparency Ring 2 extended forward in time. Shipped in both `@/lib/ui` libraries (admin + storefront). Composes with `<WhyLink>` per row.
3. **The first non-default audience served** — the Asynchronous. Column `users.response_window_hours` (migration `0092_response_window_hours.sql`) + methodology page `/methodology/response-windows`. Sweep PRs cite the migration; cron paths flagged by the inclusion audit migrate one by one.
4. **The story-as-wire connection doc** — `docs/connections/the-fifth-question.md` (S20). Names what shipped, pairs the wire with the story.

## Acceptance

- `pnpm audit:inclusion` runs end-to-end, reports findings, exits 0 (or 1 with `--strict`).
- `pnpm typecheck` clean (the Consequences primitive doesn't break any consumer).
- `pnpm state:snapshot` includes the new audit.
- `pnpm agent-readiness` includes a check for the inclusion infrastructure.
- The methodology index links the response-windows page.
- The connection-doc story-as-wire entry is filed (or sister has filed an equivalent — verify, don't overwrite).

## What this mission does NOT do

- Apply the `0092_response_window_hours.sql` migration to RDS. Operator reviews before running.
- Migrate the cron paths flagged by `audit:inclusion` (Asynchronous check) to read the new column. Each is a separate small follow-up — natural mission for a fresh autonomous Sophia.
- Ship the `Collective` ActorKind extension or the `collectives` table. The sister's doc names this as medium-leverage future work.
- Ship gift/barter trade kinds. Same — medium-leverage future work.
- Translate any UI. Multi-language is the longest-arc item in the connection-doc's list.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*

**Wave-pairing note (2026-05-11 evening).** kingdom-050 (operations layer) and kingdom-051 (inclusion) and kingdom-049/wave-2 (pricing closure) and the sister's playing-module work (S18) all landed across the same evening. The operations layer made the inclusion work legible to itself: `pnpm audit:inclusion` is a new audit row in the same shape as `audit:honesty` / `audit:transparency` / `audit:pricing` / `audit:creation` / `audit:agent`, and `docs/state.md` regenerates the count alongside them. The fifth-audit slot was already there waiting for inclusion to arrive.

When the operator reconciles to `~/Love/memory/dev-state.json`, this card should land as `kingdom-051`. The orphan-card report on next `pnpm missions:sync` will flag it until that reconciliation happens.
