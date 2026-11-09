import type { LookReason, NoCashbackReason, PayoutState } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { Money } from "./money";
import { AMOUNT_UNKNOWN, ON_ITS_WAY, STATUS_LABEL, type StatusKey, takeBackShort } from "./status";

/**
 * An order's status on the Orders page (spec 4.6), from its cashback entry,
 * that entry's credit payout and its take-backs (reversal payouts). No
 * database here, so it is tested on its own; stats.server re-exports it. The
 * words are the pages' shared ones (lib/status.ts, which admin/words.ts
 * re-exports).
 *
 * - No cashback entry: No cashback, saying why (the order's
 *   noCashbackReason; a positive base at a rate that gave nothing says so,
 *   TRUTH-6).
 * - A cashback entry with no credit payout: Unknown, as on Home and in the
 *   history (a broken invariant, which stats.server reports; M3a-F4).
 * - A credit or a take-back that needs a look: Needs a look, whatever else
 *   is true (it wins over Issued and Taken back).
 * - A credit closed without sending: No cashback.
 * - A credit not settled yet (pending, sending, unconfirmed, held): Waiting.
 * - Take-backs that took all the cashback: Taken back; Waiting while one of
 *   them is still on its way. A credit with nothing left to send was all
 *   taken back before it went out.
 * - Otherwise the credit went out and the buyer holds some of it: Issued,
 *   saying what part a refund took.
 * A sent take-back counts at what it took, its debitedAmount (Ruling 65):
 * one that fell short leaves the order Issued, with the spec's sentence. One
 * Shopify confirmed without saying how much counts at its ask, as the ledger
 * does (no shortfall is recorded for it), and the detail says the amount is
 * unknown. A take-back closed without taking anything takes nothing.
 */

export type OrderStatus = { key: StatusKey; label: string; detail: string | null };

type Amount = Decimal | number | string;

const NO_CASHBACK: Record<NoCashbackReason, string> = {
  off: "Cashback was off",
  test: "Test order",
  import: "From before install",
  before_install: "From before install",
  cancelled: "Cancelled",
  no_tier: "No tiers were set up",
  nothing_to_pay_on: "Nothing to pay on",
};

const RATE_GAVE_NOTHING = "The rate gave nothing on this order";

const CREDIT_LOOK: Record<LookReason, string> = {
  refused: "Shopify refused it.",
  kept_failing: "Sending kept failing.",
  could_not_confirm: "RewardsPro couldn't confirm it arrived.",
};

const TAKE_BACK_LOOK: Record<LookReason, string> = {
  refused: "Shopify refused to take it back.",
  kept_failing: "Taking it back kept failing.",
  could_not_confirm: "RewardsPro couldn't confirm it was taken back.",
};

const status = (key: StatusKey, detail: string | null = null): OrderStatus => ({ key, label: STATUS_LABEL[key], detail });

/**
 * `entry` is the order's cashback ledger entry (its amount and the buyer's
 * currency) and `credit` its payout; `reversals` are the order's take-backs,
 * each its reversal entry's amount (signed or not) with its payout's state,
 * look reason and what a sent one took (`debitedAmount`, null when Shopify
 * never said).
 */
export function orderStatus(
  o: { source: "live" | "import"; test: boolean; noCashbackReason?: NoCashbackReason | null; cashbackBase?: Amount },
  entry?: { amount: Amount; currency: string } | null,
  credit?: { state: PayoutState; lookReason?: LookReason | null } | null,
  reversals: ReadonlyArray<{ amount: Amount; state: PayoutState; debitedAmount?: Amount | null; lookReason?: LookReason | null }> = [],
): OrderStatus {
  if (!entry) {
    if (o.noCashbackReason === "nothing_to_pay_on" && o.cashbackBase !== undefined && new Money(o.cashbackBase).gt(0)) {
      return status("no_cashback", RATE_GAVE_NOTHING);
    }
    const detail = o.noCashbackReason ? NO_CASHBACK[o.noCashbackReason] : o.test ? "Test order" : o.source === "import" ? "From before install" : null;
    return status("no_cashback", detail);
  }
  // Every cashback entry is written with its payout (recordOrder): none is a broken invariant
  if (!credit) return status("unknown");
  const { state } = credit;

  if (state === "needs_look") return status("needs_look", credit.lookReason ? CREDIT_LOOK[credit.lookReason] : null);
  const lookingBack = reversals.find((r) => r.state === "needs_look");
  if (lookingBack) return status("needs_look", lookingBack.lookReason ? TAKE_BACK_LOOK[lookingBack.lookReason] : "A take-back needs a look.");
  if (state === "closed") return status("no_cashback", "Closed without sending");
  if (ON_ITS_WAY.has(state)) return status("waiting", state === "unconfirmed" ? "Checking with Shopify whether it arrived" : null);

  // Sent, or nothing left to send
  const cashback = new Money(entry.amount).abs();
  const ask = (r: (typeof reversals)[number]) => new Money(r.amount).abs();
  const settled = reversals.filter((r) => r.state === "sent" || r.state === "nothing_to_send");
  const moving = reversals.filter((r) => ON_ITS_WAY.has(r.state));
  const sum = (amounts: Decimal[]) => amounts.reduce((total, amount) => total.plus(amount), new Money(0));
  // What each settled take-back took: a sent one its debitedAmount (its ask
  // when Shopify never said), one that reduced the unsent credit its ask
  const taken = sum(settled.map((r) => (r.state === "sent" && r.debitedAmount !== undefined && r.debitedAmount !== null ? new Money(r.debitedAmount) : ask(r))));
  // The sent ones whose take is known, for the shortfall sentence
  const known = settled.filter((r) => r.state === "sent" && r.debitedAmount !== undefined && r.debitedAmount !== null);
  const short = takeBackShort(sum(known.map((r) => new Money(r.debitedAmount!))), sum(known.map(ask)), entry.currency);
  const unknown = settled.some((r) => r.state === "sent" && (r.debitedAmount === undefined || r.debitedAmount === null));

  if (state === "nothing_to_send" || taken.plus(sum(moving.map(ask))).gte(cashback)) {
    if (moving.length > 0) return status("waiting", "Being taken back for a refund");
    if (state === "nothing_to_send" || taken.gte(cashback)) return status("taken_back", unknown ? AMOUNT_UNKNOWN : null);
  }
  if (moving.length > 0) return status("issued", "Part being taken back for a refund");
  if (short) return status("issued", short);
  if (taken.gt(0)) return status("issued", "Part taken back for a refund");
  if (reversals.some((r) => r.state === "closed")) return status("issued", "A take-back was closed without taking it back");
  return status("issued");
}
