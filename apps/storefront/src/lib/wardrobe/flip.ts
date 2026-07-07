/**
 * @module @/lib/wardrobe/flip
 *
 * The instant lights flip — the wardrobe quick toggle's JS fast path.
 *
 * The Nav's lights switch is a plain <a> to /api/appearance (cookie
 * writer + back-redirect, the 2026-06-10 wardrobe idiom) so it works
 * without JS. That path costs a full navigation — measured ~3s on prod
 * (route + 302 + full SSR re-render with wholesale fetches). With JS we
 * flip perceived-instantly instead:
 *
 *   1. re-ink <html data-theme> NOW — every token is a CSS variable, so
 *      the whole page changes in one frame;
 *   2. persist the cookie in the background over the SAME url the <a>
 *      would have navigated to (redirect: "manual": the 302's Set-Cookie
 *      is applied at the network layer; the redirected page body is
 *      never downloaded).
 *
 * If the persist fails (offline), the flip stands for this page-view and
 * the next full load honestly reverts to the cookie's truth.
 */

export interface LightsFlipTarget {
  /** Concrete theme id to wear now ("gallery" | "midnight"). */
  target: string;
  /** The anchor's own href — the /api/appearance cookie-writer URL. */
  href: string;
}

export function applyLightsFlip(
  { target, href }: LightsFlipTarget,
  root: Pick<Element, "setAttribute"> = document.documentElement,
  fetchFn: typeof fetch = fetch,
): void {
  root.setAttribute("data-theme", target);
  void fetchFn(href, { redirect: "manual" }).catch(() => {
    // Offline/failed persist: the instant flip already happened; the
    // cookie keeps its old truth and the next load wears that.
  });
}
