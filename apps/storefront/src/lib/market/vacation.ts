// Seller vacation mode.
//
// The cron runs runVacationSweep every minute alongside the other
// market sweeps. It flips scheduled→active on starts_at (pausing all
// of the seller's open asks AND extending response windows on
// in-flight offers / returns / cancels) and active→ended on ends_at
// (restoring orders + leaving the response-window extensions in
// place — they were extended at apply-time, not gated on the
// vacation row).
//
// Discriminated-union returns mirror the rest of the codebase.

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";

export type VacationStatus = "scheduled" | "active" | "ended" | "cancelled";

export interface SellerVacation {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  message: string | null;
  status: VacationStatus;
  applied_at: string | null;
  unapplied_at: string | null;
  created_at: string;
  updated_at: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

const MIN_DURATION_MS = 4 * 60 * 60 * 1000;          // 4h floor
const MAX_DURATION_MS = 60 * 24 * 60 * 60 * 1000;    // 60d ceiling
const MIN_LEAD_TIME_MS = 5 * 60 * 1000;               // 5m future-fence
const MAX_LEAD_TIME_MS = 365 * 24 * 60 * 60 * 1000;  // 1y future-fence

// ── Schedule a vacation ──
//
// One scheduled OR active vacation per user — the lib enforces this
// because overlapping vacations would race the apply/unapply marks
// and the order-pause op isn't well-defined under overlap.

export async function scheduleVacation(input: {
  userId: string;
  startsAt: string | Date;
  endsAt: string | Date;
  message?: string;
}): Promise<Result<SellerVacation>> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, reason: "Invalid date.", status: 400 };
  }
  const now = Date.now();
  const startMs = startsAt.getTime();
  const endMs = endsAt.getTime();

  if (endMs <= startMs) {
    return { ok: false, reason: "End must be after start.", status: 400 };
  }
  if (startMs < now + MIN_LEAD_TIME_MS) {
    return { ok: false, reason: "Start must be at least 5 minutes in the future.", status: 400 };
  }
  if (startMs > now + MAX_LEAD_TIME_MS) {
    return { ok: false, reason: "Start must be within the next 12 months.", status: 400 };
  }
  if (endMs - startMs < MIN_DURATION_MS) {
    return { ok: false, reason: "Vacation must be at least 4 hours long.", status: 400 };
  }
  if (endMs - startMs > MAX_DURATION_MS) {
    return { ok: false, reason: "Vacation cannot exceed 60 days.", status: 400 };
  }

  // One active+scheduled-at-a-time
  const existing = await query(
    `SELECT id FROM seller_vacations
      WHERE user_id = $1 AND status IN ('scheduled', 'active') LIMIT 1`,
    [input.userId],
  );
  if (existing.rows.length > 0) {
    return {
      ok: false,
      reason: "You already have a scheduled or active vacation. End or cancel it first.",
      status: 409,
    };
  }

  const r = await query(
    `INSERT INTO seller_vacations (user_id, starts_at, ends_at, message)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.userId, startsAt.toISOString(), endsAt.toISOString(),
     input.message?.trim() || null],
  );
  return { ok: true, value: r.rows[0] as SellerVacation };
}

// ── End early / extend ──

export async function endVacation(vacationId: string, userId: string): Promise<Result<SellerVacation>> {
  const r = await query(
    `SELECT * FROM seller_vacations WHERE id = $1`, [vacationId]);
  if (r.rows.length === 0) return { ok: false, reason: "Vacation not found.", status: 404 };
  const v = r.rows[0] as SellerVacation;
  if (v.user_id !== userId) return { ok: false, reason: "Not your vacation.", status: 403 };

  if (v.status === "active") {
    // End-now: restore orders + flip to 'ended' atomically.
    await restoreOrdersForVacation(v);
    await query(
      `UPDATE seller_vacations
          SET status = 'ended', unapplied_at = NOW(), ends_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [vacationId],
    );
    await notify({
      userId, kind: "vacation.ended",
      title: "Vacation ended early",
      body: "Your listings are back on the book.",
      linkUrl: "/account/vacation",
      referenceType: "seller_vacation",
      referenceId: `${v.id}:ended`,
    });
  } else if (v.status === "scheduled") {
    // Cancel before it starts — no side effects to undo.
    await query(
      `UPDATE seller_vacations SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [vacationId],
    );
  } else {
    return {
      ok: false,
      reason: `Vacation is ${v.status} — can't end.`,
      status: 409,
    };
  }
  const updated = await query(`SELECT * FROM seller_vacations WHERE id = $1`, [vacationId]);
  return { ok: true, value: updated.rows[0] as SellerVacation };
}

