// Refund side effects — runs the refund-abuse pattern check after a
// successful refund lands. Atomic gate via refunds.abuse_checked
// column so re-delivery / reconciler catch-up don't re-trigger.

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

  // Re-run refund-abuse detection — Phase C of the refunds module
  // replaces the placeholder pass in @/lib/fraud/passes that counted
  // disputes only.
  const { checkRefundAbuse } = await import("@/lib/fraud/passes");
  await checkRefundAbuse(args.userId).catch((err) =>
    console.error(`[refund-effects] abuse check failed for ${args.userId}:`, err),
  );

  void logRefundTransition({
    stripeRefundId: args.stripeRefundId,
    action: "abuse_checked",
    actorLabel: "system:refund-effects",
    reason: `Refund-abuse pattern check fired for user ${args.userId}`,
  });

  return { ran: true };
}
