// E2E for the payouts arc. Six suites covering:
//
//   1. getPendingPayouts surfaces availableAt = completed_at +
//      payout_hold_days for trades, paid_at + AUCTION_HOLD_DAYS for
//      auctions, and isReady is true once that date is past.
//   2. ready vs holding split — a mix of past/future availableAt
//      rows produces the correct totals + nextAvailableAt.
//   3. recordTradePayout fires payout.released and is idempotent
//      (the duplicate-payout guard prevents double notification).
//   4. recordAuctionPayout fires payout.released too.
//   5. trade-ins and quotes (no hold timer) roll into readyTotal.
//   6. seller_paid_at trades drop out of getPendingPayouts entirely.
//
// Direct-lib pattern, matching test-notifications.mts and
// test-market-notifications.mts.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

const { getPendingPayouts } = await import("../src/lib/payouts/aggregation");
const { recordTradePayout } = await import("../src/lib/market/db");
const { recordAuctionPayout } = await import("../src/lib/auction/db");
const { listNotifications } = await import("../src/lib/notifications/db");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function makeTrade(args: {
  buyerId: string;
  sellerId: string;
  sku: string;
  payout?: number;
  holdDays?: number;
  status?: string;
  completedAgoDays?: number;   // negative => completed in the future (still holding)
}): Promise<string> {
  const payout = args.payout ?? 9.20;
  const holdDays = args.holdDays ?? 5;
  const status = args.status ?? "completed";
  // Negative completedAgoDays means the trade hasn't been completed yet.
  const completedAt = args.completedAgoDays !== undefined
    ? `NOW() - INTERVAL '${args.completedAgoDays} days'`
    : "NULL";

  const bid = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'bid', 10.00, 1, 'NM', 'filled') RETURNING id`,
    [args.buyerId, args.sku],
  );
  const ask = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'ask', 10.00, 1, 'NM', 'filled') RETURNING id`,
    [args.sellerId, args.sku],
  );
  const t = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout, payout_hold_days,
        completed_at)
     VALUES ($1, $2, $3, $4, $5, 10.00, 1, $6, 0.80, $7, $8, ${completedAt})
     RETURNING id`,
    [args.buyerId, args.sellerId, bid.rows[0].id, ask.rows[0].id,
     args.sku, status, payout, holdDays],
  );
  return t.rows[0].id;
}

async function makeAuction(args: {
  sellerId: string;
  paidAgoDays?: number;
  payout?: number;
}): Promise<string> {
  const paidAt = args.paidAgoDays !== undefined
    ? `NOW() - INTERVAL '${args.paidAgoDays} days'`
    : "NULL";
  const a = await pool.query(
    `INSERT INTO auctions
       (seller_user_id, title, status, seller_payout, paid_at, current_price,
        starting_price, starts_at, ends_at)
     VALUES ($1, 'Test auction', 'paid', $2, ${paidAt}, 50.00, 10.00,
             NOW() - INTERVAL '1 day', NOW())
     RETURNING id`,
    [args.sellerId, args.payout ?? 45.00],
  );
  return a.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM market_trades WHERE buyer_id = ANY($1::uuid[]) OR seller_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM market_orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM auctions WHERE seller_user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM trust_profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const allUsers: string[] = [];

  // ── Suite 1: trade availableAt = completed_at + payout_hold_days ──
  console.log("\n— Suite 1: per-trade hold computation");
  const buyer1 = await makeUser(`pay-b1-${t}`);
  const seller1 = await makeUser(`pay-s1-${t}`);
  allUsers.push(buyer1, seller1);

  // Trade completed 2 days ago with a 5-day hold → 3 days remaining.
  await makeTrade({
    buyerId: buyer1, sellerId: seller1, sku: `H1-${t}`,
    payout: 12.50, holdDays: 5, completedAgoDays: 2,
  });
  // Trade completed 7 days ago with a 5-day hold → already eligible.
  await makeTrade({
    buyerId: buyer1, sellerId: seller1, sku: `H2-${t}`,
    payout: 8.00, holdDays: 5, completedAgoDays: 7,
  });

  const bundle1 = await getPendingPayouts(seller1);
  assert(bundle1.trades.length === 2, `2 pending trades (got ${bundle1.trades.length})`);

  const holding = bundle1.trades.find((r) => !r.isReady);
  const ready = bundle1.trades.find((r) => r.isReady);
  assert(holding != null, "one trade is still in hold window");
  assert(ready != null, "one trade is past its hold window");
  assert(holding?.holdDays === 5, "holdDays preserved on row");

  // availableAt should be ~3 days in the future for the 2-days-ago trade
  if (holding?.availableAt) {
    const ms = new Date(holding.availableAt).getTime() - Date.now();
    const days = ms / (24 * 60 * 60 * 1000);
    assert(days > 2 && days < 4, `holding row available in ~3 days (got ${days.toFixed(1)})`);
  }

  // ── Suite 2: ready vs holding totals + nextAvailableAt ──
  console.log("\n— Suite 2: ready/holding split + nextAvailableAt");
  assert(bundle1.readyTotal === 8.00, `readyTotal = 8.00 (got ${bundle1.readyTotal})`);
  assert(bundle1.holdingTotal === 12.50, `holdingTotal = 12.50 (got ${bundle1.holdingTotal})`);
  assert(bundle1.totalOwed === 20.50, `totalOwed = 20.50 (got ${bundle1.totalOwed})`);
  assert(bundle1.nextAvailableAt != null,
    "nextAvailableAt is set when holding rows exist");
  assert(bundle1.nextAvailableAt === holding?.availableAt,
    "nextAvailableAt matches the (single) holding row");

  // ── Suite 3: recordTradePayout fires payout.released + idempotency ──
  console.log("\n— Suite 3: trade payout notification + idempotency");
  const buyer3 = await makeUser(`pay-b3-${t}`);
  const seller3 = await makeUser(`pay-s3-${t}`);
  allUsers.push(buyer3, seller3);

  const tradeId3 = await makeTrade({
    buyerId: buyer3, sellerId: seller3, sku: `PAY-${t}`,
    payout: 25.00, holdDays: 5, completedAgoDays: 10,
  });

  const r1 = await recordTradePayout({ tradeId: tradeId3, method: "bank_transfer", reference: "BANKREF-1" });
  assert(r1.ok, `first payout recorded (${r1.ok ? "ok" : r1.error})`);

  const sellerNotifs = await listNotifications(seller3);
  const payoutNotif = sellerNotifs.find((n) => n.kind === "payout.released");
  assert(payoutNotif != null, "seller got payout.released notification");
  assert(payoutNotif?.title.includes("25.00") || payoutNotif?.title.includes("25"),
    "title mentions amount");
  assert(payoutNotif?.reference_id === tradeId3,
    "notification reference_id is the trade id");

  // Second payout call must reject (already paid)
  const r2 = await recordTradePayout({ tradeId: tradeId3, method: "bank_transfer" });
  assert(r2.ok === false, "second payout rejected (already paid)");

  // Notif count for this trade stays at 1 even if we replay the
  // notify() with the same dedup key (simulating cron retry post-tx).
  const { notify } = await import("../src/lib/notifications/db");
  await notify({
    userId: seller3, kind: "payout.released", title: "DUP",
    referenceType: "market_trade_payout", referenceId: tradeId3,
  });
  const sellerNotifsAfter = await listNotifications(seller3);
  const payoutCount = sellerNotifsAfter.filter(
    (n) => n.kind === "payout.released" && n.reference_id === tradeId3).length;
  assert(payoutCount === 1, `dedup keeps payout notif count at 1 (got ${payoutCount})`);

  // ── Suite 4: recordAuctionPayout fires payout.released ──
  console.log("\n— Suite 4: auction payout notification");
  const seller4 = await makeUser(`pay-s4-${t}`);
  allUsers.push(seller4);
  // Mark seller's Stripe Connect enabled so canPay logic isn't a hurdle
  // (recordAuctionPayout doesn't check that field for non-stripe methods).

  const auctionId = await makeAuction({
    sellerId: seller4, paidAgoDays: 5, payout: 75.00,
  });
  const ar = await recordAuctionPayout({ auctionId, method: "bank_transfer", reference: "AUC-REF" });
  assert(ar.ok, `auction payout recorded (${ar.ok ? "ok" : ar.error})`);

  const s4Notifs = await listNotifications(seller4);
  const auctionPayoutNotif = s4Notifs.find((n) => n.kind === "payout.released");
  assert(auctionPayoutNotif != null, "seller got payout.released on auction");
  assert(auctionPayoutNotif?.reference_type === "auction_payout",
    "reference_type distinguishes auction from trade");

  // ── Suite 5: trade-ins / quotes roll into readyTotal ──
  console.log("\n— Suite 5: trade-ins + quotes count as ready");
  // Re-use seller1 and add a trade-in submission with cash owed.
  await pool.query(
    `INSERT INTO tradein_submissions
       (user_id, reference, status, customer_name, customer_email,
        payment_method, delivery_method, cash_amount, quoted_cash_total)
     VALUES ($1, $2, 'approved', 'Test Customer', 'test@invalid',
             'cash', 'mail', 30.00, 30.00)`,
    [seller1, `TI-${t}`],
  );
  const bundle5 = await getPendingPayouts(seller1);
  assert(bundle5.tradeins.length === 1, "trade-in row appears in pending");
  // 30.00 cash adds to readyTotal but not holdingTotal
  assert(bundle5.readyTotal >= 38.00,
    `trade-in (30) + ready trade (8) ≥ 38 in readyTotal (got ${bundle5.readyTotal})`);

  // Cleanup the trade-in row so suite 6 sees a clean state
  await pool.query(`DELETE FROM tradein_submissions WHERE user_id=$1`, [seller1]);

  // ── Suite 6: paid-out trades drop out of getPendingPayouts ──
  console.log("\n— Suite 6: paid trades excluded from pending");
  // tradeId3 was paid in suite 3 — it should not appear in seller3's pending
  const bundle6 = await getPendingPayouts(seller3);
  assert(bundle6.trades.length === 0,
    `seller3 has 0 pending trades after payout (got ${bundle6.trades.length})`);
  assert(bundle6.totalOwed === 0, "totalOwed is 0 after sole trade paid out");

  // ── Cleanup ──
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
