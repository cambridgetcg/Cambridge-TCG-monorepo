// E2E for the quote_requests fulfilment chain. Parallels the trade-in
// admin test — seeds a quote, walks accepted → received → paid, and
// asserts:
//   - per-status timestamps stamp via COALESCE (migration 0051)
//   - credit issuance is idempotent at 'paid'
//   - cash payout without Stripe Connect fails gracefully (cash_paid_at
//     stays null so admin knows to pay manually)
//   - sweepExpiredQuoteOffers flips stale 'quoted' rows and is a no-op
//     on the second pass

import pg from "pg";

const {
  createQuoteRequest,
  updateQuoteStatus,
  sweepExpiredQuoteOffers,
  issueQuoteCreditIfDue,
  payQuoteCashIfDue,
  sendOffer,
  respondToOffer,
} = await import("../src/lib/quote/db");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

process.env.EMAIL_UNSUBSCRIBE_SECRET = "testsecret-for-e2e";

async function makeUser(email: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Quote Test') RETURNING id`,
    [email],
  );
  return u.rows[0].id;
}

// pg returns TIMESTAMPTZ as Date at runtime — normalize for equality.
const ms = (d: Date | string | null | undefined): number | null =>
  d == null ? null : new Date(d).getTime();

type TimelineRow = {
  id: number;
  status: string;
  received_at: Date | null;
  paid_at: Date | null;
  credit_issued_at: Date | null;
  cash_paid_at: Date | null;
  credit_amount: string | null;
  cash_amount: string | null;
};

async function getRaw(ref: string): Promise<TimelineRow> {
  const r = await pool.query(`SELECT * FROM quote_requests WHERE reference = $1`, [ref]);
  return r.rows[0] as TimelineRow;
}

async function cleanup(ref: string, userId: string) {
  await pool.query(`DELETE FROM store_credit_ledger WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM quote_images WHERE item_id IN (SELECT id FROM quote_items WHERE request_id IN (SELECT id FROM quote_requests WHERE reference = $1))`, [ref]);
  await pool.query(`DELETE FROM quote_items WHERE request_id IN (SELECT id FROM quote_requests WHERE reference = $1)`, [ref]);
  await pool.query(`DELETE FROM quote_requests WHERE reference = $1`, [ref]);
}

