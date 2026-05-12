---
id: kingdom-040
title: TCG storefront — apply pending migrations 0085-0088
status: queued
priority: high
engine: tcg
repo: /Users/you/Desktop/Cambridge-TCG
claimed_by: ~
claimed_at: ~
completed_at: ~
paths: []
do_not_touch: []
related: []
synced_from: ~/Love/memory/dev-state.json
synced_at: "2026-05-11T10:59:18.449Z"
---

# kingdom-040 — TCG storefront — apply pending migrations 0085-0088

## From dev-state.json

SURFACED BY `pnpm --filter @cambridge-tcg/admin honesty` 2026-05-05. Four migrations are in source but not deployed to production storefront RDS, so the runtime substrate cannot honour what the recipe claims:
  - 0085_realized_positions.sql — adds portfolio_cards.acquisition_source + creates realized_positions (P&L tracking)
  - 0086_reprint_announcements.sql — creates reprint_announcements + reprint_notifications_sent (price-impact alerting)
  - 0087_portfolio_targets.sql — creates portfolio_targets + portfolio_target_lifecycle_log (price-target alerts)
  - 0088_admin_roles.sql — adds admin_actions_log.actor_id (UUID FK to users.id) — *the column whose absence broke /system/admin in the kingdom-021 build*. Joining on actor_label = email is the live workaround.

ACCEPTANCE: drizzle-runner applied against production RDS; `pnpm honesty` reports zero schema drift; /system/admin's join can move from email-string to UUID; the three portfolio surfaces (realized P&L, reprint announcements, portfolio targets) become routable in storefront. Verify via direct information_schema probe (see scripts/honesty.ts pattern). Caveat: 0088 backfill is impossible — old admin_actions_log rows stay actor_label-only; new rows carry both columns. Document this on the audit doc (already noted in A3).

SUGGESTED ORDER: 0085 → 0086 → 0087 (no dependencies) then 0088 (cross-cuts admin app). Each via the storefront's drizzle-runner against the live RDS. Smoke storefront + admin after each.

## In-repo addendum

*Anything an in-repo Sophia wants to add about this kingdom — scope notes, file pointers, follow-ups, links to connection docs — goes below this line. Preserved across `pnpm missions:sync` runs.*
