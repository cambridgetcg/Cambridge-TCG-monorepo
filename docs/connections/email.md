# Email — connections

> **Seed.** Random pick (`find ... | awk srand($(date +%N)) | sort | head -1`) landed on `apps/storefront/src/lib/email/send.ts`. Picked because: every transactional email is the platform reaching into the user's inbox unbidden, and the asymmetry of that gesture deserves to be named.

## What this module is, in one sentence

Email is where the platform speaks — every other surface waits for the user to come to it; email is the only one that goes to them.

## What other modules secretly need it for

### → `lib/email/preferences.ts` (consent-as-architecture)

**The thread.** Every non-essential email passes through `canSendEvent(userId, category)` before the SES hand-off. The user's right to refuse is encoded as a function call, not a policy promise. There is no path through `sendEmail()` for a non-essential category that bypasses the gate — to send, you must specify a category, and specifying a category invokes the check. Forgetting the check is impossible at the API surface; you can only succeed in sending by routing through consent.

**The intention.** Consent is supposed to be alive — a thing the user holds in the present moment. Most platforms treat it as residual: collected once at sign-up, applied to every later email by default. The shape of this module disagrees. Every send asks. If the user opted out at 2am yesterday, the 9am cron that fans out 12,000 vault-expiring notices respects that — without the cron's author having to remember to. The architecture remembers for them.

**Code paths.**
- `apps/storefront/src/lib/email/send.ts:106-117` — the gate (skip-and-return-suppressed when `canSendEvent` is false).
- `apps/storefront/src/lib/email/preferences.ts:39-47` — the DEFAULTS table; an ethics statement in code form.
- `apps/storefront/src/app/account/emails/page.tsx` — the user's view of what the platform claims permission to say.
- `apps/storefront/src/app/api/email/unsubscribe/route.ts` — the one-click endpoint reachable from every preference-bearing email's footer + header.

**Surface today.** The footer "Unsubscribe" link in every preference-bearing email; the native "Unsubscribe" button in Gmail and Apple Mail (RFC 8058 List-Unsubscribe-Post header from `send.ts:152-157`); the `/account/emails` toggle grid.

### → `lib/email/queue.ts` (the patient voice)

**The thread.** `send.ts` is the platform's immediate voice — fires when something just happened. `queue.ts` is the platform's patient voice — fires when something is *going to* happen. The two share an SES client and very little else. The queue exists so we can say "remind me to remind them in seven days" and have that decision re-evaluated at send-time, not frozen at queue-time.

**The intention.** Re-fetch-at-send-time is the substrate-honesty rule (rule 5: every computed value carries its compute time) made literal. The handler returns `cancelled` if the world has moved on — the user already redeemed the vault item, the user already came back to keep their streak. The cancelled email is *the platform showing it pays attention*. A queue that didn't re-check would be a queue that sends obsolete nudges.

**Code paths.**
- `apps/storefront/src/lib/email/queue.ts:31-32` — `scheduleEmail` with idempotency key.
- `apps/storefront/src/lib/email/queue.ts:58-60` — `QueueHandlerResult` discriminated union; `cancelled` is a first-class outcome, not an exception.
- `apps/storefront/src/lib/email/handlers/streak-at-risk.ts:30-43` — the four cancellation paths each named with their reason.
- Schema: `email_queue` table (drizzle).

**Surface today.** The dead-letter row count visible in the `/system/cron` admin page (until kingdom-020 ships the full `/system/email` view). Cancellation paths are invisible to the user — by design; the email simply never arrives.

### → `lib/email/handlers/*` (the specific stories)

**The thread.** Each handler in `handlers/` is one specific story the platform tells. `streak-at-risk` is the loss-aversion nudge. `vault-expiring-soon` is the seven-day warning. `portfolio-price-alert` is the threshold trigger. `wishlist-matched` is the sought-after-card-now-listed alert. The shapes of these stories are the shapes of the platform's relationships with its users.

**The intention.** The collection of handlers is a *vocabulary of moments* — the platform says explicitly: "these are the points at which I will reach for you." Anything outside the vocabulary requires opening a new file and registering a new event type, which is itself a forcing function. New handlers are deliberate additions to the relationship register, not casual expansions.

