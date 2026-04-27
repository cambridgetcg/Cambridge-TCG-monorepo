// Strip sslmode from the connection string — pg 8.x parses it from the URL
// and overrides the Pool ssl option, causing RDS cert verification failures
// on Vercel's serverless runtime.
function getConnectionConfig() {
  const raw = process.env.DATABASE_URL || "";
  const cleaned = raw.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  return { connectionString: cleaned, ssl: { rejectUnauthorized: false } };
}

interface QueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
}

async function query(sql: string, params: unknown[] = []): Promise<QueryResult> {
  // Dynamic import to avoid bundling pg on the client
  const { default: pg } = await import("pg");
  const pool = new pg.Pool(getConnectionConfig());
  try {
    const result = await pool.query(sql, params);
    return { rows: result.rows };
  } finally {
    await pool.end();
  }
}

export interface SubmissionRow {
  id: number;
  reference: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  payment_method: string;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  delivery_method: string;
  is_over_18: boolean;
  notes: string | null;
  quoted_cash_total: string | null;
  quoted_credit_total: string | null;
  final_total: string | null;
  tracking_number: string | null;
  payment_reference: string | null;
  quote_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: number;
  submission_id: number;
  sku: string;
  card_number: string | null;
  name: string | null;
  set_code: string | null;
  quantity: number;
  quoted_cash_price: string | null;
  quoted_credit_price: string | null;
  accepted_qty: number | null;
  condition_grade: string | null;
  final_unit_price: string | null;
}

export async function generateReference(): Promise<string> {
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const prefix = `TI-${dateStr}-`;

  // Get the max sequence for today
  const result = await query(
    `SELECT reference FROM tradein_submissions WHERE reference LIKE $1 ORDER BY reference DESC LIMIT 1`,
    [prefix + "%"]
  );

  let seq = 1;
  if (result.rows.length > 0) {
    const lastRef = result.rows[0].reference as string;
    const lastSeq = parseInt(lastRef.slice(-4), 10);
    seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(4, "0");
}

export async function createSubmission(data: {
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: string;
  bankSortCode?: string;
  bankAccountNumber?: string;
  deliveryMethod: string;
  isOver18: boolean;
  notes?: string;
  cashTotal: number;
  creditTotal: number;
  expiresAt: Date;
  // Caller can pass an authenticated user's id; we also fall back to a
  // lookup by email so anonymous submitters who happen to be registered
  // still get linked. Pure additive — null is fine.
  userId?: string;
  items: {
    sku: string;
    card_number: string;
    name: string;
    set_code: string | null;
    quantity: number;
    cash_price: number;
    credit_price: number;
  }[];
}): Promise<SubmissionRow> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool(getConnectionConfig());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // If caller didn't pass userId, try to resolve from email so future
    // credit issuance works without admin manually relinking.
    let resolvedUserId = data.userId ?? null;
    if (!resolvedUserId && data.customerEmail) {
      const u = await client.query(
        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [data.customerEmail]
      );
      resolvedUserId = u.rows[0]?.id ?? null;
    }

    const subResult = await client.query(
      `INSERT INTO tradein_submissions
        (reference, customer_name, customer_email, customer_phone, payment_method,
         bank_sort_code, bank_account_number, delivery_method, is_over_18, notes,
         quoted_cash_total, quoted_credit_total, quote_expires_at, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        data.reference,
        data.customerName,
        data.customerEmail,
        data.customerPhone || null,
        data.paymentMethod,
        data.bankSortCode || null,
        data.bankAccountNumber || null,
        data.deliveryMethod,
        data.isOver18,
        data.notes || null,
        data.cashTotal.toFixed(2),
        data.creditTotal.toFixed(2),
        data.expiresAt.toISOString(),
        resolvedUserId,
      ]
    );

    const submission = subResult.rows[0] as SubmissionRow;

    for (const item of data.items) {
      await client.query(
        `INSERT INTO tradein_items
          (submission_id, sku, card_number, name, set_code, quantity, quoted_cash_price, quoted_credit_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          submission.id,
          item.sku,
          item.card_number,
          item.name,
          item.set_code,
          item.quantity,
          item.cash_price.toFixed(2),
          item.credit_price.toFixed(2),
        ]
      );
    }

    await client.query("COMMIT");
    return submission;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function getSubmission(
  reference: string,
  email: string
): Promise<{ submission: SubmissionRow; items: ItemRow[] } | null> {
  const subResult = await query(
    `SELECT * FROM tradein_submissions WHERE reference = $1 AND customer_email = $2`,
    [reference, email.toLowerCase()]
  );

  if (subResult.rows.length === 0) return null;
  const submission = subResult.rows[0] as SubmissionRow;

  const itemsResult = await query(
    `SELECT * FROM tradein_items WHERE submission_id = $1 ORDER BY id`,
    [submission.id]
  );

  return { submission, items: itemsResult.rows as ItemRow[] };
}

