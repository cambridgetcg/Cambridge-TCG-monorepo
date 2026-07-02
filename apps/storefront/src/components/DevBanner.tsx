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
// Orders are genuinely paused right now, so this stays a true "not yet"
// notice (substrate honesty). It leads with the clear fact, then reassures
// anyone who already ordered. Shown in full — never truncated (see below).
export const BANNER_COPY =
  "Cambridge TCG is still in active development — we're not taking new orders just yet. Feel free to look around; prices and stock counts may still shift. If you've already placed an order, it will be processed and shipped as normal. Thanks for your patience.";

// Must match the cookie name used in DevBannerDismiss.
export const BANNER_COOKIE = "banner-dev-notice";

export default function DevBanner() {
  return (
    <div
      id="dev-banner"
      role="region"
      aria-label="Site notice"
      aria-live="polite"
      className="w-full bg-accent-strong px-4 py-2.5 text-amber-950"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Always shown in full — wraps on every screen size. The previous
            sm:truncate hid the reassuring "already-placed orders ship as
            normal" half on desktop, leaving only the scary fragment. */}
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
          {BANNER_COPY}
        </p>

        <DevBannerDismiss />
      </div>
    </div>
  );
}
