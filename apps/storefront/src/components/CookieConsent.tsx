"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/lib/ui";
import {
  ANALYTICS_CONSENT_COOKIE,
  type AnalyticsConsent,
  googleAnalyticsCookieDeletionWrites,
  readAnalyticsConsent,
} from "@/lib/privacy/analytics-consent";

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
 * - Renders nothing on the server and on first paint. After mount, a visitor
 *   who has not decided sees the choices; everyone else gets a persistent
 *   Cookie settings button so changing a choice is always available.
 * - Accept / Decline both set a 1-year cookie and reload. Decline also expires
 *   every JavaScript-accessible `_ga` cookie before the reload, ensuring the
 *   server layout comes back without analytics scripts.
 *
 * Single source of truth for the cookie name — layout.tsx and the Ads
 * conversion component import it from here (same pattern as BANNER_COOKIE
 * in DevBanner).
 */

// Keep the existing import surface for layout.tsx and GoogleAdsConversion.
export { ANALYTICS_CONSENT_COOKIE };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const subscribeToNothing = () => () => undefined;
const clientHasMounted = () => true;
const serverHasMounted = () => false;

/** Client-side check: has the visitor already answered? */
export function hasAnalyticsConsentCookie(): boolean {
  return readAnalyticsConsent(document.cookie) !== null;
}

export default function CookieConsent() {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    clientHasMounted,
    serverHasMounted,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  function decide(value: AnalyticsConsent) {
    document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${value}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax`;

    if (value === "denied") {
      for (const deletion of googleAnalyticsCookieDeletionWrites(
        document.cookie,
        window.location.hostname,
      )) {
        document.cookie = deletion;
      }
    }

    // A hard reload removes already-running analytics code after withdrawal
    // and lets the server layout make a fresh script-loading decision.
    window.location.reload();
  }

  if (!mounted) return null;

  const decision: AnalyticsConsent | null = readAnalyticsConsent(document.cookie);
  const visible = settingsOpen || decision === null;

  if (!visible) {
    return (
      <button
        type="button"
        aria-expanded="false"
        aria-controls="cookie-consent-settings"
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-3 left-3 z-40 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs text-ink-muted shadow-mat transition hover:text-ink"
      >
        Cookie settings
      </button>
    );
  }

  return (
    <div
      id="cookie-consent-settings"
      role="region"
      aria-label="Cookie settings"
      className="fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-border-subtle shadow-mat px-4 py-3"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm text-ink-muted leading-snug">
          <p>
            We&apos;d like to use Google Analytics to understand visits. No
            marketing cookies. You can say no.{" "}
            <Link href="/privacy" className="text-accent underline hover:text-accent-strong">
              More in our privacy page
            </Link>
            .
          </p>
          {decision !== null && (
            <p className="mt-1 text-xs text-ink-faint" aria-live="polite">
              Analytics is currently {decision === "granted" ? "on" : "off"}.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {decision !== null && (
            <Button size="sm" variant="secondary" onClick={() => setSettingsOpen(false)}>
              Close
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => decide("denied")}>
            {decision === "granted" ? "Turn analytics off" : "No analytics"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => decide("granted")}>
            {decision === "granted" ? "Keep analytics on" : "Allow analytics"}
          </Button>
        </div>
      </div>
    </div>
  );
}
