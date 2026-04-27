// Functional test for the journey timeline aggregator.
//
// Seeds a user with one event in each lifecycle source, then asserts:
//   1. getUserJourney returns events from every seeded source
//   2. Privacy filter (hideAdminOnly=true) drops admin-only events
//   3. Group filter narrows to the requested category
//   4. Sort order is newest-first across sources
//   5. Public stats aggregator counts match the seeded data
//
// Usage: DATABASE_URL=... pnpm exec tsx scripts/test-journey-aggregator.mts

import pg from "pg";

const url = (process.env.DATABASE_URL ?? "")
  .replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let asserted = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  asserted++;
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function main() {
  // Seed user
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`journey-test-${Date.now()}@test.invalid`, "Journey Test User"],
  );
  const userId: string = u.rows[0].id;
  console.log(`seeded user: ${userId}`);

  // Seed a vault item + lifecycle log entry (the SHIPPED event)
  const vaultRes = await pool.query(
    `INSERT INTO vault_items (user_id, sku, card_name, card_number, set_code, rarity,
      image_url, spot_price_gbp, source, status)
     VALUES ($1, 'TEST', 'Test Card', 'OP01-001', 'OP01', 'C', NULL, 5.00, 'pve_milestone', 'redeemed')
     RETURNING id`,
    [userId],
  );
  const vaultId: string = vaultRes.rows[0].id;
  await pool.query(
    `INSERT INTO vault_fulfilment_log (vault_item_id, action, notes)
     VALUES ($1, 'fulfilled', 'test seed')`,
    [vaultId],
  );

  // Seed a chargeback + log
  const ts = Date.now();
  const cbId = `du_test_${ts}`;
  await pool.query(
    `INSERT INTO chargebacks (stripe_dispute_id, stripe_payment_intent, user_id,
      amount_gbp, currency, stripe_status, stripe_reason)
     VALUES ($1, $2, $3, 25.00, 'gbp', 'needs_response', 'fraudulent')`,
    [cbId, `pi_test_${ts}`, userId],
  );
  await pool.query(
    `INSERT INTO chargeback_lifecycle_log (stripe_dispute_id, action, reason)
     VALUES ($1, 'received', 'test seed')`,
    [cbId],
  );

  // Seed a refund + log (with abuse_checked → admin-only)
  const refId = `re_test_${ts}`;
  await pool.query(
    `INSERT INTO refunds (stripe_refund_id, stripe_payment_intent, user_id,
      amount_gbp, currency, stripe_status, stripe_reason, initiated_by)
     VALUES ($1, $2, $3, 10.00, 'gbp', 'succeeded', 'requested_by_customer', 'admin')`,
    [refId, `pi_test_ref_${ts}`, userId],
  );
  await pool.query(
    `INSERT INTO refund_lifecycle_log (stripe_refund_id, action, reason)
     VALUES ($1, 'abuse_checked', 'test seed — admin only')`,
    [refId],
  );

  // ── Run getUserJourney via dynamic import (next-resolved alias) ──
  const { getUserJourney } = await import("../src/lib/journey/timeline");
  const { getPublicProfileStats } = await import("../src/lib/journey/public-stats");

  console.log("\nTest 1: customer view (hideAdminOnly=true)");
  const customerEvents = await getUserJourney(userId, { hideAdminOnly: true });
  const kinds = customerEvents.map((e) => e.kind);
  assert(kinds.includes("vault.fulfilled"), "vault.fulfilled visible to customer");
  assert(kinds.includes("chargeback.received"), "chargeback.received visible to customer");
  assert(!kinds.includes("refund.abuse_checked"), "refund.abuse_checked HIDDEN from customer");

  console.log("\nTest 2: admin view (hideAdminOnly=false)");
  const adminEvents = await getUserJourney(userId, { hideAdminOnly: false });
  const adminKinds = adminEvents.map((e) => e.kind);
  assert(adminKinds.includes("refund.abuse_checked"), "refund.abuse_checked visible to admin");

  console.log("\nTest 3: group filter");
  const paymentOnly = await getUserJourney(userId, { hideAdminOnly: true, group: "payment" });
  assert(
    paymentOnly.every((e) => e.group === "payment"),
    "group=payment filter only returns payment events",
  );
  assert(
    paymentOnly.length >= 1 && paymentOnly[0].kind === "chargeback.received",
    "chargeback present in payment group",
  );

  console.log("\nTest 4: sort order (newest first)");
  const sorted = customerEvents.every((e, i, arr) =>
    i === 0 || arr[i - 1].at.getTime() >= e.at.getTime(),
  );
  assert(sorted, "events sorted newest-first across sources");

  console.log("\nTest 5: public stats aggregator");
  const stats = await getPublicProfileStats(userId);
  assert(stats.vault.items_shipped === 1, `vault.items_shipped = ${stats.vault.items_shipped} (expected 1)`);
  assert(stats.payment_health.chargebacks === 1, `chargebacks = ${stats.payment_health.chargebacks} (expected 1)`);
  assert(!stats.is_suspended, "is_suspended = false for fresh user");

  // ── Cleanup ──
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  console.log(`\ncleaned up user ${userId}`);

  console.log(`\n${asserted - failed}/${asserted} assertions passed${failed > 0 ? ` (${failed} FAILED)` : ""}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("test failed with exception:", err);
  await pool.end();
  process.exit(1);
});
