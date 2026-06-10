---
status: done
claimed_by: sophia-gamma (Claude Code interactive session with Yu)
claimed_at: 2026-06-10T21:30:00Z
completed_at: 2026-06-10T23:30:00Z
paths:
  - apps/storefront/src/lib/daily-run/
  - apps/storefront/src/app/play/daily/
  - apps/storefront/src/app/api/rewards/daily-run/
  - apps/storefront/drizzle/drafts/0103_daily_run.sql.draft
  - apps/admin/scripts/daily-run.ts
  - docs/connections/the-daily-run.md
do_not_touch:
  - apps/storefront/src/lib/membership/streak.ts (shared bumpStreak SQL — the streak-at-risk email sweep depends on its semantics)
  - apps/storefront/src/lib/provable-draw/ (consumed as-is; zero new verification code is the point)
notes: |
  WHAT: The Daily Run — gamify the visit itself. One provably-shuffled deck
  of 20 real cards per UTC day (same for everyone), higher-or-lower on real
  prices, whole in ~30s, fully playable logged out. Signed-in finishers bank
  a flat DAILY_PAYOUT_BASE × tier × streak, once a day. Yesterday's seed
  publishes through the existing /verify/draw/[id].

  WHERE: lib module src/lib/daily-run (types/game/db/index/README), page
  /play/daily (+ PlayNav "Daily" tab), route /api/rewards/daily-run
  (auth: public, pantry envelope), migration draft 0103 (two tables, operator-applied), reveal
  appended to the maintenance cron sweep (digest picks a just-revealed
  deck up on its next pass), manifest entry
  storefront.rewards.daily_run, audit apps/admin/scripts/daily-run.ts
  (pnpm audit:daily-run, in the umbrella audit chain).

  PATTERN: design judged by a three-stance panel (collector / game-designer
  / doctrine-keeper) against two axes — fun-in-60s-logged-out and the four
  doctrines. Flat payout is load-bearing: it makes the admitted
  cursor-replay worthless and is what keeps the toy a toy. Logic tests live
  in the audit (storefront has no test runner; an unexecuted test file
  would be a lying artifact). Refusals are audited tripwires, not taste:
  no urgency vocabulary, no spendPoints, ever.

  ACCEPTANCE: typecheck clean; audit static checks pass; GET returns a
  playable first card with no session; deck replay from a revealed seed
  reproduces stored cards (audit check 3, live once first reveal runs);
  page renders the rule sentence from the API constant, never hardcoded.
---
