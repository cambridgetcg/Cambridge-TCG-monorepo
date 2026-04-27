// E2E for the pricing-rules arc. Eight suites — the most cross-
// module test of the session: pricing rules → offers → counter
// offers → notifications all in one chain.

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
  createRule, pauseRule, resumeRule, archiveRule,
  listRules, getRule, applyRulesToOffer,
} = await import("../src/lib/market/pricing-rules");

const { makeOffer, getOffer } = await import("../src/lib/market/offers");
const { listNotifications } = await import("../src/lib/notifications/db");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name, trust_score) VALUES ($1, $2, 80) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  await pool.query(
    `INSERT INTO trust_profiles (user_id, trust_score, trade_limit, daily_limit)
     VALUES ($1, 80, 2000, 10000) ON CONFLICT (user_id) DO NOTHING`,
    [u.rows[0].id],
  );
  return u.rows[0].id;
}

async function makeAsk(args: {
  sellerId: string;
  sku: string;
  setCode?: string;
  condition?: string;
  price: number;
  qty?: number;
  allowOffers?: boolean;
}): Promise<string> {
  const r = await pool.query(
    `INSERT INTO market_orders
       (user_id, side, sku, set_code, card_name, condition, price, quantity, status, allow_offers)
     VALUES ($1, 'ask', $2, $3, 'Test Card', $4, $5, $6, 'open', $7)
     RETURNING id`,
    [args.sellerId, args.sku, args.setCode ?? null, args.condition ?? "NM",
     args.price.toFixed(2), args.qty ?? 1, args.allowOffers ?? true],
  );
  return r.rows[0].id;
}

