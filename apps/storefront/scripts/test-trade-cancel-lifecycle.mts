// E2E for the trade-cancellation handshake. Eight suites against
// the lib + timeline. Direct-lib pattern matching the prior arcs.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

const {
  requestCancel, approveCancel, declineCancel, withdrawCancel,
  expireCancelRequests, getPendingCancelForTrade,
  listCancelRequestsForUser,
} = await import("../src/lib/market/trade-cancels");

const { listNotifications } = await import("../src/lib/notifications/db");
const { getCancelStep, isCancelTerminal, getCancelActor } =
  await import("../src/lib/market/cancel-timeline");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function makeAwaitingPaymentTrade(args: {
  buyerId: string; sellerId: string; sku: string; quantity?: number;
}): Promise<{ tradeId: string; bidId: string; askId: string }> {
  const qty = args.quantity ?? 1;
  // Create filled bid + ask + the trade
  const bid = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status, filled_quantity)
     VALUES ($1, $2, 'bid', 10.00, $3, 'NM', 'filled', $3) RETURNING id`,
    [args.buyerId, args.sku, qty],
  );
  const ask = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status, filled_quantity)
     VALUES ($1, $2, 'ask', 10.00, $3, 'NM', 'filled', $3) RETURNING id`,
    [args.sellerId, args.sku, qty],
  );
  const trade = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout, payment_expires_at)
     VALUES ($1, $2, $3, $4, $5, 10.00, $6, 'awaiting_payment', 0.80, 9.20,
             NOW() + INTERVAL '24 hours')
     RETURNING id`,
    [args.buyerId, args.sellerId, bid.rows[0].id, ask.rows[0].id, args.sku, qty],
  );
  return { tradeId: trade.rows[0].id, bidId: bid.rows[0].id, askId: ask.rows[0].id };
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(
    `DELETE FROM market_trade_cancellations
      WHERE trade_id IN (SELECT id FROM market_trades
        WHERE buyer_id = ANY($1::uuid[]) OR seller_id = ANY($1::uuid[]))`,
    [userIds],
  );
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

  // ── Suite 0: timeline invariants ──
  console.log("\n— Suite 0: cancel-timeline.ts");
  assert(getCancelStep("requested") === "requested", "requested step");
  assert(getCancelStep("approved") === "responded", "approved → responded step");
  assert(getCancelStep("declined") === null, "declined off-path");
  assert(getCancelStep("expired") === null, "expired off-path");
  assert(isCancelTerminal("approved"), "approved terminal");
  assert(!isCancelTerminal("requested"), "requested not terminal");
  assert(getCancelActor("requested") === "other", "requested → other party's turn");
  assert(getCancelActor("approved") === null, "approved → no actor");

  // ── Suite 1: requestCancel happy path + notify ──
  console.log("\n— Suite 1: requestCancel fires trade_cancel.requested");
  const seller1 = await makeUser(`tc-s1-${t}`);
  const buyer1 = await makeUser(`tc-b1-${t}`);
  allUsers.push(seller1, buyer1);
  const tr1 = await makeAwaitingPaymentTrade({
    buyerId: buyer1, sellerId: seller1, sku: `TC-${t}`,
  });

  const r1 = await requestCancel({
    tradeId: tr1.tradeId, requesterId: buyer1,
    reason: "can_not_pay", message: "Lost my wallet, sorry.",
  });
  assert(r1.ok, `request ok (${r1.ok ? "ok" : r1.reason})`);
  if (r1.ok) {
    assert(r1.value.status === "requested", "status starts requested");
    assert(r1.value.requester_role === "buyer", "role detected as buyer");
  }

  const sellerNotifs1 = await listNotifications(seller1);
  assert(sellerNotifs1.some((n) => n.kind === "trade_cancel.requested"),
    "seller got trade_cancel.requested");

  // getPendingCancelForTrade surfaces it for the inline UI
  const pending = await getPendingCancelForTrade(tr1.tradeId);
  assert(pending != null, "pending cancel surfaces for the trade");

  // ── Suite 2: validation + duplicates ──
  console.log("\n— Suite 2: validation");

  // Invalid reason
  const badReason = await requestCancel({
    tradeId: tr1.tradeId, requesterId: buyer1, reason: "bogus_xyz",
  });
  assert(!badReason.ok && badReason.status === 400, "invalid reason rejected");

  // 'other' without enough message
  const otherShort = await requestCancel({
    tradeId: tr1.tradeId, requesterId: buyer1, reason: "other", message: "no",
  });
  assert(!otherShort.ok, "'other' with <10 char msg rejected");

  // Stranger
  const stranger = await makeUser(`tc-x-${t}`);
  allUsers.push(stranger);
  const notMine = await requestCancel({
    tradeId: tr1.tradeId, requesterId: stranger, reason: "wrong_card",
  });
  assert(!notMine.ok && notMine.status === 403, "non-party → 403");

  // Duplicate (UNIQUE partial idx fires 23505 → 409)
  const dup = await requestCancel({
    tradeId: tr1.tradeId, requesterId: buyer1, reason: "wrong_qty",
  });
  assert(!dup.ok && dup.status === 409, "duplicate request → 409");

  // ── Suite 3: approveCancel restores order qty + cancels trade ──
  console.log("\n— Suite 3: approve restores qty atomically");
  if (!r1.ok) throw new Error("setup");

  // Wrong approver: requester can't approve their own
  const selfApprove = await approveCancel(r1.value.id, buyer1);
  assert(!selfApprove.ok && selfApprove.status === 403,
    "requester can't approve their own request");

  // Stranger can't approve
  const strangerApprove = await approveCancel(r1.value.id, stranger);
  assert(!strangerApprove.ok && strangerApprove.status === 403,
    "non-party can't approve");

  // Other party approves — load-bearing op
  const ap = await approveCancel(r1.value.id, seller1);
  assert(ap.ok, `approve ok (${ap.ok ? "ok" : ap.reason})`);
  if (ap.ok) {
    assert(ap.value.status === "approved", "status approved");
    assert(ap.value.resolved_at != null, "resolved_at stamped");
  }

  // Trade is cancelled
  const tradeCheck = await pool.query(
    `SELECT escrow_status FROM market_trades WHERE id = $1`, [tr1.tradeId]);
  assert(tradeCheck.rows[0].escrow_status === "cancelled",
    `trade.escrow_status='cancelled' (got ${tradeCheck.rows[0].escrow_status})`);

  // Both orders restored: filled_quantity dropped from 1 to 0, status flipped to 'open'
  const orderCheck = await pool.query(
    `SELECT id, filled_quantity, status FROM market_orders WHERE id IN ($1, $2)`,
    [tr1.bidId, tr1.askId]);
  for (const o of orderCheck.rows) {
    assert(o.filled_quantity === 0,
      `order ${o.id.slice(0, 8)} qty restored to 0 (got ${o.filled_quantity})`);
    assert(o.status === "open",
      `order ${o.id.slice(0, 8)} status reset to 'open' (got ${o.status})`);
  }

  // Buyer (requester) got the approval notification
  const buyerNotifs1 = await listNotifications(buyer1);
  assert(buyerNotifs1.some((n) => n.kind === "trade_cancel.approved"),
    "buyer got trade_cancel.approved");

  // ── Suite 4: declineCancel keeps trade running ──
  console.log("\n— Suite 4: declineCancel");
  const buyer4 = await makeUser(`tc-b4-${t}`);
  allUsers.push(buyer4);
  const tr4 = await makeAwaitingPaymentTrade({
    buyerId: buyer4, sellerId: seller1, sku: `TC4-${t}`,
  });
  const r4 = await requestCancel({
    tradeId: tr4.tradeId, requesterId: buyer4,
    reason: "no_longer_needed",
  });
  if (!r4.ok) throw new Error("setup");

  const dr = await declineCancel(r4.value.id, seller1, "Already packed it.");
  assert(dr.ok, "decline ok");
  if (dr.ok) {
    assert(dr.value.status === "declined", "status declined");
    assert(dr.value.decline_reason === "Already packed it.", "decline_reason stored");
  }

  // Trade still awaiting_payment
  const tradeAfterDecline = await pool.query(
    `SELECT escrow_status FROM market_trades WHERE id = $1`, [tr4.tradeId]);
  assert(tradeAfterDecline.rows[0].escrow_status === "awaiting_payment",
    "trade continues after decline");

  // Buyer notified with reason in body
  const buyer4Notifs = await listNotifications(buyer4);
  const declineNotif = buyer4Notifs.find((n) => n.kind === "trade_cancel.declined");
  assert(declineNotif != null, "buyer got trade_cancel.declined");
  assert(declineNotif?.body?.includes("Already packed"),
    "decline reason in notification body");

  // ── Suite 5: withdrawCancel ──
  console.log("\n— Suite 5: withdrawCancel");
  const buyer5 = await makeUser(`tc-b5-${t}`);
  allUsers.push(buyer5);
  const tr5 = await makeAwaitingPaymentTrade({
    buyerId: buyer5, sellerId: seller1, sku: `TC5-${t}`,
  });
  const r5 = await requestCancel({
    tradeId: tr5.tradeId, requesterId: buyer5,
    reason: "can_not_pay",
  });
  if (!r5.ok) throw new Error("setup");

  // Non-requester can't withdraw
  const wrongWithdraw = await withdrawCancel(r5.value.id, seller1);
  assert(!wrongWithdraw.ok && wrongWithdraw.status === 403,
    "non-requester can't withdraw");

  const wr = await withdrawCancel(r5.value.id, buyer5);
  assert(wr.ok, "withdraw ok");
  if (wr.ok) assert(wr.value.status === "withdrawn", "status withdrawn");

  // Other party (seller) gets the withdrawn notification
  const sellerNotifs5 = await listNotifications(seller1);
  assert(sellerNotifs5.some((n) => n.kind === "trade_cancel.withdrawn"
    && n.reference_id === `${r5.value.id}:withdrawn`),
    "seller got trade_cancel.withdrawn");

  // After withdraw, a fresh request is allowed (UNIQUE partial idx
  // only blocks while status='requested')
  const r5b = await requestCancel({
    tradeId: tr5.tradeId, requesterId: buyer5,
    reason: "wrong_qty",
  });
  assert(r5b.ok, "fresh request after withdraw allowed");

  // ── Suite 6: expireCancelRequests sweep ──
  console.log("\n— Suite 6: expireCancelRequests");
  const buyer6 = await makeUser(`tc-b6-${t}`);
  allUsers.push(buyer6);
  const tr6 = await makeAwaitingPaymentTrade({
    buyerId: buyer6, sellerId: seller1, sku: `TC6-${t}`,
  });
  const r6 = await requestCancel({
    tradeId: tr6.tradeId, requesterId: buyer6, reason: "wrong_card",
  });
  if (!r6.ok) throw new Error("setup");

  // Back-date the expiry
  await pool.query(
    `UPDATE market_trade_cancellations SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
    [r6.value.id],
  );

  const sweep = await expireCancelRequests();
  assert(sweep.expired >= 1, `sweep expired at least 1 (got ${sweep.expired})`);

  const after = await pool.query(
    `SELECT status FROM market_trade_cancellations WHERE id = $1`, [r6.value.id]);
  assert(after.rows[0].status === "expired", "marked expired");

  // Trade still alive
  const tradeAfterExpiry = await pool.query(
    `SELECT escrow_status FROM market_trades WHERE id = $1`, [tr6.tradeId]);
  assert(tradeAfterExpiry.rows[0].escrow_status === "awaiting_payment",
    "trade continues after cancel-request expiry");

  // Buyer notified
  const buyer6Notifs = await listNotifications(buyer6);
  assert(buyer6Notifs.some((n) => n.kind === "trade_cancel.expired"),
    "requester got trade_cancel.expired");

  // Re-running is no-op
  const sweep2 = await expireCancelRequests();
  assert(sweep2.expired === 0, "re-sweep is no-op");

  // ── Suite 7: trade in non-cancellable state rejected ──
  console.log("\n— Suite 7: non-cancellable states");
  const buyer7 = await makeUser(`tc-b7-${t}`);
  allUsers.push(buyer7);
  const tr7 = await makeAwaitingPaymentTrade({
    buyerId: buyer7, sellerId: seller1, sku: `TC7-${t}`,
  });
  // Force trade to 'completed' (past handshake window)
  await pool.query(
    `UPDATE market_trades SET escrow_status = 'completed' WHERE id = $1`,
    [tr7.tradeId]);

  const tooLate = await requestCancel({
    tradeId: tr7.tradeId, requesterId: buyer7, reason: "wrong_qty",
  });
  assert(!tooLate.ok && tooLate.status === 409,
    "trade in 'completed' rejects cancel request");
  if (!tooLate.ok) {
    assert(tooLate.reason.includes("dispute"),
      "rejection message points user to disputes instead");
  }

  // ── Suite 8: list queries ──
  console.log("\n— Suite 8: list queries");
  const myList = await listCancelRequestsForUser(buyer1);
  // Buyer1 had one cancel (approved); expect to see it in their list
  assert(myList.length >= 1, "buyer1 sees their cancel in the list");

  const sellerList = await listCancelRequestsForUser(seller1);
  // Seller1 was on the receiving end of multiple cancels
  assert(sellerList.length >= 4, `seller1 sees multiple incoming (got ${sellerList.length})`);

  // Cleanup
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
