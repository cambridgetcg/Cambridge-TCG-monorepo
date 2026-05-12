/**
 * card_price_change_log writer.
 *
 * Append-only audit trail for mutations to `cards.price` / `cards.baseGbp`.
 * Mirrors `apps/storefront/src/lib/market/pricing-rule-lifecycle-log.ts`
 * (the `logRuleTransition` helper); same shape, same catch-without-rethrow
 * discipline.
 *
 * The Witnesses' Book rule (S13, `docs/connections/the-witnesses-book.md`):
 * *important enough to attempt always; unimportant enough that its failure
 * can never break the act it was witnessing.* If the INSERT fails for any
 * reason, we log to stderr and return — the price-change itself has already
 * happened; the log entry is the audit trail, not the act.
 *
 * Phase 2 of kingdom-049 (pricing-backend consolidation).
 * See docs/pricing-current-state.md and docs/connections/the-pricing-arrow.md.
 */

import { db } from "@/lib/db";
import { cardPriceChangeLog } from "@/lib/db/schema";

export type PriceChangeAction =
  | "admin_edit"
  | "snapshot"
  | "csv_upload"       // reserved — kingdom-030 closure
  | "synced_to_shopify"; // reserved — Phase 2.5

export interface PriceChangeValues {
  /** GBP retail price as stored in cards.price. */
  price?: number | null;
  /** GBP base (pre-margin) as stored in cards.baseGbp. */
  baseGbp?: number | null;
  /** Source JPY at moment of mutation (snapshot path). */
  cardrushJpy?: number | null;
  /** GBP/JPY rate at moment of mutation (snapshot path). */
  gbpJpyRate?: number | null;
}

export interface LogPriceChangeArgs {
  cardId: number;
  action: PriceChangeAction;
  /** Free-form system name: "admin", "cardrush-cron", "shopify-sync". */
  source?: string | null;
  /** "admin:<email>", "cron:price-snapshot", etc. */
  actorLabel?: string | null;
  before?: PriceChangeValues | null;
  after?: PriceChangeValues | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append one row to `card_price_change_log`. Never throws.
 *
 * The caller has already mutated `cards.price` / `cards.baseGbp` by the
 * time this is called; this function only records that the mutation
 * happened, who/what did it, and the before/after values.
 */
export async function logPriceChange(args: LogPriceChangeArgs): Promise<void> {
  try {
    await db.insert(cardPriceChangeLog).values({
      cardId: args.cardId,
      action: args.action,
      source: args.source ?? null,
      actorLabel: args.actorLabel ?? null,
      beforeValue: args.before ?? null,
      afterValue: args.after ?? null,
      reason: args.reason ?? null,
      metadata: args.metadata ?? null,
    });
  } catch (err) {
    console.error(
      `[price-change-log] insert failed (card=${args.cardId} action=${args.action}):`,
      err,
    );
  }
}
