// E2E for the no-fault returns arc. Nine suites against the lib +
// timeline. Same direct-lib pattern as test-offer-lifecycle.mts.

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
  requestReturn, acceptReturn, declineReturn, markShipped,
  markReceived, refundReturn, cancelReturn, expireReturnRequests,
  listReturnsForBuyer, listReturnsForSeller, getReturnEligibility,
} = await import("../src/lib/market/returns");

const { listNotifications } = await import("../src/lib/notifications/db");
const {
  getReturnStep, isReturnTerminal, getReturnActor, getReturnClosedCopy,
} = await import("../src/lib/market/return-timeline");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function makeCompletedTrade(args: {
  buyerId: string;
  sellerId: string;
  sku: string;
  acceptsReturns?: boolean;
  windowDays?: number;
  completedDaysAgo?: number;
}): Promise<string> {
  const completedAt = `NOW() - INTERVAL '${args.completedDaysAgo ?? 1} days'`;

  const ask = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status, accepts_returns)
     VALUES ($1, $2, 'ask', 10.00, 1, 'NM', 'filled', $3) RETURNING id`,
    [args.sellerId, args.sku, args.acceptsReturns ?? true],
  );
  const bid = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'bid', 10.00, 1, 'NM', 'filled') RETURNING id`,
    [args.buyerId, args.sku],
  );
  const t = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout,
        accepts_returns, return_window_days, completed_at)
     VALUES ($1, $2, $3, $4, $5, 10.00, 1, 'completed', 0.80, 9.20, $6, $7, ${completedAt})
     RETURNING id`,
    [args.buyerId, args.sellerId, bid.rows[0].id, ask.rows[0].id,
     args.sku, args.acceptsReturns ?? true, args.windowDays ?? 14],
  );
  return t.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(`DELETE FROM admin_actions_log WHERE target_user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(
    `DELETE FROM market_returns
      WHERE buyer_id = ANY($1::uuid[]) OR seller_id = ANY($1::uuid[])`,
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
  console.log("\n— Suite 0: return-timeline.ts invariants");
  assert(getReturnStep("requested") === "requested", "requested step");
  assert(getReturnStep("accepted") === "accepted", "accepted step");
  assert(getReturnStep("shipping") === "shipping", "shipping step");
  assert(getReturnStep("received") === "received", "received step");
  assert(getReturnStep("refunded") === "refunded", "refunded step");
  assert(getReturnStep("declined") === null, "declined off-path (null)");
  assert(getReturnStep("cancelled") === null, "cancelled off-path (null)");
  assert(getReturnStep("expired") === null, "expired off-path (null)");
  assert(isReturnTerminal("refunded"), "refunded terminal");
  assert(isReturnTerminal("declined"), "declined terminal");
  assert(!isReturnTerminal("accepted"), "accepted not terminal");
  assert(getReturnActor("requested") === "seller", "requested → seller");
  assert(getReturnActor("accepted") === "buyer", "accepted → buyer");
  assert(getReturnActor("shipping") === "seller", "shipping → seller");
  assert(getReturnActor("received") === "admin", "received → admin");
  assert(getReturnActor("refunded") === null, "refunded → null");
  assert(getReturnClosedCopy("declined") != null, "declined has closed copy");
  assert(getReturnClosedCopy("refunded") === null, "refunded has no closed copy");

  // ── Suite 1: requestReturn happy path + notify ──
  console.log("\n— Suite 1: requestReturn fires return.requested");
  const seller1 = await makeUser(`ret-s1-${t}`);
  const buyer1 = await makeUser(`ret-b1-${t}`);
  allUsers.push(seller1, buyer1);
  const trade1 = await makeCompletedTrade({
    buyerId: buyer1, sellerId: seller1, sku: `RET-${t}`,
  });

  const r1 = await requestReturn({
    buyerId: buyer1,
    tradeId: trade1,
    reason: "changed_mind",
    message: "Realised I already have this card.",
  });
  assert(r1.ok, `requestReturn ok (${r1.ok ? "ok" : r1.reason})`);
  if (r1.ok) {
    assert(r1.value.status === "requested", "status starts requested");
    assert(r1.value.expires_at != null, "expires_at populated");
    assert(r1.value.refund_amount === null, "refund_amount null until accepted");
  }

  const sellerNotifs1 = await listNotifications(seller1);
  const reqNotif = sellerNotifs1.find((n) => n.kind === "return.requested");
  assert(reqNotif != null, "seller got return.requested notification");

  // ── Suite 2: validation rejections ──
  console.log("\n— Suite 2: validation rejections");

  // Invalid reason
  const badReason = await requestReturn({
    buyerId: buyer1, tradeId: trade1, reason: "bogus",
  });
  assert(!badReason.ok, "invalid reason rejected");

  // 'other' without enough message
  const otherShort = await requestReturn({
    buyerId: buyer1, tradeId: trade1, reason: "other", message: "no",
  });
  assert(!otherShort.ok, "'other' with <10 char msg rejected");

  // Non-buyer trying to open return
  const stranger = await requestReturn({
    buyerId: seller1, tradeId: trade1, reason: "changed_mind",
  });
  assert(!stranger.ok && stranger.status === 403, "non-buyer rejected with 403");

  // Duplicate active return on same trade
  const dup = await requestReturn({
    buyerId: buyer1, tradeId: trade1, reason: "no_longer_needed",
  });
  assert(!dup.ok && dup.reason.includes("already"), "duplicate active return rejected");

  // Trade that doesn't accept returns
  const seller2 = await makeUser(`ret-s2-${t}`);
  const buyer2 = await makeUser(`ret-b2-${t}`);
  allUsers.push(seller2, buyer2);
  const noReturnsTrade = await makeCompletedTrade({
    buyerId: buyer2, sellerId: seller2, sku: `NORET-${t}`,
    acceptsReturns: false,
  });
  const blocked = await requestReturn({
    buyerId: buyer2, tradeId: noReturnsTrade, reason: "changed_mind",
  });
  assert(!blocked.ok && blocked.reason.includes("doesn't accept"),
    "accepts_returns=false rejected");

  // Trade outside window
  const oldTrade = await makeCompletedTrade({
    buyerId: buyer2, sellerId: seller2, sku: `OLD-${t}`,
    acceptsReturns: true, windowDays: 14, completedDaysAgo: 30,
  });
  const tooLate = await requestReturn({
    buyerId: buyer2, tradeId: oldTrade, reason: "changed_mind",
  });
  assert(!tooLate.ok && tooLate.reason.includes("window"),
    "outside-window rejected");

  // ── Suite 3: declineReturn ──
  console.log("\n— Suite 3: declineReturn");
  const buyer3 = await makeUser(`ret-b3-${t}`);
  allUsers.push(buyer3);
  const trade3 = await makeCompletedTrade({
    buyerId: buyer3, sellerId: seller1, sku: `RET3-${t}`,
  });
  const r3 = await requestReturn({
    buyerId: buyer3, tradeId: trade3, reason: "changed_mind",
  });
  if (!r3.ok) throw new Error(`setup failed: ${r3.reason}`);

  const dr = await declineReturn(r3.value.id, seller1, "Final-sale listing.");
  assert(dr.ok, `decline ok (${dr.ok ? "ok" : dr.reason})`);
  if (dr.ok) {
    assert(dr.value.status === "declined", "status declined");
    assert(dr.value.decline_reason === "Final-sale listing.", "decline_reason stored");
    assert(dr.value.resolved_at != null, "resolved_at stamped");
  }

  const buyer3Notifs = await listNotifications(buyer3);
  const dn = buyer3Notifs.find((n) => n.kind === "return.declined");
  assert(dn != null, "buyer got return.declined");
  assert(dn?.body?.includes("Final-sale"), "decline reason in body");

  // ── Suite 4: full success chain (accept → ship → receive → refund) ──
  console.log("\n— Suite 4: accept → ship → receive → refund");
  const buyer4 = await makeUser(`ret-b4-${t}`);
  allUsers.push(buyer4);
  const trade4 = await makeCompletedTrade({
    buyerId: buyer4, sellerId: seller1, sku: `RET4-${t}`,
  });
  const r4 = await requestReturn({
    buyerId: buyer4, tradeId: trade4, reason: "wrong_card",
  });
  if (!r4.ok) throw new Error(`setup failed: ${r4.reason}`);

  // accept
  const ac = await acceptReturn(r4.value.id, seller1);
  assert(ac.ok, `accept ok (${ac.ok ? "ok" : ac.reason})`);
  if (ac.ok) {
    assert(ac.value.status === "accepted", "status accepted");
    assert(ac.value.refund_amount === "10.00", "refund_amount = trade total (10.00)");
  }
  const buyer4Notifs1 = await listNotifications(buyer4);
  assert(buyer4Notifs1.some((n) => n.kind === "return.accepted"),
    "buyer got return.accepted");

  // ship
  const sh = await markShipped({
    returnId: r4.value.id, buyerId: buyer4,
    carrier: "Royal Mail", trackingNumber: "RM12345TEST",
  });
  assert(sh.ok, `ship ok (${sh.ok ? "ok" : sh.reason})`);
  if (sh.ok) {
    assert(sh.value.status === "shipping", "status shipping");
    assert(sh.value.return_tracking_number === "RM12345TEST", "tracking# stored");
    assert(sh.value.return_tracking_carrier === "Royal Mail", "carrier stored");
    assert(sh.value.shipped_at != null, "shipped_at stamped");
  }
  const sellerNotifs4 = await listNotifications(seller1);
  assert(sellerNotifs4.some((n) => n.kind === "return.shipping"
    && n.reference_id === `${r4.value.id}:shipping`),
    "seller got return.shipping with tracking ref");

  // receive
  const re = await markReceived(r4.value.id, seller1);
  assert(re.ok, `receive ok (${re.ok ? "ok" : re.reason})`);
  if (re.ok) {
    assert(re.value.status === "received", "status received");
    assert(re.value.received_at != null, "received_at stamped");
  }

  // refund (admin)
  const rf = await refundReturn({
    returnId: r4.value.id, adminLabel: "admin@ctcg.test",
    note: "Returned in original condition.",
  });
  assert(rf.ok, `refund ok (${rf.ok ? "ok" : rf.reason})`);
  if (rf.ok) {
    assert(rf.value.status === "refunded", "status refunded");
    assert(rf.value.refunded_by_admin === "admin@ctcg.test", "admin label stored");
    assert(rf.value.refunded_at != null, "refunded_at stamped");
  }

  // governance audit log entry exists
  const audit = await pool.query(
    `SELECT action, target_id FROM admin_actions_log
      WHERE target_kind = 'market_return' AND target_id = $1`,
    [r4.value.id],
  );
  assert(audit.rows.length === 1, "governance log entry written");
  assert(audit.rows[0].action === "return_refunded", "action = return_refunded");

  const buyer4Notifs2 = await listNotifications(buyer4);
  assert(buyer4Notifs2.some((n) => n.kind === "return.refunded"),
    "buyer got return.refunded notification");

  // ── Suite 5: out-of-order refund attempts rejected ──
  console.log("\n— Suite 5: refund requires status='received'");
  const buyer5 = await makeUser(`ret-b5-${t}`);
  allUsers.push(buyer5);
  const trade5 = await makeCompletedTrade({
    buyerId: buyer5, sellerId: seller1, sku: `RET5-${t}`,
  });
  const r5 = await requestReturn({
    buyerId: buyer5, tradeId: trade5, reason: "changed_mind",
  });
  if (!r5.ok) throw new Error(`setup failed: ${r5.reason}`);

  // refund directly without going through accept → ship → receive
  const earlyRefund = await refundReturn({
    returnId: r5.value.id, adminLabel: "admin",
  });
  assert(!earlyRefund.ok && earlyRefund.status === 409,
    "refund before received rejected with 409");

  // ── Suite 6: cancel before refund ──
  console.log("\n— Suite 6: cancelReturn");
  const buyer6 = await makeUser(`ret-b6-${t}`);
  allUsers.push(buyer6);
  const trade6 = await makeCompletedTrade({
    buyerId: buyer6, sellerId: seller1, sku: `RET6-${t}`,
  });
  const r6 = await requestReturn({
    buyerId: buyer6, tradeId: trade6, reason: "changed_mind",
  });
  if (!r6.ok) throw new Error(`setup failed: ${r6.reason}`);

  const c = await cancelReturn(r6.value.id, buyer6);
  assert(c.ok, "cancel ok");
  if (c.ok) assert(c.value.status === "cancelled", "status cancelled");

  const sellerNotifs6 = await listNotifications(seller1);
  assert(sellerNotifs6.some((n) => n.kind === "return.cancelled"
    && n.reference_id === `${r6.value.id}:cancelled`),
    "seller got return.cancelled");

  // Non-buyer can't cancel — set up a fresh return on a fresh trade,
  // then try to cancel it as a stranger.
  const buyer6b = await makeUser(`ret-b6b-${t}`);
  allUsers.push(buyer6b);
  const trade6b = await makeCompletedTrade({
    buyerId: buyer6b, sellerId: seller1, sku: `RET6B-${t}`,
  });
  const r6b = await requestReturn({
    buyerId: buyer6b, tradeId: trade6b, reason: "no_longer_needed",
  });
  if (!r6b.ok) throw new Error(`setup failed: ${r6b.reason}`);
  const stranger6 = await cancelReturn(r6b.value.id, buyer6);
  assert(!stranger6.ok && stranger6.status === 403, "non-buyer cancel rejected");

  // ── Suite 7: expireReturnRequests sweep ──
  console.log("\n— Suite 7: expireReturnRequests sweep");
  const buyer7 = await makeUser(`ret-b7-${t}`);
  allUsers.push(buyer7);
  const trade7 = await makeCompletedTrade({
    buyerId: buyer7, sellerId: seller1, sku: `RET7-${t}`,
  });
  const r7 = await requestReturn({
    buyerId: buyer7, tradeId: trade7, reason: "changed_mind",
  });
  if (!r7.ok) throw new Error(`setup failed: ${r7.reason}`);

  // Back-date the expiry
  await pool.query(
    `UPDATE market_returns SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
    [r7.value.id],
  );

  const sweep = await expireReturnRequests();
  assert(sweep.expired >= 1, `sweep expired at least 1 (got ${sweep.expired})`);

  const after = await pool.query(
    `SELECT status FROM market_returns WHERE id = $1`, [r7.value.id]);
  assert(after.rows[0].status === "expired", "marked expired");

  const buyer7Notifs = await listNotifications(buyer7);
  assert(buyer7Notifs.some((n) => n.kind === "return.expired"),
    "buyer got return.expired");

  // Re-running the sweep is no-op
  const sweep2 = await expireReturnRequests();
  assert(sweep2.expired === 0, "re-sweep is no-op");

  // ── Suite 8: getReturnEligibility ──
  console.log("\n— Suite 8: getReturnEligibility");
  // Trade with active return
  const e1 = await getReturnEligibility(trade1, buyer1);
  assert(!e1.eligible && e1.existingReturnId != null,
    "trade with active return → not eligible, existingReturnId set");

  // Trade outside window
  const e2 = await getReturnEligibility(oldTrade, buyer2);
  assert(!e2.eligible && e2.reason?.includes("window"),
    "out-of-window trade → not eligible");

  // Eligible trade (fresh, accepts_returns=true, no active return)
  const buyer8 = await makeUser(`ret-b8-${t}`);
  allUsers.push(buyer8);
  const trade8 = await makeCompletedTrade({
    buyerId: buyer8, sellerId: seller1, sku: `RET8-${t}`,
  });
  const e3 = await getReturnEligibility(trade8, buyer8);
  assert(e3.eligible, "fresh trade with accepts_returns → eligible");

  // Wrong user
  const e4 = await getReturnEligibility(trade8, seller1);
  assert(!e4.eligible, "non-buyer → not eligible");

  // ── Suite 9: list queries ──
  console.log("\n— Suite 9: list queries");
  const buyer1Out = await listReturnsForBuyer(buyer1);
  assert(buyer1Out.length === 1, "buyer1 has 1 outgoing return");

  const seller1In = await listReturnsForSeller(seller1);
  assert(seller1In.length >= 4, `seller1 has multiple incoming (got ${seller1In.length})`);

  const seller1Active = await listReturnsForSeller(seller1, { activeOnly: true });
  assert(seller1Active.every((r) => !isReturnTerminal(r.status)),
    "activeOnly filter excludes terminal states");

  // ── Cleanup ──
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
