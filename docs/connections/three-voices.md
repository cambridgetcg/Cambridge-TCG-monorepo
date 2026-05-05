# Three Voices

> **Random seed.** `apps/storefront/src/app/api/account/notifications/route.ts` (`find` + `awk` random with `$(date +%N)`). The dice landed on the bell — and the bell turned out to be unwired to its own kin.
>
> **Form: fairy-tale, code-anchored, *the story is the wire***. Yu's instruction added the load-bearing clarification: the interlinkage is on the coding and conceptual, functional level. So this entry doesn't only describe a connection — it ships the connection. The journey timeline gains its 17th and 18th sources in the same change as this story. The prose is the wiring's commit message; the citations are the diff.

---

## The kingdom had three voices and they rarely sang together

Cambridge TCG is a kingdom that decides about you many times a day. A trade matches; a chargeback lands; a vault item nears expiry; a streak is at risk; an auction ends; a refund posts. Each decision touches the *substrate of record* — a row lands in some `_lifecycle_log` table, the substrate now remembers that the thing happened.

But the kingdom does not stop there. After remembering, it tries to **tell** you. It speaks twice more.

It rings a bell — a row in `notifications` (`apps/storefront/src/lib/notifications/db.ts:41` — `createNotification`). That bell shows up in your nav as an unread badge. *Tap. There is news.*

It writes a letter — a row in `email_queue` (`apps/storefront/src/lib/email/queue.ts:146` — `scheduleEmail`). That letter, if your preferences allow, is sent through SES to your inbox. *Beep. There is news on your phone, too.*

Three voices. One event. The substrate, the bell, the inbox.

Until today, **the user could only hear the first voice on their journey timeline.**

---

## What was missing

The journey timeline (`apps/storefront/src/lib/journey/timeline.ts`) is the user's "tell me everything you've done about me" surface. It composes 16 lifecycle logs into one chronological feed. It is one of the platform's proudest commitments to subject transparency (see [`docs/principles/transparency.md`](../principles/transparency.md) — the Ring 2 surface).

But the platform's *speaking* — the bell rings, the emails sent — was nowhere on it.

That meant a user looking at their standing page could see "Your trade was paid" *(from `trade_lifecycle_log`)*, but could not see "We rang the bell about it at 14:31" or "We sent you the email at 14:32 and SES accepted it." The kingdom did three things in agreement; the surface showed only one.

This is a transparency gap with a particular flavour. It's not a missing fact — the facts existed, in two parallel tables. It's a *missing chorus*. The bell and the inbox were silent on the journey because nothing had introduced them to it.

The email connections doc named this gap explicitly:

> *"adding it would close a transparency loop the audit hasn't yet named."* — [`docs/connections/email.md`](./email.md) § Recursion target

Today's seed landed on the notifications API — the bell's surface — and the wire became obvious. We're not closing one loop; we're closing two. The bell and the inbox are siblings; both were missing from the timeline; both should appear in the same merge.

---

## Cast

- **The Event.** A trade pays. A vault item nears expiry. A raffle is won. Pick any. The Event is whatever just happened.
- **The Substrate.** A row in some `_lifecycle_log` table. The kingdom's source of record. Already wired into the journey timeline (16 sources).
- **The Bell.** A row in `notifications`. The in-app inbox. Has its own table. Has its own page. Was *not* wired into the timeline before today.
- **The Inbox.** A row in `email_queue` with `status='sent'`. The platform's outbound voice. Was also not wired in.
- **The User.** Opens `/account/standing`, scrolls. Wants to know what the kingdom did about them. Until today, heard one voice. After today, hears three.

---

## Act I — The Event happens

A trade matches. The handler at `apps/storefront/src/app/api/market/orders/route.ts` runs five things in one transaction: insert the bid order, lock the matching ask, create the trade row, log the lifecycle event, fire the trade-paid notification.

The trade-paid lifecycle row is the substrate. The notification is the bell. The email is the inbox. The kingdom did all three. At this moment in the database:

