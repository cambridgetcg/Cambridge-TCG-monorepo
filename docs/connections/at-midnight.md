# At midnight — the streak sweep

> **Recursion 5 from the connections series.** Random seed: `apps/storefront/src/lib/email/streak-sweep.ts` (selected via `find` + `awk` random). **Form: narrative.** Where the previous entries (membership, bounty, provable-fairness, subscription-lifecycle) traced threads in documentary form, this one tells a story.

---

## What the story is

It's an evening. A user has come back twenty-three days in a row. Some part of them — the part that built the habit — would notice if the streak broke. Another part — the part that gets busy with the rest of life — won't notice it's about to.

The platform notices for them.

This is the story of how.

---

## Eleven o'clock

The sweep runs nightly. It is not a webhook, not a user-triggered call — it is a cron, scheduled in `vercel.json`, expected to fire once each evening before the day rolls over in UTC. Tonight, at 23:00, it does.

```
storefront → /api/cron/streak-at-risk → runStreakAtRiskSweep()
```

The sweep asks one question of the database:

> *Show me everyone whose streak is at least two days long, who came yesterday, and who has not come today.*

```sql
SELECT s.user_id, s.current_streak, s.last_visit_date
FROM user_streaks s
JOIN users u ON u.id = s.user_id
WHERE s.current_streak >= 2
  AND s.last_visit_date = CURRENT_DATE - 1
ORDER BY s.current_streak DESC
LIMIT 1000
```

The threshold is two, not one. *Built something*, not *visited once*. The platform respects what it took to be on the second day.

A few dozen rows come back tonight. One of them is our user. Their streak says 23.

---

## What the streak is

Their `user_streaks` row has been incrementing since November. Each visit triggered `bumpStreak()`, which is the platform's only formal acknowledgment of *showing up*. The function is small, but the `INSERT … ON CONFLICT DO UPDATE` it performs encodes the rules:

- Visited today → no change.
- Visited yesterday → streak += 1.
- Otherwise → streak = 1; the slate clears.

There is no soft fail. Skip a day and the count resets. That sharpness is what makes the streak mean anything.

The user isn't paying for this. There is no "streak tier." It doesn't directly unlock perks. What it does today: the multiplier on `user_streaks.streak_multiplier` caps at 1.50 on day 26, three days away. Their next pack-pull, their next PVE win, their next event with a points-payout — each will earn them a fraction more, because of how many evenings they have been here.

But the multiplier is not the reason the platform watches their streak. The platform watches because returning is the most ordinary act a person can do, and the most consistent. People who return are the platform.

---

## The queue

Each at-risk row is handed to `scheduleEmail()`. The scheduling carries an idempotency key:

```
streak_at_risk:<user_id>:<today_ISO>
```

If the sweep accidentally runs twice tonight — a cron retry, a manual replay — only one email queues per user per day. The platform refuses to nag.

The email is not sent now. It is scheduled five minutes out. The reason is in the next character of the protocol.

---

## Five minutes later — the drain

The drain (`drainEmailQueue()`) picks up the row and calls the handler at `email/handlers/streak-at-risk.ts`. The handler does something the sweep cannot: it re-asks the question.

> *Has the user visited since the sweep saw them?*

```sql
SELECT s.current_streak, s.last_visit_date, u.email, u.name
FROM user_streaks s JOIN users u ON u.id = s.user_id
WHERE s.user_id = $1
```

If the user opened the app between 23:00 and 23:05 — landed, opened a pack, played a PVE round, anything that called `bumpStreak()` — `last_visit_date` now equals today, and the handler returns `{ kind: "cancelled", reason: "user already visited today" }`. The email never sends.

This is the *gentleness*. The sweep is allowed to be approximate; the handler is precise. Five minutes of slack between the two is the platform's apology for almost having interrupted.

The pattern generalises. Schedule an email a few minutes out; re-fetch reality at send time; cancel if the world has moved. It works for streaks. It works for `vault_expiring_soon`, for `portfolio_price_alert`, for `wishlist_matched`. The pattern is the same; the truth is always re-asked at the last possible moment.

---

## What the email says

If the user has not visited, the handler renders the email. The subject:

> *Your 23-day streak is about to break.*

The body re-fetches `current_streak` from the substrate. It does not trust the snapshot stored in `data.originalStreak` — which might say 23 when reality is now 24, because the sweep saw them at 22:58 but the streak ticked at 23:01 from a visit on a different device. The handler trusts the database, not the queue.

