// E2E for the customer-facing /trade-in/confirm surface. Splits into
// two independent suites:
//
// 1. Tradein status API — seeds submissions in each lifecycle state
//    and asserts the /api/tradein/status route returns the timeline
//    columns the page needs (received_at / grading_at / approved_at /
//    paid_at / credit_issued_at / cash_paid_at / stripe_transfer_id).
//
// 2. Escrow timeline resolver — exhaustive per-tier mapping so a
//    future migration adding a status doesn't silently regress the
//    timeline UI.

import pg from "pg";

const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

let passed = 0, failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

const { GET: statusGET } = await import("../src/app/api/tradein/status/route");
const { TIMELINE_STEPS, getActiveStep } = await import("../src/lib/escrow/timeline");

async function makeUser(email: string): Promise<string> {
  const u = await pool.query(
    `INSERT INTO users (email, name) VALUES ($1, 'Customer Status Test') RETURNING id`,
    [email],
  );
  return u.rows[0].id;
}

async function cleanup(userId: string) {
  await pool.query(`DELETE FROM tradein_items WHERE submission_id IN (SELECT id FROM tradein_submissions WHERE user_id = $1)`, [userId]);
  await pool.query(`DELETE FROM tradein_submissions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

async function fetchStatus(reference: string): Promise<Record<string, unknown>> {
  const req = new Request(`http://localhost/api/tradein/status?reference=${encodeURIComponent(reference)}`);
  const res = await statusGET(req);
  return (await res.json()) as Record<string, unknown>;
}

try {
  const t = Date.now().toString(36).slice(-5);
  const email = `ctstat-${t}@test.invalid`;
  const userId = await makeUser(email);

  // ── Suite 1: tradein status API ──
  console.log("\n— Suite 1: /api/tradein/status contract + timeline fields");

  // 1.1 Contract: ?reference=... works (previously broke because route read ?ref=)
  await pool.query(
    `INSERT INTO tradein_submissions
      (reference, customer_name, customer_email, payment_method, delivery_method, is_over_18,
       quoted_cash_total, quoted_credit_total, credit_amount, status, user_id)
     VALUES ($1, 'Customer', $2, 'credit', 'mail', true, 0, 25, 25, 'accepted', $3)`,
    [`TI-CS-A${t}`, email, userId],
  );
  await pool.query(
    `INSERT INTO tradein_items (submission_id, sku, name, quantity, quoted_cash_price, quoted_credit_price)
     SELECT id, 'OP01-001', 'Test', 1, 0, 25 FROM tradein_submissions WHERE reference = $1`,
    [`TI-CS-A${t}`],
  );

  const accepted = await fetchStatus(`TI-CS-A${t}`);
  assert(accepted.reference === `TI-CS-A${t}`, `?reference= returns the row (got ${accepted.reference})`);
  assert(accepted.status === "accepted", `status='accepted' echoed (got ${accepted.status})`);
  assert("receivedAt" in accepted, "receivedAt key present in response");
  assert("gradingAt" in accepted, "gradingAt key present");
  assert("approvedAt" in accepted, "approvedAt key present");
  assert("paidAt" in accepted, "paidAt key present");
  assert("creditIssuedAt" in accepted, "creditIssuedAt key present");
  assert("cashPaidAt" in accepted, "cashPaidAt key present");
  assert("stripeTransferId" in accepted, "stripeTransferId key present");
  assert(accepted.receivedAt === null && accepted.paidAt === null,
    "timeline fields start null before cards arrive");

  // 1.2 Legacy ?ref= still accepted
  const legacyReq = new Request(`http://localhost/api/tradein/status?ref=${encodeURIComponent(`TI-CS-A${t}`)}`);
  const legacyRes = await statusGET(legacyReq);
  assert(legacyRes.ok, "legacy ?ref= query param still accepted (backward compat)");

  // 1.3 Walk through timeline — each transition should surface a new timestamp
  await pool.query(
    `UPDATE tradein_submissions SET status='received', received_at=NOW() WHERE reference = $1`,
    [`TI-CS-A${t}`],
  );
  const received = await fetchStatus(`TI-CS-A${t}`);
  assert(received.status === "received", "status=received after admin flip");
  assert(received.receivedAt != null, "receivedAt stamped in response");
  assert(received.gradingAt === null, "gradingAt still null");

  await pool.query(
    `UPDATE tradein_submissions SET status='grading', grading_at=NOW() WHERE reference = $1`,
    [`TI-CS-A${t}`],
  );
  const grading = await fetchStatus(`TI-CS-A${t}`);
  assert(grading.status === "grading", "status=grading");
  assert(grading.gradingAt != null, "gradingAt now stamped");
  assert(grading.receivedAt === received.receivedAt,
    "receivedAt unchanged after grading (COALESCE holds first value)");

  await pool.query(
    `UPDATE tradein_submissions
        SET status='paid', approved_at=NOW(), paid_at=NOW(),
            credit_issued_at=NOW(), stripe_transfer_id=$2
      WHERE reference = $1`,
    [`TI-CS-A${t}`, `tr_test_${t}_CSAPI`],
  );
  const paid = await fetchStatus(`TI-CS-A${t}`);
  assert(paid.status === "paid", "status=paid");
  assert(paid.paidAt != null, "paidAt stamped");
  assert(paid.creditIssuedAt != null, "creditIssuedAt stamped");
  assert(paid.stripeTransferId === `tr_test_${t}_CSAPI`,
    "stripeTransferId carried through to customer response");

  // 1.4 404 on nonexistent reference
  const nfReq = new Request(`http://localhost/api/tradein/status?reference=TI-NOTREAL-${t}`);
  const nfRes = await statusGET(nfReq);
  assert(nfRes.status === 404, `nonexistent ref returns 404 (got ${nfRes.status})`);

  // 1.5 400 when no ref provided
  const emptyReq = new Request(`http://localhost/api/tradein/status`);
  const emptyRes = await statusGET(emptyReq);
  assert(emptyRes.status === 400, `no ref returns 400 (got ${emptyRes.status})`);

  // ── Suite 2: escrow timeline resolver ──
  console.log("\n— Suite 2: escrow timeline step resolution");

  // Regression guards for the three string-matching bugs fixed in this arc.
  assert(getActiveStep("full_escrow", "received_by_ctcg") === 2,
    "full_escrow.received_by_ctcg → step 2 (was: 1, string-match bug)");
  assert(getActiveStep("full_escrow", "verified") === 3,
    "full_escrow.verified → step 3 (was: 0, no string matched)");
  assert(getActiveStep("full_escrow", "completed") === 4,
    "full_escrow.completed → step 4 (was: 0, !== 'complete')");

  // All three tiers render correct start/end indexes
  for (const tier of ["direct", "verified", "full_escrow"] as const) {
    const final = TIMELINE_STEPS[tier].length - 1;
    assert(getActiveStep(tier, "awaiting_payment") === 0,
      `${tier}.awaiting_payment → step 0`);
    assert(getActiveStep(tier, "completed") === final,
      `${tier}.completed → last step (${final})`);
  }

  // Unknown / terminal statuses never fake progress
  assert(getActiveStep("direct", "disputed") === 0,
    "disputed never claims progress (off-ramp branch)");
  assert(getActiveStep("direct", "refunded") === 0, "refunded stays at 0");
  assert(getActiveStep("direct", "cancelled") === 0, "cancelled stays at 0");
  assert(getActiveStep("direct", null) === 0, "null status safely returns 0");
  assert(getActiveStep("direct", undefined) === 0, "undefined status safely returns 0");
  assert(getActiveStep("direct", "not_a_real_status") === 0,
    "garbage status stays at 0 (doesn't fall through to wrong step)");

  // Tier-specific ordering checks
  assert(getActiveStep("verified", "shipped_to_ctcg") === 2,
    "verified.shipped_to_ctcg → step 2 (CTCG Reviews)");
  assert(getActiveStep("verified", "shipped_to_buyer") === 4,
    "verified.shipped_to_buyer → step 4 (Delivered)");
  assert(getActiveStep("direct", "shipped_to_buyer") === 2,
    "direct.shipped_to_buyer → step 2 (Delivered)");
  assert(getActiveStep("direct", "verified") === 3,
    "direct.verified → step 3 (Dispute Window — post-delivery hold)");

  // ── Cleanup ──
  await cleanup(userId);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await pool.end();
}