export async function getAllSubmissions(): Promise<{ submission: SubmissionRow; items: ItemRow[] }[]> {
  const subResult = await query(
    `SELECT * FROM tradein_submissions ORDER BY created_at DESC`
  );

  const submissions: { submission: SubmissionRow; items: ItemRow[] }[] = [];
  for (const row of subResult.rows) {
    const submission = row as SubmissionRow;
    const itemsResult = await query(
      `SELECT * FROM tradein_items WHERE submission_id = $1 ORDER BY id`,
      [submission.id]
    );
    submissions.push({ submission, items: itemsResult.rows as ItemRow[] });
  }

  return submissions;
}

// Map status → its per-status timestamp column. updated_at always bumps;
// these only stamp on first hit (COALESCE keeps the original).
const STATUS_TIMESTAMP_COL: Record<string, string> = {
  received: "received_at",
  grading:  "grading_at",
  approved: "approved_at",
  paid:     "paid_at",
};

export async function updateSubmissionStatus(
  reference: string,
  status: string
): Promise<SubmissionRow | null> {
  const tsCol = STATUS_TIMESTAMP_COL[status];
  const setExtra = tsCol ? `, ${tsCol} = COALESCE(${tsCol}, NOW())` : "";
  const result = await query(
    `UPDATE tradein_submissions SET status = $1, updated_at = NOW()${setExtra}
      WHERE reference = $2 RETURNING *`,
    [status, reference]
  );
  return result.rows.length > 0 ? (result.rows[0] as SubmissionRow) : null;
}

export async function getSubmissionByRef(
  reference: string
): Promise<{ submission: SubmissionRow; items: ItemRow[] } | null> {
  const subResult = await query(
    `SELECT * FROM tradein_submissions WHERE reference = $1`,
    [reference]
  );

  if (subResult.rows.length === 0) return null;
  const submission = subResult.rows[0] as SubmissionRow;

  const itemsResult = await query(
    `SELECT * FROM tradein_items WHERE submission_id = $1 ORDER BY id`,
    [submission.id]
  );

  return { submission, items: itemsResult.rows as ItemRow[] };
}

