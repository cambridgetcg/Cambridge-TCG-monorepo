// E2E for the trade-in admin fulfilment chain. Seeds a submission with
// items, walks it through received → grading → approved → paid, and
// asserts that:
//   - per-status timestamps stamp (migration 0047)
//   - updateSubmissionStatus never overwrites an earlier stamp
//   - credit issuance is idempotent at 'paid' (credit_issued_at gate)
//   - expiry sweep transitions stale 'quoted' rows to 'expired'
//   - rejected → doesn't stamp payout columns
//
// Library-level test: exercises the db helpers directly rather than
// going through the HTTP layer, so we don't need a local dev server.
// The admin PATCH route is a thin wrapper around these helpers + the
// email fan-out, which the email preference suite already covers.

import pg from "pg";

const {
  createSubmission,
  updateSubmissionStatus,
  getSubmissionByRef,
  sweepExpiredQuotes,
  issueTradeinCreditIfDue,
  payTradeinCashIfDue,
} = await import("../src/lib/tradein/db");

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
    `INSERT INTO users (email, name) VALUES ($1, 'Tradein Admin Test') RETURNING id`,
    [email],
  );
  return u.rows[0].id;
}

async function makeSubmission(opts: {
  email: string;
  paymentMethod?: "cash" | "credit";
  refSuffix: string;
  cashTotal?: number;
  creditTotal?: number;
}) {
  // reference column is VARCHAR(20) — keep short. refSuffix is a single
  // letter; the 8-char slice of Date.now is plenty unique per test run.
  const reference = `TI-T${opts.refSuffix}`.slice(0, 20);
  const sub = await createSubmission({
    reference,
    customerName: "Admin Test",
    customerEmail: opts.email,
    paymentMethod: opts.paymentMethod ?? "credit",
    deliveryMethod: "mail",
    isOver18: true,
    cashTotal: opts.cashTotal ?? 0,
    creditTotal: opts.creditTotal ?? 20,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    items: [
      { sku: `OP01-TEST-${opts.refSuffix}`, card_number: "OP01-001", name: "Test Card", set_code: "OP01", quantity: 1, cash_price: opts.cashTotal ?? 0, credit_price: opts.creditTotal ?? 20 },
    ],
  });
  return { reference, submission: sub };
}

async function cleanup(ref: string, userId: string) {
  await pool.query(`DELETE FROM store_credit_ledger WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM tradein_items WHERE submission_id IN (SELECT id FROM tradein_submissions WHERE reference = $1)`, [ref]);
  await pool.query(`DELETE FROM tradein_submissions WHERE reference = $1`, [ref]);
}

