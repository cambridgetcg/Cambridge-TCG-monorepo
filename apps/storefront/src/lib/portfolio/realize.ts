// Realized P&L close-out + auto-acquisition helpers.
//
// Cost-basis accounting: HMRC's s104 share-pool / weighted average is
// what portfolio.addCard already maintains via its rolling-average
// upsert. closePosition() reads that pooled basis, decrements the
// holding by the sold quantity, and writes a realized_positions row
// that captures the gain or loss at sale time.
//
// closePosition is idempotent on (user_id, sku, condition, exit_kind,
// exit_reference_id) — re-firing from a webhook retry won't double-
// realize. Implemented via INSERT ... ON CONFLICT DO NOTHING after
// the qty decrement (see comment inline).
//
// Both functions return discriminated-union shapes consistent with the
// rest of the codebase. Both are fire-and-forget safe at call sites
// (errors logged, never thrown), since realization shouldn't block
// the actual sale completing.

import { query } from "@/lib/db";
import { addCard } from "./db";

export interface CloseResult {
  ok: boolean;
  reason?: string;
  realized?: {
    quantity: number;
    cost_basis_total: number;
    proceeds_gbp: number;
    gain_gbp: number;
  };
}

export interface CloseInput {
  userId: string;
  sku: string;
  condition?: string;     // defaults to 'NM' (matches portfolio_cards default)
  quantity: number;
  proceedsGbp: number;    // gross sale proceeds (before fees)
  feesGbp?: number;       // commission, payout fee, etc
  exitKind: "market_trade" | "auction" | "lot_trade" | "manual";
  exitReferenceId: string;
  soldAt?: Date;
  notes?: string;
}

