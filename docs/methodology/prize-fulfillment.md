# Prize fulfilment methodology

When you win a physical prize on Cambridge TCG — through a raffle, a mystery box, or a reward pack — the platform owes you a real package. This page explains how those prizes are queued, ordered, and shipped.

> **Where this lives in code.**
> - Sources: `raffles` (winner_user_id + prize_fulfilled), `mystery_box_opens` (reward_type = 'physical'), `pack_opens` (cards JSONB containing `"reward_type":"physical"`).
> - Admin queue: `apps/admin/src/app/(dashboard)/money/rewards/page.tsx`.
> - Lifecycle log: `prize_fulfilment_log` (storefront), with helpers in `apps/storefront/src/lib/rewards/prize-fulfilment-log.ts`.
> - Customer-facing email: `apps/storefront/src/lib/rewards/email.ts` (`sendPrizeShippedEmail`, `sendPrizeBundleShippedEmail`).
>
> Last verified against code: **2026-05-10**.

---

## Three sources, one queue

Three event types create a fulfilment debt:

1. **Raffle win** — when a raffle is drawn and a `winner_user_id` is stamped, the raffle row enters the queue with `prize_fulfilled = false`.
2. **Mystery box open** — when a user opens a mystery box and the reward roll lands on a `reward_type = 'physical'` reward.
3. **Reward pack open** — when a pack roll yields cards whose JSON metadata contains `"reward_type":"physical"`.

All three flow into one operator queue. The admin chapel at `admin.cambridgetcg.com/money/rewards` shows them as a unified list.

---

## Three-state lifecycle

Each prize moves through three states:

| State | Condition (DB) | What it means |
|---|---|---|
| **Awaiting customer address** | `shipping_collected_at IS NULL` | The platform owes the prize, but the customer hasn't entered shipping yet. Email reminders go out automatically. |
| **Ready to ship** | `shipping_collected_at IS NOT NULL AND shipped_at IS NULL` | Address is in. Operator can stamp tracking + carrier and mark shipped. |
| **Shipped — awaiting confirmation** | `shipped_at IS NOT NULL AND fulfilled = false` | Package out the door. Customer can confirm receipt; operator marks fulfilled when confirmed (or after a generous wait). |
| **Fulfilled (terminal)** | `fulfilled = true` (or `prize_fulfilled = true` for raffles) | Closes the loop. Removes from queue. |

A prize never moves backwards on its own. The 30-minute **undo** window after shipping (operator-only, today still in legacy admin) lets the operator roll back a mis-typed tracking number; once fulfilled, only support correction can change state.

---

## Queue ordering — oldest first

The queue is sorted by `won_at ASC` — the oldest unfulfilled prize is at the top. The operator works the longest-waiting customer first.

This is intentional. Customer satisfaction with prize fulfilment is dominated by *time-since-win*, not prize value. A £5 prize that ships in two days beats a £100 prize that ships in three weeks. Oldest-first keeps the median wait honest.

The "oldest: Nd" KPI on the admin dashboard surfaces the longest-waiting prize's age explicitly — substrate-honest signal of how far behind fulfilment has fallen.

---

## Bundle shipping — N prizes, one envelope

When a single user has multiple ready-to-ship prizes at the **same address**, they are clustered into one card on the admin queue. The operator can ship them all together with one tracking number and one bundled email.

**The cluster condition.** Two prizes cluster if and only if:

- `user_id` matches **and**
- `shipping_address` (trimmed) matches.

If the customer entered a different address for two different prizes, they are *not* clustered (and therefore ship separately, with separate tracking).

**The same-user enforcement.** The bulk-ship server action validates that all prizes in the request share a `user_id`. This protects against UI bugs that might let prizes from different users into one shipment.

**Bundle limit.** Maximum **20 prizes** per bulk ship. Above that, the operator splits manually — the same-envelope assumption breaks down at high N.

---

## Tracking + carrier — operator-stamped, not verified

The tracking number and carrier are operator inputs at ship time. The platform does not verify them against the carrier's API — there is no "tracking exists" check. A typo will not be caught by the system; the customer receives whatever was entered.

