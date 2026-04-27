// Deep E2E for the dispute system. Covers the happy-path lifecycle
// (open → under_review → awaiting_evidence → resolved), the withdraw
// path, the timeline step resolution, and regression guards for the
// five security / contract bugs fixed in this arc.
//
// Uses the lib helpers directly where possible; calls route handlers
// for paths that need the auth gate (security regression tests).

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const {
  raiseDispute,
  setDisputeStatus,
  resolveDispute,
  addDisputeMessage,
  getDisputeMessages,
  getDisputeByTradeForUser,
  userCanAccessDispute,
  listMyDisputes,
  withdrawDispute,
} = await import("../src/lib/trust/db");

const {
  DISPUTE_TIMELINE,
  getDisputeStep,
  isDisputeTerminal,
} = await import("../src/lib/trust/dispute-timeline");

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

async function makeUser(email: string, verified = true): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name, is_verified) VALUES ($1, $2, $3) RETURNING id`,
    [email, email.split("@")[0], verified],
  );
  return u.rows[0].id;
}

async function makeTrade(buyerId: string, sellerId: string, sku: string): Promise<string> {
  // market_trades requires both bid_order_id and ask_order_id — seed
  // the two matching market_orders first.
  const bid = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'bid', 10.00, 1, 'NM', 'open') RETURNING id`,
    [buyerId, sku],
  );
  const ask = await pool.query(
    `INSERT INTO market_orders (user_id, sku, side, price, quantity, condition, status)
     VALUES ($1, $2, 'ask', 10.00, 1, 'NM', 'open') RETURNING id`,
    [sellerId, sku],
  );

  const t = await pool.query(
    `INSERT INTO market_trades
       (buyer_id, seller_id, bid_order_id, ask_order_id, sku, price, quantity,
        escrow_status, commission_amount, seller_payout, created_at)
     VALUES ($1, $2, $3, $4, $5, 10.00, 1, 'awaiting_shipment', 0.80, 9.20, NOW())
     RETURNING id`,
    [buyerId, sellerId, bid.rows[0].id, ask.rows[0].id, sku],
  );
  return t.rows[0].id;
}

