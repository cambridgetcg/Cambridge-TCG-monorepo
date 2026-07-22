// Refund side effects — records that a successful refund landed.
// Atomic gate via refunds.abuse_checked column so re-delivery /
// reconciler catch-up don't re-trigger. (The column name is legacy;
// no person-level abuse action is taken — escrow already protects the
// counterparty by holding funds until receipt is confirmed.)

import { query } from "@/lib/db";
import { logRefundTransition } from "./refund-log";

export interface HandleRefundReceivedArgs {
  stripeRefundId: string;
  userId: string;
  amountGbp: number;
}

export async function handleRefundReceived(args: HandleRefundReceivedArgs): Promise<{ ran: boolean }> {
  // Atomic gate: flip abuse_checked false→true; rowCount=0 → already done.
  const gateRes = await query(
    `UPDATE refunds
        SET abuse_checked = true, updated_at = NOW()
      WHERE stripe_refund_id = $1 AND abuse_checked = false
      RETURNING stripe_refund_id`,
    [args.stripeRefundId],
  );
  if (gateRes.rowCount === 0) return { ran: false };

  void logRefundTransition({
    stripeRefundId: args.stripeRefundId,
    action: "abuse_checked",
    actorLabel: "system:refund-effects",
    reason: `Refund recorded for user ${args.userId}`,
  });

  return { ran: true };
}
