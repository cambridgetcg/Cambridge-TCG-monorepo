/**
 * DevBanner — temporary site-wide notice (remove when storefront is ready).
 *
 * To find and remove: search for "temporary" in git log, or delete this file
 * and remove <DevBanner /> + the cookies/headers logic from src/app/layout.tsx.
 *
 * Behaviour:
 * - Server-rendered: never flashes in late.
 * - Hidden on /admin paths: layout.tsx reads middleware-forwarded x-pathname header
 *   before deciding whether to render this component at all.
 * - Dismissible per session: dismiss button sets a session cookie
 *   (no max-age → expires on browser close). On the next visit the banner re-appears.
 */

import DevBannerDismiss from "./DevBannerDismiss";

// Single source of truth — edit copy here.
//
// Current product boundary; existing-account support remains available.
export const BANNER_COPY =
  "New paid orders and subscriptions are retired. Existing records, settlement and refunds remain available through your account.";

// Must match the cookie name used in DevBannerDismiss.
export const BANNER_COOKIE = "banner-dev-notice";

export default function DevBanner() {
  return (
    <div
      id="dev-banner"
      role="region"
      aria-label="Site notice"
      aria-live="polite"
      className="w-full bg-warning/10 border-b border-warning/30 px-4 py-2.5 text-ink"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Single line on desktop (truncates with tooltip); wraps on mobile */}
        <p
          className="min-w-0 flex-1 text-sm font-medium leading-snug
                     sm:truncate sm:whitespace-nowrap"
          title={BANNER_COPY}
        >
          {BANNER_COPY}
        </p>

        <DevBannerDismiss />
      </div>
    </div>
  );
}