try {
  // Short unique token for references/SKUs (column caps at varchar(20/30)).
  const t = Date.now().toString(36).slice(-6);
  const userEmail = `tradein-admin-${t}@test.invalid`;
  const userId = await makeUser(userEmail);

  // ─── Scenario 1: full happy path, credit payout ───
  console.log("\n— Scenario 1: submitted → received → grading → approved → paid");
  const { reference: ref1 } = await makeSubmission({ email: userEmail, refSuffix: `A${t}`, creditTotal: 20 });

  // pg returns TIMESTAMPTZ as Date objects at runtime even though our
  // library types them as string. Normalise to ms for equality checks.
  type TimelineRow = {
    status: string;
    received_at: Date | null;
    grading_at: Date | null;
    approved_at: Date | null;
    paid_at: Date | null;
    credit_issued_at?: Date | null;
  };
  const ms = (d: Date | null | undefined): number | null => (d ? new Date(d).getTime() : null);

  // Admin marks 'received' — received_at should stamp
  await updateSubmissionStatus(ref1, "received");
  let row1 = (await getSubmissionByRef(ref1))!.submission as unknown as TimelineRow;
  assert(row1.status === "received", "status → received");
  assert(row1.received_at != null, "received_at stamped");
  assert(row1.grading_at == null, "grading_at still null");

  // received_at shouldn't move when we re-mark 'received'
  const firstReceivedMs = ms(row1.received_at);
  await updateSubmissionStatus(ref1, "received");
  row1 = (await getSubmissionByRef(ref1))!.submission as unknown as TimelineRow;
  assert(ms(row1.received_at) === firstReceivedMs, "received_at preserved on re-mark (COALESCE)");

  // Advance to grading
  await updateSubmissionStatus(ref1, "grading");
  row1 = (await getSubmissionByRef(ref1))!.submission as unknown as TimelineRow;
  assert(row1.status === "grading", "status → grading");
  assert(row1.grading_at != null, "grading_at stamped");
  assert(ms(row1.received_at) === firstReceivedMs, "received_at unchanged after grading");

  // Advance to approved
  await updateSubmissionStatus(ref1, "approved");
  row1 = (await getSubmissionByRef(ref1))!.submission as unknown as TimelineRow;
  assert(row1.status === "approved", "status → approved");
  assert(row1.approved_at != null, "approved_at stamped");

  // Advance to paid — should fire credit issuance
  await updateSubmissionStatus(ref1, "paid");
  row1 = (await getSubmissionByRef(ref1))!.submission as unknown as TimelineRow;
  assert(row1.status === "paid", "status → paid");
  assert(row1.paid_at != null, "paid_at stamped");

  const issueResult = await issueTradeinCreditIfDue(ref1);
  assert(issueResult.ok, `first credit issuance ok (reason=${issueResult.reason ?? "—"})`);
  row1 = (await getSubmissionByRef(ref1))!.submission as unknown as TimelineRow;
  assert(row1.credit_issued_at != null, "credit_issued_at stamped");

  const ledger = await pool.query(
    `SELECT amount::numeric::float AS n FROM store_credit_ledger WHERE reference_id = $1`,
    [ref1],
  );
  assert(ledger.rows.length === 1, `one ledger row (got ${ledger.rows.length})`);
  assert(Math.abs(ledger.rows[0].n - 20) < 0.01, `ledger amount = £20 (got ${ledger.rows[0].n})`);

  // Idempotency: second issuance doesn't double-credit
  const issueAgain = await issueTradeinCreditIfDue(ref1);
  assert(!issueAgain.ok, `second issuance rejected (reason=${issueAgain.reason})`);
  const ledger2 = await pool.query(
    `SELECT count(*)::int AS n FROM store_credit_ledger WHERE reference_id = $1`,
    [ref1],
  );
  assert(ledger2.rows[0].n === 1, `still 1 ledger row after retry (got ${ledger2.rows[0].n})`);

  await cleanup(ref1, userId);

  // ─── Scenario 2: cash-only, Connect not set up → cash helper graceful fallback ───
  console.log("\n— Scenario 2: cash payout with no Stripe Connect");
  const { reference: ref2 } = await makeSubmission({
    email: userEmail,
    refSuffix: `B${t}`,
    paymentMethod: "cash",
    cashTotal: 15,
    creditTotal: 0,
  });

  await updateSubmissionStatus(ref2, "received");
  await updateSubmissionStatus(ref2, "grading");
  await updateSubmissionStatus(ref2, "approved");
  await updateSubmissionStatus(ref2, "paid");
  // Set cash_amount so payTradein finds the non-zero leg
  await pool.query(`UPDATE tradein_submissions SET cash_amount = 15.00, payout_type = 'cash' WHERE reference = $1`, [ref2]);

  const cashResult = await payTradeinCashIfDue(ref2);
  assert(!cashResult.ok && /stripe|connect/i.test(cashResult.reason || ""),
    `cash payout skipped — no Connect (reason=${cashResult.reason})`);

  const r2 = await pool.query(`SELECT cash_paid_at FROM tradein_submissions WHERE reference = $1`, [ref2]);
  assert(r2.rows[0].cash_paid_at == null, "cash_paid_at NOT stamped when Connect missing — admin still owes manually");

  await cleanup(ref2, userId);

  // ─── Scenario 3: rejected path — no payout stamps ───
  console.log("\n— Scenario 3: grading → rejected");
  const { reference: ref3 } = await makeSubmission({ email: userEmail, refSuffix: `C${t}`, creditTotal: 30 });

  await updateSubmissionStatus(ref3, "received");
  await updateSubmissionStatus(ref3, "grading");
  await updateSubmissionStatus(ref3, "rejected");
  const row3 = (await getSubmissionByRef(ref3))!.submission as unknown as TimelineRow;
  assert(row3.status === "rejected", "status → rejected");
  assert(row3.received_at != null, "received_at still stamped");
  assert(row3.grading_at != null, "grading_at still stamped");
  assert(row3.approved_at == null, "approved_at NEVER stamped (never approved)");
  assert(row3.paid_at == null, "paid_at NEVER stamped");

  // Credit issuance must refuse when not paid
  const rejIssue = await issueTradeinCreditIfDue(ref3);
  assert(!rejIssue.ok, `credit issuance refused on rejected (reason=${rejIssue.reason})`);
  const rejLedger = await pool.query(`SELECT count(*)::int AS n FROM store_credit_ledger WHERE reference_id = $1`, [ref3]);
  assert(rejLedger.rows[0].n === 0, "no ledger rows for rejected submission");

  await cleanup(ref3, userId);

  // ─── Scenario 4: quote expiry sweep ───
  console.log("\n— Scenario 4: sweep expires stale 'quoted' rows");
  const { reference: ref4 } = await makeSubmission({ email: userEmail, refSuffix: `D${t}`, creditTotal: 10 });
  // Move to quoted with an expires_at in the past
  await pool.query(
    `UPDATE tradein_submissions SET status = 'quoted', quote_expires_at = NOW() - INTERVAL '1 hour' WHERE reference = $1`,
    [ref4],
  );
  const sweep = await sweepExpiredQuotes();
  const mine = sweep.expired.find((r: { reference: string }) => r.reference === ref4);
  assert(!!mine, "my stale quote was picked up by sweep");

  const r4 = await pool.query(`SELECT status FROM tradein_submissions WHERE reference = $1`, [ref4]);
  assert(r4.rows[0].status === "expired", `status → expired (got ${r4.rows[0].status})`);

  // Re-sweep: already expired, should be a no-op
  const sweep2 = await sweepExpiredQuotes();
  const mine2 = sweep2.expired.find((r: { reference: string }) => r.reference === ref4);
  assert(!mine2, "second sweep is a no-op on already-expired rows");

  await cleanup(ref4, userId);

  // ─── Cleanup user ───
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
