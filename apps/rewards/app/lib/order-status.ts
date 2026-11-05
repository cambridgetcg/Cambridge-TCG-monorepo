import type { LookReason, NoCashbackReason, PayoutState } from "@prisma/client";
import type { Decimal } from "decimal.js";
import { Money } from "./money";

/**
 * An order's status on the Orders page (spec 4.6), from its cashback entry,
 * that entry's credit payout and its take-backs (reversal payouts). No
 * database here, so it is tested on its own; stats.server re-exports it.
 *
 * - No cashback entry: No cashback, saying why (the order's
 *   noCashbackReason).
 * - A credit or a take-back that needs a look: Needs a look, whatever else
 *   is true (it wins over Issued and Taken back).
 * - A credit closed without sending: No cashback.
 * - A credit not settled yet (pending, sending, unconfirmed, held): Waiting.
 * - Take-backs that took all the cashback: Taken back; Waiting while one of
 *   them is still on its way. A credit with nothing left to send was all
 *   taken back before it went out.
 * - Otherwise the credit went out: Issued, saying what part a refund took.
 * A take-back closed without taking anything takes nothing. One that fell
 * short (Ruling 35) took all it asked for on the ledger; the buyer had spent
 * the rest, which the detail says.
 */

export type OrderStatusLabel = "Issued" | "Waiting" | "Taken back" | "Needs a look" | "No cashback";

export type OrderStatus = { label: OrderStatusLabel; detail: string | null };

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

const ON_ITS_WAY: ReadonlySet<PayoutState> = new Set(["pending", "sending", "unconfirmed", "held"]);

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

const SPENT = "Part of it couldn't be taken back: the buyer had spent it";

/**
 * `entry` is the order's cashback ledger entry and `credit` its payout;
 * `reversals` are the order's take-backs, each its reversal entry's amount
 * (signed or not) with its payout's state, look reason and shortfall.
 */
export function orderStatus(
  o: { source: "live" | "import"; test: boolean; noCashbackReason?: NoCashbackReason | null },
  entry?: { amount: Amount } | null,
  credit?: { state: PayoutState; lookReason?: LookReason | null } | null,
  reversals: ReadonlyArray<{ amount: Amount; state: PayoutState; shortfall?: Amount | null; lookReason?: LookReason | null }> = [],
): OrderStatus {
  if (!entry) {
    const detail = o.noCashbackReason ? NO_CASHBACK[o.noCashbackReason] : o.test ? "Test order" : o.source === "import" ? "From before install" : null;
    return { label: "No cashback", detail };
  }
  // Every cashback entry is written with its payout (recordOrder): none yet reads as not sent
  const state = credit?.state ?? "pending";

  if (state === "needs_look") {
    return { label: "Needs a look", detail: credit?.lookReason ? CREDIT_LOOK[credit.lookReason] : null };
  }
  const lookingBack = reversals.find((r) => r.state === "needs_look");
  if (lookingBack) {
    return { label: "Needs a look", detail: lookingBack.lookReason ? TAKE_BACK_LOOK[lookingBack.lookReason] : "A take-back needs a look." };
  }
  if (state === "closed") return { label: "No cashback", detail: "Closed without sending" };
  if (ON_ITS_WAY.has(state)) {
    return { label: "Waiting", detail: state === "unconfirmed" ? "Checking with Shopify whether it arrived" : null };
  }

  // Sent, or nothing left to send
  const taking = reversals.filter((r) => r.state !== "closed");
  const taken = taking.reduce((sum, r) => sum.plus(new Money(r.amount).abs()), new Money(0));
  const all = state === "nothing_to_send" || taken.gte(new Money(entry.amount).abs());
  const moving = taking.some((r) => ON_ITS_WAY.has(r.state));
  const short = taking.some((r) => r.shortfall !== undefined && r.shortfall !== null && new Money(r.shortfall).gt(0));

  if (all) {
    if (moving) return { label: "Waiting", detail: "Being taken back for a refund" };
    return { label: "Taken back", detail: short ? SPENT : null };
  }
  if (moving) return { label: "Issued", detail: "Part being taken back for a refund" };
  if (taken.gt(0)) return { label: "Issued", detail: short ? SPENT : "Part taken back for a refund" };
  if (reversals.some((r) => r.state === "closed")) return { label: "Issued", detail: "A take-back was closed without taking it back" };
  return { label: "Issued", detail: null };
}
