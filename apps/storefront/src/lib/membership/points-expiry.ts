// Points expiration sweep.
//
// Activity-based model: if a user has had no points_ledger activity (earn
// or spend) in the last expiration_days, their entire points_balance is
// expired. Mirrors how most consumer reward programmes communicate
// expiration ("use them or lose them") — far simpler than per-batch FIFO
// without losing user-meaningful semantics.
//
// Self-gates to 02:30 UTC daily so it runs once per day while the
// per-minute cron tick checks the time. Disabled when
// points_config.points_expire = false.

import { query, transaction } from "@/lib/db";

export interface PointsExpiryResult {
  ranInWindow: boolean;
  expired: number;            // users whose balance was expired
  totalPointsExpired: number; // sum across all users
  failures: number;
}

function inWindow(now = new Date()): boolean {
  return now.getUTCHours() === 2 && now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 32;
}

export async function runPointsExpirySweep(opts?: { force?: boolean }): Promise<PointsExpiryResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, expired: 0, totalPointsExpired: 0, failures: 0 };
  }

  // Bail if expiration isn't enabled
  const config = await query(
    `SELECT points_expire, expiration_days FROM points_config LIMIT 1`
  );
  if (!config.rows[0]?.points_expire) {
    return { ranInWindow: true, expired: 0, totalPointsExpired: 0, failures: 0 };
  }
  const days = config.rows[0].expiration_days || 365;

  // Users with positive balance whose newest activity is older than the
  // window. Filtered in SQL via the LATERAL subquery so we only return
  // candidates for expiration.
  const stale = await query(
    `SELECT u.id
       FROM users u
       LEFT JOIN LATERAL (
         SELECT MAX(created_at) AS last_activity
           FROM points_ledger WHERE user_id = u.id
       ) la ON true
      WHERE u.points_balance > 0
        AND (la.last_activity IS NULL
             OR la.last_activity <= NOW() - make_interval(days => $1))`,
    [days]
  );
  let expired = 0;
  let totalPointsExpired = 0;
  let failures = 0;

  for (const u of stale.rows) {
    try {
      // Genuinely atomic per user: the candidate scan above is only a hint.
      // Re-check staleness AT WRITE TIME inside one transaction — a concurrent
      // earn/spend since the scan writes a fresh ledger row, which cancels the
      // expiration (NOT EXISTS fails) so we don't destroy just-earned points;
      // and we zero + book the amount actually held, not the stale read.
      const amount = await transaction(async (q) => {
        // SELECT ... FOR UPDATE first: it blocks on any in-flight earn/spend and,
        // once that commits, sees the post-commit balance AND its fresh ledger
        // row — so the NOT EXISTS re-check cancels the expiration rather than
        // zeroing just-earned points, and `prev` is the true locked balance
        // (no EPQ ambiguity from reading the row twice in one UPDATE).
        const victim = await q(
          `SELECT points_balance::int AS prev
             FROM users
            WHERE id = $1
              AND points_balance > 0
              AND NOT EXISTS (
                SELECT 1 FROM points_ledger
                 WHERE user_id = $1 AND created_at > NOW() - make_interval(days => $2)
              )
            FOR UPDATE`,
          [u.id, days]
        );
        if (victim.rows.length === 0) return 0;
        const amt = victim.rows[0].prev || 0;
        if (amt <= 0) return 0;
        await q(
          `UPDATE users SET points_balance = 0, updated_at = NOW() WHERE id = $1`,
          [u.id]
        );
        await q(
          `INSERT INTO points_ledger (user_id, amount, balance, type, description)
           VALUES ($1, $2, 0, 'expired', $3)`,
          [u.id, -amt, `Inactivity expiration (${days} days)`]
        );
        return amt;
      });
      if (amount > 0) {
        expired++;
        totalPointsExpired += amount;
      }
    } catch (err) {
      failures++;
      console.error(`[points-expiry] failed for ${u.id}:`, err);
    }
  }

  return { ranInWindow: true, expired, totalPointsExpired, failures };
}
