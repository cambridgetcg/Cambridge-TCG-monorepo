import type { PayoutState } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { formatMoney } from "./money";

/**
 * The status words the engine decides with (M3a-F6): each status is a key
 * (StatusKey) with one label, the payout states that are still on their way,
 * and the take-back sentences. Shop-neutral, so orderStatus never reaches
 * into the admin; app/admin/words.ts re-exports these beside the badge tones
 * and the pages' other words. Not a .server module: the pages use it too.
 */

export type StatusKey = "issued" | "waiting" | "needs_look" | "taken_back" | "not_taken_back" | "no_cashback" | "unknown";

export const STATUS_LABEL: Record<StatusKey, string> = {
  issued: "Issued",
  waiting: "Waiting",
  needs_look: "Needs a look",
  taken_back: "Taken back",
  not_taken_back: "Not taken back",
  no_cashback: "No cashback",
  unknown: "Unknown",
};

/** A payout not settled yet: Waiting on every page (M3a-F7). */
export const ON_ITS_WAY: ReadonlySet<PayoutState> = new Set(["pending", "sending", "unconfirmed", "held"]);

/** A take-back Shopify confirmed without saying how much it took (A11-F4). */
export const AMOUNT_UNKNOWN = "Amount unknown";

/**
 * The spec's sentence for a take-back that took less than it asked (spec
 * 4.6, Ruling 65), in the cashback's currency; null when it took all of it.
 */
export function takeBackShort(taken: Decimal, asked: Decimal, currency: string): string | null {
  if (!taken.lt(asked)) return null;
  if (taken.isZero()) return `Couldn't take back ${formatMoney(asked, currency)}; the buyer had spent it`;
  return `Took back ${formatMoney(taken, currency)} of ${formatMoney(asked, currency)}; the buyer had spent the rest`;
}
