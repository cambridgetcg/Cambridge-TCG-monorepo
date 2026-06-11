"use client";

import { useEffect } from "react";
import { ANALYTICS_CONSENT_COOKIE } from "@/components/CookieConsent";

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
    // Consent gate — the conversion only fires when the visitor accepted
    // analytics via the CookieConsent banner. Without consent the layout
    // never loads gtag, so window.gtag is undefined anyway; this check
    // makes the intent explicit rather than incidental.
    const consented = document.cookie
      .split("; ")
      .includes(`${ANALYTICS_CONSENT_COOKIE}=granted`);
    if (!consented) return;

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
