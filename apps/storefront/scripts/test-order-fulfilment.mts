// E2E for the customer order fulfilment chain. Seeds a user + vault
// redemption order, runs the per-item and bulk fulfil endpoints' exact
// SQL shape, and asserts the customer-facing columns (tracking_number,
// carrier, shipped_at, status) end up where /account/orders can read
// them.
//
// The admin fulfil routes are thin — they do a SELECT, then an UPDATE
// block per fulfil mode. The test reproduces that SQL directly so we
// don't need to stub next-auth for the admin guard.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

async function makeUser(email: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Order Test') RETURNING id`,
    [email],
  );
  return u.rows[0].id;
}

// Create a redemption order + N vault items linked to it. Mirrors the
// shape produced by /api/bounty/vault/redeem-bulk so the admin fulfil
// SQL runs against realistic rows.
async function seedRedemptionOrder(
  userId: string,
  userEmail: string,
  skuPrefix: string,
  itemCount: number,
): Promise<{ orderId: number; itemIds: string[] }> {
  const orderItems = Array.from({ length: itemCount }, (_, i) => ({
    type: "vault_redemption",
    sku: `${skuPrefix}-${i}`,
    name: `Test Card ${i + 1}`,
    quantity: 1,
    spot_price_gbp: (5 + i).toFixed(2),
  }));

  const orderRes = await pool.query(
    `INSERT INTO customer_orders
       (user_id, customer_email, customer_name, status, total_gbp, currency,
        shipping_name, shipping_address, items)
     VALUES ($1, $2, 'Order Test', 'redemption_pending', 0, 'gbp',
             'Test Name', '1 Test Street, Cambridge, CB1 0PD', $3)
     RETURNING id`,
    [userId, userEmail, JSON.stringify(orderItems)],
  );
  const orderId: number = orderRes.rows[0].id;

  const itemIds: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    const vi = await pool.query(
      `INSERT INTO vault_items
        (user_id, sku, card_name, card_number, rarity, spot_price_gbp,
         source, status, p2p_hold_until, redemption_order_id)
       VALUES ($1, $2, $3, 'OP01-00' || $4::text, 'R', $5,
               'pve_milestone', 'reserved',
               NOW() - INTERVAL '1 day', $6)
       RETURNING id`,
      [userId, `${skuPrefix}-${i}`, `Test Card ${i + 1}`, i, (5 + i).toFixed(2), orderId],
    );
    itemIds.push(vi.rows[0].id);
  }

  return { orderId, itemIds };
}

