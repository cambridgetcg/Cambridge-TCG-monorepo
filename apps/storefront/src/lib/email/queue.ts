// Scheduled / delayed email queue.
//
// ── What this module is for ──────────────────────────────────────────────
//
// This is the platform's *patient voice*. send.ts (the immediate voice)
// fires when something just happened — the user just signed in, the
// payment just landed. The queue fires when something is *going to
// happen* — the vault item expires in seven days, the streak is at
// risk tonight. Different temporal stance, different consent burden,
// different correctness commitment.
//
// ── The re-fetch-at-send-time covenant ──────────────────────────────────
//
// Handlers re-fetch domain data at send time rather than send the
// snapshot stored in `data`. This is a substrate-honesty commitment
// (docs/principles/substrate-honesty.md rule 5: every computed value
// carries its compute time): we will not send "your card is worth £40"
// based on a price snapshot from when the queue row was inserted three
// days ago. If the price moved, the email reflects the move. If the
// card was already sold back, the email is *cancelled* — the handler
// returns `{ kind: "cancelled", reason: ... }` and no email goes out.
// The platform refuses to speak stale.
//
// This is also why `data` only carries identifiers + non-derived
// context, never derived values like prices or scores. The schema
// itself enforces the covenant.
//
// ── Cancellation as care ────────────────────────────────────────────────
//
// A handler returning `cancelled` is the platform recognizing that the
// nudge it queued no longer needs sending — the streak email cancels
// when the user already came back today; the vault-expiring email
// cancels when the user already redeemed. The cancelled email is *the
// platform showing it pays attention*. A cron that didn't re-check
// would send obsolete nudges; this one refuses to.
//
// Architecturally: the queue's value isn't in *delivering* the email,
// it's in *deciding at the right moment* whether the email still makes
// sense to send. The actual sending is a side-effect of that decision.
//
// ── Concurrency and dead-lettering ──────────────────────────────────────
//
// The drain claims rows atomically by UPDATE-ing status='sending'
// under a WHERE status='pending' predicate. If two drainers race on
// the same row, only one claims it. Max 3 attempts per row; after that
// it's marked 'dead' and surfaced in admin tooling for manual review.
//
// The dead-letter behavior is itself a substrate-honesty move: the
// platform admits failure rather than retrying forever. A row in
// 'dead' state is the platform saying *we tried; we couldn't; please
// look*. Silent failure (status='sent' but no email actually sent)
// would be worse than noisy failure ('dead' visible in /system/email).
//
// ── What this module reaches toward ──────────────────────────────────────
//
//   - apps/storefront/src/lib/email/send.ts — the immediate sibling.
//     Both modules call sesClient ultimately; the difference is in
//     when the decision-to-send is made (now vs at-drain-time).
//
//   - apps/storefront/src/lib/email/handlers/* — the per-event story
//     library. registerQueueHandler is how a domain hooks its
//     re-engagement logic into the drain loop.
//
//   - apps/storefront/src/app/(dashboard)/system/email/page.tsx (admin)
//     — the dead-letter visibility surface (when shipped per
//     kingdom-020). The dead state's existence demands a place where
//     the operator can see it.
//
// See docs/connections/email.md for the network view.
// See docs/connections/at-midnight.md for one user's evening through
// this queue — a story-form companion to the documentary above.

import { query } from "@/lib/db";

export const MAX_ATTEMPTS = 3;

export interface ScheduleEmailArgs {
  userId: string;
  event: string;
  data: Record<string, unknown>;
  scheduledFor: Date;
  /** Unique idempotency key — duplicate scheduleEmail() calls return the existing row. */
  idempotencyKey?: string;
}

