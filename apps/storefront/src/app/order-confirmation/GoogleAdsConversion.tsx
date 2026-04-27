"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function GoogleAdsConversion({
  value,
  transactionId,
  currency,
}: {
  value: number;
  transactionId: string;
  currency: string;
}) {
  useEffect(() => {
    if (typeof window.gtag === "function") {
      // Google Ads purchase conversion
      window.gtag("event", "conversion", {
        send_to: "AW-16597058275/hsOCCMn0p8YZEOOFjOo9",
        value,
        currency,
        transaction_id: transactionId,
      });

      // GA4 purchase event
      window.gtag("event", "purchase", {
        value,
        currency,
        transaction_id: transactionId,
      });
    }
  }, [value, transactionId, currency]);

  return null;
}
