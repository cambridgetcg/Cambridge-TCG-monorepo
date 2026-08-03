"use client";

/**
 * PaidReturnBanner — the page turn after returning from Checkout.
 *
 * A success query parameter proves only navigation. For market trades we
 * read the participant-only trade endpoint and poll briefly for webhook
 * convergence. We never create another Checkout Session from this banner.
 * Lot trades do not yet expose an equivalent participant status endpoint,
 * so their return remains explicitly unverified.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PAYMENT_RETURN_COPY,
  classifyPaymentReturn,
  type PaymentReturnState,
} from "@/lib/market/payment-return";
import { readMarketTradePaymentStatus } from "@/lib/market/payment-return-client";
import { InkRule } from "@/lib/ui/InkRule";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLL_DELAYS_MS = [0, 1_500, 3_000, 6_000] as const;

export default function PaidReturnBanner() {
  const params = useSearchParams();
  const paidTrade = params.get("paid");
  const paidLot = params.get("paidLot");
  const reference = paidTrade ?? paidLot;
  const [observation, setObservation] = useState<{
    tradeId: string;
    refreshVersion: number;
    state: PaymentReturnState;
  } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const checkableTradeId = paidTrade && UUID_PATTERN.test(paidTrade) ? paidTrade : null;
  const state: PaymentReturnState = !reference
    ? "checking"
    : !checkableTradeId
      ? "unavailable"
      : observation?.tradeId === checkableTradeId
          && observation.refreshVersion === refreshVersion
        ? observation.state
        : "checking";

  useEffect(() => {
    // The legacy lot success URL carries a lot-trade id, but no participant
    // status endpoint exists for that row yet. Stay honest instead of reading
    // the public lot or treating the URL as a payment receipt.
    if (!checkableTradeId) return;
    const tradeId = checkableTradeId;

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function check(attempt: number): Promise<void> {
      try {
        const snapshot = await readMarketTradePaymentStatus(tradeId, {
          signal: controller.signal,
        });
        const next = classifyPaymentReturn(snapshot);
        const finalAutomaticCheck = attempt + 1 === POLL_DELAYS_MS.length;
        const displayedState = next === "still_awaiting" && finalAutomaticCheck
          ? "still_awaiting_manual"
          : next;
        if (!controller.signal.aborted) {
          setObservation({ tradeId, refreshVersion, state: displayedState });
        }
        if (next === "still_awaiting" && attempt + 1 < POLL_DELAYS_MS.length) {
          timeout = setTimeout(() => void check(attempt + 1), POLL_DELAYS_MS[attempt + 1]);
        }
      } catch {
        if (!controller.signal.aborted) {
          setObservation({ tradeId, refreshVersion, state: "unavailable" });
        }
      }
    }

    void check(0);
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [checkableTradeId, refreshVersion]);

  if (!reference) return null;
  const copy = PAYMENT_RETURN_COPY[state];

  return (
    <div className="wardrobe-panel wardrobe-speedlines p-5 mb-6" role="status" aria-live="polite">
      <p className="font-display italic text-lg text-ink">
        {copy.title}{" "}
        <span aria-hidden="true" className="font-semibold not-italic">
          {state === "trade_advanced" ? "ドン" : "…"}
        </span>
      </p>
      <InkRule accent className="my-3 max-w-xs" />
      <p className="text-sm text-ink-muted">{copy.body}</p>
      <p className="mt-1 font-mono text-xs text-ink-faint tabular-nums">
        {paidTrade ? "trade" : "lot"} · {reference}
      </p>
      {state !== "trade_advanced" && state !== "checking" && checkableTradeId && (
        <button
          type="button"
          onClick={() => setRefreshVersion((version) => version + 1)}
          className="mt-3 rounded-md border border-border-subtle px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-subtle"
        >
          Check again
        </button>
      )}
    </div>
  );
}