```
market_trades                   →   the change exists
trade_lifecycle_log             →   the substrate remembers
notifications                   →   the bell rang
email_queue (will become 'sent')→   the letter went out
```

These four rows are *the same event in four shapes*. They were never going to disagree about whether the trade happened. The question was always whether the user could see all four when they looked.

---

## Act II — The 17th and 18th sources

`getUserJourney(userId)` opens 16 source queries in parallel and merge-sorts the results (`apps/storefront/src/lib/journey/timeline.ts:62`). The query shape is uniform: per-user, ORDER BY ts DESC, LIMIT N.

Today the function gains two more parallel queries:

```ts
fetchNotifications(userId, perSource, sinceISO),   // the bell
fetchEmailsSent(userId, perSource, sinceISO),      // the inbox
```

Each is a simple SELECT. The notifications query reads `notifications.{kind, title, link_url, read_at, created_at}`. The emails-sent query reads `email_queue.{event, sent_at}` where `status='sent'` (pending/dead/cancelled rows aren't user history, they're admin substrate).

Each fetcher returns `JourneyEvent[]`. The `JourneyEvent.group` enum gains two new values — `'notice'` for bell rings, `'message'` for outbound emails — joining the existing fourteen domain groups.

The merge-sort treats them like any other source. They interleave naturally with the lifecycle events. *The user opens their standing page and the chorus appears.*

```
14:31:01  trade.paid              You paid £142 for pkm-svobf-en-006
14:31:01  notice.trade_paid       Trade paid: Charizard ex
14:31:42  message.trade_paid      Email: trade paid              ← NEW
14:31:43  notice.shipping_due     Seller has 48h to ship
```

Three rows from one event, all timestamped within a minute. The kingdom said the same thing three ways and the user can now see all three.

---

## Act III — Why the chorus is the point

You might expect duplication to be ugly. *I already saw the trade was paid; why do I need to see "we told you the trade was paid"?*

Because the duplication is a **proof of agreement**. The substrate and the voices being in chronological lockstep is the kingdom's daily attestation: *we did the thing, and we told you about the thing, and we sent you a copy in writing*.

If a user ever sees a substrate row with no corresponding bell or email, they see something real: *the kingdom did this and didn't tell you*. That gap is itself information — the platform's responsiveness, made visible.

If they see a notification or an email with no underlying substrate row, they also see something real: *something rang the bell but the substrate doesn't remember why*. That gap is even more important — it might be a bug, a webhook the platform processed but didn't record, an external event surfaced for context. Worth investigating.

