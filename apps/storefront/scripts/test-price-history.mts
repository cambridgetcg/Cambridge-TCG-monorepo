// E2E for price-history helpers — getPriceChanges + getPriceSeries.
// Seeds rows directly, does NOT hit the wholesale API.

import pg from "pg";
const { getPriceChanges, getPriceSeries } = await import("../src/lib/portfolio/price-history");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const SKU_A = `TEST-HIST-A-${Date.now()}`;
const SKU_B = `TEST-HIST-B-${Date.now()}`;
const SKU_NEW = `TEST-HIST-NEW-${Date.now()}`; // only today, no past

try {
  // Seed:
  //   SKU_A: 30d ago £10, 7d ago £11, today £13  (gainer)
  //   SKU_B: 30d ago £20, 7d ago £22, today £18  (loser)
  //   SKU_NEW: today £5 only — should not appear in changes
  const insert = async (sku: string, daysAgo: number, price: number) => {
    await pool.query(
      `INSERT INTO card_price_history (sku, captured_on, spot_gbp)
       VALUES ($1, CURRENT_DATE - $2::int, $3)
       ON CONFLICT (sku, captured_on) DO UPDATE SET spot_gbp = EXCLUDED.spot_gbp`,
      [sku, daysAgo, price.toFixed(2)],
    );
  };
  await insert(SKU_A, 30, 10.00);
  await insert(SKU_A, 7, 11.00);
  await insert(SKU_A, 0, 13.00);

  await insert(SKU_B, 30, 20.00);
  await insert(SKU_B, 7, 22.00);
  await insert(SKU_B, 0, 18.00);

  await insert(SKU_NEW, 0, 5.00);

  // 1) 7-day changes
  const w = await getPriceChanges([SKU_A, SKU_B, SKU_NEW], 7);
  assert(w.has(SKU_A), "7d: SKU_A present");
  assert(w.has(SKU_B), "7d: SKU_B present");
  assert(!w.has(SKU_NEW), "7d: SKU_NEW absent (no past point)");
  const wA = w.get(SKU_A)!;
  assert(Math.abs(wA.deltaPct - ((13 - 11) / 11) * 100) < 0.001, `7d SKU_A pct ≈ 18.18% (got ${wA.deltaPct.toFixed(2)})`);
  assert(wA.delta === 2, "7d SKU_A delta = 2.00");
  const wB = w.get(SKU_B)!;
  assert(wB.delta === -4, "7d SKU_B delta = -4.00");
  assert(wB.deltaPct < 0, "7d SKU_B pct negative");

  // 2) 30-day changes
  const m = await getPriceChanges([SKU_A, SKU_B], 30);
  const mA = m.get(SKU_A)!;
  assert(Math.abs(mA.deltaPct - 30) < 0.001, `30d SKU_A pct = 30% (got ${mA.deltaPct.toFixed(2)})`);
  const mB = m.get(SKU_B)!;
  assert(Math.abs(mB.deltaPct - (-10)) < 0.001, `30d SKU_B pct = -10% (got ${mB.deltaPct.toFixed(2)})`);

  // 3) Series
  const s = await getPriceSeries(SKU_A, 40);
  assert(s.length === 3, `series length 3 (got ${s.length})`);
  assert(s[0].spot_gbp === 10 && s[2].spot_gbp === 13, "series chronological");

  // 4) Empty SKUs list → empty map
  const empty = await getPriceChanges([], 7);
  assert(empty.size === 0, "empty input → empty map");

  // Cleanup
  await pool.query(`DELETE FROM card_price_history WHERE sku = ANY($1::text[])`, [[SKU_A, SKU_B, SKU_NEW]]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
