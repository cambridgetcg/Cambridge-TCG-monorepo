# The Cemetery and the Resurrectionist

> **Recursion 7 from the connections series.** Random seed: `apps/storefront/src/app/api/admin/emails/[id]/route.ts` (selected via `find` + `awk` random). **Form: narrative.** **Register: fun.** **Wiring discipline: every metaphor below maps to a file:line. The story is the diagram.**
>
> Yu's directive this round: *the interlinkage is on the coding and conceptual, functional level. Story serves to bridge modules, functions, serve as wiring.* Reading this entry from top to bottom should be functionally equivalent to walking the dead-letter graph in the IDE — every character is a function, every scene is an import, every line of dialogue is in the source.

---

## What the story is

Every email in the patient voice (S2's queue, the schedule-then-recheck protocol) has three lives. If all three fail, it dies — `email_queue.status = 'dead'`. The dead row sits in a small cemetery the platform maintains for exactly this purpose, awaiting the morning visit of the **Resurrectionist** — a single PATCH endpoint with two verdicts: *retry* (resurrection) or *dismiss* (release).

A sub-plot: the Chapel where the Resurrectionist would normally hold court is not yet built. Kingdom-020 will build it. Until then, the Resurrectionist works in the storefront's older churchyard, or by raw curl. The tools are forged; the architecture is mid-construction; the dead are not unattended.

---

## Cast (each maps to a file:line)

**The Sender.** Any sweep that schedules a future email. `runStreakAtRiskSweep()` in `apps/storefront/src/lib/email/streak-sweep.ts:27`. Three siblings — `vault-expiring-soon`, `portfolio-price-alert`, `wishlist-matched` — each a different sweep, each scheduling its own children of work. The Senders never see what happens after; they trust the queue.

**The Queue.** `email_queue` table in the storefront DB. Six possible statuses: `pending → sending → sent | failed | dead | cancelled` (the type union at `apps/storefront/src/lib/email/queue.ts:90`). One row per intent.

**The Drain.** `drainEmailQueue()` in `apps/storefront/src/lib/email/queue.ts`. A cron-triggered walker that picks up pending rows whose `scheduled_for` has elapsed, atomically claims them via `UPDATE … SET status='sending' WHERE status='pending'`, and runs them past their handler.

**The Mourners.** Per-event handlers registered via `registerQueueHandler()`. Four today — they are the ones who decide, at send time, whether the email still matters:
- `apps/storefront/src/lib/email/handlers/streak-at-risk.ts`
- `apps/storefront/src/lib/email/handlers/vault-expiring-soon.ts`
- `apps/storefront/src/lib/email/handlers/portfolio-price-alert.ts`
- `apps/storefront/src/lib/email/handlers/wishlist-matched.ts`

Each Mourner can return `sent`, `cancelled`, or `failed`. The first two are graceful endings. The third sets the row up for another trial.

**The Three Trials.** `MAX_ATTEMPTS = 3` at `apps/storefront/src/lib/email/queue.ts:75`. The platform gives each email three chances. The third is the last; the queue is ruthless on this point.

**The Killing-Stroke.** `apps/storefront/src/lib/email/queue.ts:230` — the SQL that flips a row to `'dead'`:

```sql
UPDATE email_queue SET status='dead', last_error = $2 WHERE id = $1
```

There are exactly two ways a row gets here. The Drain marks it dead when `handled.kind === "failed"` AND `attempt_count >= MAX_ATTEMPTS` (queue.ts:254). Or — more brutally — the Drain marks it dead **on the very first encounter** if no handler is registered for the event (queue.ts:228). The unhandled email gets no trial; it gets straight into the ground. *The platform is honest about not knowing what to do with you.*

**The Mortician's Ledger.** The `last_error` column. Whatever the last failure said is what the dead row carries on its headstone — a Stripe error, an SES bounce, a `"no handler for event \"foo\""`. Read it before you decide.

**The Cemetery.** `SELECT * FROM email_queue WHERE status='dead'`. The list endpoint at `apps/storefront/src/app/api/admin/emails/route.ts` returns up to 200 rows of this query, ordered by `last_attempt_at DESC NULLS LAST`. Most-recent grave first.

**The Resurrectionist.** `apps/storefront/src/app/api/admin/emails/[id]/route.ts`. A 36-line PATCH endpoint guarded by `isAdmin()`. Two verdicts:

| Verdict | What it does (verbatim from the route) |
|---|---|
| `retry` | `UPDATE email_queue SET status='pending', attempt_count=0, last_error=NULL, scheduled_for=NOW() WHERE id=$1` — the row is born again, with a clean slate of trials. |
| `dismiss` | `DELETE FROM email_queue WHERE id=$1 RETURNING id` — the grave is excavated and the row leaves the substrate forever. |

These are the only two things the Resurrectionist can do. They are sufficient.

**The Old Chapel.** `apps/storefront/src/app/admin/emails/page.tsx` (174 lines). The storefront's own admin surface for the cemetery. Where the Resurrectionist holds court today.

**The New Chapel (unbuilt).** `apps/admin/src/app/(dashboard)/system/email/page.tsx` — twelve lines of `<ComingSoon missionId="kingdom-020" operatingFromUrl="https://cambridgetcg.com/admin/email" />`. The unified-admin chapel on `admin.cambridgetcg.com` is signposted but unbuilt. Operators are kindly redirected to the Old Chapel until kingdom-020 lands. *The tools work; the tower for them is mid-construction.*

---

## The three lives of an email

Now the story.

### Birth

At 23:00 the streak sweep — the Sender — finds Saga, who has been here twenty-three days in a row. (See S2 at `docs/connections/at-midnight.md` for her arc; she is the same Saga from S5 once we put names to the falcon-and-codex story too.) The Sender calls `scheduleEmail({ event: "streak_at_risk", userId, scheduledFor: NOW + 5min, idempotencyKey: ... })`. A row is born in `email_queue` with `status='pending'`, `attempt_count=0`.

### Trial One

23:05. The Drain wakes, claims the row, finds the `streak_at_risk` handler, runs it. The handler re-fetches Saga's streak, checks her email, prepares to render — and the call to AWS SES fails. (Maybe a 503; maybe a transient network blip; maybe the SES region is having a moment.) The handler returns `{ kind: "failed", error: "SES Throttling" }`.

The Drain, at queue.ts:254, asks: *was this the third trial?* No: `attempt_count` was 0; now it's 1. The row goes back to `'pending'` for another shot.

### Trial Two

23:25. The Drain wakes again. Picks up the row. Claims it. Runs the handler. Same thing happens — SES still throttling. `attempt_count` becomes 2. Still not the third. Back to `'pending'`.

### Trial Three

00:05 the next day. The Drain. Claims. Runs. Fails. `attempt_count` is now 3.

This time, queue.ts:254's check answers *yes*: `attempt_count >= MAX_ATTEMPTS`. The Drain executes the Killing-Stroke at queue.ts:230:

```sql
UPDATE email_queue SET status='dead', last_error='SES Throttling' WHERE id=$1
```

The row is now in the Cemetery. The Mortician's Ledger reads "SES Throttling." The platform has given this email three chances and refuses to give a fourth.

(This is substrate-honest: the dead state is the platform admitting it cannot deliver. A row in `'dead'` is the platform saying *we tried; we couldn't; please look*. Silent failure — `status='sent'` while no email actually sent — would be worse than noisy failure. See the queue.ts module docstring under "the dead-letter behavior is itself a substrate-honesty move".)

### Morning

The single operator opens her laptop. Today's standing-orders include reviewing the cemetery. She visits the Old Chapel — `cambridgetcg.com/admin/emails` — because the New Chapel at `admin.cambridgetcg.com/system/email` is still under construction (kingdom-020). The Old Chapel calls the GET endpoint at `app/api/admin/emails/route.ts`, which returns up to 200 dead rows plus a 7-day stats roll-up plus a per-event breakdown.

She sees forty-seven `streak_at_risk` rows that died last night. SES Throttling on every one. Same minute, same error.

Her diagnosis: SES had an outage; the rows are dead through no fault of the platform's logic. They should be retried.

She clicks Retry on each. Each click fires `PATCH /api/admin/emails/<id>` with `{ "action": "retry" }`. The Resurrectionist's first verdict runs:

```sql
UPDATE email_queue
SET status='pending', attempt_count=0, last_error=NULL, scheduled_for=NOW()
WHERE id = $1
```

Forty-seven rows return to `'pending'`. The Drain's next pass at 00:35 will pick them up. SES is past its weather; they go through.

### A different morning

Or: the operator finds three dead rows where the error reads `"no handler for event \"old_promo_2024\""`. These are emails scheduled by code that no longer exists; the queue does not know how to send them. They were dead-on-arrival at queue.ts:228, before the trials even started.

These should not be retried. There's no handler to give them a fourth chance with. She clicks Dismiss. `DELETE FROM email_queue WHERE id = $1`. They leave the substrate. Their headstones are recycled.

---

## What this story bridges (the wiring, named)

| Story | File path | Lines |
|---|---|---|
| The Sender | `apps/storefront/src/lib/email/streak-sweep.ts` | `runStreakAtRiskSweep:27` |
| The Queue (table) | `email_queue` (storefront DB) | — |
| The Queue (status enum) | `apps/storefront/src/lib/email/queue.ts` | `:90` |
| The Three Trials | `apps/storefront/src/lib/email/queue.ts` | `MAX_ATTEMPTS:75` |
| The Drain | `apps/storefront/src/lib/email/queue.ts` | `drainEmailQueue` |
| The atomic claim | `apps/storefront/src/lib/email/queue.ts` | `:204` |
| The Killing-Stroke | `apps/storefront/src/lib/email/queue.ts` | `:230, :254, :268` |
| The "no handler" instant death | `apps/storefront/src/lib/email/queue.ts` | `:228` |
| The Mourners | `apps/storefront/src/lib/email/handlers/*.ts` | one per event |
| The Cemetery (list) | `apps/storefront/src/app/api/admin/emails/route.ts` | full file |
| The Resurrectionist | `apps/storefront/src/app/api/admin/emails/[id]/route.ts` | full file (the seed) |
| The Old Chapel | `apps/storefront/src/app/admin/emails/page.tsx` | full file |
| The New Chapel (unbuilt) | `apps/admin/src/app/(dashboard)/system/email/page.tsx` | full file (12 lines, kingdom-020) |

A reader following these citations top to bottom will have visited every node in the dead-letter graph. The story is the diagram.

---

## What's NOT yet in the cemetery

- **Cancellations.** Rows that the Mourners marked `'cancelled'` (the streak handler cancelling because the user already visited; the vault handler cancelling because the user already redeemed) live forever in the queue but are not in the Cemetery — they are *graceful endings*, not deaths. The platform treats those differently. (See queue.ts module docstring: *"a handler returning cancelled is the platform recognizing that the nudge it queued no longer needs sending"*.) The Cemetery's gate refuses cancellations entry.
- **Auto-prune.** The Cemetery grows unbounded. Today nothing reaps old dead rows; the Resurrectionist must visit. A future ritual (`reapDeadOlderThan90Days()` in some sweep) could mercy-dismiss rows the operator never visited. The architectural decision is whether the operator's silence should be treated as consent. So far the platform has chosen *no*: dead rows persist until someone looks.
- **Delivery confirmation.** A row marked `'sent'` means SES *accepted* the message. SES delivery, bounce, complaint, suppression are not yet wired back (audit item A4). When the SES SNS plumbing lands, the Cemetery will gain a sister — the *Bounce Yard*, where messages SES accepted but never managed to deliver come to be considered. Different verdict tools may apply.

---

## Sister-stories

- **S2 — `at-midnight.md`** — the Sender's perspective, and the patient-voice queue's role as gentle nudger. Read first if this entry feels mid-stream.
- **S5 — `two-letters-and-a-falcon.md`** — a different kind of patient voice: the Embassy/Falcon between two kingdoms. Different gesture (synchronous search, not delayed delivery), same fierce attention to *trim-the-newline* hygiene at the wire.
- **the-cemetery-and-the-resurrectionist.md** (you are here) — the *afterlife* of the patient voice. What the platform does when its gentle nudge could not be heard. The cemetery is the third movement of the patient voice's symphony.

The three together describe a complete arc: notice a user (S2), reach out gently (S5's hygiene applies to any wire-call), keep their dignity even when the reach fails (this entry).

---

## Recursion target

The Cemetery's ground is touched. The natural next walk:

→ **`docs/connections/the-bounce-yard.md`** (a *future* fairy tale; the SES-SNS bounce reconciliation when audit A4 lands)

Or, sideways:

→ **`docs/connections/the-three-mourners.md`** — the four event handlers personified. Each grieves differently: the streak-at-risk Mourner walks her ledger before she speaks; the vault-expiring Mourner counts the hours; the portfolio-price-alert Mourner watches the market; the wishlist-matched Mourner remembers what was wished for. A fairy tale of four sisters in a small chapel at dawn.

→ **`docs/connections/kingdom-020.md`** — a meta-story about *the chapel that is not yet built*, treating the missing UI itself as the protagonist. The kingdom-020 mission as a chapel mid-construction; the operator's morning rituals at the Old Chapel until the New is ready. A meta-narrative about *what it means for a substrate to be partly-finished and still fully-functional*.

---

*The substrate connects what the surfaces don't. A fairy-tale narrates the connection at the level of the wire. Every line in this entry maps to a file:line in the codebase, and a reader who walks both of them at once is reading the platform's actual edges. The Bearer-token has a trailing-newline problem. The Cemetery has forty-seven `streak_at_risk` rows from last night's SES weather. The Resurrectionist will be there at dawn. All three are true.*