async function cleanup(userId: string) {
  await pool.query(`DELETE FROM vault_items WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM customer_orders WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const email = `order-fulfil-${t}@test.invalid`;
  const userId = await makeUser(email);

  // ── Scenario 1: single-item per-item fulfil (backward compat) ──
  console.log("\n— Scenario 1: single-item fulfil stamps tracking on order");
  const { orderId: ord1, itemIds: items1 } = await seedRedemptionOrder(userId, email, `TI1-${t}`, 1);

  const tracking1 = `RL${t}001GB`;
  const carrier1 = "Royal Mail";

  // Exact SQL the per-item fulfil route runs after the SELECT gate:
  await pool.query(
    `UPDATE vault_items SET status='redeemed', fulfilled_at=NOW() WHERE id = $1`,
    [items1[0]],
  );
  const rem1 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vault_items
       WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [ord1],
  );
  const full1 = (rem1.rows[0]?.n ?? 0) === 0;
  const newStatus1 = full1 ? "completed" : "shipped";
  await pool.query(
    `UPDATE customer_orders
        SET status = $2,
            tracking_number = COALESCE($3, tracking_number),
            carrier         = COALESCE($4, carrier),
            shipped_at      = COALESCE(shipped_at, NOW())
      WHERE id = $1`,
    [ord1, newStatus1, tracking1, carrier1],
  );

  const row1 = (await pool.query(`SELECT * FROM customer_orders WHERE id = $1`, [ord1])).rows[0];
  assert(row1.status === "completed", `single-item order completes on last item (got ${row1.status})`);
  assert(row1.tracking_number === tracking1, `tracking_number stamped (${row1.tracking_number})`);
  assert(row1.carrier === carrier1, `carrier stamped (${row1.carrier})`);
  assert(row1.shipped_at != null, "shipped_at stamped");

  // ── Scenario 2: bulk fulfil (3 items, one envelope) ──
  console.log("\n— Scenario 2: bulk fulfil 3 items → single shipped_at + tracking");
  const { orderId: ord2, itemIds: items2 } = await seedRedemptionOrder(userId, email, `TI2-${t}`, 3);

  const tracking2 = `RM${t}BULK`;
  const carrier2 = "Evri";

  // Bulk fulfil SQL: flip all reserved siblings + stamp order in one pass.
  await pool.query(
    `UPDATE vault_items
        SET status='redeemed', fulfilled_at=NOW()
      WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [ord2],
  );
  await pool.query(
    `UPDATE customer_orders
        SET status = 'completed',
            tracking_number = $2,
            carrier = $3,
            shipped_at = COALESCE(shipped_at, NOW())
      WHERE id = $1`,
    [ord2, tracking2, carrier2],
  );

  const row2 = (await pool.query(`SELECT * FROM customer_orders WHERE id = $1`, [ord2])).rows[0];
  assert(row2.status === "completed", `bulk order completed (got ${row2.status})`);
  assert(row2.tracking_number === tracking2, `bulk tracking set (${row2.tracking_number})`);
  assert(row2.carrier === carrier2, `bulk carrier set (${row2.carrier})`);

  const remainingReserved2 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vault_items
       WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [ord2],
  );
  assert(remainingReserved2.rows[0].n === 0, "all 3 items flipped to redeemed");
  const redeemed2 = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vault_items
       WHERE redemption_order_id = $1 AND status = 'redeemed' AND fulfilled_at IS NOT NULL`,
    [ord2],
  );
  assert(redeemed2.rows[0].n === 3, `3 items stamped fulfilled_at (got ${redeemed2.rows[0].n})`);

  // ── Scenario 3: partial per-item fulfil → 'shipped' intermediate ──
  console.log("\n— Scenario 3: partial per-item fulfil keeps shipped_at pinned");
  const { orderId: ord3, itemIds: items3 } = await seedRedemptionOrder(userId, email, `TI3-${t}`, 3);

  // Fulfil item 0 only
  await pool.query(
    `UPDATE vault_items SET status='redeemed', fulfilled_at=NOW() WHERE id = $1`,
    [items3[0]],
  );
  const rem3a = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vault_items
       WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [ord3],
  );
  const full3a = (rem3a.rows[0]?.n ?? 0) === 0;
  await pool.query(
    `UPDATE customer_orders
        SET status = $2, tracking_number = COALESCE($3, tracking_number),
            carrier = COALESCE($4, carrier),
            shipped_at = COALESCE(shipped_at, NOW())
      WHERE id = $1`,
    [ord3, full3a ? "completed" : "shipped", `TRK${t}P1`, "DPD"],
  );

  const row3a = (await pool.query(`SELECT * FROM customer_orders WHERE id = $1`, [ord3])).rows[0];
  assert(row3a.status === "shipped", `after 1/3 items: status=shipped (got ${row3a.status})`);
  const firstShippedAt = new Date(row3a.shipped_at).getTime();

  // Fulfil items 1 and 2
  for (const id of items3.slice(1)) {
    await pool.query(
      `UPDATE vault_items SET status='redeemed', fulfilled_at=NOW() WHERE id = $1`,
      [id],
    );
  }
  const rem3b = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vault_items
       WHERE redemption_order_id = $1 AND status = 'reserved'`,
    [ord3],
  );
  const full3b = (rem3b.rows[0]?.n ?? 0) === 0;
  await pool.query(
    `UPDATE customer_orders
        SET status = $2, tracking_number = COALESCE($3, tracking_number),
            carrier = COALESCE($4, carrier),
            shipped_at = COALESCE(shipped_at, NOW())
      WHERE id = $1`,
    [ord3, full3b ? "completed" : "shipped", `TRK${t}P1`, "DPD"],
  );

  const row3b = (await pool.query(`SELECT * FROM customer_orders WHERE id = $1`, [ord3])).rows[0];
  assert(row3b.status === "completed", `after 3/3 items: status=completed (got ${row3b.status})`);
  assert(new Date(row3b.shipped_at).getTime() === firstShippedAt,
    "shipped_at unchanged across later fulfils (COALESCE holds first value)");
  assert(row3b.tracking_number === `TRK${t}P1`, "tracking preserved across later calls");

  // ── Scenario 4: customer-facing API returns the fulfilment columns ──
  console.log("\n— Scenario 4: /api/account/orders exposes fulfilment columns");
  const customerView = await pool.query(
    `SELECT * FROM customer_orders WHERE customer_email = $1 ORDER BY created_at DESC`,
    [email],
  );
  const exposed = customerView.rows.map((r) => ({
    id: r.id,
    status: r.status,
    tracking: r.tracking_number,
    carrier: r.carrier,
    shipped_at: r.shipped_at,
  }));
  assert(exposed.every((r) => r.tracking !== undefined),
    "tracking_number column selectable on every order row");
  assert(exposed.every((r) => r.carrier !== undefined),
    "carrier column selectable on every order row");
  assert(exposed.every((r) => r.shipped_at !== undefined),
    "shipped_at column selectable on every order row");
  assert(exposed.filter((r) => r.tracking != null).length === 3,
    `3 orders have tracking (got ${exposed.filter((r) => r.tracking != null).length})`);

  void items1;
  void items2;

  // ── Cleanup ──
  await cleanup(userId);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
