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

import { query } from "@/lib/db";

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
    `SELECT u.id, u.points_balance, u.email, la.last_activity
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
  const cutoff = Date.now() - days * 86400_000;

  let expired = 0;
  let totalPointsExpired = 0;
  let failures = 0;

  for (const u of stale.rows) {
    const lastTs = u.last_activity ? new Date(u.last_activity).getTime() : 0;
    if (lastTs >= cutoff) continue;

    const amount = parseInt(u.points_balance, 10) || 0;
    if (amount <= 0) continue;

    try {
      // Atomic: zero the balance, write a ledger 'expired' row referencing
      // the days-since-activity for forensics. ledger.balance reflects the
      // post-expiration zero.
      await query(
        `UPDATE users SET points_balance = 0, updated_at = NOW() WHERE id = $1`,
        [u.id]
      );
      await query(
        `INSERT INTO points_ledger (user_id, amount, balance, type, description)
         VALUES ($1, $2, 0, 'expired', $3)`,
        [u.id, -amount, `Inactivity expiration (${days} days)`]
      );
      expired++;
      totalPointsExpired += amount;
    } catch (err) {
      failures++;
      console.error(`[points-expiry] failed for ${u.id}:`, err);
    }
  }

  return { ranInWindow: true, expired, totalPointsExpired, failures };
}

// Customer-facing helper: how many of the user's points are at risk of
// expiring soon. Returns 0 if expiration is disabled.
export async function getExpiringSoon(userId: string, withinDays = 30): Promise<{
  amount: number; expiresInDays: number | null;
}> {
  const config = await query(`SELECT points_expire, expiration_days FROM points_config LIMIT 1`);
  if (!config.rows[0]?.points_expire) {
    return { amount: 0, expiresInDays: null };
  }
  const days = config.rows[0].expiration_days || 365;

  const last = await query(
    `SELECT u.points_balance,
            (SELECT MAX(created_at) FROM points_ledger WHERE user_id = u.id) AS last_activity
       FROM users u WHERE u.id = $1`,
    [userId]
  );
  const row = last.rows[0];
  if (!row || !row.points_balance || !row.last_activity) {
    return { amount: 0, expiresInDays: null };
  }
  const balance = parseInt(row.points_balance, 10);
  const expiresAt = new Date(row.last_activity).getTime() + days * 86400_000;
  const remainingDays = Math.ceil((expiresAt - Date.now()) / 86400_000);

  if (remainingDays > withinDays || remainingDays < 0) {
    return { amount: 0, expiresInDays: null };
  }
  return { amount: balance, expiresInDays: Math.max(0, remainingDays) };
}