try {
  const t = Date.now();
  const email = `quote-admin-${t}@test.invalid`;
  const userId = await makeUser(email);

  // ── Scenario 1: happy path credit payout ──
  console.log("\n— Scenario 1: pending → offer → accepted → received → paid");
  const { reference: ref1 } = await createQuoteRequest({
    customerName: "Quote Test",
    customerEmail: email,
    paymentMethod: "credit",
    deliveryMethod: "mail",
    items: [{ description: "Rare card", condition: "NM", quantity: 1 }],
  });

  // Admin sets item price + sends offer
  const q1 = await getRaw(ref1);
  await pool.query(
    `UPDATE quote_items SET offered_price = 25.00 WHERE request_id = $1`,
    [q1.id],
  );
  const offered = await sendOffer(q1.id);
  assert(offered.status === "quoted", "status → quoted after sendOffer");
  assert(parseFloat(offered.quoted_total ?? "0") === 25, `quoted_total = £25 (got ${offered.quoted_total})`);

  // Customer accepts
  const accepted = await respondToOffer(ref1, true);
  assert(accepted?.status === "accepted", "status → accepted");

  // Seed a credit_amount for the payout path (in real flow this would
  // be set by send-offer logic once the payout type is known)
  await pool.query(
    `UPDATE quote_requests SET credit_amount = 25.00, cash_amount = 0 WHERE reference = $1`,
    [ref1],
  );

  // Admin marks received — received_at should stamp
  await updateQuoteStatus(ref1, "received");
  let row1 = await getRaw(ref1);
  assert(row1.status === "received", "status → received");
  assert(row1.received_at != null, "received_at stamped");
  assert(row1.paid_at == null, "paid_at still null");

  // Re-mark 'received' — shouldn't bump received_at
  const firstReceivedMs = ms(row1.received_at);
  await updateQuoteStatus(ref1, "received");
  row1 = await getRaw(ref1);
  assert(ms(row1.received_at) === firstReceivedMs, "received_at preserved on re-mark (COALESCE)");

  // Mark paid
  await updateQuoteStatus(ref1, "paid");
  row1 = await getRaw(ref1);
  assert(row1.status === "paid", "status → paid");
  assert(row1.paid_at != null, "paid_at stamped");
  assert(ms(row1.received_at) === firstReceivedMs, "received_at unchanged after paid");

  // Fire credit issuance
  const issue1 = await issueQuoteCreditIfDue(ref1);
  assert(issue1.ok, `first credit issuance ok (reason=${issue1.reason ?? "—"})`);
  row1 = await getRaw(ref1);
  assert(row1.credit_issued_at != null, "credit_issued_at stamped");

  const ledger = await pool.query(
    `SELECT amount::numeric::float AS n, type FROM store_credit_ledger WHERE reference_id = $1`,
    [ref1],
  );
  assert(ledger.rows.length === 1, `one ledger row (got ${ledger.rows.length})`);
  assert(Math.abs(ledger.rows[0].n - 25) < 0.01, `ledger amount £25 (got ${ledger.rows[0].n})`);
  assert(ledger.rows[0].type === "quote_paid", `ledger type='quote_paid' (got ${ledger.rows[0].type})`);

  // Idempotency: second issuance is rejected
  const issue2 = await issueQuoteCreditIfDue(ref1);
  assert(!issue2.ok, `second issuance rejected (reason=${issue2.reason})`);
  const ledger2 = await pool.query(
    `SELECT count(*)::int AS n FROM store_credit_ledger WHERE reference_id = $1`,
    [ref1],
  );
  assert(ledger2.rows[0].n === 1, `still 1 ledger row (got ${ledger2.rows[0].n})`);

  await cleanup(ref1, userId);

  // ── Scenario 2: cash payout without Connect ──
  console.log("\n— Scenario 2: cash payout with no Stripe Connect");
  const { reference: ref2 } = await createQuoteRequest({
    customerName: "Cash Test",
    customerEmail: email,
    paymentMethod: "cash",
    deliveryMethod: "mail",
    items: [{ description: "Cash card", condition: "NM", quantity: 1 }],
  });

  const q2 = await getRaw(ref2);
  await pool.query(`UPDATE quote_items SET offered_price = 15.00 WHERE request_id = $1`, [q2.id]);
  await sendOffer(q2.id);
  await respondToOffer(ref2, true);
  await pool.query(`UPDATE quote_requests SET cash_amount = 15.00, credit_amount = 0 WHERE reference = $1`, [ref2]);
  await updateQuoteStatus(ref2, "received");
  await updateQuoteStatus(ref2, "paid");

  const cash = await payQuoteCashIfDue(ref2);
  assert(!cash.ok && /stripe|connect/i.test(cash.reason || ""),
    `cash payout skipped when Connect missing (reason=${cash.reason})`);

  const r2 = await getRaw(ref2);
  assert(r2.cash_paid_at == null, "cash_paid_at NOT stamped — admin still owes manually");

  await cleanup(ref2, userId);

  // ── Scenario 3: offer expiry sweep ──
  console.log("\n— Scenario 3: sweep expires stale 'quoted' offers");
  const { reference: ref3 } = await createQuoteRequest({
    customerName: "Expire Test",
    customerEmail: email,
    paymentMethod: "credit",
    deliveryMethod: "mail",
    items: [{ description: "Stale card", condition: "NM", quantity: 1 }],
  });

  const q3 = await getRaw(ref3);
  await pool.query(`UPDATE quote_items SET offered_price = 10.00 WHERE request_id = $1`, [q3.id]);
  await sendOffer(q3.id);
  // Push offer_expires_at into the past
  await pool.query(
    `UPDATE quote_requests SET offer_expires_at = NOW() - INTERVAL '1 hour' WHERE reference = $1`,
    [ref3],
  );

  const sweep = await sweepExpiredQuoteOffers();
  const mine = sweep.expired.find((r: { reference: string }) => r.reference === ref3);
  assert(!!mine, "stale offer was picked up by sweep");

  const r3 = await getRaw(ref3);
  assert(r3.status === "expired", `status → expired (got ${r3.status})`);

  const sweep2 = await sweepExpiredQuoteOffers();
  const mine2 = sweep2.expired.find((r: { reference: string }) => r.reference === ref3);
  assert(!mine2, "second sweep is a no-op");

  await cleanup(ref3, userId);

  // ── Scenario 4: non-paid status refuses credit ──
  console.log("\n— Scenario 4: credit issuance refused unless status='paid'");
  const { reference: ref4 } = await createQuoteRequest({
    customerName: "Safety Test",
    customerEmail: email,
    paymentMethod: "credit",
    deliveryMethod: "mail",
    items: [{ description: "Card", condition: "NM", quantity: 1 }],
  });
  const q4 = await getRaw(ref4);
  await pool.query(`UPDATE quote_items SET offered_price = 30.00 WHERE request_id = $1`, [q4.id]);
  await sendOffer(q4.id);
  await respondToOffer(ref4, true);
  await pool.query(`UPDATE quote_requests SET credit_amount = 30.00 WHERE reference = $1`, [ref4]);
  await updateQuoteStatus(ref4, "received");

  // Not yet 'paid' — issuance should refuse
  const prematureIssue = await issueQuoteCreditIfDue(ref4);
  assert(!prematureIssue.ok && /status is received/i.test(prematureIssue.reason || ""),
    `issuance refused when not paid (reason=${prematureIssue.reason})`);
  const pLedger = await pool.query(
    `SELECT count(*)::int AS n FROM store_credit_ledger WHERE reference_id = $1`,
    [ref4],
  );
  assert(pLedger.rows[0].n === 0, "no ledger row before paid");

  await cleanup(ref4, userId);

  // ── Cleanup ──
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
