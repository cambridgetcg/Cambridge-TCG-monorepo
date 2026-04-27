// E2E for wishlist matching. Seeds a user, three wishlist items, plants
// matching + non-matching P2P asks, runs the sweep, verifies the right
// emails queued.

import pg from "pg";
const { runWishlistMatchSweep } = await import("../src/lib/wishlist/matching");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

async function makeUser(email: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Wish Test') RETURNING id`,
    [email],
  );
  return u.rows[0].id;
}

try {
  const t = Date.now();
  const wisher = await makeUser(`wish-${t}@test.invalid`);
  const seller = await makeUser(`seller-${t}@test.invalid`);

  const SKU_MATCH = `WISH-A-${t}`;
  const SKU_TOO_EXPENSIVE = `WISH-B-${t}`;
  const SKU_WRONG_CONDITION = `WISH-C-${t}`;

  // 3 wishlist items for wisher
  await pool.query(
    `INSERT INTO wishlists (user_id, sku, card_name, max_price, condition_min)
     VALUES ($1, $2, 'Wish Match', 10.00, 'NM'),
            ($1, $3, 'Wish Too Expensive', 5.00, 'NM'),
            ($1, $4, 'Wish NM Only', 20.00, 'NM')`,
    [wisher, SKU_MATCH, SKU_TOO_EXPENSIVE, SKU_WRONG_CONDITION],
  );

  // 3 P2P asks:
  //   SKU_MATCH       → £9 NM — should match (under £10 target, NM OK)
  //   SKU_TOO_EXPENSIVE → £8 NM — should NOT match (> £5 target)
  //   SKU_WRONG_CONDITION → £15 MP — should NOT match (wishlist demands NM)
  await pool.query(
    `INSERT INTO market_orders (user_id, side, sku, condition, price, quantity, status)
     VALUES ($1, 'ask', $2, 'NM', 9.00, 1, 'open'),
            ($1, 'ask', $3, 'NM', 8.00, 1, 'open'),
            ($1, 'ask', $4, 'MP', 15.00, 1, 'open')`,
    [seller, SKU_MATCH, SKU_TOO_EXPENSIVE, SKU_WRONG_CONDITION],
  );

  // 1) First sweep — only SKU_MATCH should fire
  const r1 = await runWishlistMatchSweep();
  assert(r1.matched >= 1, `matched >= 1 (got ${r1.matched})`);
  const mine = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_queue
     WHERE user_id = $1 AND event = 'wishlist_matched'`,
    [wisher],
  );
  assert(mine.rows[0].n === 1, `1 email queued for wisher (got ${mine.rows[0].n})`);

  // 2) last_matched_at stamped on the matching wishlist row
  const stamped = await pool.query(
    `SELECT last_matched_at FROM wishlists WHERE user_id = $1 AND sku = $2`,
    [wisher, SKU_MATCH],
  );
  assert(stamped.rows[0].last_matched_at != null, "last_matched_at set on matched wish");

  // 3) Too-expensive and wrong-condition wishes were NOT stamped
  const unstamped = await pool.query(
    `SELECT COUNT(*)::int AS n FROM wishlists
     WHERE user_id = $1 AND sku = ANY($2::text[]) AND last_matched_at IS NOT NULL`,
    [wisher, [SKU_TOO_EXPENSIVE, SKU_WRONG_CONDITION]],
  );
  assert(unstamped.rows[0].n === 0, "non-matching wishes not stamped");

  // 4) Cooldown — second sweep shouldn't re-queue
  const r2 = await runWishlistMatchSweep();
  assert(r2.skipped >= 1, `cooldown: skipped >= 1 (got ${r2.skipped})`);
  const mine2 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_queue
     WHERE user_id = $1 AND event = 'wishlist_matched'`,
    [wisher],
  );
  assert(mine2.rows[0].n === 1, `cooldown holds: still 1 email (got ${mine2.rows[0].n})`);

  // 5) Fulfilled wishlist item doesn't match
  await pool.query(
    `UPDATE wishlists SET last_matched_at = NULL, fulfilled = true
     WHERE user_id = $1 AND sku = $2`,
    [wisher, SKU_MATCH],
  );
  const r3 = await runWishlistMatchSweep();
  const mine3 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_queue
     WHERE user_id = $1 AND event = 'wishlist_matched'`,
    [wisher],
  );
  assert(mine3.rows[0].n === 1, `fulfilled wish not re-matched (still 1 email)`);
  void r3;

  // Cleanup
  await pool.query(`DELETE FROM email_queue WHERE user_id = $1`, [wisher]);
  await pool.query(`DELETE FROM market_orders WHERE user_id = $1`, [seller]);
  await pool.query(`DELETE FROM wishlists WHERE user_id = $1`, [wisher]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[wisher, seller]]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
