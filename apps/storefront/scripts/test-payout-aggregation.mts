// E2E for the seller payout dashboard aggregation. Seeds a user with
// entities across every source and combination of paid/unpaid state,
// then exercises the shared /lib/payouts/aggregation helpers (which
// the route handlers also call) and asserts the right buckets.

import pg from "pg";

const { getPendingPayouts, getPayoutHistory } = await import("../src/lib/payouts/aggregation");

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

async function makeUser(email: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Payout Test') RETURNING id`,
    [email],
  );
  return u.rows[0].id;
}

async function cleanup(userId: string) {
  await pool.query(`DELETE FROM store_credit_ledger WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM quote_requests WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM tradein_items WHERE submission_id IN (SELECT id FROM tradein_submissions WHERE user_id = $1)`, [userId]);
  await pool.query(`DELETE FROM tradein_submissions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

try {
  const t = Date.now().toString(36).slice(-5);
  const email = `payout-agg-${t}@test.invalid`;
  const userId = await makeUser(email);

  // ── Seed scenarios ──
  // TI-A: approved £30 credit → PENDING (not yet paid)
  // TI-B: paid, both legs cleared → HISTORY (cash + credit)
  // TI-C: paid, credit issued, cash still pending → PENDING cash, HISTORY credit
  // QR-D: quote 'received' (accepted but not paid) £15 cash → PENDING cash
  // QR-E: quote paid, credit issued → HISTORY credit

  await pool.query(
    `INSERT INTO tradein_submissions
      (reference, customer_name, customer_email, payment_method, delivery_method, is_over_18,
       quoted_cash_total, quoted_credit_total, credit_amount, cash_amount,
       status, user_id, approved_at)
     VALUES ($1, 'Test', $2, 'credit', 'mail', true, 0, 30, 30, 0, 'approved', $3, NOW())`,
    [`TI-AG-A${t}`, email, userId],
  );

  await pool.query(
    `INSERT INTO tradein_submissions
      (reference, customer_name, customer_email, payment_method, delivery_method, is_over_18,
       quoted_cash_total, quoted_credit_total, credit_amount, cash_amount,
       status, user_id, received_at, approved_at, paid_at,
       credit_issued_at, cash_paid_at, stripe_transfer_id)
     VALUES ($1, 'Test', $2, 'mixed', 'mail', true, 12, 18, 18, 12, 'paid', $3,
             NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day',
             NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', $4)`,
    [`TI-AG-B${t}`, email, userId, `tr_test_${t}_ABCDEF`],
  );

  await pool.query(
    `INSERT INTO tradein_submissions
      (reference, customer_name, customer_email, payment_method, delivery_method, is_over_18,
       quoted_cash_total, quoted_credit_total, credit_amount, cash_amount,
       status, user_id, received_at, approved_at, paid_at, credit_issued_at)
     VALUES ($1, 'Test', $2, 'mixed', 'mail', true, 10, 20, 20, 10, 'paid', $3,
             NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day',
             NOW() - INTERVAL '1 day')`,
    [`TI-AG-C${t}`, email, userId],
  );

  await pool.query(
    `INSERT INTO quote_requests
      (reference, customer_name, customer_email, payment_method, delivery_method,
       status, user_id, cash_amount, credit_amount, received_at)
     VALUES ($1, 'Test', $2, 'cash', 'mail', 'received', $3, 15, 0, NOW())`,
    [`QR-AG-D${t}`, email, userId],
  );

  await pool.query(
    `INSERT INTO quote_requests
      (reference, customer_name, customer_email, payment_method, delivery_method,
       status, user_id, cash_amount, credit_amount, received_at, paid_at, credit_issued_at)
     VALUES ($1, 'Test', $2, 'credit', 'mail', 'paid', $3, 0, 20,
             NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')`,
    [`QR-AG-E${t}`, email, userId],
  );

  // ── Pending ──
  console.log("\n— Pending payouts");
  const pending = await getPendingPayouts(userId);

  const tiRefs = new Set(pending.tradeins.map((r) => r.reference));
  assert(tiRefs.has(`TI-AG-A${t}`), "approved trade-in in pending");
  assert(tiRefs.has(`TI-AG-C${t}`), "cash-only-owed trade-in in pending");
  assert(!tiRefs.has(`TI-AG-B${t}`), "fully-paid trade-in NOT in pending");

  const rowA = pending.tradeins.find((r) => r.reference === `TI-AG-A${t}`)!;
  assert(rowA.amount === 30, `TI-A amount = £30 (got ${rowA.amount})`);
  assert(rowA.status === "approved", `TI-A status='approved' (got ${rowA.status})`);

  const rowC = pending.tradeins.find((r) => r.reference === `TI-AG-C${t}`)!;
  assert(rowC.amount === 10, `TI-C amount = £10 cash only (got ${rowC.amount})`);
  assert(rowC.cashOwed === 10 && rowC.creditOwed === 0,
    `TI-C split: cash=${rowC.cashOwed} credit=${rowC.creditOwed}`);

  const qRefs = new Set(pending.quotes.map((r) => r.reference));
  assert(qRefs.has(`QR-AG-D${t}`), "cash-pending quote in pending");
  assert(!qRefs.has(`QR-AG-E${t}`), "fully-paid quote NOT in pending");
  const rowD = pending.quotes.find((r) => r.reference === `QR-AG-D${t}`)!;
  assert(rowD.amount === 15, `QR-D amount = £15 (got ${rowD.amount})`);

  assert(pending.totalOwed === 55, `total owed = £55 (got £${pending.totalOwed})`);

  // ── History ──
  console.log("\n— Earnings history");
  const history = await getPayoutHistory(userId);
  const bySource: Record<string, typeof history.rows> = {};
  for (const row of history.rows) {
    (bySource[row.source] = bySource[row.source] ?? []).push(row);
  }

  // TI-B should show as BOTH tradein_cash AND tradein_credit legs
  assert(bySource.tradein_cash?.some((r) => r.id === `TI-AG-B${t}`),
    "TI-B cash leg in history");
  assert(bySource.tradein_credit?.some((r) => r.id === `TI-AG-B${t}`),
    "TI-B credit leg in history");
  const bCash = bySource.tradein_cash!.find((r) => r.id === `TI-AG-B${t}`)!;
  assert(bCash.amount === 12 && bCash.method === "stripe",
    `TI-B cash: £12 via stripe (got £${bCash.amount} via ${bCash.method})`);
  assert(bCash.reference === `tr_test_${t}_ABCDEF`,
    `TI-B carries stripe_transfer_id (got ${bCash.reference})`);

  // TI-C credit leg in history, cash leg NOT (still pending)
  assert(bySource.tradein_credit?.some((r) => r.id === `TI-AG-C${t}`),
    "TI-C credit leg in history");
  assert(!bySource.tradein_cash?.some((r) => r.id === `TI-AG-C${t}`),
    "TI-C cash leg NOT in history (still pending)");

  // TI-A: neither leg in history
  assert(!bySource.tradein_cash?.some((r) => r.id === `TI-AG-A${t}`) &&
         !bySource.tradein_credit?.some((r) => r.id === `TI-AG-A${t}`),
    "TI-A NOT in history (approved but unpaid)");

  // QR-D: cash leg NOT in history; QR-E: credit leg in history
  assert(!bySource.quote_cash?.some((r) => r.id === `QR-AG-D${t}`),
    "QR-D cash NOT in history");
  assert(bySource.quote_credit?.some((r) => r.id === `QR-AG-E${t}`),
    "QR-E credit leg in history");
  const qECredit = bySource.quote_credit!.find((r) => r.id === `QR-AG-E${t}`)!;
  assert(qECredit.method === "store_credit" && qECredit.reference === null,
    `QR-E method = store_credit, no external reference`);

  // YTD total ≥ £12 + £18 + £20 + £20 = £70
  assert(history.totals.ytd >= 70,
    `YTD total ≥ £70 (got £${history.totals.ytd.toFixed(2)})`);

  // Desc sort invariant
  const paidTimes = history.rows
    .map((r) => new Date(r.paidAt).getTime())
    .filter((n) => !Number.isNaN(n));
  const sortedDesc = paidTimes.every((t, i) => i === 0 || t <= paidTimes[i - 1]);
  assert(sortedDesc, "history rows sorted by paidAt desc");

  // ── Cleanup ──
  await cleanup(userId);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
