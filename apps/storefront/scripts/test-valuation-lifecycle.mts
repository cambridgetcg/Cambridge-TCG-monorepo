// E2E for portfolio valuation. Seven suites covering the price
// cascade, aggregation rollups, snapshots, time series, and the
// certificate export shape.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const {
  getCollectionValue, takeSnapshot, getValueOverTime,
  getValuationCertificate, runValuationSnapshotSweep,
} = await import("../src/lib/portfolio/valuation");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function ownCard(args: {
  userId: string;
  sku: string;
  qty?: number;
  acquisitionPrice?: number;
  setCode?: string;
  setName?: string;
  rarity?: string;
  cardName?: string;
}) {
  await pool.query(
    `INSERT INTO portfolio_cards
       (user_id, sku, card_name, set_code, set_name, rarity, condition,
        quantity, acquisition_price, acquired_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'NM', $7, $8, CURRENT_DATE - 30)
     ON CONFLICT (user_id, sku, condition) DO UPDATE
       SET quantity = $7, acquisition_price = $8`,
    [args.userId, args.sku, args.cardName ?? "Test Card",
     args.setCode ?? null, args.setName ?? null,
     args.rarity ?? null, args.qty ?? 1,
     args.acquisitionPrice != null ? args.acquisitionPrice.toFixed(2) : null],
  );
}

async function seedAsk(sku: string, sellerId: string, price: number) {
  await pool.query(
    `INSERT INTO market_orders
       (user_id, side, sku, condition, price, quantity, status, allow_offers)
     VALUES ($1, 'ask', $2, 'NM', $3, 1, 'open', false)`,
    [sellerId, sku, price.toFixed(2)],
  );
}

async function seedSpot(sku: string, gbp: number, daysAgo = 0) {
  await pool.query(
    `INSERT INTO card_price_history (sku, captured_on, spot_gbp)
     VALUES ($1, CURRENT_DATE - $2::int, $3)
     ON CONFLICT DO NOTHING`,
    [sku, daysAgo, gbp.toFixed(2)],
  );
}

async function seedSnapshot(userId: string, daysAgo: number, totalValue: number) {
  await pool.query(
    `INSERT INTO portfolio_snapshots (user_id, total_value, total_cost, card_count, snapshot_date)
     VALUES ($1, $2, $3, 1, CURRENT_DATE - $4::int)
     ON CONFLICT (user_id, snapshot_date) DO UPDATE SET total_value = $2`,
    [userId, totalValue.toFixed(2), totalValue.toFixed(2), daysAgo],
  );
}

