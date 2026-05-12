"use server";

/**
 * Payouts — server actions.
 *
 * One mutation: recordPayout. Stamps seller_paid_at + payout_method +
 * payout_reference on the right table (market_trades or auctions) without
 * moving money. The operator has paid the seller out-of-band (bank,
 * PayPal, crypto, store credit, etc.) and is recording the receipt.
 *
 * Stripe Connect transfers stay in the legacy admin for now — they need
 * the storefront's Stripe SDK + Connect helpers, which would either
 * require duplicating the integration here or extracting a shared
 * package. Out of scope for kingdom-023; flagged as a follow-up.
 *
 * Governance audit fires automatically through adminAction(). The
 * trade_lifecycle_log enum vocabulary is owned by the storefront schema
 * (drizzle/0078) and we don't extend it from here — admin_actions_log is
 * the audit substrate for this kind of out-of-band record-keeping.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

const VALID_METHODS = new Set([
  "bank_transfer",
  "paypal",
  "crypto",
  "stripe_connect",
  "store_credit",
  "other",
]);

export interface RecordPayoutInput {
  kind: "trade" | "auction";
  id: string;
  method: string;
  reference?: string;
  reason: string;
}

export async function recordPayout(input: RecordPayoutInput) {
  return adminAction({
    action: input.kind === "trade" ? "trade.record_payout" : "auction.record_payout",
    targetKind: input.kind === "trade" ? "market_trade" : "auction",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/money/payouts",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to record a payout.");
      }
      if (!VALID_METHODS.has(input.method)) {
        throw new ActionInputError(
          `method must be one of: ${[...VALID_METHODS].join(", ")}`,
        );
      }
      const reference = input.reference?.trim() || null;

      if (input.kind === "trade") {
        const before = await sfQuery<{
          escrow_status: string;
          seller_paid_at: string | null;
        }>(
          `SELECT escrow_status, seller_paid_at::text AS seller_paid_at
             FROM market_trades WHERE id = $1`,
          [input.id],
        );
        if (before.rows.length === 0) {
          throw new ActionInputError(`Trade ${input.id} not found.`);
        }
        const row = before.rows[0]!;
        if (row.seller_paid_at) {
          throw new ActionInputError("Payout already recorded for this trade.");
        }
        if (row.escrow_status !== "completed") {
          throw new ActionInputError(
            `Cannot pay seller until trade is completed (currently ${row.escrow_status}).`,
          );
        }
        await sfQuery(
          `UPDATE market_trades
              SET seller_paid_at = NOW(),
                  payout_method = $2,
                  payout_reference = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [input.id, input.method, reference],
        );
        return { kind: "trade" as const, id: input.id, method: input.method };
      }

      // auction
      const before = await sfQuery<{
        status: string;
        seller_paid_at: string | null;
        seller_payout: string | null;
      }>(
        `SELECT status, seller_paid_at::text AS seller_paid_at,
                seller_payout::text AS seller_payout
           FROM auctions WHERE id = $1`,
        [input.id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Auction ${input.id} not found.`);
      }
      const row = before.rows[0]!;
      if (row.seller_paid_at) {
        throw new ActionInputError("Payout already recorded for this auction.");
      }
      if (row.status !== "paid") {
        throw new ActionInputError(
          `Cannot pay seller until auction is paid (currently ${row.status}).`,
        );
      }
      if (row.seller_payout == null) {
        throw new ActionInputError("Auction has no seller payout amount set.");
      }
      await sfQuery(
        `UPDATE auctions
            SET seller_paid_at = NOW(),
                payout_method = $2,
                payout_reference = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [input.id, input.method, reference],
      );
      return { kind: "auction" as const, id: input.id, method: input.method };
    },
  });
}
