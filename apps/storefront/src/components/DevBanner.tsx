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
// Collectors-first (2026-07-06): the old copy was shop language ("stock
// counts", "placing new orders") that read as a trading freeze on a market
// whose whole pitch is "post an ask — it can fill the moment you post". The
// house sells nothing now; every listing is a collector's. Honest + calm.
export const BANNER_COPY =
  "Cambridge TCG is a peer-to-peer collectors' market, still in active development. You trade directly with other collectors; reference prices are policy-bound guides, not offers or open-data grants. Tell us if anything looks off.";

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