async function cleanup(userIds: string[], skus: string[]) {
  if (skus.length > 0) {
    await pool.query(`DELETE FROM card_price_history WHERE sku = ANY($1::text[])`, [skus]);
    await pool.query(`DELETE FROM market_orders WHERE sku = ANY($1::text[])`, [skus]);
  }
  await pool.query(`DELETE FROM portfolio_cards WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM portfolio_snapshots WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM market_orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];
  const allSkus = [`VAL-${t}-1`, `VAL-${t}-2`, `VAL-${t}-3`, `VAL-${t}-4`];

  // ── Suite 1: price cascade — best_ask wins over price_history ──
  console.log("\n— Suite 1: price cascade");
  const u1 = await makeUser(`val-u1-${t}`);
  const seller = await makeUser(`val-seller-${t}`);
  allUsers.push(u1, seller);

  // Card 1: has both an ask AND price_history. best_ask should win.
  await ownCard({ userId: u1, sku: `VAL-${t}-1`, qty: 1, setCode: `SET1-${t}`, rarity: "C" });
  await seedAsk(`VAL-${t}-1`, seller, 25.00);
  await seedSpot(`VAL-${t}-1`, 18.00);

  // Card 2: only price_history.
  await ownCard({ userId: u1, sku: `VAL-${t}-2`, qty: 2, setCode: `SET1-${t}`, rarity: "R" });
  await seedSpot(`VAL-${t}-2`, 50.00);

  // Card 3: only an ask.
  await ownCard({ userId: u1, sku: `VAL-${t}-3`, qty: 1, setCode: `SET2-${t}`, rarity: "SR" });
  await seedAsk(`VAL-${t}-3`, seller, 100.00);

  // Card 4: nothing — no ask, no history. Should be priced=false.
  await ownCard({ userId: u1, sku: `VAL-${t}-4`, qty: 1, setCode: `SET2-${t}`, rarity: "L" });

  const v1 = await getCollectionValue(u1);

  const card1 = v1.top_cards.find((c) => c.sku === `VAL-${t}-1`);
  assert(card1?.unit_price === 25.00,
    `card1 unit_price = 25 (best_ask wins) (got ${card1?.unit_price})`);
  assert(card1?.source === "best_ask", "card1 source = best_ask");

  // Verify total_value math: 25.00 * 1 + 50.00 * 2 + 100.00 * 1 = 225.00
  // Card 4 contributes 0 (unpriced).
  assert(v1.total_value === 225.00, `total_value = 225.00 (got ${v1.total_value})`);
  assert(v1.unique_sku_count === 4, "4 unique skus");
  assert(v1.priced_sku_count === 3, "3 priced (cards 1, 2, 3)");
  assert(v1.unpriced_sku_count === 1, "1 unpriced (card 4)");
  assert(v1.card_count === 5, "5 total copies (1+2+1+1)");

  // ── Suite 2: by_set + by_rarity rollups ──
  console.log("\n— Suite 2: aggregation rollups");
  const set1 = v1.by_set.find((s) => s.set_code === `SET1-${t}`);
  const set2 = v1.by_set.find((s) => s.set_code === `SET2-${t}`);
  // SET1: card1 (25) + card2 (100 = 50*2) = 125
  // SET2: card3 (100) + card4 (0) = 100
  assert(set1?.total_value === 125.00, `SET1 = 125 (got ${set1?.total_value})`);
  assert(set2?.total_value === 100.00, `SET2 = 100 (got ${set2?.total_value})`);
  assert(set1!.cards === 3, "SET1 has 3 copies (card1×1 + card2×2)");
  assert(set2!.cards === 2, "SET2 has 2 copies (card3×1 + card4×1)");

  // by_rarity: R has highest value (50*2=100), then SR(100), C(25), L(0)
  const rarityR = v1.by_rarity.find((b) => b.rarity === "R");
  const raritySR = v1.by_rarity.find((b) => b.rarity === "SR");
  const rarityL = v1.by_rarity.find((b) => b.rarity === "L");
  assert(rarityR?.total_value === 100.00, "R = 100");
  assert(raritySR?.total_value === 100.00, "SR = 100");
  assert(rarityL?.total_value === 0, "L = 0 (unpriced)");

  // ── Suite 3: cost basis + unrealized P&L ──
  console.log("\n— Suite 3: cost basis + unrealized gain");
  const u2 = await makeUser(`val-u2-${t}`);
  allUsers.push(u2);

  // bought 2x VAL-2 at £30 each (total cost £60), now worth £100 (50*2)
  // unrealized gain = 100 - 60 = 40
  await ownCard({ userId: u2, sku: `VAL-${t}-2`, qty: 2, acquisitionPrice: 30 });
  // bought VAL-1 at £40 (above current £25 — losing money on this one)
  // cost 40, value 25, gain = -15
  await ownCard({ userId: u2, sku: `VAL-${t}-1`, qty: 1, acquisitionPrice: 40 });
  // Card with no acquisition_price set — contributes to value but not to cost.
  await ownCard({ userId: u2, sku: `VAL-${t}-3`, qty: 1 });

  const v2 = await getCollectionValue(u2);
  // total_value = 25 + 100 + 100 = 225
  assert(v2.total_value === 225.00, `total_value = 225 (got ${v2.total_value})`);
  // total_cost = 30*2 + 40 + 0 = 100  (card 3 has no acquisition_price)
  assert(v2.total_cost === 100.00, `total_cost = 100 (got ${v2.total_cost})`);
  // unrealized_gain only counts rows where BOTH price and cost are known
  //   card 2: priced=true (50ea), cost=60 → gain = 100 - 60 = 40
  //   card 1: priced=true (25), cost=40 → gain = 25 - 40 = -15
  //   card 3: priced=true (100), cost=null → SKIPPED
  // total = 40 + (-15) = 25
  assert(v2.unrealized_gain === 25.00,
    `unrealized_gain = 25 (40 + -15) (got ${v2.unrealized_gain})`);

  // ── Suite 4: takeSnapshot idempotency ──
  console.log("\n— Suite 4: takeSnapshot");
  const s1 = await takeSnapshot(u1);
  assert(s1.total_value === 225.00, "snapshot stores total_value");
  assert(s1.card_count === 5, "snapshot stores card_count");

  // Re-running on the same day updates rather than inserts
  await pool.query(
    `UPDATE portfolio_cards SET quantity = quantity + 1 WHERE user_id = $1 AND sku = $2`,
    [u1, `VAL-${t}-1`],
  );
  const s2 = await takeSnapshot(u1);
  assert(s2.total_value > s1.total_value,
    `re-snapshot reflects new state (was ${s1.total_value}, now ${s2.total_value})`);

  const snapshotRows = await pool.query(
    `SELECT COUNT(*)::int AS n FROM portfolio_snapshots
      WHERE user_id = $1 AND snapshot_date = CURRENT_DATE`,
    [u1],
  );
  assert(snapshotRows.rows[0].n === 1,
    "still exactly 1 snapshot row for today (UPSERT not INSERT)");

  // ── Suite 5: getValueOverTime ──
  console.log("\n— Suite 5: time series");
  // Seed 5 historical days
  await seedSnapshot(u1, 30, 100);
  await seedSnapshot(u1, 20, 150);
  await seedSnapshot(u1, 10, 180);
  await seedSnapshot(u1, 5, 200);

  const series = await getValueOverTime(u1, { days: 90 });
  assert(series.length >= 4, `series has ≥ 4 points (got ${series.length})`);
  // Ascending date order
  for (let i = 1; i < series.length; i++) {
    assert(series[i - 1].snapshot_date <= series[i].snapshot_date,
      `point ${i - 1} ≤ point ${i} by date`);
  }

  // days=7 filter excludes the older points (>7 days ago)
  const recent = await getValueOverTime(u1, { days: 7 });
  assert(recent.length <= series.length,
    "narrower window returns ≤ rows");

  // ── Suite 6: certificate export shape ──
  console.log("\n— Suite 6: valuation certificate");
  const cert = await getValuationCertificate(u2);
  assert(cert.user_id === u2, "cert has user_id");
  assert(cert.lines.length === 3, `cert has 3 line items (got ${cert.lines.length})`);
  // Totals match getCollectionValue
  assert(cert.total_value === v2.total_value, "cert total_value matches");
  assert(cert.total_cost === v2.total_cost, "cert total_cost matches");
  assert(cert.unrealized_gain === v2.unrealized_gain, "cert unrealized_gain matches");
  // Line shape
  const line1 = cert.lines.find((l) => l.sku === `VAL-${t}-1`);
  assert(line1?.unit_price === 25.00, "line carries unit_price");
  assert(line1?.cost_basis === 40.00, "line carries cost_basis");
  assert(line1?.source === "best_ask", "line carries price source");

  // ── Suite 7: snapshot sweep ──
  console.log("\n— Suite 7: runValuationSnapshotSweep");
  // Clean today's snapshots so we can verify the sweep creates fresh ones
  await pool.query(
    `DELETE FROM portfolio_snapshots
      WHERE user_id = ANY($1::uuid[]) AND snapshot_date = CURRENT_DATE`,
    [allUsers],
  );

  const sweep = await runValuationSnapshotSweep();
  assert(sweep.ran >= 2, `sweep took snapshots for ≥ 2 users (got ${sweep.ran})`);

  const todays = await pool.query(
    `SELECT COUNT(*)::int AS n FROM portfolio_snapshots
      WHERE user_id = ANY($1::uuid[]) AND snapshot_date = CURRENT_DATE`,
    [allUsers],
  );
  assert(todays.rows[0].n >= 2,
    `today's snapshots exist for our test users (got ${todays.rows[0].n})`);

  // Re-running the sweep is idempotent (UPSERT, no extra rows)
  await runValuationSnapshotSweep();
  const todaysAgain = await pool.query(
    `SELECT COUNT(*)::int AS n FROM portfolio_snapshots
      WHERE user_id = ANY($1::uuid[]) AND snapshot_date = CURRENT_DATE`,
    [allUsers],
  );
  assert(todaysAgain.rows[0].n === todays.rows[0].n,
    "second sweep adds no new rows (idempotent)");

  // ── Cleanup ──
  await cleanup(allUsers, allSkus);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
