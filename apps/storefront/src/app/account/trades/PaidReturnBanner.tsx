"use client";

/**
 * PaidReturnBanner — the page turn after payment.
 *
 * Stripe's success_url returns buyers to /account/trades?paid=<tradeId>
 * (lots: ?paidLot=<lotId>). Until the manga gallery (spec 2026-07-07
 * §2 trade flow #1) NOTHING read these params — the biggest celebration
 * gap on the platform. This banner is the acknowledgment.
 *
 * Substrate honesty: the param proves return-from-Stripe, not webhook
 * settlement. The copy says "payment sent"; the escrow status Badge in
 * the list below remains the source of truth. No fetch — the banner
 * asserts nothing it doesn't know.
 */

import { useSearchParams } from "next/navigation";
import { voice } from "@/lib/wardrobe/voice";
import { InkRule } from "@/lib/ui/InkRule";

export default function PaidReturnBanner() {
  const params = useSearchParams();
  const paidTrade = params.get("paid");
  const paidLot = params.get("paidLot");
  const reference = paidTrade ?? paidLot;
  if (!reference) return null;

  return (
    <div className="wardrobe-panel wardrobe-speedlines p-5 mb-6" role="status">
      <p className="font-display italic text-lg text-ink">
        {voice("standard", "trades.paid.title")}{" "}
        <span aria-hidden="true" className="font-semibold not-italic">ドン</span>
      </p>
      <InkRule accent className="my-3 max-w-xs" />
      <p className="text-sm text-ink-muted">{voice("standard", "trades.paid.sub")}</p>
      <p className="mt-1 font-mono text-xs text-ink-faint tabular-nums">
        {paidTrade ? "trade" : "lot"} · {reference}
      </p>
    </div>
  );
}