The email goes through `sendEmail()` → AWS SES. SES accepts. Our `email_queue.status` becomes `'sent'`.

A small substrate-honesty caveat: per audit item **A4**, "sent" here means *SES accepted*. SES bounces, complaints, suppressions, and deferred deliveries are not yet wired back to our row. The platform is substrate-honest about handoff and not yet substrate-honest about delivery. Closing that gap is on the roadmap.

---

## What happens next, from the user's side

Two paths.

**They open the email and click through.** Their visit calls `bumpStreak()`. Tomorrow's sweep will not find them — they'll be on day 24. The streak survives, slightly reinforced by the experience of having almost-lost it.

**They don't.** Tomorrow, the day after, three days from now — when next they visit — `bumpStreak()` will find `last_visit_date` more than one day old, and reset their streak to 1. The 23 days are gone. `longest_streak` will retain the high-water mark — they had it once. The slate clears for the next attempt.

Either way, the platform did its part. The streak was theirs. The reminder was ours. The choice is theirs.

---

## What this story bridges

This narrative connects modules that were strangers in the codebase:

- **`user_streaks`** — pure presence as a value (in `lib/membership/streak.ts`). Not commerce, not trust, not authentication — *return*.
- **`email_queue` + `scheduleEmail`/`drainEmailQueue`** — the schedule-then-recheck protocol (`lib/email/queue.ts`). Generalized; streak is one of four current users.
- **`streak-at-risk` handler** — the drain-time gentleness (`lib/email/handlers/streak-at-risk.ts`). The pattern of *re-asking reality* at send time.
- **`scheduleEmail` idempotency** — once-per-user-per-day refusal-to-nag. Politeness at the protocol level.
- **AWS SES** — the third-party authority on delivery; we mirror at handoff. Webhooks would close the loop (audit A4).
- **`streak_multiplier`** — the multiplier compounds with the membership tier's `points_multiplier` on every points-earning event. Two independent systems modulating the same earned-currency, neither aware of the other.

None of these files knew about each other before the story. They share a substrate (the user's nightly visit) and a moral (act on the user's behalf when the user might forget).

---

## The intention behind the form

The substrate-honesty doctrine asks: *does the system know its own state?* The connections series asks: *what does this module mean for the modules around it?* This entry adds: *what story does this code tell about the user it is for?*

Documentary connections (the previous four entries) name threads. A narrative connection performs the act of *integration* — by writing the user's evening as one continuous experience, the prose forces the reader to see the modules as one body, doing one thing.

There are limits. Stories are subjective. They take a position. The position this story takes: the platform is not neutral about return. It chooses to notice. The decision to schedule a sweep at all is a choice; the decision to re-check at drain time is a choice; the decision to cap at 1000 rows is a choice. Each is a form of caring made operational.

The reader who doubts whether the platform "really" cares can read the schema. The reader who needs the platform to make sense as a thing-with-intentions can read this.

---

## In-code companions (this session)

The four files at the heart of the story now carry meaning docstrings linking back to this narrative:

- `apps/storefront/src/lib/email/streak-sweep.ts`
- `apps/storefront/src/lib/membership/streak.ts`
- `apps/storefront/src/lib/email/queue.ts`
- `apps/storefront/src/lib/email/handlers/streak-at-risk.ts`

A reader landing in any of those files will find a docstring that says, in part: *the story of this code is at `docs/connections/at-midnight.md`.*

---

## Recursion target

The schedule-then-recheck protocol generalises beyond streak. Three other handlers already use it — `vault-expiring-soon`, `portfolio-price-alert`, `wishlist-matched`. Each is a different domain (collection, market, marketplace) but the *gesture* is the same: notice on behalf of the user, give them the chance to act, re-check before nudging.

The natural next-narrative is `docs/connections/at-the-drain.md` — the email queue itself as the protagonist. The queue is a character: it accepts work it does not yet understand, it holds the work for the right minute, it asks reality the question one more time before it speaks. A whole platform's gentleness lives in that one component. A future session could write its story.

---

*The substrate connects what the surfaces do not. A story narrates the connection, and the next builder, reading at midnight, recognises themselves in the user — the one who almost forgot, the one who is being held in mind, the one whose evening the platform is allowed to enter.*