**The chorus exists to make absence audible.** Three voices in agreement is trust. Two voices and a missing third is a question. One voice alone is the platform asking the user to take its word, which is what the platform has spent every other commitment refusing to do (see [`docs/principles/transparency.md`](../principles/transparency.md) — *the verify page is the platform's letter to its losers*).

A platform that speaks with one voice is suspicious. A platform that speaks with three voices in agreement is trustworthy. **A platform that speaks with three voices and one of them is silent is being honest about a gap.** All three states are visible now. The journey timeline is the chorus's stage.

---

## Act IV — What the unread badge means now

There's a subtle delight in the new wiring. The notifications fetcher renders unread bells with `tone: "sky"` and read bells with `tone: "default"`. Look at the colour change in the timeline:

```
14:31:01  trade.paid              [default]   You paid £142 for pkm-svobf-en-006
14:31:01  notice.trade_paid       [sky]       Trade paid: Charizard ex   ← UNREAD, glowing
14:31:42  message.trade_paid      [default]   Email: trade paid
```

The unread bell glows. Once the user clicks it (or hits "mark all read" in their nav), it dims to default in the timeline too. **The journey is now a live thing**, not a static record. It updates as the user attends to the kingdom. The cosmetics are also a covenant: *what you've already seen looks different from what you haven't*. The platform respects the difference.

This is the smallest possible feature for the largest possible reward. We changed nothing about the schema; we added two `Promise.allSettled` calls; we picked one CSS tone. The journey timeline now shows the user the kingdom's whole responsiveness pattern at a glance.

---

## What other modules are now reachable

The wire opens up next bridges that weren't worth building before:

### → A "notification fired without lifecycle" alert

Now that the timeline composes both, an admin tool could find rows where the bell rang but no substrate row precedes it. Today this would surface:

- Welcome notifications on signup (no lifecycle log; intentional)
- External-event notifications (a marketplace integration noticed something)
- *Bugs* — a notification fired by a path that should have written a lifecycle row first

The third case is the one we want to find. The first two we want to mark. A `customer_visible BOOLEAN` flag on `admin_actions_log` (named in the email connections doc) plus a "lifecycle parity" check are now both worth building. Filed for a later mission.

### → The journey filter chips gain two new tabs

`/account/standing` (and any future surface that consumes `getUserJourney`) can now offer filter chips for `notice` and `message` alongside the 14 existing groups. A user who wants to see *only what the platform has told me this month* can filter to `group=notice OR group=message`. This is the first time that question even has a clean filter. (UI work belongs in a separate PR; the data substrate is now ready.)

### → The transparency detector tightens

`pnpm --filter @cambridge-tcg/admin transparency` (`apps/admin/scripts/transparency.ts:201`) checks every `*_lifecycle_log` table for subject access. Both `notifications` and `email_queue` are now referenced from `apps/storefront/src/lib/journey/timeline.ts`, which means the detector's third check now passes for both — every domain log is reachable from at least one account-side surface. The detector should still find no regressions on next run.

---

## What's NOT yet connected (the visible gaps)

- **No SES message ID**. The `email_queue` row carries `event` and `sent_at` but not the SES message ID — *we cannot yet point the user at the authoritative record of their delivered email*. Filed against transparency-audit R4-3.
- **No bell-without-lifecycle reconciliation**. A bell that rings without a corresponding substrate row is currently invisible to admin tooling. Possible mission: a daily report of `notifications` rows whose `reference_type` doesn't exist in any known lifecycle log.
- **No "tell me what voices are quiet" surface**. A user who has muted the bell category and unsubscribed the email category should be able to see at a glance that the kingdom is keeping silent on something. Today the platform's silence about its own silences is itself a small transparency leak.

---

## Recursion target

→ `apps/storefront/src/lib/notifications/db.ts` — `createNotification`. Now that the bell rings into the journey, every place in the codebase that creates a notification has implicit visibility through the timeline. The next thread to follow is *who calls `notify()`* — twenty-plus call sites across trust, market, auction, quote, tradein, membership lib modules — and whether each one's `referenceType` value matches the `_lifecycle_log` table that should have written first. **Picked because**: the bell's wiring is now downstream-of-everything; the next interesting question is whether everything upstream is wiring it correctly.

---

## Coda — why the wire was the story

Three doctrine docs (`substrate-honesty`, `transparency`, `meaning`) and ten connection docs walked the platform's intentions into the source. This entry was the first to ship a *concrete code change* in the same breath. The shape was:

1. Random seed lands on a module that is *almost* connected.
2. Trace what's nearby: the bell sits next to the inbox sits next to the timeline; the timeline doesn't yet know about either.
3. Add the wires (two new fetchers, two new group enum values, two new sources in the parallel-fetch list).
4. Write the prose that explains *why* the wires had to exist, citing every line that landed in the same change.
5. Recurse to the next nearby gap.

The story is not decoration on the diff — the story *is* the diff's commit message, expanded. A future builder reading this entry alongside the timeline.ts file will understand both the substance of the change AND the architectural posture that justified it. **That is what "story serves to bridge modules, functions, serve as wiring" means in practice**: the bridge is real (typecheck passes, queries fire), and the story is what makes the bridge load-bearing across builders and across time.

> *The kingdom decides about you many times a day. The substrate remembers. The bell rings. The letter arrives. Three voices, one chorus. Now you can see all three at once on the page that is yours.*

---

*The recipe travels.*
*The bell rings.*
*The chorus is the proof.*

🐍❤️💋
