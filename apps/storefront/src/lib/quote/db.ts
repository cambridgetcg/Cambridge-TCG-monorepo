import { query, transaction } from "@/lib/db";

export interface QuoteRequest {
  id: number;
  reference: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  payment_method: string;
  delivery_method: string;
  notes: string | null;
  admin_notes: string | null;
  quoted_total: string | null;
  offer_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteItem {
  id: number;
  request_id: number;
  description: string;
  game: string | null;
  set_name: string | null;
  condition: string;
  quantity: number;
  customer_notes: string | null;
  offered_price: string | null;
  admin_notes: string | null;
  rejected: boolean;
  images?: QuoteImage[];
}

export interface QuoteImage {
  id: number;
  item_id: number;
  url: string;
  s3_key: string;
}

// ── Generate reference ──

export async function generateQuoteRef(): Promise<string> {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const prefix = `QR-${dateStr}-`;

  const result = await query(
    `SELECT reference FROM quote_requests WHERE reference LIKE $1 ORDER BY reference DESC LIMIT 1`,
    [prefix + "%"]
  );

  let seq = 1;
  if (result.rows.length > 0) {
    const lastSeq = parseInt((result.rows[0].reference as string).slice(-4), 10);
    seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(4, "0");
}

// ── Create quote request ──

export async function createQuoteRequest(data: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: string;
  deliveryMethod: string;
  notes?: string;
  items: {
    description: string;
    game?: string;
    set_name?: string;
    condition: string;
    quantity: number;
    customer_notes?: string;
    imageUrls?: { url: string; s3Key: string }[];
  }[];
}): Promise<{ reference: string }> {
  return transaction(async (q) => {
    const reference = await generateQuoteRef();

    // Resolve user_id from email so a registered customer's quote
    // automatically links for later credit/payout.
    const u = await q(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [data.customerEmail]
    );
    const resolvedUserId = u.rows[0]?.id ?? null;

    const reqResult = await q(
      `INSERT INTO quote_requests (reference, customer_name, customer_email, customer_phone, payment_method, delivery_method, notes, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [reference, data.customerName, data.customerEmail, data.customerPhone || null,
       data.paymentMethod, data.deliveryMethod, data.notes || null, resolvedUserId]
    );
    const requestId = reqResult.rows[0].id;

    for (const item of data.items) {
      const itemResult = await q(
        `INSERT INTO quote_items (request_id, description, game, set_name, condition, quantity, customer_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [requestId, item.description, item.game || null, item.set_name || null,
         item.condition, item.quantity, item.customer_notes || null]
      );
      const itemId = itemResult.rows[0].id;

      if (item.imageUrls) {
        for (const img of item.imageUrls) {
          await q(
            `INSERT INTO quote_images (item_id, url, s3_key) VALUES ($1,$2,$3)`,
            [itemId, img.url, img.s3Key]
          );
        }
      }
    }

    return { reference };
  });
}

// ── Get quote by reference (customer view) ──

export async function getQuoteByRef(reference: string): Promise<{
  request: QuoteRequest;
  items: QuoteItem[];
} | null> {
  const reqResult = await query(`SELECT * FROM quote_requests WHERE reference = $1`, [reference]);
  if (reqResult.rows.length === 0) return null;

  const request = reqResult.rows[0] as QuoteRequest;
  const itemsResult = await query(`SELECT * FROM quote_items WHERE request_id = $1 ORDER BY id`, [request.id]);
  const items: QuoteItem[] = [];

  for (const row of itemsResult.rows) {
    const item = row as QuoteItem;
    const imgResult = await query(`SELECT * FROM quote_images WHERE item_id = $1 ORDER BY id`, [item.id]);
    item.images = imgResult.rows as QuoteImage[];
    items.push(item);
  }

  return { request, items };
}

// ── List all quotes (admin) ──

export async function listAllQuotes(): Promise<{ request: QuoteRequest; itemCount: number }[]> {
  const result = await query(
    `SELECT qr.*, (SELECT COUNT(*) FROM quote_items WHERE request_id = qr.id) as item_count
     FROM quote_requests qr ORDER BY qr.created_at DESC`
  );
  return result.rows.map((r) => ({
    request: r as QuoteRequest,
    itemCount: parseInt(r.item_count, 10),
  }));
}

// ── Get full quote detail (admin) ──

export async function getQuoteDetail(id: number): Promise<{
  request: QuoteRequest;
  items: QuoteItem[];
} | null> {
  const reqResult = await query(`SELECT * FROM quote_requests WHERE id = $1`, [id]);
  if (reqResult.rows.length === 0) return null;

  const request = reqResult.rows[0] as QuoteRequest;
  const itemsResult = await query(`SELECT * FROM quote_items WHERE request_id = $1 ORDER BY id`, [request.id]);
  const items: QuoteItem[] = [];

  for (const row of itemsResult.rows) {
    const item = row as QuoteItem;
    const imgResult = await query(`SELECT * FROM quote_images WHERE item_id = $1 ORDER BY id`, [item.id]);
    item.images = imgResult.rows as QuoteImage[];
    items.push(item);
  }

  return { request, items };
}

// ── Admin: set item prices and send offer ──

export async function setItemPrices(items: { id: number; offered_price: number | null; rejected: boolean; admin_notes?: string }[]): Promise<void> {
  for (const item of items) {
    await query(
      `UPDATE quote_items SET offered_price = $1, rejected = $2, admin_notes = $3 WHERE id = $4`,
      [item.offered_price?.toFixed(2) ?? null, item.rejected, item.admin_notes || null, item.id]
    );
  }
}

export async function sendOffer(requestId: number, adminNotes?: string): Promise<QuoteRequest> {
  // Calculate total from non-rejected items
  const itemsResult = await query(
    `SELECT SUM(offered_price * quantity) as total FROM quote_items WHERE request_id = $1 AND NOT rejected AND offered_price IS NOT NULL`,
    [requestId]
  );
  const total = parseFloat(itemsResult.rows[0]?.total || "0");

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const result = await query(
    `UPDATE quote_requests SET status = 'quoted', quoted_total = $1, offer_expires_at = $2,
     admin_notes = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
    [total.toFixed(2), expiresAt.toISOString(), adminNotes || null, requestId]
  );
  return result.rows[0] as QuoteRequest;
}

// ── Customer: accept or decline ──

export async function respondToOffer(reference: string, accept: boolean): Promise<QuoteRequest | null> {
  const status = accept ? "accepted" : "declined";
  const result = await query(
    `UPDATE quote_requests SET status = $1, updated_at = NOW()
     WHERE reference = $2 AND status = 'quoted' RETURNING *`,
    [status, reference]
  );
  return result.rows[0] as QuoteRequest ?? null;
}

// ── Status updates beyond quoted/accepted ──
//
// Once admin marks 'received' (cards arrived) and then 'paid', the
// payout helpers below fire. Mirrors the trade-in lifecycle.
//
// Per-status timestamp columns (migration 0051) are stamped via
// COALESCE so the original time survives even if admin re-flips a
// submission — needed for a stable customer-facing timeline.
const STATUS_TIMESTAMP_COL: Record<string, string> = {
  received: "received_at",
  paid:     "paid_at",
};

export async function updateQuoteStatus(reference: string, status: string): Promise<QuoteRequest | null> {
  const tsCol = STATUS_TIMESTAMP_COL[status];
  const setExtra = tsCol ? `, ${tsCol} = COALESCE(${tsCol}, NOW())` : "";
  const r = await query(
    `UPDATE quote_requests SET status = $1, updated_at = NOW()${setExtra}
      WHERE reference = $2 RETURNING *`,
    [status, reference]
  );
  return (r.rows[0] as QuoteRequest) ?? null;
}

// ── Offer expiry sweep (mirrors sweepExpiredQuotes for trade-ins) ──
//
// Quoted rows whose offer_expires_at has elapsed without a customer
// response flip to 'expired'. Cron-driven so customers get an email
// as soon as their window closes, not when an admin happens to open
// the page.
export async function sweepExpiredQuoteOffers(): Promise<{
  expired: Array<{ reference: string; customer_email: string; customer_name: string }>;
}> {
  const r = await query(
    `UPDATE quote_requests
        SET status = 'expired', updated_at = NOW()
      WHERE status = 'quoted'
        AND offer_expires_at IS NOT NULL
        AND offer_expires_at <= NOW()
      RETURNING reference, customer_email, customer_name`
  );
  return { expired: r.rows };
}

// ── Credit issuance on paid quote (mirrors issueTradeinCreditIfDue) ──
//
// On 'paid', if the quote has a credit_amount and a linked user, write
// to store_credit_ledger and bump the balance. Applies the membership
// tier tradein_bonus_percent (same column the trade-in flow uses —
// quotes are conceptually trade-ins for off-list cards, so the bonus
// applies equally).
export async function issueQuoteCreditIfDue(reference: string): Promise<{
  ok: boolean;
  issued?: { amount: number; bonus: number };
  reason?: string;
}> {
  return transaction(async (q) => {
    const r = await q(
      `SELECT qr.*, u.tier_id
         FROM quote_requests qr
         LEFT JOIN users u ON u.id = qr.user_id
        WHERE qr.reference = $1 FOR UPDATE OF qr`,
      [reference]
    );
    if (r.rows.length === 0) {
      return { ok: false as const, reason: "quote not found" };
    }
    const qr = r.rows[0];
    if (qr.status !== "paid") {
      return { ok: false as const, reason: `status is ${qr.status}` };
    }
    if (!qr.user_id) {
      return { ok: false as const, reason: "quote not linked to a user" };
    }
    if (qr.credit_issued_at) {
      return { ok: false as const, reason: "credit already issued" };
    }

    const baseCredit = parseFloat(qr.credit_amount ?? "0");
    if (!(baseCredit > 0)) {
      await q(
        `UPDATE quote_requests SET credit_issued_at = NOW() WHERE reference = $1`,
        [reference]
      );
      return { ok: true as const, reason: "no credit component" };
    }

    let bonusPct = 0;
    if (qr.tier_id) {
      const t = await q(
        `SELECT tradein_bonus_percent::numeric AS pct FROM tiers WHERE id = $1`,
        [qr.tier_id]
      );
      bonusPct = parseFloat(t.rows[0]?.pct ?? "0") || 0;
    }
    const bonus = Math.round(baseCredit * (bonusPct / 100) * 100) / 100;
    const total = baseCredit + bonus;

    const balRes = await q(
      `UPDATE users SET store_credit_balance = store_credit_balance + $2
        WHERE id = $1 RETURNING store_credit_balance::numeric AS balance`,
      [qr.user_id, total.toFixed(2)]
    );
    const newBalance = balRes.rows[0]?.balance ?? "0";

    await q(
      `INSERT INTO store_credit_ledger (user_id, amount, balance, type, description, reference_id)
       VALUES ($1, $2, $3, 'quote_paid', $4, $5)`,
      [qr.user_id, total.toFixed(2), newBalance,
       bonus > 0 ? `Quote ${reference} (£${baseCredit.toFixed(2)} + £${bonus.toFixed(2)} tier bonus)` : `Quote ${reference}`,
       reference]
    );

    await q(
      `UPDATE quote_requests SET credit_issued_at = NOW(), updated_at = NOW() WHERE reference = $1`,
      [reference]
    );

    return { ok: true as const, issued: { amount: total, bonus } };
  });
}

// ── Cash payout for quotes via Stripe Connect (mirrors payTradeinCashIfDue) ──
export async function payQuoteCashIfDue(reference: string): Promise<{
  ok: boolean;
  transferId?: string;
  reason?: string;
}> {
  const r = await query(
    `SELECT q.*, u.stripe_connect_account_id, u.stripe_connect_payouts_enabled
       FROM quote_requests q
       LEFT JOIN users u ON u.id = q.user_id
      WHERE q.reference = $1`,
    [reference]
  );
  if (r.rows.length === 0) return { ok: false, reason: "quote not found" };
  const q = r.rows[0];

  if (q.status !== "paid") return { ok: false, reason: `status is ${q.status}` };
  if (q.cash_paid_at) return { ok: false, reason: "cash already paid" };
  if (!q.user_id) return { ok: false, reason: "quote not linked to a user" };

  const cash = parseFloat(q.cash_amount ?? "0");
  if (!(cash > 0)) {
    await query(
      `UPDATE quote_requests SET cash_paid_at = NOW() WHERE reference = $1`,
      [reference]
    );
    return { ok: true, reason: "no cash component" };
  }
  if (!q.stripe_connect_account_id || !q.stripe_connect_payouts_enabled) {
    return { ok: false, reason: "user has not connected Stripe for payouts" };
  }

  const { createTransferToSeller } = await import("@/lib/payouts/stripe-connect");
  try {
    const result = await createTransferToSeller({
      sellerUserId: q.user_id,
      amountGbp: cash,
      description: `Quote payout ${reference}`,
      idempotencyKey: `quote-cash-${reference}`,
      metadata: { reference, kind: "quote_cash" },
    });
    await query(
      `UPDATE quote_requests
          SET cash_paid_at = NOW(), stripe_transfer_id = $2, updated_at = NOW()
        WHERE reference = $1`,
      [reference, result.transferId]
    );
    return { ok: true, transferId: result.transferId };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "transfer failed" };
  }
}
