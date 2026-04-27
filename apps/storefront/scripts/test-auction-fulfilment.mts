// Deep E2E for the auction post-win fulfilment chain. Seeds consigned
// and direct auctions, walks each through every transition via the
// shared @/lib/auction/fulfilment helpers the route handlers delegate
// to, and guards every security rule.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

const { sellerShip, buyerConfirmReceived, adminFulfil } = await import("../src/lib/auction/fulfilment");
const {
  getTimelineSteps, getFulfilmentStep, getCurrentActor, isFulfilmentTerminal,
  CONSIGNED_TIMELINE, DIRECT_TIMELINE,
} = await import("../src/lib/auction/fulfilment-timeline");

async function makeUser(label: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [`${label}@test.invalid`, label],
  );
  return u.rows[0].id;
}

async function makeAuction(opts: {
  sellerId: string; winnerId: string; consigned: boolean; paid: boolean;
}): Promise<string> {
  const statusFields = opts.paid ? ", paid_at, escrow_status" : "";
  const statusValues = opts.paid ? ", NOW(), 'awaiting_shipment'" : "";
  const a = await pool.query(
    `INSERT INTO auctions
       (title, auction_type, status, starting_price, bid_increment,
        starts_at, ends_at, actual_end_at,
        current_price, bid_count, winner_user_id, seller_user_id, is_consignment
        ${statusFields},
        created_at, updated_at)
     VALUES ($1, 'english', $2, 10, 1,
             NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day',
             10, 1, $3, $4, $5
             ${statusValues},
             NOW(), NOW())
     RETURNING id`,
    [`Test auction ${Date.now()}`, opts.paid ? "paid" : "ended", opts.winnerId, opts.sellerId, opts.consigned],
  );
  return a.rows[0].id;
}

async function getAuction(id: string) {
  const r = await pool.query(`SELECT * FROM auctions WHERE id=$1`, [id]);
  return r.rows[0];
}

async function cleanup(userIds: string[], auctionIds: string[]) {
  if (auctionIds.length > 0) {
    await pool.query(`DELETE FROM auction_images WHERE auction_id = ANY($1::uuid[])`, [auctionIds]);
    await pool.query(`DELETE FROM auction_bids WHERE auction_id = ANY($1::uuid[])`, [auctionIds]);
    await pool.query(`DELETE FROM auctions WHERE id = ANY($1::uuid[])`, [auctionIds]);
  }
  if (userIds.length > 0) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }
}