async function cleanup(userIds: string[]) {
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
  await pool.query(
    `DELETE FROM market_offers
      WHERE buyer_id = ANY($1::uuid[]) OR seller_id = ANY($1::uuid[])`,
    [userIds],
  );
  await pool.query(`DELETE FROM pricing_rules WHERE user_id = ANY($1::uuid[])`, [userIds]);
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

  // ── Suite 1: createRule validation ──
  console.log("\n— Suite 1: createRule validation");
  const seller1 = await makeUser(`pr-s1-${t}`);
  allUsers.push(seller1);

  // Blank name
  const noName = await createRule({
    userId: seller1, name: "", ruleType: "auto_decline", thresholdPct: 80,
  });
  assert(!noName.ok, "blank name rejected");

  // Bad threshold
  const badThresh = await createRule({
    userId: seller1, name: "test", ruleType: "auto_decline", thresholdPct: 150,
  });
  assert(!badThresh.ok, "threshold > 100 rejected");

  // auto_counter without counterPct
  const counterMissing = await createRule({
    userId: seller1, name: "test", ruleType: "auto_counter", thresholdPct: 80,
  });
  assert(!counterMissing.ok, "auto_counter requires counterPct");

  // counter ≤ threshold
  const counterTooLow = await createRule({
    userId: seller1, name: "test", ruleType: "auto_counter",
    thresholdPct: 90, counterPct: 80,
  });
  assert(!counterTooLow.ok, "counterPct ≤ threshold rejected");

  // auto_decline with counterPct
  const declineWithCounter = await createRule({
    userId: seller1, name: "test", ruleType: "auto_decline",
    thresholdPct: 80, counterPct: 90,
  });
  assert(!declineWithCounter.ok, "auto_decline rejects counterPct");

  // Valid
  const okRule = await createRule({
    userId: seller1, name: "Floor at 80%",
    ruleType: "auto_decline", thresholdPct: 80,
    responseMessage: "Sorry, can't go that low.",
  });
  assert(okRule.ok, `valid auto_decline created (${okRule.ok ? "ok" : okRule.reason})`);
  if (okRule.ok) {
    assert(okRule.value.status === "active", "starts active");
    assert(okRule.value.trigger_count === 0, "trigger_count starts 0");
  }

  // ── Suite 2: auto_decline path ──
  console.log("\n— Suite 2: auto_decline triggered by makeOffer");
  if (!okRule.ok) throw new Error("setup");

  const buyer2 = await makeUser(`pr-b2-${t}`);
  allUsers.push(buyer2);
  // Prices kept under the £50 NEW-tier trade limit so canTrade gate
  // doesn't block fresh test users.
  const ask2 = await makeAsk({ sellerId: seller1, sku: `PR2-${t}`, price: 40.00 });

  // 70% of ask = £28 — below 80% threshold, should trigger auto-decline.
  const offer2 = await makeOffer({
    buyerId: buyer2, askOrderId: ask2, offerPrice: 28.00,
  });
  assert(offer2.ok, `offer created (${offer2.ok ? "ok" : offer2.reason})`);
  if (!offer2.ok) throw new Error("offer setup failed");

  // Wait briefly for the lazy-imported rule eval to finish
  await new Promise((r) => setTimeout(r, 100));

  const after = await getOffer(offer2.value.id);
  assert(after?.status === "declined",
    `offer auto-declined (got ${after?.status})`);

  // Buyer got the standard offer.declined notification — same kind
  // as a manual decline. The rule's response_message lands in the
  // notification body so the buyer reads the seller's reason.
  const buyer2Notifs = await listNotifications(buyer2);
  const declineNotif = buyer2Notifs.find((n) => n.kind === "offer.declined");
  assert(declineNotif != null, "buyer got offer.declined (no separate kind for rule-triggered)");
  assert(declineNotif?.body?.includes("can't go that low"),
    "rule's response_message landed in the notification body");

  // Rule stats incremented
  const ruleAfter = await getRule(okRule.value.id, seller1);
  assert(ruleAfter?.trigger_count === 1, "trigger_count = 1");
  assert(ruleAfter?.last_triggered_at != null, "last_triggered_at stamped");

  // ── Suite 3: above-threshold offer NOT auto-declined ──
  console.log("\n— Suite 3: offer at threshold falls through");
  const ask3 = await makeAsk({ sellerId: seller1, sku: `PR3-${t}`, price: 40.00 });

  // 85% of ask = £34, above the 80% threshold → falls through to pending
  const offer3 = await makeOffer({
    buyerId: buyer2, askOrderId: ask3, offerPrice: 34.00,
  });
  if (!offer3.ok) throw new Error(`offer setup: ${offer3.reason}`);
  await new Promise((r) => setTimeout(r, 100));

  const after3 = await getOffer(offer3.value.id);
  assert(after3?.status === "pending",
    `offer stays pending (got ${after3?.status})`);

  // ── Suite 4: auto_counter path ──
  console.log("\n— Suite 4: auto_counter triggered + price computed correctly");
  const seller4 = await makeUser(`pr-s4-${t}`);
  const buyer4 = await makeUser(`pr-b4-${t}`);
  allUsers.push(seller4, buyer4);

  const counterRule = await createRule({
    userId: seller4, name: "Counter at 90%",
    ruleType: "auto_counter", thresholdPct: 80, counterPct: 90,
    responseMessage: "Best I can do is 90% of ask.",
  });
  if (!counterRule.ok) throw new Error("setup");

  const ask4 = await makeAsk({ sellerId: seller4, sku: `PR4-${t}`, price: 40.00 });

  // 60% of £40 = £24, below 80% threshold
  const offer4 = await makeOffer({
    buyerId: buyer4, askOrderId: ask4, offerPrice: 24.00,
  });
  if (!offer4.ok) throw new Error(`offer setup: ${offer4.reason}`);
  await new Promise((r) => setTimeout(r, 100));

  const after4 = await getOffer(offer4.value.id);
  assert(after4?.status === "countered",
    `offer auto-countered (got ${after4?.status})`);
  assert(after4?.counter_price === "36.00",
    `counter_price = 90% of £40 = £36.00 (got ${after4?.counter_price})`);
  assert(after4?.counter_message?.includes("90% of ask"),
    "counter_message stored");

  // ── Suite 5: listing_filter scoping ──
  console.log("\n— Suite 5: listing_filter scopes the rule to matching asks");
  const seller5 = await makeUser(`pr-s5-${t}`);
  const buyer5 = await makeUser(`pr-b5-${t}`);
  allUsers.push(seller5, buyer5);

  // Rule that only applies to OP01 set
  const scopedRule = await createRule({
    userId: seller5, name: "OP01 floor",
    ruleType: "auto_decline", thresholdPct: 90,
    listingFilter: { set_codes: ["OP01"] },
  });
  if (!scopedRule.ok) throw new Error("setup");

  const ask_op01 = await makeAsk({
    sellerId: seller5, sku: `OP01-001-${t}`, setCode: "OP01", price: 40.00,
  });
  const ask_op02 = await makeAsk({
    sellerId: seller5, sku: `OP02-001-${t}`, setCode: "OP02", price: 40.00,
  });

  // Lowball on OP01 — should auto-decline (80 < 90% threshold)
  const offer_op01 = await makeOffer({
    buyerId: buyer5, askOrderId: ask_op01, offerPrice: 32.00,
  });
  if (!offer_op01.ok) throw new Error("setup");
  await new Promise((r) => setTimeout(r, 100));
  const after_op01 = await getOffer(offer_op01.value.id);
  assert(after_op01?.status === "declined",
    "OP01 lowball auto-declined (rule scoped match)");

  // Same lowball on OP02 — should fall through to pending (rule
  // doesn't apply to that set)
  const offer_op02 = await makeOffer({
    buyerId: buyer5, askOrderId: ask_op02, offerPrice: 32.00,
  });
  if (!offer_op02.ok) throw new Error("setup");
  await new Promise((r) => setTimeout(r, 100));
  const after_op02 = await getOffer(offer_op02.value.id);
  assert(after_op02?.status === "pending",
    "OP02 lowball NOT auto-declined (rule scope excludes set)");

  // ── Suite 6: paused rule doesn't fire ──
  console.log("\n— Suite 6: paused rule is no-op");
  const pr = await pauseRule(scopedRule.value.id, seller5);
  assert(pr.ok, "pause ok");

  const ask_op01_b = await makeAsk({
    sellerId: seller5, sku: `OP01-002-${t}`, setCode: "OP01", price: 40.00,
  });
  const offer_op01_b = await makeOffer({
    buyerId: buyer5, askOrderId: ask_op01_b, offerPrice: 32.00,
  });
  if (!offer_op01_b.ok) throw new Error("setup");
  await new Promise((r) => setTimeout(r, 100));
  const after_op01_b = await getOffer(offer_op01_b.value.id);
  assert(after_op01_b?.status === "pending",
    "paused rule lets the offer fall through to pending");

  // Resume — next offer auto-declines
  await resumeRule(scopedRule.value.id, seller5);
  const ask_op01_c = await makeAsk({
    sellerId: seller5, sku: `OP01-003-${t}`, setCode: "OP01", price: 40.00,
  });
  const offer_op01_c = await makeOffer({
    buyerId: buyer5, askOrderId: ask_op01_c, offerPrice: 32.00,
  });
  if (!offer_op01_c.ok) throw new Error("setup");
  await new Promise((r) => setTimeout(r, 100));
  const after_op01_c = await getOffer(offer_op01_c.value.id);
  assert(after_op01_c?.status === "declined",
    "resumed rule fires again");

  // ── Suite 7: applyRulesToOffer direct call ──
  console.log("\n— Suite 7: applyRulesToOffer return shape");
  const ask7 = await makeAsk({
    sellerId: seller1, sku: `PR7-${t}`, price: 40.00,
  });

  // Insert offer manually (bypassing makeOffer) so we can call
  // applyRulesToOffer directly and inspect the return.
  const manualOffer = await pool.query(
    `INSERT INTO market_offers
       (ask_order_id, buyer_id, seller_id, offer_price, expires_at)
     VALUES ($1, $2, $3, 70.00, NOW() + INTERVAL '48 hours') RETURNING id`,
    [ask7, buyer2, seller1],
  );
  const manualOfferId = manualOffer.rows[0].id;

  const result = await applyRulesToOffer({
    offerId: manualOfferId,
    sellerId: seller1,
    askId: ask7,
    offerPrice: 28.00,
  });
  assert(result.triggered === true, "rule fired (direct call)");
  assert(result.action === "declined", `action = declined (got ${result.action})`);
  assert(result.ruleId === okRule.value.id, "ruleId returned");

  // Above-threshold offer through direct call → no trigger
  const aboveOffer = await pool.query(
    `INSERT INTO market_offers
       (ask_order_id, buyer_id, seller_id, offer_price, expires_at)
     VALUES ($1, $2, $3, 90.00, NOW() + INTERVAL '48 hours') RETURNING id`,
    [ask7, buyer2, seller1],
  );
  const aboveResult = await applyRulesToOffer({
    offerId: aboveOffer.rows[0].id,
    sellerId: seller1,
    askId: ask7,
    offerPrice: 36.00,
  });
  assert(aboveResult.triggered === false, "above-threshold offer doesn't fire");
  assert(aboveResult.action === null, "action null on no-trigger");

  // ── Suite 8: ownership / list filters ──
  console.log("\n— Suite 8: ownership + listRules");
  const buyer8 = await makeUser(`pr-b8-${t}`);
  allUsers.push(buyer8);

  const otherPause = await pauseRule(okRule.value.id, buyer8);
  assert(!otherPause.ok && otherPause.status === 403, "non-owner pause rejected");

  const stranger = await getRule(okRule.value.id, buyer8);
  assert(stranger === null, "non-owner getRule returns null");

  // listRules excludes archived
  await archiveRule(okRule.value.id, seller1);
  const list = await listRules(seller1);
  assert(list.every((r) => r.status !== "archived"),
    "archived rules hidden from listRules");

  // Cleanup
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