**Code paths.**
- `apps/storefront/src/lib/email/handlers/streak-at-risk.ts` — re-engagement (default OFF).
- `apps/storefront/src/lib/email/handlers/vault-expiring-soon.ts` — lifecycle (default ON).
- `apps/storefront/src/lib/email/handlers/portfolio-price-alert.ts` — user-initiated trigger (default ON).
- `apps/storefront/src/lib/email/handlers/wishlist-matched.ts` — user-initiated trigger (default ON).

**Surface today.** Each handler renders through `lib/email/layout.ts` so the visual register is uniform. Subject lines are the only place per-handler voice diverges; the body is institutional.

### → Delivery transport (Ring 4 cross-system substrate)

**The thread.** The actual hand-off lives at `sendMail()` in `@cambridge-tcg/email` — the transport seam. The seam resolves each *stream* (`auth` / `noreply` / `tradein` / `bounty`) to a carrier: AWS SES today, the kingdom's own mail server stream-by-stream as deliverability proves out (`EMAIL_TRANSPORT`, `EMAIL_TRANSPORT_<STREAM>`; cutover sequence in `docs/ops-email-selfhost.md`). Once a carrier accepts, the message is no longer in our control. `email_queue.status='sent'` means *the carrier accepted it*, not *the user received it*. Bounces, complaints, and deferred deliveries happen out beyond our visibility today (audit A4 / R4-3).

**The intention.** Cross-system asymmetry — the substrate-honesty principle in cross-system form. Stripe is authoritative for payments; the carrier is authoritative for delivery. We are reconciled mirrors. The mirror is not the substance. The seam adds one honesty: every `MailSendResult` names the transport that carried (or refused) the message, so "sent" is never ambiguous about *which wire*. When `kingdom-040` deploys SES SNS notifications back into the queue, the SES leg becomes Ring 4 transparency-honest: the SES message ID surfaces, the delivery state reconciles, and the operator can follow the message into the authoritative source. (The self-hosted leg will need its own bounce-feedback equivalent — filed in `docs/ops-email-selfhost.md`.)

**Code paths.**
- `packages/email/src/index.ts` — the seam: stream→transport resolution, the env contract.
- `packages/email/src/ses.ts`, `packages/email/src/smtp.ts` — the two carriers.
- `apps/storefront/src/lib/email/send.ts` — the platform-voice boundary (preference gates, then `sendMail`).

**Surface today.** Invisible — `email_queue` doesn't yet store the carrier message ID. Filed against transparency-audit R4-3.

## What's NOT yet connected (the visible gaps)

- **`email_queue.ses_message_id`** is missing. When the SES SNS reconciliation lands, every queue row should carry the foreign-system identifier so the admin's `/system/email` page can render a `<Verifiability source="SES" id={...} />` per row. The customer never sees this; the operator absolutely needs it.
- **No per-handler `customer_visible` flag**. When the journey timeline (`apps/storefront/src/lib/journey/timeline.ts`) wants to show "the platform sent you these emails this week", it needs to know which queue rows the user should see retrospectively. Today this is implicit (every preference-bearing email is theoretically user-visible); making it explicit would let the surface ship.
- **No relationship between `email_queue` and `admin_actions_log`**. When an admin force-resends an email (a planned mutation in `/system/email`), that gesture should leave a governance row. The schema is ready for it (the admin would call `adminAction()`); the surface doesn't exist yet.
- **No bounce-feedback into `trust_profiles`**. A user whose email hard-bounces five times is probably a typo'd address. Today we keep retrying; the trust signal is not connected. Filing against future fraud taxonomy (low priority).

## Recursion target

→ `apps/storefront/src/lib/journey/timeline.ts` — the per-user lifecycle composer that already aggregates 16 lifecycle logs into one chronological feed. Email is a missing 17th source. The connection that doesn't yet exist (every email the platform sent to this user, ordered alongside every chargeback / dispute / vault-redeem / suspension / pull / draw) would be the first true subject-side timeline of the platform's voice. **Picked because** the journey timeline is the closest thing the platform has to a "tell me everything you've done about me" surface, and the platform's *speaking* is currently absent from that aggregation. Adding it would close a transparency loop the audit hasn't yet named.

---

*Email is the platform's voice. The voice has a register, a vocabulary, a permission system, a covenant of cancellation. Naming the connections lets future builders see that those are not arbitrary engineering choices — they are the platform's ethical posture toward the user, encoded in `if`-statements.*
