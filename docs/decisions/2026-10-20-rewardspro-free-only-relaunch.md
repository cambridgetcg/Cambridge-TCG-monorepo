# RewardsPro relaunches free-only

**Status:** decided 2026-10-20. This is an agent's call under Yu's delegation,
not Yu's own decision. Yu overturns it by saying so.

**Decided by:** Claude Code session 00f12612, in the agents' decision ledger
(item `rp-commercial-shape`). On 2026-10-20 Yu asked agents to decide "through
principalities and your understanding of what choices I will make", in the
shape "more transparency, more truth, more understanding. Reduce redundancy,
let things be simple, let things work. Modularise, connect when needed, no
forcing."

## Decision

Free Forever is the whole offer for now.

- Paid plans stay off: `NEW_PAID_SUBSCRIPTIONS_RETIRED` stays `true`. The
  billing webhooks (`app-subscriptions-update`, `subscriptions/approaching-cap`)
  stay unsubscribed.
- Merchants see no retirement copy. The app tells them paid plans aren't
  offered right now. It doesn't say that anything is being retired.
- The App Store listing stays Free, and the scopes stay as they are.
- Raffles, mystery boxes and instant wins stay paused (`CHANCE_MECHANICS_PAUSED`),
  and nothing is spent on a solicitor for now.
- Reopening paid plans is a later call for Yu, when a merchant needs more than
  Free.

## Why

Three signals bear on this, and free-only fits all of them:

1. **Yu, 2026-07-23, verbatim**, recorded in the
   [free-first pricing decision](2026-07-23-rewardspro-free-first-pricing.md):
   "Wanna make it cheap and have a generous free tier for everyone to use! Only
   for larger corporates should we charge more. Small business should have
   enough from free plan."
2. **2026-09-23**, commit `8165fcbe` ("Retire new paid commerce and remove
   acquisition pressure"). Its "Will:" line is an agent's paraphrase, not Yu's
   words: "user requested pure understanding without KPIs, commercialisation or
   revenue pressure, and explicitly retired new paid signups and checkout." No
   decision record was written for it.
3. **2026-10-18**, when Yu restarted RewardsPro to reach real merchants. The
   backend was then rebuilt (#77 and #78, merged 2026-10-19). That aim was
   recorded by the agent session that ran the rebuild; it isn't a verbatim quote.

A generous free tier answers (1). No new paid signups and no revenue pressure
answer (2). An app that real merchants can install and use without a payment
decision answers (3). Billing doesn't change, no money moves, and the call is
reversible.

## What stays as it was

- The 2026-07-23 catalogue and capacity contract remain the application
  contract. The paid tiers just aren't offered. Capacity enforcement stays
  advisory.
- Existing subscription records, cancellation, refunds and support keep their
  paths.
- Internal names don't change: the `NEW_PAID_SUBSCRIPTIONS_RETIRED` constant,
  the API error code of the same name and its 410 status. Only wording that
  merchants see changes.
- The rewardspro.io landing page (`apps/rewardspro/landing`) still says "New
  paid subscriptions are retired". It is deployed separately and has its own
  planned landing PR, which brings the approved look, so its wording changes
  there, not here.

## Undo

A later decision record reopens paid plans: it sets
`NEW_PAID_SUBSCRIPTIONS_RETIRED` to `false`, subscribes the billing webhooks,
and follows the App Pricing cutover in the free-first record.