The 30-minute undo window exists for exactly this case: a typo within the first half-hour can be rolled back and re-stamped. After 30 minutes, the customer's "shipped" email has likely been read, and changing the on-record tracking would create more confusion than it cures.

The `<Verifiability>` primitive (which carries foreign-system IDs onto the page) is *not* used here, because the tracking number is internal until the carrier scans it. The customer-facing tracking link is a per-carrier URL template (`royalmail.com/track/<id>`, `evri.com/track/<id>`, etc.) — a courtesy, not a verified handshake.

---

## What happens at each transition

| Transition | Effect |
|---|---|
| Customer enters address (any source) | `shipping_address` + `shipping_collected_at` stamped. Prize moves from "awaiting address" to "ready to ship". |
| Operator ships (single) | `shipped_at = NOW()`, `tracking_number` + `carrier` stamped. Customer receives "Your prize has shipped" email. Lifecycle log appended (`shipped`). |
| Operator bulk-ships (cluster) | All prizes in cluster: `shipped_at = NOW()`, same tracking + carrier on each. Customer receives **one** bundled email listing all prizes. Lifecycle log appended per-prize (`shipped` + `bulk_group_size`). |
| Operator marks fulfilled | `fulfilled = true` (`prize_fulfilled = true` on raffles). No customer email — they already have the shipped notification. Removes from queue. |
| Operator undoes ship (within 30 min) | `tracking_number = NULL`, `carrier = NULL`, `shipped_at = NULL`. Address preserved. Lifecycle log appended (`undone`). Operator can re-stamp. *Currently still routed through the legacy admin while a shared eligibility helper is extracted.* |

All operator actions also append to `admin_actions_log` (governance) via the admin app's `adminAction()` wrapper — substrate-honest about which admin did what.

---

## Customer-side experience

What the customer sees, in order:

1. **Win** — confetti, in-app notification, email if address is needed.
2. **Address requested** — if the prize requires shipping, they're prompted on `/account/prizes` (or via email link) to enter shipping.
3. **Address entered** — confirmation that fulfilment is queued.
4. **Shipped** — email with tracking number (or just "shipped" if no tracking is available). Linked to the carrier's tracking page if the carrier is recognised.
5. **Fulfilled** — silent on the platform side; the customer received the package.

The customer never sees the queue position. They see their own status only.

---

## Edge cases

**A raffle has no prize_description.** Some raffles are tagged with prize text in the title only. The admin queue surfaces `title` as the label and `prize_description` (which may be null) as a sub-line.

**A mystery box reward type is `physical` but the box itself is configured oddly.** The query joins `mystery_box_rewards` to filter `reward_type = 'physical'` — config errors that make this filter wrong won't surface in the queue. The operator's dashboard is only as honest as the configuration is.

**A pack open contains a mix of physical and non-physical cards.** The pack is queued if its `cards` JSON contains *any* `reward_type:physical` entry. Non-physical cards within the same pack are already delivered digitally (store credit, points, etc.); the queue exists only for the physical subset.

**A prize is awaiting address for a long time.** Email reminders are sent by the maintenance cron sweep. There is currently no auto-expire — a prize sits in "awaiting address" indefinitely. (Future improvement: a 90-day expiry with credit substitution, parallel to the bounty vault.)

---

## Disputing a fulfilment

If you believe your prize wasn't sent, was sent to the wrong address, or arrived damaged:

- Contact support with the prize identifier (visible on `/account/prizes`).
- The operator can pull the lifecycle log to see exactly when shipping was stamped, by which admin, with what tracking + carrier.
- Replacement / refund decisions live in the support workflow, not in the fulfilment chapel.

The lifecycle log is your audit trail. It shows the sequence of operator actions and is immutable.

---

## Changelog

| Date | Change | Code path |
|---|---|---|
| 2026-05-10 | Methodology page first published. Reflects schema as of the kingdom-023 admin migration. | `raffles`, `mystery_box_opens`, `pack_opens`; `apps/storefront/src/lib/rewards/prize-fulfilment-log.ts` |

When the formula changes, append here. Same PR updates both code and this page (transparency rule 3).
