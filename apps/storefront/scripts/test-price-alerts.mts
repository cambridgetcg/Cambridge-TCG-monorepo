// E2E for price-alert evaluator. Seeds a user, two alerts (above + below),
// two matching SKUs in card_price_history, runs the sweep, asserts the
// right side fires and the right queue row lands.

import pg from "pg";
const { createAlert, runPriceAlertSweep, deleteAlert } = await import("../src/lib/portfolio/alerts");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

try {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Alert Test') RETURNING id`,
    [`alert-test-${Date.now()}@test.invalid`],
  );
  const userId: string = u.rows[0].id;

  // Seed history: SKU A at £15 (above £10 threshold), SKU B at £5 (below £10).
  const SKU_A = `ALRT-A-${Date.now()}`;
  const SKU_B = `ALRT-B-${Date.now()}`;
  const SKU_NEUTRAL = `ALRT-N-${Date.now()}`;
  for (const [sku, price] of [[SKU_A, 15], [SKU_B, 5], [SKU_NEUTRAL, 12]] as const) {
    await pool.query(
      `INSERT INTO card_price_history (sku, captured_on, spot_gbp)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (sku, captured_on) DO UPDATE SET spot_gbp = EXCLUDED.spot_gbp`,
      [sku, price.toFixed(2)],
    );
  }

  // Create three alerts:
  //   A above £10 — should FIRE
  //   B below £10 — should FIRE
  //   NEUTRAL above £20 — should SKIP (current £12 < £20 threshold)
  const aAlert = await createAlert({
    userId, sku: SKU_A, direction: "above", thresholdGbp: 10,
    cardName: "Alert Test A",
  });
  const bAlert = await createAlert({
    userId, sku: SKU_B, direction: "below", thresholdGbp: 10,
    cardName: "Alert Test B",
  });
  await createAlert({
    userId, sku: SKU_NEUTRAL, direction: "above", thresholdGbp: 20,
    cardName: "Alert Test Neutral",
  });

  const sweep1 = await runPriceAlertSweep();
  assert(sweep1.fired >= 2, `sweep fired >= 2 (got ${sweep1.fired})`);
  // The sweep may have picked up other users' alerts too — count by user.
  const mine = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_queue
     WHERE user_id = $1 AND event = 'portfolio_price_alert'`,
    [userId],
  );
  assert(mine.rows[0].n === 2, `2 emails queued for this user (got ${mine.rows[0].n})`);

  // Cooldown check: running the sweep again shouldn't re-queue
  const sweep2 = await runPriceAlertSweep();
  const mine2 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_queue
     WHERE user_id = $1 AND event = 'portfolio_price_alert'`,
    [userId],
  );
  assert(mine2.rows[0].n === 2, `cooldown: still 2 emails (got ${mine2.rows[0].n})`);
  assert(sweep2.fired === 0 || sweep2.fired < sweep1.fired, "second sweep fires fewer");

  // Verify last_notified_at got set
  const refresh = await pool.query(
    `SELECT id, last_notified_at FROM portfolio_price_alerts WHERE id = $1`,
    [aAlert.id],
  );
  assert(refresh.rows[0].last_notified_at != null, "last_notified_at set on fired alert");

  // Delete one
  const deleted = await deleteAlert(bAlert.id, userId);
  assert(deleted, "deleteAlert returns true for existing row");
  const phantom = await deleteAlert("00000000-0000-0000-0000-000000000000", userId);
  assert(!phantom, "deleteAlert returns false for missing row");

  // Cleanup
  await pool.query(`DELETE FROM email_queue WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM portfolio_price_alerts WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM card_price_history WHERE sku = ANY($1::text[])`,
    [[SKU_A, SKU_B, SKU_NEUTRAL]]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