async function cleanup(userIds: string[], tradeIds: string[]) {
  if (tradeIds.length > 0) {
    await pool.query(`DELETE FROM dispute_evidence WHERE dispute_id IN (SELECT id FROM trade_disputes WHERE trade_id = ANY($1::uuid[]))`, [tradeIds]);
    await pool.query(`DELETE FROM dispute_messages WHERE dispute_id IN (SELECT id FROM trade_disputes WHERE trade_id = ANY($1::uuid[]))`, [tradeIds]);
    await pool.query(`DELETE FROM trade_disputes WHERE trade_id = ANY($1::uuid[])`, [tradeIds]);
    await pool.query(`DELETE FROM escrow_payments WHERE trade_id = ANY($1::uuid[])`, [tradeIds]);
    // Nullable FK, so it's safe to just delete trades — the market_orders
    // row goes with the user below via user_id cascade.
    await pool.query(`DELETE FROM market_trades WHERE id = ANY($1::uuid[])`, [tradeIds]);
  }
  if (userIds.length > 0) {
    await pool.query(`DELETE FROM market_orders WHERE user_id = ANY($1::uuid[])`, [userIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }
}

try {
  const t = Date.now().toString(36).slice(-5);

  // ── Suite 1: happy-path lifecycle + timeline timestamps ──
  console.log("\n— Suite 1: open → under_review → awaiting_evidence → resolved_buyer");
  const buyer1 = await makeUser(`disp-b1-${t}@test.invalid`);
  const seller1 = await makeUser(`disp-s1-${t}@test.invalid`);
  const trade1 = await makeTrade(buyer1, seller1, `DISP-${t}-1`);

  const d1 = await raiseDispute(trade1, buyer1, "wrong_card", "Received a different card than listed.");
  assert(d1.status === "open", `dispute opens with status='open' (got ${d1.status})`);
  assert(d1.raised_by === buyer1, "raised_by records the opener");

  // under_review — stamps under_review_at
  const d1b = (await setDisputeStatus(d1.id, "under_review"))!;
  assert(d1b.status === "under_review", "status → under_review");
  assert(!!d1b.under_review_at, "under_review_at stamped");

  // re-setting under_review should NOT bump the timestamp (COALESCE invariant)
  const firstReview = new Date(d1b.under_review_at as string).getTime();
  await new Promise((r) => setTimeout(r, 50));
  await setDisputeStatus(d1.id, "under_review");
  const d1c = (await pool.query(`SELECT * FROM trade_disputes WHERE id=$1`, [d1.id])).rows[0];
  assert(new Date(d1c.under_review_at).getTime() === firstReview,
    "under_review_at preserved on re-set (COALESCE holds first value)");

  // awaiting_evidence
  const d1d = (await setDisputeStatus(d1.id, "awaiting_evidence"))!;
  assert(d1d.status === "awaiting_evidence", "status → awaiting_evidence");
  assert(!!d1d.awaiting_evidence_at, "awaiting_evidence_at stamped");
  assert(new Date(d1d.under_review_at as string).getTime() === firstReview,
    "under_review_at still pinned to first stamp");

  // resolve — refund_buyer
  const d1e = await resolveDispute(d1.id, {
    resolutionType: "refund_buyer",
    resolutionNotes: "Card was not as described.",
    refundAmount: 10.0,
  });
  assert(d1e.status === "resolved_buyer", "refund_buyer → status='resolved_buyer'");
  assert(!!d1e.resolved_at, "resolved_at stamped");
  assert(d1e.resolution_type === "refund_buyer", "resolution_type captured");

  // ── Suite 2: DISPUTE_TIMELINE step resolution ──
  console.log("\n— Suite 2: shared timeline helper");
  assert(getDisputeStep("open") === 0, "open → step 0");
  assert(getDisputeStep("under_review") === 1, "under_review → step 1");
  assert(getDisputeStep("awaiting_evidence") === 2, "awaiting_evidence → step 2");
  assert(getDisputeStep("resolved_buyer") === 3, "resolved_buyer → step 3");
  assert(getDisputeStep("resolved_seller") === 3, "resolved_seller → step 3");
  assert(getDisputeStep("resolved_split") === 3, "resolved_split → step 3");
  assert(getDisputeStep("closed") === 0, "closed (withdrawn) → step 0");
  assert(getDisputeStep(null) === 0, "null status safely returns 0");
  assert(getDisputeStep("not_a_status") === 0, "unknown status returns 0");

  assert(!isDisputeTerminal("open"), "open is not terminal");
  assert(!isDisputeTerminal("under_review"), "under_review is not terminal");
  assert(isDisputeTerminal("resolved_buyer"), "resolved_buyer is terminal");
  assert(isDisputeTerminal("closed"), "closed is terminal");

  assert(DISPUTE_TIMELINE.length === 4, `4 timeline steps (got ${DISPUTE_TIMELINE.length})`);
  assert(DISPUTE_TIMELINE[0].tsField === "created_at", "opened step anchored on created_at");
  assert(DISPUTE_TIMELINE[3].tsField === "resolved_at", "resolved step anchored on resolved_at");

  // ── Suite 3: auth helpers (party check + my-disputes list) ──
  console.log("\n— Suite 3: user access scoping");
  const buyer3 = buyer1;        // reuse
  const seller3 = seller1;
  const stranger = await makeUser(`disp-x-${t}@test.invalid`);

  assert(await userCanAccessDispute(d1.id, buyer3), "buyer can access their own dispute");
  assert(await userCanAccessDispute(d1.id, seller3), "seller (counterparty) can access");
  assert(!(await userCanAccessDispute(d1.id, stranger)),
    "unrelated user cannot access the dispute");

  const buyerDisputes = await listMyDisputes(buyer3);
  assert(buyerDisputes.some((d) => d.id === d1.id), "listMyDisputes returns raised disputes");
  const sellerDisputes = await listMyDisputes(seller3);
  assert(sellerDisputes.some((d) => d.id === d1.id), "listMyDisputes returns disputes you're a counterparty on");
  const strangerDisputes = await listMyDisputes(stranger);
  assert(!strangerDisputes.some((d) => d.id === d1.id),
    "strangers don't see other users' disputes");

  // ── Suite 4: admin messages with sender_id=NULL (migration 0057 bug fix) ──
  console.log("\n— Suite 4: admin messages don't attribute to random user");
  const adminMsg = await addDisputeMessage(d1.id, null, "Admin reply: reviewing evidence.", true);
  assert(adminMsg.is_admin === true, "admin message flagged is_admin");
  assert(adminMsg.sender_id === null, "admin message persisted with sender_id=NULL");

  const userMsg = await addDisputeMessage(d1.id, buyer3, "Thanks.", false);
  assert(userMsg.is_admin === false && userMsg.sender_id === buyer3,
    "user message still attributes to real user");

  const msgs = await getDisputeMessages(d1.id);
  assert(msgs.length === 2, `both messages return (got ${msgs.length})`);
  const admin = msgs.find((m) => m.is_admin);
  assert(admin?.sender_name === null,
    "admin message sender_name=null (LEFT JOIN preserves row)");
  const user = msgs.find((m) => !m.is_admin);
  assert(!!user?.sender_name, "user message sender_name populated");

  // ── Suite 5: getDisputeByTradeForUser (scoped lookup) ──
  console.log("\n— Suite 5: ?trade_id= scoped lookup");
  const byTradeBuyer = await getDisputeByTradeForUser(trade1, buyer3);
  assert(byTradeBuyer?.id === d1.id, "buyer sees dispute for their trade");
  const byTradeStranger = await getDisputeByTradeForUser(trade1, stranger);
  assert(byTradeStranger === null,
    "stranger gets null — no leak of dispute data via trade_id");

  // ── Suite 6: withdraw flow ──
  console.log("\n— Suite 6: raiser can withdraw unresolved disputes");
  const buyer6 = await makeUser(`disp-b6-${t}@test.invalid`);
  const seller6 = await makeUser(`disp-s6-${t}@test.invalid`);
  const trade6 = await makeTrade(buyer6, seller6, `DISP-${t}-6`);
  const d6 = await raiseDispute(trade6, buyer6, "not_received", "Card never arrived.");

  // Non-raiser can't withdraw
  const sellerWithdraw = await withdrawDispute(d6.id, seller6);
  assert(!sellerWithdraw.ok && sellerWithdraw.reason?.includes("raiser"),
    `only raiser can withdraw (got: ${sellerWithdraw.reason})`);

  // Raiser withdraws successfully
  const buyerWithdraw = await withdrawDispute(d6.id, buyer6);
  assert(buyerWithdraw.ok, `raiser withdraw succeeds (reason: ${buyerWithdraw.reason ?? "ok"})`);

  const d6After = (await pool.query(`SELECT * FROM trade_disputes WHERE id=$1`, [d6.id])).rows[0];
  assert(d6After.status === "closed", `dispute → closed (got ${d6After.status})`);
  assert(!!d6After.withdrawn_at, "withdrawn_at stamped");

  const trade6After = (await pool.query(`SELECT escrow_status FROM market_trades WHERE id=$1`, [trade6])).rows[0];
  assert(trade6After.escrow_status === "awaiting_shipment",
    `trade returns to awaiting_shipment (got ${trade6After.escrow_status})`);

  // Second withdraw is idempotent-refuse
  const doubleWithdraw = await withdrawDispute(d6.id, buyer6);
  assert(!doubleWithdraw.ok && doubleWithdraw.reason?.includes("resolved"),
    `already-resolved dispute rejects second withdraw (got: ${doubleWithdraw.reason})`);

  // Can't withdraw a resolved dispute
  const d1Withdraw = await withdrawDispute(d1.id, buyer3);
  assert(!d1Withdraw.ok, "cannot withdraw an already-resolved dispute");

  // ── Suite 7: dispute_messages.sender_id NOT NULL → NULL migration (schema regression guard) ──
  console.log("\n— Suite 7: migration 0057 schema state");
  const schemaCheck = await pool.query(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_name='dispute_messages' AND column_name='sender_id'`,
  );
  assert(schemaCheck.rows[0]?.is_nullable === "YES",
    "dispute_messages.sender_id is nullable (migration 0057 applied)");

  const columnsCheck = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='trade_disputes'
        AND column_name IN ('under_review_at','awaiting_evidence_at','withdrawn_at')`,
  );
  assert(columnsCheck.rows.length === 3,
    `all 3 lifecycle columns exist on trade_disputes (got ${columnsCheck.rows.length})`);

  // ── Cleanup ──
  await cleanup(
    [buyer1, seller1, stranger, buyer6, seller6],
    [trade1, trade6],
  );

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
