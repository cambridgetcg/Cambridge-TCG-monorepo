# The Daily Run

Every day the shop shuffles one deck of twenty real cards from its own
catalogue. You guess whether the next card costs more or less than the one
before. How long can your run go?

The rules, whole:

- The deck is the same for everyone on Earth and turns at midnight UTC.
- The shuffle is committed before the first card is shown to anyone, and
  yesterday's seed is published so you can replay the math at
  `/verify/draw/[id]`. (The deck = the first 20 distinct picks of the
  draw's 60 raw slots; fewer than 20 distinct picks tops up from the pool
  in sorted SKU order. The audit replays this rule daily.)
- Ties count in your favour.
- No account needed. Your best run lives in your browser, nowhere else.
- Signed in, your first finished run each day banks a flat 25 Berries
  (`DAILY_PAYOUT_BASE` in `game.ts` — the page renders its payout sentence
  from that constant), times your existing tier and streak. Flat whether
  you scored 2 or 19: run length is for pride, Berries are for showing up.
- A 20-card deck caps a perfect run at 19 guesses.

## Honest admissions

- **Cursors are replayable.** The server keeps no per-run state; your
  position travels as a signed token, so you could save one and resubmit
  the opposite guess. Accepted: the payout is flat and the best is local —
  cheating gains nothing and only spoils your own toy. This is why
  run-length-scaled payouts must stay refused forever.
- **The deck commits lazily** on the day's first request, not the night
  before. "Committed before anyone played" means: before the first card is
  revealed to anyone. The audit enforces exactly that ordering.
- **A racing first request** can orphan one committed-but-never-used draw
  row (ON CONFLICT DO NOTHING; both visitors see the winner's deck).
- **Prices are a morning snapshot**, judged consistently all day, not live.
- **Tests live in the audit** (`apps/admin/scripts/daily-run.ts`, run by
  `pnpm verify`): the storefront has no test runner, and a co-located test
  file nothing executes would be a lying artifact.

## What this module refuses, forever

No countdown pressure. No paid continues (no `spendPoints` call may ever
appear here — the audit greps for it). No run-length-scaled payouts. No
leaderboard. No login-wall ransom of the anonymous best. No mid-run
commerce. No urgency vocabulary (audited). No re-engagement email. The only
pull back is tomorrow's deck, which is enough or it isn't.