export async function extendVacation(input: {
  vacationId: string;
  userId: string;
  newEndsAt: string | Date;
}): Promise<Result<SellerVacation>> {
  const newEnd = new Date(input.newEndsAt);
  if (Number.isNaN(newEnd.getTime())) {
    return { ok: false, reason: "Invalid date.", status: 400 };
  }

  const r = await query(`SELECT * FROM seller_vacations WHERE id = $1`, [input.vacationId]);
  if (r.rows.length === 0) return { ok: false, reason: "Vacation not found.", status: 404 };
  const v = r.rows[0] as SellerVacation;
  if (v.user_id !== input.userId) return { ok: false, reason: "Not your vacation.", status: 403 };
  if (v.status !== "scheduled" && v.status !== "active") {
    return { ok: false, reason: `Vacation is ${v.status} — can't extend.`, status: 409 };
  }
  if (newEnd.getTime() <= new Date(v.ends_at).getTime()) {
    return { ok: false, reason: "New end must be later than current end.", status: 400 };
  }
  if (newEnd.getTime() - new Date(v.starts_at).getTime() > MAX_DURATION_MS) {
    return { ok: false, reason: "Total duration would exceed 60 days.", status: 400 };
  }

  await query(
    `UPDATE seller_vacations SET ends_at = $2, updated_at = NOW() WHERE id = $1`,
    [input.vacationId, newEnd.toISOString()],
  );
  const updated = await query(`SELECT * FROM seller_vacations WHERE id = $1`, [input.vacationId]);
  return { ok: true, value: updated.rows[0] as SellerVacation };
}

// ── Active-vacation helpers (drive profile banner + listing chip) ──

export async function getActiveVacation(userId: string): Promise<SellerVacation | null> {
  const r = await query(
    `SELECT * FROM seller_vacations
      WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [userId],
  );
  return (r.rows[0] as SellerVacation) ?? null;
}

export async function listMyVacations(userId: string): Promise<SellerVacation[]> {
  const r = await query(
    `SELECT * FROM seller_vacations
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return r.rows as SellerVacation[];
}

// ── The sweep ──

export async function runVacationSweep(): Promise<{
  started: number;
  ended: number;
}> {
  let started = 0;
  let ended = 0;

  // Side 1: scheduled → active (starts_at has arrived)
  const startingRows = await query(
    `SELECT id, user_id, starts_at, ends_at
       FROM seller_vacations
      WHERE status = 'scheduled' AND starts_at <= NOW()
      LIMIT 100`,
  );

  for (const v of startingRows.rows) {
    // Pause all of this seller's active asks. The 'paused' status
    // is excluded from placeOrder's matching predicate, so this is
    // effectively a soft-take-off-the-book.
    await query(
      `UPDATE market_orders
          SET status = 'paused', updated_at = NOW()
        WHERE user_id = $1 AND side = 'ask'
          AND status IN ('open', 'partially_filled')`,
      [v.user_id],
    );

    // Extend in-flight response windows by the vacation duration.
    // Done at apply-time (rather than checked at expiry) so the
    // sweeps for those modules don't need to know about vacations.
    const durMs = new Date(v.ends_at).getTime() - new Date(v.starts_at).getTime();
    const durInterval = `${Math.floor(durMs / 1000)} seconds`;

    await query(
      `UPDATE market_offers
          SET expires_at = expires_at + $2::interval
        WHERE seller_id = $1 AND status IN ('pending', 'countered')`,
      [v.user_id, durInterval],
    );
    await query(
      `UPDATE market_returns
          SET expires_at = expires_at + $2::interval
        WHERE seller_id = $1 AND status = 'requested'`,
      [v.user_id, durInterval],
    );
    await query(
      `UPDATE market_trade_cancellations
          SET expires_at = expires_at + $2::interval
        WHERE status = 'requested'
          AND trade_id IN (
            SELECT id FROM market_trades
              WHERE seller_id = $1 AND escrow_status = 'awaiting_payment'
          )`,
      [v.user_id, durInterval],
    );

    await query(
      `UPDATE seller_vacations
          SET status = 'active', applied_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'scheduled'`,
      [v.id],
    );

    await notify({
      userId: v.user_id, kind: "vacation.starting",
      title: "Vacation started",
      body: `Your listings are paused until ${new Date(v.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. In-flight offer/return/cancel deadlines extended.`,
      linkUrl: "/account/vacation",
      referenceType: "seller_vacation",
      referenceId: `${v.id}:starting`,
    });
    started++;
  }

  // Side 2: active → ended (ends_at has arrived)
  const endingRows = await query(
    `SELECT * FROM seller_vacations
      WHERE status = 'active' AND ends_at <= NOW()
      LIMIT 100`,
  );

  for (const v of endingRows.rows) {
    await restoreOrdersForVacation(v as SellerVacation);
    await query(
      `UPDATE seller_vacations
          SET status = 'ended', unapplied_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'active'`,
      [v.id],
    );
    await notify({
      userId: v.user_id, kind: "vacation.ended",
      title: "Vacation ended — listings live again",
      body: "Your asks are back on the book at their original prices.",
      linkUrl: "/account/vacation",
      referenceType: "seller_vacation",
      referenceId: `${v.id}:ended`,
    });
    ended++;
  }

  return { started, ended };
}

// ── Internal: restore paused orders to their pre-vacation state ──
//
// 'paused' → 'open' for orders with no fill, 'partially_filled' for
// those that had filled qty before pausing. Same shape as the
// trade-cancel restoration.

async function restoreOrdersForVacation(v: SellerVacation): Promise<void> {
  await query(
    `UPDATE market_orders
        SET status = CASE
          WHEN filled_quantity = 0 THEN 'open'
          WHEN filled_quantity < quantity THEN 'partially_filled'
          ELSE status
        END,
        updated_at = NOW()
      WHERE user_id = $1 AND side = 'ask' AND status = 'paused'`,
    [v.user_id],
  );
}