export interface QueueRow {
  id: string;
  user_id: string;
  event: string;
  data: Record<string, unknown>;
  scheduled_for: string;
  status: "pending" | "sending" | "sent" | "failed" | "dead" | "cancelled";
  attempt_count: number;
  last_error: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface DrainResult {
  picked: number;
  sent: number;
  cancelled: number;
  failed: number;
  dead: number;
  errors: Array<{ id: string; event: string; error: string }>;
}

export type QueueHandlerResult =
  | { kind: "sent"; messageId?: string }
  | { kind: "cancelled"; reason: string }
  | { kind: "failed"; error: string };

export type QueueHandler = (row: QueueRow) => Promise<QueueHandlerResult>;

// Handler registry. Populated via registerQueueHandler() from each caller.
const HANDLERS: Record<string, QueueHandler> = {};

export function registerQueueHandler(event: string, handler: QueueHandler): void {
  HANDLERS[event] = handler;
}

// Lazy import pattern: handlers live in other modules and import this one.
// Loader called on-demand so a missing registration surfaces as a clear
// runtime error in the drain, not a module-load cycle.
async function loadHandlers(): Promise<void> {
  // Registers anything not already registered. Add new events here as we wire
  // them up.
  if (!HANDLERS["vault_expiring_soon"]) {
    await import("./handlers/vault-expiring-soon");
  }
  if (!HANDLERS["streak_at_risk"]) {
    await import("./handlers/streak-at-risk");
  }
  if (!HANDLERS["portfolio_price_alert"]) {
    await import("./handlers/portfolio-price-alert");
  }
  if (!HANDLERS["wishlist_matched"]) {
    await import("./handlers/wishlist-matched");
  }
}

// ── Schedule ────────────────────────────────────────────────────────────

export async function scheduleEmail(args: ScheduleEmailArgs): Promise<{
  id: string;
  alreadyScheduled: boolean;
}> {
  // UPSERT on idempotency_key when provided, otherwise plain insert.
  if (args.idempotencyKey) {
    const result = await query(
      `INSERT INTO email_queue (user_id, event, data, scheduled_for, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        args.userId,
        args.event,
        JSON.stringify(args.data ?? {}),
        args.scheduledFor.toISOString(),
        args.idempotencyKey,
      ],
    );
    if (result.rowCount && result.rowCount > 0) {
      return { id: result.rows[0].id, alreadyScheduled: false };
    }
    // Already there — fetch and return the existing row's id.
    const existing = await query(
      `SELECT id FROM email_queue WHERE idempotency_key = $1`,
      [args.idempotencyKey],
    );
    return { id: existing.rows[0].id, alreadyScheduled: true };
  }

  const result = await query(
    `INSERT INTO email_queue (user_id, event, data, scheduled_for)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [args.userId, args.event, JSON.stringify(args.data ?? {}), args.scheduledFor.toISOString()],
  );
  return { id: result.rows[0].id, alreadyScheduled: false };
}

export async function cancelScheduledEmail(idempotencyKey: string): Promise<boolean> {
  const result = await query(
    `UPDATE email_queue SET status='cancelled'
     WHERE idempotency_key = $1 AND status = 'pending'`,
    [idempotencyKey],
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Drain ───────────────────────────────────────────────────────────────

export async function drainEmailQueue(opts?: { limit?: number }): Promise<DrainResult> {
  await loadHandlers();
  const limit = opts?.limit ?? 50;

  // Atomically claim a batch: pending rows whose scheduled_for has elapsed.
  // The RETURNING + UPDATE-with-subselect pattern lets us grab a batch
  // without needing a transaction block.
  const claim = await query(
    `UPDATE email_queue SET status='sending', last_attempt_at = NOW(), attempt_count = attempt_count + 1
     WHERE id IN (
       SELECT id FROM email_queue
       WHERE status = 'pending' AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC
       LIMIT $1
     )
     RETURNING *`,
    [limit],
  );

  const rows: QueueRow[] = claim.rows;
  const result: DrainResult = {
    picked: rows.length,
    sent: 0,
    cancelled: 0,
    failed: 0,
    dead: 0,
    errors: [],
  };

  for (const row of rows) {
    const handler = HANDLERS[row.event];
    if (!handler) {
      // No handler registered — mark dead so it doesn't retry forever.
      await query(
        `UPDATE email_queue SET status='dead', last_error = $2 WHERE id = $1`,
        [row.id, `no handler for event "${row.event}"`],
      );
      result.dead++;
      result.errors.push({ id: row.id, event: row.event, error: "no handler" });
      continue;
    }

    try {
      const handled = await handler(row);
      if (handled.kind === "sent") {
        await query(
          `UPDATE email_queue SET status='sent', sent_at = NOW() WHERE id = $1`,
          [row.id],
        );
        result.sent++;
      } else if (handled.kind === "cancelled") {
        await query(
          `UPDATE email_queue SET status='cancelled', last_error = $2 WHERE id = $1`,
          [row.id, handled.reason],
        );
        result.cancelled++;
      } else {
        // failed
        const dead = row.attempt_count >= MAX_ATTEMPTS;
        await query(
          `UPDATE email_queue SET status = $2, last_error = $3 WHERE id = $1`,
          [row.id, dead ? "dead" : "pending", handled.error],
        );
        if (dead) {
          result.dead++;
        } else {
          result.failed++;
        }
        result.errors.push({ id: row.id, event: row.event, error: handled.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const dead = row.attempt_count >= MAX_ATTEMPTS;
      await query(
        `UPDATE email_queue SET status = $2, last_error = $3 WHERE id = $1`,
        [row.id, dead ? "dead" : "pending", msg],
      );
      if (dead) result.dead++;
      else result.failed++;
      result.errors.push({ id: row.id, event: row.event, error: msg });
    }
  }

  return result;
}
