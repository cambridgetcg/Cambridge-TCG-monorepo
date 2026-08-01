export type PaymentReturnState =
  | "checking"
  | "trade_advanced"
  | "still_awaiting"
  | "still_awaiting_manual"
  | "window_closed_reconcile"
  | "cancelled_reconcile"
  | "unavailable";

export interface PaymentReturnTradeSnapshot {
  escrow_status: string;
  payment_expires_at?: string | null;
}

export function isPaymentWindowOpen(
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const deadline = new Date(expiresAt).getTime();
  return Number.isFinite(deadline) && deadline > nowMs;
}

const PAYMENT_STEP_PASSED = new Set([
  "paid",
  "awaiting_shipment",
  "shipped_to_ctcg",
  "received_by_ctcg",
  "verified",
  "shipped_to_buyer",
  "completed",
  "disputed",
  "refunded",
]);

export function classifyPaymentReturn(
  trade: PaymentReturnTradeSnapshot,
  nowMs = Date.now(),
): PaymentReturnState {
  if (PAYMENT_STEP_PASSED.has(trade.escrow_status)) return "trade_advanced";
  if (trade.escrow_status === "cancelled") return "cancelled_reconcile";
  if (trade.escrow_status !== "awaiting_payment") return "unavailable";

  if (!isPaymentWindowOpen(trade.payment_expires_at, nowMs)) {
    return "window_closed_reconcile";
  }
  return "still_awaiting";
}

export const PAYMENT_RETURN_COPY: Record<PaymentReturnState, {
  title: string;
  body: string;
}> = {
  checking: {
    title: "Back from checkout — checking this trade",
    body: "This return link is not proof of payment. We’re checking Cambridge’s participant-only trade record now.",
  },
  trade_advanced: {
    title: "The trade has moved past the payment step",
    body: "Cambridge’s trade record has advanced. Use the timeline below for the current shipping, dispute, or completion step.",
  },
  still_awaiting: {
    title: "Confirmation has not reached the trade yet",
    body: "Do not open another checkout. A success return can arrive before the provider webhook, so we’ll check again shortly.",
  },
  still_awaiting_manual: {
    title: "Confirmation has not reached the trade yet",
    body: "Automatic checks have finished. Do not open another checkout. Use Check again once, or contact support with the trade reference.",
  },
  window_closed_reconcile: {
    title: "Payment timing needs reconciliation",
    body: "The payment window closed before this trade advanced. Do not pay again. Refresh once, then contact support with the trade reference if it stays here.",
  },
  cancelled_reconcile: {
    title: "This trade is cancelled; payment is not inferred",
    body: "The return link cannot tell us whether funds moved. Do not retry payment. Contact support with the trade reference so the provider record can be checked.",
  },
  unavailable: {
    title: "We couldn’t verify the trade just now",
    body: "Do not start another payment from this return link. Refresh or contact support with the trade reference before trying again.",
  },
};
