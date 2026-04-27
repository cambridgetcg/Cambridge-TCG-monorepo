// E2E test of the queue + scheduled-drain pipeline.
// Exercises: idempotency, drain lifecycle, handler "cancelled" transition,
// handler "sent" path (with AWS creds missing → failed → dead).

import pg from "pg";
const q = await import("../src/lib/email/queue");
const { scheduleEmail, cancelScheduledEmail, drainEmailQueue } = q;

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

try {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Queue Test') RETURNING id`,
    [`queue-test-${Date.now()}@test.invalid`],
  );
  const userId: string = u.rows[0].id;

  // Seed a vault item in state='reserved' and another in state='sold_back'
  const v1 = await pool.query(
    `INSERT INTO vault_items
      (user_id, sku, card_name, card_number, set_code, rarity, image_url,
       spot_price_gbp, source, status, expires_at, p2p_hold_until)
     VALUES ($1, 'Q-1', 'Reserved Card', 'OP01-100', 'OP01', 'SR', NULL,
             10.00, 'pve_milestone', 'reserved',
             NOW() + INTERVAL '30 days', NOW() - INTERVAL '1 hour')
     RETURNING id`,
    [userId],
  );
  const v2 = await pool.query(
    `INSERT INTO vault_items
      (user_id, sku, card_name, card_number, set_code, rarity, image_url,
       spot_price_gbp, source, status, expires_at, p2p_hold_until, sold_back_credit, sold_back_at)
     VALUES ($1, 'Q-2', 'Sold Back Card', 'OP01-101', 'OP01', 'R', NULL,
             10.00, 'pve_milestone', 'sold_back',
             NOW() + INTERVAL '30 days', NOW() - INTERVAL '1 hour', 7.70, NOW())
     RETURNING id`,
    [userId],
  );
  const reservedId: string = v1.rows[0].id;
  const soldBackId: string = v2.rows[0].id;

  // 1) Schedule an email due in the past — drain should pick it up
  const past = new Date(Date.now() - 60 * 1000);
  const sched1 = await scheduleEmail({
    userId,
    event: "vault_expiring_soon",
    data: { vaultItemId: reservedId },
    scheduledFor: past,
    idempotencyKey: `vault_expiring_soon:${reservedId}`,
  });
  assert(!sched1.alreadyScheduled, "first schedule: new row");

  // 2) Idempotent — second call returns same id
  const sched1b = await scheduleEmail({
    userId,
    event: "vault_expiring_soon",
    data: { vaultItemId: reservedId },
    scheduledFor: past,
    idempotencyKey: `vault_expiring_soon:${reservedId}`,
  });
  assert(sched1b.alreadyScheduled, "idempotent: second schedule with same key = already");
  assert(sched1b.id === sched1.id, "idempotent: same id returned");

  // 3) Schedule for the sold_back item — handler should CANCEL at drain time
  await scheduleEmail({
    userId,
    event: "vault_expiring_soon",
    data: { vaultItemId: soldBackId },
    scheduledFor: past,
    idempotencyKey: `vault_expiring_soon:${soldBackId}`,
  });

  // 4) Schedule for FUTURE — drain should NOT pick it up
  const future = new Date(Date.now() + 3600 * 1000);
  await scheduleEmail({
    userId,
    event: "vault_expiring_soon",
    data: { vaultItemId: reservedId },
    scheduledFor: future,
    idempotencyKey: `vault_expiring_soon:future:${reservedId}`,
  });

  // Drain — AWS creds are missing locally so reserved send will FAIL,
  // sold_back send will CANCEL (status check), future item stays pending.
  const drain = await drainEmailQueue({ limit: 100 });
  assert(drain.picked === 2, `drain picked 2 due rows (got ${drain.picked})`);

  // Count per terminal status
  const terms = await pool.query(
    `SELECT status, count(*)::int AS n FROM email_queue WHERE user_id = $1 GROUP BY status`,
    [userId],
  );
  const byStatus = Object.fromEntries(terms.rows.map((r) => [r.status, r.n]));
  console.log("  queue terminal states:", byStatus);
  assert((byStatus.cancelled ?? 0) === 1, "sold_back row was CANCELLED by handler (status check)");
  // Reserved-item send failed because no AWS creds → pending (attempt 1 < MAX_ATTEMPTS=3)
  assert((byStatus.pending ?? 0) === 2, "reserved row back to pending + future row untouched");

  // 5) Cancel the pending row for sold_back (already cancelled, should be no-op)
  const cancelledAgain = await cancelScheduledEmail(`vault_expiring_soon:${soldBackId}`);
  assert(!cancelledAgain, "cancel on already-cancelled row = no-op");

  // 6) Cancel the future-scheduled row
  const cancelFuture = await cancelScheduledEmail(`vault_expiring_soon:future:${reservedId}`);
  assert(cancelFuture, "cancel pending future row succeeds");

  // 7) Verify attempt_count tracking — drain again, reserved row's attempt_count increments
  const drain2 = await drainEmailQueue({ limit: 100 });
  const again = await pool.query(
    `SELECT attempt_count, status FROM email_queue
     WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, `vault_expiring_soon:${reservedId}`],
  );
  assert(again.rows[0].attempt_count === 2, "attempt_count incremented on retry");

  // 8) One more drain → attempt_count=3 = MAX, row flips to dead
  await drainEmailQueue({ limit: 100 });
  const dead = await pool.query(
    `SELECT attempt_count, status FROM email_queue
     WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, `vault_expiring_soon:${reservedId}`],
  );
  assert(dead.rows[0].status === "dead", "after MAX_ATTEMPTS, row is DEAD");

  // drain2 just to quiet unused-var lint
  void drain2;

  // Cleanup
  await pool.query(`DELETE FROM email_queue WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM vault_items WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
