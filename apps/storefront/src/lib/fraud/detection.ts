// Fraud signal detection + emission.
//
// fraud_signals (migration 0019) was schema-defined but never produced
// outside of a couple hardcoded checks — meaning the trust engine's
// 20-pt-per-medium-or-higher penalty was effectively dormant. This lib
// is the production source of fraud signals; detection passes (Phase B)
// emit through emitSignal() here.
//
// Severity ladder + auto_action defaults are centralised so the
// detection passes don't each invent their own policy. Adding a new
// signal type = add an entry to SIGNAL_DEFS and a detection function.

import { query } from "@/lib/db";

export type SignalSeverity = "low" | "medium" | "high" | "critical";
export type SignalAutoAction = "none" | "flag" | "hold_payout" | "suspend" | "block_trade";

export interface SignalDef {
  type: string;
  severity: SignalSeverity;
  autoAction: SignalAutoAction;
  description: string;
}

/**
 * Signal taxonomy. Severity drives trust penalty (medium+ = -20 each)
 * and auto-action drives Phase C's auto-suspend gate. Every detection
 * pass picks one of these; the catalog is the source of truth.
 */
export const SIGNAL_DEFS = {
  RAPID_LISTING: {
    type: "rapid_listing",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Rapid listing burst — many orders placed in a short window",
  },
  SELF_TRADING: {
    type: "self_trading",
    severity: "high" as const,
    autoAction: "block_trade" as const,
    description: "Detected possible self-trade between linked accounts",
  },
  REFUND_ABUSE: {
    type: "refund_abuse",
    severity: "high" as const,
    autoAction: "hold_payout" as const,
    description: "Pattern of repeated refunds initiated as buyer",
  },
  VELOCITY_SPIKE: {
    type: "velocity_spike",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Sudden multi-day surge in trading volume vs baseline",
  },
  NEW_ACCOUNT_HIGH_VALUE: {
    type: "new_account_high_value",
    severity: "high" as const,
    autoAction: "hold_payout" as const,
    description: "New account placing orders well above starter limits",
  },
  NEGATIVE_REVIEWS: {
    type: "negative_reviews",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Accumulation of negative reviews above tier baseline",
  },
  CHARGEBACK: {
    type: "chargeback",
    severity: "critical" as const,
    autoAction: "suspend" as const,
    description: "Stripe chargeback received against a paid trade",
  },
  FAILED_PAYMENT_BURST: {
    type: "failed_payment_burst",
    severity: "high" as const,
    autoAction: "block_trade" as const,
    description: "Multiple Stripe payment failures in a short window — possible card testing",
  },
  BID_SNIPING: {
    type: "bid_sniping",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Burst bidding in the final minutes across multiple auctions — anti-snipe extension exploitation",
  },
  AUCTION_DEFAULT: {
    type: "auction_default",
    severity: "high" as const,
    autoAction: "block_trade" as const,
    description: "Won an auction and let the 48h payment window lapse without paying",
  },
  AUCTION_CANCEL_ABUSE: {
    type: "auction_cancel_abuse",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Repeated seller-initiated cancellations after bids landed — shill-cancel pattern (used to dodge low winning prices)",
  },
  TRADE_PAYMENT_DEFAULT: {
    type: "trade_payment_default",
    severity: "high" as const,
    autoAction: "block_trade" as const,
    description: "Matched a market trade and let the 24h payment window lapse without paying",
  },
  TRADE_CANCEL_ABUSE: {
    type: "trade_cancel_abuse",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Repeated trade cancellations initiated by the same party — pattern of pulling out after match",
  },
  OFFER_LOWBALL_ABUSE: {
    type: "offer_lowball_abuse",
    severity: "low" as const,
    autoAction: "flag" as const,
    description: "Burst of offers at ≤30% of ask price across multiple listings — wasted-attention pattern that wears sellers down",
  },
  RETURN_ABUSE: {
    type: "return_abuse",
    severity: "medium" as const,
    autoAction: "flag" as const,
    description: "Repeated return requests from the same buyer — wardrobing or grading-arbitrage pattern",
  },
} as const;

export type SignalKey = keyof typeof SIGNAL_DEFS;

export interface EmitSignalArgs {
  userId: string;
  /** Signal taxonomy entry (use the SIGNAL_DEFS constants). */
  def: SignalDef;
  /** Optional trade reference for attribution. */
  tradeId?: string | null;
  /** Custom description override; defaults to def.description. */
  description?: string;
  /** De-dup key so a re-running detector doesn't pile up duplicates.
   *  When provided, the lib checks for an existing unresolved signal of
   *  the same type with the same dedupe_key (stored in resolved_notes
   *  for now; a dedicated column would be cleaner but avoids a third
   *  schema change). */
  dedupeKey?: string;
}

/**
 * Emit a fraud signal. Idempotent when dedupeKey is supplied — repeat
 * calls within the unresolved window no-op.
 *
 * Returns the inserted (or pre-existing) signal id, or null if dedup
 * suppressed it.
 */
export async function emitSignal(args: EmitSignalArgs): Promise<string | null> {
  if (args.dedupeKey) {
    const existing = await query(
      `SELECT id FROM fraud_signals
        WHERE user_id = $1
          AND signal_type = $2
          AND resolved = false
          AND COALESCE(resolved_notes, '') LIKE $3
        LIMIT 1`,
      [args.userId, args.def.type, `%dedupe:${args.dedupeKey}%`],
    );
    if (existing.rows.length > 0) return null;
  }

  const description = args.description ?? args.def.description;
  // Squat the dedupe key into resolved_notes (prefixed) so the next
  // emit can see it without a schema change. Once resolved by an
  // admin the key is overwritten; that's correct — a resolved signal
  // shouldn't suppress a fresh emit of the same pattern.
  const notesWithKey = args.dedupeKey ? `dedupe:${args.dedupeKey}` : null;

  const r = await query(
    `INSERT INTO fraud_signals
       (user_id, trade_id, signal_type, severity, description, auto_action, resolved_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      args.userId,
      args.tradeId ?? null,
      args.def.type,
      args.def.severity,
      description,
      args.def.autoAction,
      notesWithKey,
    ],
  );

  return r.rows[0]?.id ?? null;
}

/** Severity rank for ordering / threshold comparisons. */
export function severityRank(s: SignalSeverity): number {
  switch (s) {
    case "low": return 1;
    case "medium": return 2;
    case "high": return 3;
    case "critical": return 4;
  }
}