try {
  const t = Date.now().toString(36).slice(-5);

  // ── Scenario 1: consigned full path ──
  console.log("\n— Scenario 1: consigned paid → CTCG → buyer → completed");
  const seller1 = await makeUser(`auc-s1-${t}`);
  const buyer1 = await makeUser(`auc-b1-${t}`);
  const a1 = await makeAuction({ sellerId: seller1, winnerId: buyer1, consigned: true, paid: true });

  const s1 = await sellerShip(a1, seller1, { tracking: `RM-${t}-A1`, carrier: "Royal Mail" });
  assert(s1.ok, `consigned seller ship succeeds (${s1.reason ?? "ok"})`);
  let row = await getAuction(a1);
  assert(row.seller_shipped_at != null, "seller_shipped_at stamped");
  assert(row.tracking_to_ctcg === `RM-${t}-A1`, "tracking_to_ctcg saved");
  assert(row.carrier_to_ctcg === "Royal Mail", "carrier_to_ctcg saved");
  assert(row.escrow_status === "awaiting_shipment",
    `consigned ship keeps escrow=awaiting_shipment (got ${row.escrow_status})`);

  const r1 = await adminFulfil(a1, { action: "receive" });
  assert(r1.ok, "admin receive succeeds");
  row = await getAuction(a1);
  assert(row.received_by_ctcg_at != null, "received_by_ctcg_at stamped");
  assert(row.escrow_status === "received_by_ctcg", "escrow → received_by_ctcg");

  const d1 = await adminFulfil(a1, { action: "dispatch", tracking: `RM-${t}-A1-OUT`, carrier: "DPD" });
  assert(d1.ok, "admin dispatch succeeds");
  row = await getAuction(a1);
  assert(row.shipped_to_buyer_at != null, "shipped_to_buyer_at stamped");
  assert(row.tracking_to_buyer === `RM-${t}-A1-OUT`, "tracking_to_buyer set by admin");
  assert(row.escrow_status === "shipped_to_buyer", "escrow → shipped_to_buyer");

  const c1 = await buyerConfirmReceived(a1, buyer1);
  assert(c1.ok, "buyer confirm succeeds");
  row = await getAuction(a1);
  assert(row.buyer_received_at != null, "buyer_received_at stamped");
  assert(row.escrow_status === "completed", "escrow → completed");

  // Double confirm rejected
  const c1dup = await buyerConfirmReceived(a1, buyer1);
  assert(!c1dup.ok && c1dup.status === 409, `double confirm rejected (status ${c1dup.status})`);

  // ── Scenario 2: direct path ──
  console.log("\n— Scenario 2: direct seller ships straight to buyer");
  const seller2 = await makeUser(`auc-s2-${t}`);
  const buyer2 = await makeUser(`auc-b2-${t}`);
  const a2 = await makeAuction({ sellerId: seller2, winnerId: buyer2, consigned: false, paid: true });

  const s2 = await sellerShip(a2, seller2, { tracking: `EV-${t}-A2`, carrier: "Evri" });
  assert(s2.ok, "direct seller ship succeeds");
  let row2 = await getAuction(a2);
  assert(row2.seller_shipped_at != null, "seller_shipped_at stamped on direct");
  assert(row2.shipped_to_buyer_at != null, "direct: shipped_to_buyer_at stamped in one hop");
  assert(row2.escrow_status === "shipped_to_buyer", "direct escrow skips CTCG");
  assert(row2.tracking_to_buyer === `EV-${t}-A2`, "tracking → tracking_to_buyer on direct");
  assert(row2.tracking_to_ctcg === null, "tracking_to_ctcg stays null on direct");

  const c2 = await buyerConfirmReceived(a2, buyer2);
  assert(c2.ok, "direct buyer confirm succeeds");
  row2 = await getAuction(a2);
  assert(row2.escrow_status === "completed", "direct escrow → completed");

  // ── Scenario 3: security regressions ──
  console.log("\n— Scenario 3: role mismatches rejected");
  const seller3 = await makeUser(`auc-s3-${t}`);
  const buyer3 = await makeUser(`auc-b3-${t}`);
  const stranger = await makeUser(`auc-x-${t}`);
  const a3 = await makeAuction({ sellerId: seller3, winnerId: buyer3, consigned: false, paid: true });

  const bs = await sellerShip(a3, buyer3, { tracking: "X", carrier: null });
  assert(!bs.ok && bs.status === 403, `buyer trying to ship → 403 (${bs.status})`);

  const xs = await sellerShip(a3, stranger, { tracking: "X", carrier: null });
  assert(!xs.ok && xs.status === 403, "stranger ship → 403");

  // Seller ships (legitimate)
  await sellerShip(a3, seller3, { tracking: `EV-${t}-A3`, carrier: "Evri" });

  const sc = await buyerConfirmReceived(a3, seller3);
  assert(!sc.ok && sc.status === 403, `seller confirm → 403 (${sc.status})`);

  const strangerConfirm = await buyerConfirmReceived(a3, stranger);
  assert(!strangerConfirm.ok && strangerConfirm.status === 403, "stranger confirm → 403");

  // Admin fulfil on direct auction rejected
  const ad = await adminFulfil(a3, { action: "receive" });
  assert(!ad.ok && ad.status === 400, `admin fulfil on direct → 400 (${ad.status})`);

  // ── Scenario 4: out-of-order transitions ──
  console.log("\n— Scenario 4: out-of-order transitions rejected");
  const seller4 = await makeUser(`auc-s4-${t}`);
  const buyer4 = await makeUser(`auc-b4-${t}`);
  const a4 = await makeAuction({ sellerId: seller4, winnerId: buyer4, consigned: true, paid: true });

  const early = await adminFulfil(a4, { action: "dispatch", tracking: `X-${t}` });
  assert(!early.ok && early.status === 409, `dispatch before receive → 409 (${early.status})`);

  await adminFulfil(a4, { action: "receive" });
  const noTrack = await adminFulfil(a4, { action: "dispatch" });
  assert(!noTrack.ok && noTrack.status === 400, `dispatch without tracking → 400 (${noTrack.status})`);

  const earlyConfirm = await buyerConfirmReceived(a4, buyer4);
  assert(!earlyConfirm.ok && earlyConfirm.status === 409,
    `confirm before shipped_to_buyer → 409 (${earlyConfirm.status})`);

  // Unknown admin action
  const unknown = await adminFulfil(a4, { action: "xyzzy" as "receive" });
  assert(!unknown.ok && unknown.status === 400, `unknown admin action → 400 (${unknown.status})`);

  // Ship before paid
  const a4b = await makeAuction({ sellerId: seller4, winnerId: buyer4, consigned: false, paid: false });
  const shipBeforePay = await sellerShip(a4b, seller4, { tracking: "X", carrier: null });
  assert(!shipBeforePay.ok && shipBeforePay.status === 409,
    `seller ship before buyer pays → 409 (${shipBeforePay.status})`);

  // ── Scenario 5: timeline helper ──
  console.log("\n— Scenario 5: timeline step + actor resolution");
  assert(CONSIGNED_TIMELINE.length === 6, `consigned 6 steps (got ${CONSIGNED_TIMELINE.length})`);
  assert(DIRECT_TIMELINE.length === 4, `direct 4 steps (got ${DIRECT_TIMELINE.length})`);
  assert(getTimelineSteps({ is_consignment: true }) === CONSIGNED_TIMELINE,
    "consigned picks consigned timeline");
  assert(getTimelineSteps({ is_consignment: false }) === DIRECT_TIMELINE,
    "direct picks direct timeline");

  // Consigned steps
  assert(getFulfilmentStep({ is_consignment: true, status: "paid", escrow_status: "awaiting_shipment" }) === 2,
    "consigned+awaiting_shipment → step 2");
  assert(getFulfilmentStep({ is_consignment: true, status: "paid", escrow_status: "received_by_ctcg" }) === 3,
    "consigned+received_by_ctcg → step 3");
  assert(getFulfilmentStep({ is_consignment: true, status: "paid", escrow_status: "shipped_to_buyer" }) === 4,
    "consigned+shipped_to_buyer → step 4");
  assert(getFulfilmentStep({ is_consignment: true, status: "paid", escrow_status: "completed" }) === 5,
    "consigned+completed → step 5");

  // Direct steps
  assert(getFulfilmentStep({ is_consignment: false, status: "paid", escrow_status: "shipped_to_buyer" }) === 2,
    "direct+shipped_to_buyer → step 2 (skips CTCG)");
  assert(getFulfilmentStep({ is_consignment: false, status: "paid", escrow_status: "completed" }) === 3,
    "direct+completed → step 3");

  // Ended auction → step 0
  assert(getFulfilmentStep({ is_consignment: true, status: "ended", escrow_status: null }) === 0,
    "ended → step 0");

  // Actor role
  assert(getCurrentActor({ is_consignment: true, status: "ended", escrow_status: null }) === "buyer",
    "ended → actor=buyer");
  assert(getCurrentActor({ is_consignment: true, status: "paid", escrow_status: "awaiting_shipment" }) === "seller",
    "paid+awaiting_shipment → actor=seller");
  assert(getCurrentActor({ is_consignment: true, status: "paid", escrow_status: "received_by_ctcg" }) === "ctcg",
    "paid+received_by_ctcg → actor=ctcg");
  assert(getCurrentActor({ is_consignment: true, status: "paid", escrow_status: "shipped_to_buyer" }) === "buyer",
    "paid+shipped_to_buyer → actor=buyer (confirm)");
  assert(getCurrentActor({ is_consignment: true, status: "paid", escrow_status: "completed" }) === null,
    "completed → actor=null");

  // Terminal detection
  assert(isFulfilmentTerminal({ status: "paid", escrow_status: "completed" }), "completed is terminal");
  assert(isFulfilmentTerminal({ status: "cancelled", escrow_status: null }), "cancelled is terminal");
  assert(!isFulfilmentTerminal({ status: "paid", escrow_status: "shipped_to_buyer" }),
    "shipped_to_buyer is NOT terminal");

  // ── Cleanup ──
  await cleanup(
    [seller1, buyer1, seller2, buyer2, seller3, buyer3, stranger, seller4, buyer4],
    [a1, a2, a3, a4, a4b],
  );

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
