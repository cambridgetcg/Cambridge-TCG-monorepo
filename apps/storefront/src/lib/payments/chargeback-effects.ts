// Chargeback side effects: honest fraud-signal record + governance
// log + trust recompute.
//
// De-duped by the chargebacks.fraud_emitted column so webhook
// re-delivery and reconciler catch-up share one-shot semantics.
// Without this, a chronic webhook-retry loop would re-emit the same
// record repeatedly + spam the governance log. Recording the
// chargeback protects the counterparty; no person-level action is taken.

import { query } from "@/lib/db";
import { emitSignal, SIGNAL_DEFS } from "@/lib/fraud/detection";
import { logAdminAction } from "@/lib/admin/governance-log";
import { logChargebackTransition } from "./chargeback-log";

export interface HandleNewChargebackArgs {
  stripeDisputeId: string;
  userId: string;
  amountGbp: number;
  stripeReason: string | null;
}

/**
 * One-shot side-effect fan-out for a freshly-received chargeback.
 * Idempotent via the chargebacks.fraud_emitted gate — a re-call
 * checks the gate atomically and no-ops on second touch.
 */
export async function handleNewChargeback(args: HandleNewChargebackArgs): Promise<{ ran: boolean }> {
  // Atomic gate: flip fraud_emitted false→true; if the UPDATE
  // returns 0 rows the gate was already flipped (re-delivery).
  const gateRes = await query(
    `UPDATE chargebacks
        SET fraud_emitted = true, updated_at = NOW()
      WHERE stripe_dispute_id = $1 AND fraud_emitted = false
      RETURNING stripe_dispute_id`,
    [args.stripeDisputeId],
  );
  if (gateRes.rowCount === 0) {
    return { ran: false };
  }

  // Emit CHARGEBACK fraud signal (closes the documented gap in
  // SIGNAL_DEFS — taxonomy entry existed since Phase A of fraud module
  // but had no producer). This is an honest record of what happened,
  // surfaced for human review; it protects the counterparty and takes
  // no automatic person-level action.
  const description = `Chargeback £${args.amountGbp.toFixed(2)} filed${args.stripeReason ? ` — ${args.stripeReason}` : ""}`;
  await emitSignal({
    userId: args.userId,
    def: SIGNAL_DEFS.CHARGEBACK,
    description,
    dedupeKey: `chargeback:${args.stripeDisputeId}`,
  });

  // Governance log row for the chargeback so /admin/governance has an
  // honest record of what happened and when.
  void logAdminAction({
    actorLabel: "system:chargeback-handler",
    targetUserId: args.userId,
    targetKind: "user",
    targetId: args.userId,
    action: "user.chargeback_received",
    afterValue: {
      stripe_dispute_id: args.stripeDisputeId,
      amount_gbp: args.amountGbp,
    },
    reason: description,
  });

  void logChargebackTransition({
    stripeDisputeId: args.stripeDisputeId,
    action: "fraud_emitted",
    actorLabel: "system:chargeback-handler",
    reason: "Chargeback recorded",
  });

  return { ran: true };
}
