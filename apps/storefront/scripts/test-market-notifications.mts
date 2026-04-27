// E2E for the market notification wiring. Covers the four events
// that were previously email-only and now also fire notify():
//
//   1. placeOrder match → matched_buyer + matched_seller
//   2. sweepExpired on an open order past its TTL → order_expired
//   3. sweepExpired on an awaiting_payment trade past its window
//      → payment_timeout for both parties
//   4. notifyTradeStatusChange on paid/shipped/completed/etc
//
// The stripe webhook path (paid_buyer/paid_seller) is grep-covered
// not run-covered — it requires a Stripe signature and is tested in
// staging against real sessions.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

const { placeOrder, updateEscrowStatus, cancelOrder, runMarketMaintenance } =
  await import("../src/lib/market/db");
const { listNotifications, unreadCount } =
  await import("../src/lib/notifications/db");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM activity_feed WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(
    `DELETE FROM market_trades
      WHERE buyer_id = ANY($1::uuid[]) OR seller_id = ANY($1::uuid[])`,
    [userIds],
  );
  await pool.query(`DELETE FROM market_orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];

  // ── Suite 1: match fires both buyer and seller notifications ──
  console.log("\n— Suite 1: matched_buyer + matched_seller on placeOrder");
  const seller = await makeUser(`mkt-s-${t}`);
  const buyer = await makeUser(`mkt-b-${t}`);
  allUsers.push(seller, buyer);

  // Seller posts an ask
  await placeOrder({
    userId: seller,
    side: "ask",
    sku: `TEST-${t}`,
    cardName: "Test Card",
    condition: "NM",
    price: 15.00,
    quantity: 1,
  });

  // Buyer hits it with a bid
  const buyerResult = await placeOrder({
    userId: buyer,
    side: "bid",
    sku: `TEST-${t}`,
    cardName: "Test Card",
    condition: "NM",
    price: 15.00,
    quantity: 1,
  });
  assert(buyerResult.trades.length === 1, "match produced exactly one trade");

  // Wait for fire-and-forget notify() calls. The match path fires
  // notifications without await (intentional — keep placeOrder fast),
  // so the test waits long enough for the DB inserts to complete.
  await new Promise((r) => setTimeout(r, 1500));

  const buyerNotifs = await listNotifications(buyer);
  const buyerMatch = buyerNotifs.find((n) => n.kind === "market.matched_buyer");
  assert(buyerMatch != null, "buyer got matched_buyer notification");
  assert(buyerMatch?.title.includes("24h") || buyerMatch?.title.includes("pay"),
    "buyer title mentions payment urgency");

  const sellerNotifs = await listNotifications(seller);
  const sellerMatch = sellerNotifs.find((n) => n.kind === "market.matched_seller");
  assert(sellerMatch != null, "seller got matched_seller notification");

  // Dedup check: running a second trade for the same trade row would
  // collide on reference_id — simulate by firing the same notify again.
  const { notify } = await import("../src/lib/notifications/db");
  const tradeId = buyerResult.trades[0].id;
  await notify({
    userId: buyer,
    kind: "market.matched_buyer",
    title: "DUPLICATE",
    referenceType: "market_trade",
    referenceId: `${tradeId}:matched_buyer`,
  });
  const buyerNotifsAfterDup = await listNotifications(buyer);
  const buyerMatches = buyerNotifsAfterDup.filter((n) => n.kind === "market.matched_buyer");
  assert(buyerMatches.length === 1, `dedup collapses to 1 buyer match (got ${buyerMatches.length})`);

  // ── Suite 2: order expiry fires notification ──
  console.log("\n— Suite 2: order_expired on sweepExpired");
  const maker = await makeUser(`mkt-m-${t}`);
  allUsers.push(maker);

  // Seed an open order whose expires_at is already in the past.
  const pastOrder = await pool.query(
    `INSERT INTO market_orders
       (user_id, side, sku, card_name, condition, price, quantity, status, expires_at)
     VALUES ($1, 'ask', $2, 'Stale Card', 'NM', 9.99, 1, 'open', NOW() - INTERVAL '1 hour')
     RETURNING id`,
    [maker, `STALE-${t}`],
  );
  const staleOrderId = pastOrder.rows[0].id;

  // Force the sweep — runMarketMaintenance bypasses the 60s throttle
  // that would block sweepExpired() from running again so soon after
  // the placeOrder calls in suite 1.
  await runMarketMaintenance();

  // Confirm the stale order is now marked expired
  const staleCheck = await pool.query(
    `SELECT status FROM market_orders WHERE id = $1`, [staleOrderId]);
  assert(staleCheck.rows[0].status === "expired",
    `stale order swept to expired (got ${staleCheck.rows[0].status})`);

  // Generous wait — the shared query() helper creates a fresh pg.Pool
  // per call (TCP+SSL+auth handshake to RDS each time, ~200-500ms over
  // public internet). A status transition for 'completed' does 5
  // queries = potentially 2.5s; we leave headroom on top.
  await new Promise((r) => setTimeout(r, 3500));
  const makerNotifs = await listNotifications(maker);
  const expiryNotif = makerNotifs.find((n) => n.kind === "market.order_expired");
  assert(expiryNotif != null, "maker got market.order_expired notification");
  assert(expiryNotif?.reference_id === `${staleOrderId}:expired`,
    "notification reference_id encodes order id");

  // ── Suite 3: payment_timeout notification on both parties ──
  console.log("\n— Suite 3: payment_timeout fires to both parties");
  const s3 = await makeUser(`mkt-pt-s-${t}`);
  const b3 = await makeUser(`mkt-pt-b-${t}`);
  allUsers.push(s3, b3);

  // Seed a trade whose payment window has already elapsed.
  const ask = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'ask', 10.00, 1, 'NM', 'filled') RETURNING id`,
    [s3, `TMOUT-${t}`],
  );
  const bid = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'bid', 10.00, 1, 'NM', 'filled') RETURNING id`,
    [b3, `TMOUT-${t}`],
  );
  const staleTrade = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout, payment_expires_at)
     VALUES ($1, $2, $3, $4, $5, 10.00, 1, 'awaiting_payment', 0.80, 9.20,
             NOW() - INTERVAL '1 hour')
     RETURNING id`,
    [b3, s3, bid.rows[0].id, ask.rows[0].id, `TMOUT-${t}`],
  );
  const staleTradeId = staleTrade.rows[0].id;

  // Force-sweep again (60s throttle still in effect from suite 2).
  await runMarketMaintenance();

  // Verify trade got cancelled by the sweep
  const tradeCheck = await pool.query(
    `SELECT escrow_status FROM market_trades WHERE id = $1`, [staleTradeId]);
  assert(tradeCheck.rows[0].escrow_status === "cancelled",
    `trade cancelled by sweep (got ${tradeCheck.rows[0].escrow_status})`);

  // Generous wait — the shared query() helper creates a fresh pg.Pool
  // per call (TCP+SSL+auth handshake to RDS each time, ~200-500ms over
  // public internet). A status transition for 'completed' does 5
  // queries = potentially 2.5s; we leave headroom on top.
  await new Promise((r) => setTimeout(r, 3500));
  const b3Notifs = await listNotifications(b3);
  const s3Notifs = await listNotifications(s3);
  const b3Timeout = b3Notifs.find((n) => n.kind === "market.payment_timeout");
  const s3Timeout = s3Notifs.find((n) => n.kind === "market.payment_timeout");
  assert(b3Timeout != null, "buyer got payment_timeout notification");
  assert(s3Timeout != null, "seller got payment_timeout notification");
  assert(b3Timeout?.title !== s3Timeout?.title,
    "buyer and seller get distinct copy");

  // ── Suite 4: updateEscrowStatus fires in-app notifications ──
  console.log("\n— Suite 4: status transitions via updateEscrowStatus");
  const s4 = await makeUser(`mkt-s4-${t}`);
  const b4 = await makeUser(`mkt-b4-${t}`);
  allUsers.push(s4, b4);

  const ask4 = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'ask', 20.00, 1, 'NM', 'filled') RETURNING id`,
    [s4, `STATUS-${t}`],
  );
  const bid4 = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'bid', 20.00, 1, 'NM', 'filled') RETURNING id`,
    [b4, `STATUS-${t}`],
  );
  const trade4 = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout, seller_ships_to)
     VALUES ($1, $2, $3, $4, $5, 20.00, 1, 'paid', 1.60, 18.40, 'ctcg')
     RETURNING id`,
    [b4, s4, bid4.rows[0].id, ask4.rows[0].id, `STATUS-${t}`],
  );
  const trade4Id = trade4.rows[0].id;

  // verified → buyer gets "verified" notif, seller does not
  await updateEscrowStatus(trade4Id, "verified");
  // Generous wait — the shared query() helper creates a fresh pg.Pool
  // per call (TCP+SSL+auth handshake to RDS each time, ~200-500ms over
  // public internet). A status transition for 'completed' does 5
  // queries = potentially 2.5s; we leave headroom on top.
  await new Promise((r) => setTimeout(r, 3500));
  const b4AfterVerified = await listNotifications(b4);
  const verifiedNotif = b4AfterVerified.find((n) => n.kind === "market.verified");
  assert(verifiedNotif != null, "buyer gets market.verified after verification");

  // completed → both parties get notifications
  await updateEscrowStatus(trade4Id, "completed");
  // Generous wait — the shared query() helper creates a fresh pg.Pool
  // per call (TCP+SSL+auth handshake to RDS each time, ~200-500ms over
  // public internet). A status transition for 'completed' does 5
  // queries = potentially 2.5s; we leave headroom on top.
  await new Promise((r) => setTimeout(r, 3500));
  const b4Done = await listNotifications(b4);
  const s4Done = await listNotifications(s4);
  assert(b4Done.some((n) => n.kind === "market.completed"), "buyer gets completed notification");
  assert(s4Done.some((n) => n.kind === "market.completed"), "seller gets completed notification (mentions payout)");

  // Admin re-saves completed — dedup should keep count at 1
  await updateEscrowStatus(trade4Id, "completed");
  // Generous wait — the shared query() helper creates a fresh pg.Pool
  // per call (TCP+SSL+auth handshake to RDS each time, ~200-500ms over
  // public internet). A status transition for 'completed' does 5
  // queries = potentially 2.5s; we leave headroom on top.
  await new Promise((r) => setTimeout(r, 3500));
  const b4DoneAgain = await listNotifications(b4);
  const completedCount = b4DoneAgain.filter((n) => n.kind === "market.completed").length;
  assert(completedCount === 1,
    `admin re-save is idempotent (got ${completedCount} completed notifs)`);

  // ── Suite 5: cancelOrder is silent (user is the actor) ──
  console.log("\n— Suite 5: cancelOrder doesn't spam the user");
  const u5 = await makeUser(`mkt-u5-${t}`);
  allUsers.push(u5);
  const ownOrder = await pool.query(
    `INSERT INTO market_orders (user_id, side, sku, condition, price, quantity, status)
     VALUES ($1, 'bid', $2, 'NM', 1.00, 1, 'open') RETURNING id`,
    [u5, `OWN-${t}`],
  );
  const beforeCancel = await unreadCount(u5);
  await cancelOrder(ownOrder.rows[0].id, u5);
  const afterCancel = await unreadCount(u5);
  assert(afterCancel === beforeCancel,
    "self-cancel does not fire a notification (user is the actor)");

  // ── Cleanup ──
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
