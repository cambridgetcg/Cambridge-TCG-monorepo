// E2E for the make-an-offer arc. Covers the full state machine
// (pending → accepted | declined | countered → accepted/declined),
// notification dedup keys, the trust gate, and the expiry sweep.
//
// Direct-lib pattern matching test-market-notifications.mts.

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
  makeOffer, acceptOffer, declineOffer, counterOffer,
  acceptCounter, withdrawOffer, expireOffers,
  listOffersForBuyer, listOffersForSeller,
} = await import("../src/lib/market/offers");

const { listNotifications } = await import("../src/lib/notifications/db");
const { getOfferStep, isOfferTerminal, getOfferActor } =
  await import("../src/lib/market/offer-timeline");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name, trust_score) VALUES ($1, $2, 80) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  // Seed a Veteran-tier trust profile so the canTrade gate doesn't
  // reject offers > £50 (NEW tier ceiling). The trust engine
  // recomputes anyway when a real trade flows through; this lets
  // the test exercise prices up to £2000.
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
  price: number;
  qty?: number;
  allowOffers?: boolean;
}): Promise<string> {
  const r = await pool.query(
    `INSERT INTO market_orders
       (user_id, side, sku, card_name, condition, price, quantity, status, allow_offers)
     VALUES ($1, 'ask', $2, 'Test Card', 'NM', $3, $4, 'open', $5)
     RETURNING id`,
    [args.sellerId, args.sku, args.price.toFixed(2),
     args.qty ?? 1, args.allowOffers ?? true],
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
  console.log("\n— Suite 0: offer-timeline.ts invariants");
  assert(getOfferStep("pending") === "offered", "pending → offered");
  assert(getOfferStep("countered") === "responded", "countered → responded");
  assert(getOfferStep("accepted") === "resolved", "accepted → resolved");
  assert(getOfferStep("withdrawn") === "resolved", "withdrawn → resolved");
  assert(isOfferTerminal("expired"), "expired is terminal");
  assert(!isOfferTerminal("pending"), "pending is not terminal");
  assert(getOfferActor("pending") === "seller", "pending → seller's turn");
  assert(getOfferActor("countered") === "buyer", "countered → buyer's turn");
  assert(getOfferActor("accepted") === null, "accepted → no actor");

  // ── Suite 1: makeOffer happy path + notify ──
  console.log("\n— Suite 1: makeOffer fires offer.received");
  const seller1 = await makeUser(`off-s1-${t}`);
  const buyer1 = await makeUser(`off-b1-${t}`);
  allUsers.push(seller1, buyer1);
  const ask1 = await makeAsk({ sellerId: seller1, sku: `OFF-${t}`, price: 20.00 });

  const r1 = await makeOffer({
    buyerId: buyer1,
    askOrderId: ask1,
    offerPrice: 15.00,
    message: "Would you take £15?",
  });
  assert(r1.ok, `makeOffer ok (${r1.ok ? "ok" : r1.reason})`);
  if (r1.ok) {
    assert(r1.value.status === "pending", "status starts pending");
    assert(r1.value.expires_at != null, "expires_at populated");
  }

  const sellerNotifs = await listNotifications(seller1);
  const recvNotif = sellerNotifs.find((n) => n.kind === "offer.received");
  assert(recvNotif != null, "seller got offer.received notification");
  assert(recvNotif?.title.includes("15") || recvNotif?.title.includes("£15"),
    "title includes the offer amount");

  // ── Suite 2: validation rejections ──
  console.log("\n— Suite 2: validation rejections");

  // Self-offer
  const self = await makeOffer({
    buyerId: seller1, askOrderId: ask1, offerPrice: 15.00,
  });
  assert(!self.ok && self.reason.includes("own"), "self-offer rejected");

  // Above-ask offer
  const overAsk = await makeOffer({
    buyerId: buyer1, askOrderId: ask1, offerPrice: 25.00,
  });
  assert(!overAsk.ok, "over-ask rejected");

  // Duplicate (buyer1 already has a pending offer on ask1)
  const dup = await makeOffer({
    buyerId: buyer1, askOrderId: ask1, offerPrice: 16.00,
  });
  assert(!dup.ok && dup.reason.includes("already"), "duplicate offer rejected");

  // Ask with allow_offers=false
  const seller2 = await makeUser(`off-s2-${t}`);
  allUsers.push(seller2);
  const noOffersAsk = await makeAsk({
    sellerId: seller2, sku: `NOOFF-${t}`, price: 30.00, allowOffers: false,
  });
  const blocked = await makeOffer({
    buyerId: buyer1, askOrderId: noOffersAsk, offerPrice: 25.00,
  });
  assert(!blocked.ok && blocked.reason.includes("doesn't accept"),
    "allow_offers=false rejected");

  // ── Suite 3: declineOffer ──
  console.log("\n— Suite 3: declineOffer");
  const buyer3 = await makeUser(`off-b3-${t}`);
  allUsers.push(buyer3);
  const ask3 = await makeAsk({ sellerId: seller1, sku: `OFF3-${t}`, price: 20.00 });
  const o3 = await makeOffer({ buyerId: buyer3, askOrderId: ask3, offerPrice: 15.00 });
  if (!o3.ok) throw new Error(`setup failed: ${o3.reason}`);

  const dr = await declineOffer(o3.value.id, seller1, "Too low.");
  assert(dr.ok, `decline ok (${dr.ok ? "ok" : dr.reason})`);
  if (dr.ok) {
    assert(dr.value.status === "declined", "status declined");
    assert(dr.value.resolved_at != null, "resolved_at stamped");
  }

  const buyerNotifs3 = await listNotifications(buyer3);
  const dn = buyerNotifs3.find((n) => n.kind === "offer.declined");
  assert(dn != null, "buyer got offer.declined");
  assert(dn?.body?.includes("Too low"), "decline reason in body");

  // Re-decline returns 409
  const dr2 = await declineOffer(o3.value.id, seller1);
  assert(!dr2.ok, "re-decline rejected");

  // ── Suite 4: acceptOffer creates a trade ──
  console.log("\n— Suite 4: acceptOffer creates a market_trade at offer_price");
  const buyer4 = await makeUser(`off-b4-${t}`);
  allUsers.push(buyer4);
  const ask4 = await makeAsk({ sellerId: seller1, sku: `OFF4-${t}`, price: 50.00, qty: 2 });

  const o4 = await makeOffer({ buyerId: buyer4, askOrderId: ask4, offerPrice: 40.00, quantity: 1 });
  if (!o4.ok) throw new Error(`setup failed: ${o4.reason}`);

  const ar = await acceptOffer(o4.value.id, seller1);
  assert(ar.ok, `accept ok (${ar.ok ? "ok" : ar.reason})`);
  if (ar.ok) {
    assert(ar.value.offer.status === "accepted", "offer status = accepted");
    assert(ar.value.offer.trade_id === ar.value.trade.id, "offer linked to trade");
    assert(parseFloat(ar.value.trade.price) === 40.00, "trade price = offer_price (not ask price)");
    assert(ar.value.trade.escrow_status === "awaiting_payment",
      "trade enters awaiting_payment");
  }

  // Ask should now be partially_filled (qty was 2, 1 consumed)
  const askAfter = await pool.query(
    `SELECT status, filled_quantity FROM market_orders WHERE id=$1`, [ask4]);
  assert(askAfter.rows[0].filled_quantity === 1, "ask filled_quantity advanced to 1");
  assert(askAfter.rows[0].status === "partially_filled",
    `ask status partially_filled (got ${askAfter.rows[0].status})`);

  const buyer4Notifs = await listNotifications(buyer4);
  const acceptNotif = buyer4Notifs.find((n) => n.kind === "offer.accepted");
  assert(acceptNotif != null, "buyer got offer.accepted notification");
  assert(acceptNotif?.title.includes("40") || acceptNotif?.title.includes("£40"),
    "accept notification mentions the agreed price (40)");

  // ── Suite 5: counter → acceptCounter → trade at counter_price ──
  console.log("\n— Suite 5: counter + acceptCounter");
  const buyer5 = await makeUser(`off-b5-${t}`);
  allUsers.push(buyer5);
  // Prices kept under the £50 NEW-tier trade limit so canTrade gate
  // doesn't block fresh test users. The counter logic is independent
  // of magnitude.
  const ask5 = await makeAsk({ sellerId: seller1, sku: `OFF5-${t}`, price: 40.00 });
  const o5 = await makeOffer({ buyerId: buyer5, askOrderId: ask5, offerPrice: 28.00 });
  if (!o5.ok) throw new Error(`setup failed: ${o5.reason}`);

  // Counter outside bounds — must be > offer (28) and < ask (40)
  const badLo = await counterOffer({
    offerId: o5.value.id, sellerId: seller1, counterPrice: 26.00,
  });
  assert(!badLo.ok, "counter <= offer rejected");
  const badHi = await counterOffer({
    offerId: o5.value.id, sellerId: seller1, counterPrice: 42.00,
  });
  assert(!badHi.ok, "counter >= ask rejected");

  // Valid counter
  const cr = await counterOffer({
    offerId: o5.value.id, sellerId: seller1,
    counterPrice: 34.00, counterMessage: "How about £34?",
  });
  assert(cr.ok, `counter ok (${cr.ok ? "ok" : cr.reason})`);
  if (cr.ok) {
    assert(cr.value.status === "countered", "status = countered");
    assert(cr.value.counter_price === "34.00", "counter_price stored");
    assert(cr.value.responded_at != null, "responded_at stamped");
    assert(cr.value.resolved_at == null, "still not resolved (ball back to buyer)");
  }

  const buyer5Notifs = await listNotifications(buyer5);
  const counterNotif = buyer5Notifs.find((n) => n.kind === "offer.countered");
  assert(counterNotif != null, "buyer got offer.countered");

  // Buyer accepts the counter
  const acc = await acceptCounter(o5.value.id, buyer5);
  assert(acc.ok, `acceptCounter ok (${acc.ok ? "ok" : acc.reason})`);
  if (acc.ok) {
    assert(acc.value.offer.status === "accepted", "status = accepted");
    assert(parseFloat(acc.value.trade.price) === 34.00,
      "trade price = counter_price (not offer/ask)");
  }

  const sellerNotifs5 = await listNotifications(seller1);
  const counterAcceptNotif = sellerNotifs5.find((n) => n.kind === "offer.counter_accepted");
  assert(counterAcceptNotif != null, "seller got offer.counter_accepted");

  // ── Suite 6: withdraw notifies seller ──
  console.log("\n— Suite 6: withdrawOffer");
  const buyer6 = await makeUser(`off-b6-${t}`);
  allUsers.push(buyer6);
  const ask6 = await makeAsk({ sellerId: seller1, sku: `OFF6-${t}`, price: 25.00 });
  const o6 = await makeOffer({ buyerId: buyer6, askOrderId: ask6, offerPrice: 20.00 });
  if (!o6.ok) throw new Error(`setup failed: ${o6.reason}`);

  const wr = await withdrawOffer(o6.value.id, buyer6);
  assert(wr.ok, "withdraw ok");
  if (wr.ok) assert(wr.value.status === "withdrawn", "status = withdrawn");

  const sellerNotifs6 = await listNotifications(seller1);
  const wdNotif = sellerNotifs6.find(
    (n) => n.kind === "offer.withdrawn" && n.reference_id === `${o6.value.id}:withdrawn`);
  assert(wdNotif != null, "seller got offer.withdrawn");

  // Non-buyer can't withdraw
  const o6b = await makeOffer({ buyerId: buyer3, askOrderId: ask6, offerPrice: 18.00 });
  if (!o6b.ok) throw new Error(`setup failed: ${o6b.reason}`);
  const stranger = await withdrawOffer(o6b.value.id, buyer6);
  assert(!stranger.ok && stranger.status === 403, "non-buyer withdraw rejected with 403");

  // ── Suite 7: expireOffers sweep ──
  console.log("\n— Suite 7: expireOffers sweep");
  const buyer7 = await makeUser(`off-b7-${t}`);
  allUsers.push(buyer7);
  const ask7 = await makeAsk({ sellerId: seller1, sku: `OFF7-${t}`, price: 10.00 });
  const o7 = await makeOffer({ buyerId: buyer7, askOrderId: ask7, offerPrice: 8.00 });
  if (!o7.ok) throw new Error(`setup failed: ${o7.reason}`);

  // Back-date the expiry past now
  await pool.query(
    `UPDATE market_offers SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
    [o7.value.id],
  );

  const sweep = await expireOffers();
  assert(sweep.expired >= 1, `sweep expired at least 1 (got ${sweep.expired})`);

  const after = await pool.query(`SELECT status FROM market_offers WHERE id = $1`, [o7.value.id]);
  assert(after.rows[0].status === "expired",
    `offer marked expired (got ${after.rows[0].status})`);

  const buyer7Notifs = await listNotifications(buyer7);
  assert(buyer7Notifs.some((n) => n.kind === "offer.expired"),
    "buyer got offer.expired notification");

  // Re-running the sweep is a no-op (idempotent)
  const sweep2 = await expireOffers();
  assert(sweep2.expired === 0, `re-sweep is no-op (got ${sweep2.expired})`);

  // ── Suite 8: list queries ──
  console.log("\n— Suite 8: list queries");
  const buyer1Outgoing = await listOffersForBuyer(buyer1);
  assert(buyer1Outgoing.length >= 1, "buyer1 has at least 1 outgoing offer");

  const seller1Incoming = await listOffersForSeller(seller1);
  assert(seller1Incoming.length >= 4, `seller1 has multiple incoming (got ${seller1Incoming.length})`);

  const seller1Active = await listOffersForSeller(seller1, { activeOnly: true });
  assert(seller1Active.every((o) => o.status === "pending" || o.status === "countered"),
    "activeOnly filter excludes terminal states");

  // ── Cleanup ──
  await cleanup(allUsers);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
