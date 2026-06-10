# The Daily Run — the visit becomes the game

*S51 · kingdom-096 · Yu's directive 2026-06-10: "lets gamify cambridgetcg! module
and process! Make the visit rewarding and fun!" — with the standing direction
from the same day: reduce process, increase trust, plain words.*

## The thesis

**The kingdom learns to be fun before it is paid.** For 95 kingdoms the
platform built play, rewards, streaks, and provable fairness — and every one
of them asked for an account or a purchase before the fun started. The Daily
Run exists because provable-draw made fairness cheap enough to give away on a
free game, and the card pantry made the catalogue itself the game board: one
provably-shuffled deck of twenty real cards per UTC day, the same for everyone
on Earth, higher-or-lower on real prices, whole in thirty seconds, logged out.

## What it means to the modules around it

- **provable-draw** is why this module could be small: the shuffle is a
  `verifiable_draws` row (`kind: "custom"`), so the existing verifier page,
  Merkle digest, and self-audit cover the deck with zero new verification
  code. The Daily Run is provable-draw's first *free* consumer — fairness as
  a gift, not a receipt.
- **membership/streak + rewards/earnings** lend the claim its meaning:
  finishing a run is a real "I'm here today" action (`bumpStreak` first, so
  today's multiplier applies), and `earnRewardPoints` composes tier × streak
  exactly as every paid surface does. The flat `DAILY_PAYOUT_BASE` is the
  load-bearing honesty: run length is for pride, Berries are for showing up,
  and flatness is what makes the admitted cursor-replay worthless.
- **wholesale prices** become a morning snapshot the whole world judges
  against for one day — the first surface where a price is a *question*
  rather than an answer.
- **the maintenance cron** gained one line: `revealDailyRunYesterday()` runs
  before the fairness digest so a just-revealed deck joins the same day's
  Merkle root.

## What this module refuses (audited, permanently)

No urgency vocabulary, no spending calls, no run-length-scaled payouts, no
leaderboard, no login-wall ransom, no mid-run commerce, no re-engagement
email. `pnpm audit:daily-run` greps the first two into permanence; the README
in `src/lib/daily-run/` carries the full refusals and the honest admissions
(replayable cursors; lazy commit; the orphaned draw a racing first request
can leave).

## Sisters

S48 (`the-game-registry.md`) — play substrate this sits beside, in /play's
nav; S42 (`the-rebrand.md`) — the data plane this turns into a toy; the
provable-fairness node-view — the trust this module spends nothing to borrow.

## Recursion targets

Anonymous-to-signed-in carryover of the local best (named gap in
the-welcome-all.md); a streak rest-day (cut from this kingdom because it
edits shared `bumpStreak` SQL the streak-at-risk email sweep depends on —
its own mission when wanted); per-game daily decks when a second game's
prices are deep enough; a "how it felt" line in the recap feeding the
activity feed (only if players ask).

*The kingdom that is fun while asking for nothing is the kingdom whose
asks are believed.*