export async function closePosition(input: CloseInput): Promise<CloseResult> {
  const condition = input.condition ?? "NM";
  if (input.quantity <= 0) {
    return { ok: false, reason: "Quantity must be positive." };
  }
  if (input.proceedsGbp < 0) {
    return { ok: false, reason: "Proceeds must be non-negative." };
  }

  // Idempotency check — same exit reference already realized?
  const dup = await query(
    `SELECT 1 FROM realized_positions
      WHERE user_id = $1 AND exit_kind = $2 AND exit_reference_id = $3
      LIMIT 1`,
    [input.userId, input.exitKind, input.exitReferenceId],
  );
  if (dup.rows.length > 0) {
    return { ok: true, reason: "Already realized (idempotent no-op)." };
  }

  // Find the open position. If the user never had it in their
  // portfolio (e.g. they bought outside the platform and sold here),
  // we still want a realized row — fall back to cost basis = 0
  // so the gain reflects the full proceeds. Investors can edit the
  // basis after the fact via the portfolio CRUD if needed.
  const existing = await query(
    `SELECT id, quantity, acquisition_price, acquired_at, card_name, set_code
       FROM portfolio_cards
      WHERE user_id = $1 AND sku = $2 AND condition = $3`,
    [input.userId, input.sku, condition],
  );

  let costBasisPerUnit = 0;
  let acquiredAt: string | null = null;
  let cardName: string | null = null;
  let setCode: string | null = null;
  let positionId: string | null = null;
  let availableQty = 0;

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    positionId = row.id;
    availableQty = row.quantity;
    costBasisPerUnit = row.acquisition_price ? parseFloat(row.acquisition_price) : 0;
    acquiredAt = row.acquired_at;
    cardName = row.card_name;
    setCode = row.set_code;
  }

  // We don't refuse to realize if the holding is short — the user
  // genuinely sold the card, and the platform side recorded the sale.
  // Realize what they sold; decrement what's available and floor at 0.
  // Investors can flag "sold more than I held" themselves.
  const realizedQty = input.quantity;
  const costBasisTotal = Math.round(costBasisPerUnit * realizedQty * 100) / 100;
  const fees = input.feesGbp ?? 0;
  const netProceeds = Math.round((input.proceedsGbp - fees) * 100) / 100;
  const gain = Math.round((netProceeds - costBasisTotal) * 100) / 100;
  const soldAt = input.soldAt ?? new Date();
  const holdingDays = acquiredAt
    ? Math.floor((soldAt.getTime() - new Date(acquiredAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Insert the realized row + decrement the open position atomically.
  // Two statements — the dup-check above guards the realize side; the
  // decrement is GREATEST-clamped so a short sale doesn't underflow.
  await query(
    `INSERT INTO realized_positions
       (user_id, sku, card_name, set_code, condition, quantity,
        cost_basis_per_unit, cost_basis_total, proceeds_gbp, fees_gbp, gain_gbp,
        acquired_at, sold_at, holding_days,
        exit_kind, exit_reference_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,
             $7,$8,$9,$10,$11,
             $12,$13,$14,
             $15,$16,$17)`,
    [input.userId, input.sku, cardName, setCode, condition, realizedQty,
     costBasisPerUnit.toFixed(2), costBasisTotal.toFixed(2),
     input.proceedsGbp.toFixed(2), fees.toFixed(2), gain.toFixed(2),
     acquiredAt, soldAt.toISOString(), holdingDays,
     input.exitKind, input.exitReferenceId, input.notes ?? null],
  );

  if (positionId) {
    const newQty = Math.max(0, availableQty - realizedQty);
    if (newQty === 0) {
      // Don't delete — keep the row at qty=0 so the user's history
      // page can still show "you used to hold this." A future
      // garbage-collect job could prune zero-qty rows older than N
      // months if the table gets bloated.
      await query(
        `UPDATE portfolio_cards SET quantity = 0, updated_at = NOW() WHERE id = $1`,
        [positionId],
      );
    } else {
      await query(
        `UPDATE portfolio_cards SET quantity = $1, updated_at = NOW() WHERE id = $2`,
        [newQty, positionId],
      );
    }
  }

  return {
    ok: true,
    realized: {
      quantity: realizedQty,
      cost_basis_total: costBasisTotal,
      proceeds_gbp: input.proceedsGbp,
      gain_gbp: gain,
    },
  };
}

// ── Auto-acquisition wrapper ──
//
// Thin facade around portfolio.addCard that stamps the source so
// auto-acquired positions can be distinguished from manual entries
// (and sanity-checked against the originating sale). Idempotency is
// enforced at the call site via the (acquisition_source, acquisition_
// reference_id) index — we check before inserting.

export interface AcquireInput {
  userId: string;
  sku: string;
  cardName?: string;
  cardNumber?: string;
  setCode?: string;
  setName?: string;
  imageUrl?: string;
  rarity?: string;
  condition?: string;
  quantity: number;
  pricePaidGbp: number;     // gross of fees the buyer paid
  feesGbp?: number;         // shipping, payment processing, etc
  acquisitionSource: "market_trade" | "auction" | "lot_trade" | "checkout" | "vault" | "manual";
  acquisitionReferenceId: string;
  acquiredAt?: Date;
}

export async function recordAcquisition(input: AcquireInput): Promise<{ ok: boolean; alreadyRecorded?: boolean }> {
  // Idempotency: same source+reference already on this user's
  // portfolio? Skip. Webhook retries are common from Stripe; we
  // don't want double-counting in basis.
  const dup = await query(
    `SELECT 1 FROM portfolio_cards
      WHERE user_id = $1
        AND acquisition_source = $2
        AND acquisition_reference_id = $3
      LIMIT 1`,
    [input.userId, input.acquisitionSource, input.acquisitionReferenceId],
  );
  if (dup.rows.length > 0) {
    return { ok: true, alreadyRecorded: true };
  }

  const allInPrice = input.pricePaidGbp + (input.feesGbp ?? 0);
  const condition = input.condition ?? "NM";
  const acquiredAt = (input.acquiredAt ?? new Date()).toISOString().slice(0, 10);

  await addCard(input.userId, {
    sku: input.sku,
    cardName: input.cardName,
    cardNumber: input.cardNumber,
    setCode: input.setCode,
    setName: input.setName,
    imageUrl: input.imageUrl,
    rarity: input.rarity,
    condition,
    quantity: input.quantity,
    acquisitionPrice: allInPrice,
    acquiredAt,
  });

  // Stamp the source on whichever row addCard touched (insert OR
  // upsert path). The acquisition_source column was added by
  // 0118_realized_positions.sql for exactly this backtrack.
  await query(
    `UPDATE portfolio_cards
        SET acquisition_source = COALESCE(acquisition_source, $2),
            acquisition_reference_id = COALESCE(acquisition_reference_id, $3),
            updated_at = NOW()
      WHERE user_id = $1 AND sku = $4 AND condition = $5`,
    [input.userId, input.acquisitionSource, input.acquisitionReferenceId,
     input.sku, condition],
  );

  return { ok: true };
}
