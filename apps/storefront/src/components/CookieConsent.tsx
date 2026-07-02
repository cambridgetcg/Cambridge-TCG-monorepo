"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/lib/ui";

/**
 * CookieConsent — the analytics consent banner.
 *
 * Default-deny: Google Analytics (and the Google Ads purchase conversion)
 * load only after the visitor explicitly accepts. The server layout reads
 * this cookie and skips the gtag <Script> tags entirely until consent is
 * "granted" — declining means the scripts never reach the browser, not
 * that they load and self-mute.
 *
 * Behaviour:
 * - Renders nothing on the server and on first paint; after mount it checks
 *   document.cookie and only appears when no decision has been recorded.
 *   (Visitors who already answered never see a flash.)
 * - Accept / Decline both set a 1-year cookie, then router.refresh() so the
 *   server layout re-renders with the new consent state.
 *
 * Single source of truth for the cookie name — layout.tsx and the Ads
 * conversion component import it from here (same pattern as BANNER_COOKIE
 * in DevBanner).
 */

// Must match what layout.tsx reads server-side.
export const ANALYTICS_CONSENT_COOKIE = "analytics-consent";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Client-side check: has the visitor already answered? */
export function hasAnalyticsConsentCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`));
}

export default function CookieConsent() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasAnalyticsConsentCookie()) setVisible(true);
  }, []);

  function decide(value: "granted" | "denied") {
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${value}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax`;
    setVisible(false);
    // Re-render the server layout so the GA scripts load (or stay absent).
    router.refresh();
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-border-subtle px-4 py-3"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-muted leading-snug">
          We&apos;d like to use Google Analytics to understand visits. No
          marketing cookies. You can say no.{" "}
          <Link href="/privacy" className="text-accent-strong underline hover:text-accent-strong">
            More in our privacy page
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => decide("denied")}>
            No thanks
          </Button>
          <Button size="sm" variant="primary" onClick={() => decide("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