// ── Cash payout via Stripe Connect ──
//
// Sibling of issueTradeinCreditIfDue. When admin marks 'paid' and the
// submission has a non-zero cash component, attempt a Stripe Transfer to
// the seller's connected account. If they haven't onboarded Connect (or
// payouts aren't enabled), this returns gracefully — admin handles cash
// out-of-band as before.
//
// Idempotent via the cash_paid_at column. Stripe idempotency key is
// stable per reference so a retry returns the same transfer object.
export async function payTradeinCashIfDue(reference: string): Promise<{
  ok: boolean;
  transferId?: string;
  amount?: number;
  reason?: string;
}> {
  const r = await query(
    `SELECT s.reference, s.status, s.user_id, s.cash_paid_at, s.cash_amount,
            s.quoted_cash_total, s.payment_method,
            u.stripe_connect_account_id, u.stripe_connect_payouts_enabled
       FROM tradein_submissions s
       LEFT JOIN users u ON u.id = s.user_id
      WHERE s.reference = $1`,
    [reference]
  );
  if (r.rows.length === 0) return { ok: false, reason: "submission not found" };
  const sub = r.rows[0];

  if (sub.status !== "paid") {
    return { ok: false, reason: `status is ${sub.status}, not paid` };
  }
  if (sub.cash_paid_at) {
    return { ok: false, reason: "cash already paid" };
  }
  if (!sub.user_id) {
    return { ok: false, reason: "submission not linked to a user" };
  }

  const cashAmount = parseFloat(sub.cash_amount ?? sub.quoted_cash_total ?? "0");
  if (!(cashAmount > 0)) {
    // Credit-only payout; mark stamp so we don't re-check
    await query(
      `UPDATE tradein_submissions SET cash_paid_at = NOW() WHERE reference = $1`,
      [reference]
    );
    return { ok: true, reason: "credit-only payout, nothing to wire" };
  }

  if (!sub.stripe_connect_account_id || !sub.stripe_connect_payouts_enabled) {
    // Connect not set up — admin will pay manually via the bank fields.
    // Don't stamp cash_paid_at; leave it for the manual flow.
    return { ok: false, reason: "user has not connected Stripe for payouts" };
  }

  // Defer to the existing Connect transfer helper
  const { createTransferToSeller } = await import("@/lib/payouts/stripe-connect");
  try {
    const result = await createTransferToSeller({
      sellerUserId: sub.user_id,
      amountGbp: cashAmount,
      description: `Trade-in payout ${reference}`,
      idempotencyKey: `tradein-cash-${reference}`,
      metadata: { reference, kind: "tradein_cash" },
    });
    await query(
      `UPDATE tradein_submissions
          SET cash_paid_at = NOW(),
              stripe_transfer_id = $2,
              updated_at = NOW()
        WHERE reference = $1`,
      [reference, result.transferId]
    );
    return { ok: true, transferId: result.transferId, amount: cashAmount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transfer failed";
    return { ok: false, reason: msg };
  }
}

// ── Quote expiry sweep ──
//
// Cron entry point. Transitions submissions whose quote_expires_at has
// elapsed without a customer response from 'quoted' → 'expired'.
// Returns affected references so the caller can fan out emails.
export async function sweepExpiredQuotes(): Promise<{ expired: Array<{ reference: string; customer_email: string }> }> {
  const r = await query(
    `UPDATE tradein_submissions
        SET status = 'expired', updated_at = NOW()
      WHERE status = 'quoted'
        AND quote_expires_at IS NOT NULL
        AND quote_expires_at <= NOW()
      RETURNING reference, customer_email`
  );
  return { expired: r.rows };
}

// ── Credit issuance on paid trade-ins ──
//
// Called whenever a submission transitions to status='paid'. Idempotent
// (the credit_issued_at column gates re-runs); safe under retries.
//
// Issues credit when:
//   - Submission has a linked user_id (registered customer)
//   - payout_type is 'credit' or 'mixed' (non-zero credit_amount)
//   - credit_issued_at is null (never issued before)
//
// Applies the user's membership tier tradein_bonus_percent on top of the
// quoted credit_amount. Bonus is admin-visible via final_total but never
// retroactively lost — once issued, the credit row is final.
//
// Uses a transaction: claim the credit_issued_at slot first (ON CONFLICT-
// style by checking it's null), then bump balance + write ledger row,
// then commit. If the transaction fails the credit_issued_at stays null
// and the next status update re-attempts.
export async function issueTradeinCreditIfDue(reference: string): Promise<{
  ok: boolean;
  issued?: { amount: number; bonus: number; userId: string };
  reason?: string;
}> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool(getConnectionConfig());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Re-read with a row lock so concurrent admin clicks don't double-credit
    const subRes = await client.query(
      `SELECT s.*, u.tier_id
         FROM tradein_submissions s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.reference = $1
        FOR UPDATE OF s`,
      [reference]
    );
    if (subRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "Submission not found" };
    }
    const sub = subRes.rows[0];

    if (sub.status !== "paid") {
      await client.query("ROLLBACK");
      return { ok: false, reason: `status is ${sub.status}, not paid` };
    }
    if (!sub.user_id) {
      // Anonymous trade-in (no linked user). Admin pays them another way.
      await client.query("ROLLBACK");
      return { ok: false, reason: "submission not linked to a registered user" };
    }
    if (sub.credit_issued_at) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "credit already issued" };
    }

    const baseCredit = parseFloat(sub.credit_amount ?? sub.quoted_credit_total ?? "0");
    if (!(baseCredit > 0)) {
      // Cash-only trade-in; mark issued so we don't keep checking
      await client.query(
        `UPDATE tradein_submissions SET credit_issued_at = NOW() WHERE reference = $1`,
        [reference]
      );
      await client.query("COMMIT");
      return { ok: true, reason: "cash-only payout, nothing to credit" };
    }

    // Apply membership tier tradein_bonus_percent (column on tiers table)
    let bonusPct = 0;
    if (sub.tier_id) {
      const tierRes = await client.query(
        `SELECT tradein_bonus_percent::numeric AS pct FROM tiers WHERE id = $1`,
        [sub.tier_id]
      );
      bonusPct = parseFloat(tierRes.rows[0]?.pct ?? "0") || 0;
    }
    const bonusAmount = Math.round(baseCredit * (bonusPct / 100) * 100) / 100;
    const totalCredit = baseCredit + bonusAmount;

    // Bump balance + ledger row, then mark issued
    const balRes = await client.query(
      `UPDATE users SET store_credit_balance = store_credit_balance + $2
        WHERE id = $1 RETURNING store_credit_balance::numeric AS balance`,
      [sub.user_id, totalCredit.toFixed(2)]
    );
    const newBalance = balRes.rows[0]?.balance ?? "0";

    const ledgerDescription = bonusAmount > 0
      ? `Trade-in ${reference} (£${baseCredit.toFixed(2)} + £${bonusAmount.toFixed(2)} tier bonus)`
      : `Trade-in ${reference}`;
    await client.query(
      `INSERT INTO store_credit_ledger (user_id, amount, balance, type, description, reference_id)
       VALUES ($1, $2, $3, 'tradein_paid', $4, $5)`,
      [sub.user_id, totalCredit.toFixed(2), newBalance, ledgerDescription, reference]
    );

    await client.query(
      `UPDATE tradein_submissions
          SET credit_issued_at = NOW(),
              mint_bonus_amount = COALESCE(mint_bonus_amount, '0')::numeric + $2,
              updated_at = NOW()
        WHERE reference = $1`,
      [reference, bonusAmount.toFixed(2)]
    );

    await client.query("COMMIT");
    return {
      ok: true,
      issued: { amount: totalCredit, bonus: bonusAmount, userId: sub.user_id },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
