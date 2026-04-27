// E2E test: seed an expired vault item, hit /api/cron/maintenance,
// verify the item flipped to 'expired' and credit was awarded.
// Usage: pnpm dev & ; sleep 5 ; node scripts/test-bounty-expiry-e2e.js

import pg from "pg";

const url = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`cron-test-${Date.now()}@test.invalid`, "Cron Test User"],
  );
  const userId = u.rows[0].id;
  console.log("seeded user:", userId);

  const v = await pool.query(
    `INSERT INTO vault_items
      (user_id, sku, card_name, card_number, set_code, rarity, image_url,
       spot_price_gbp, source, status, expires_at, p2p_hold_until)
     VALUES ($1, 'TEST-SKU', 'Test Card', 'OP01-001', 'OP01', 'C', NULL,
             10.00, 'pve_milestone', 'reserved',
             NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days')
     RETURNING id`,
    [userId],
  );
  const itemId = v.rows[0].id;
  console.log("seeded vault_item:", itemId);

  const res = await fetch("http://localhost:3000/api/cron/maintenance");
  const body = await res.json();
  console.log("cron response:", JSON.stringify(body, null, 2));

  const after = await pool.query(
    `SELECT status, sold_back_credit, notes FROM vault_items WHERE id=$1`,
    [itemId],
  );
  console.log("vault after:", after.rows[0]);

  const bal = await pool.query(
    `SELECT store_credit_balance FROM users WHERE id=$1`,
    [userId],
  );
  console.log("user balance:", bal.rows[0]);

  const ledger = await pool.query(
    `SELECT type, amount, description FROM store_credit_ledger WHERE reference_id=$1`,
    [itemId],
  );
  console.log("ledger for item:", ledger.rows);

  // Assertions
  let ok = true;
  if (after.rows[0].status !== "expired") { console.error("FAIL: status not expired"); ok = false; }
  if (parseFloat(after.rows[0].sold_back_credit) !== 7.70) { console.error("FAIL: credit not 7.70"); ok = false; }
  if (parseFloat(bal.rows[0].store_credit_balance) !== 7.70) { console.error("FAIL: balance not 7.70"); ok = false; }
  if (ledger.rows.length !== 1) { console.error("FAIL: ledger row count"); ok = false; }

  // Cleanup
  await pool.query(`DELETE FROM store_credit_ledger WHERE user_id=$1`, [userId]);
  await pool.query(`DELETE FROM vault_items WHERE user_id=$1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);

  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
}

main().finally(() => pool.end());
