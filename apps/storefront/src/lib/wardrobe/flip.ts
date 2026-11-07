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
 *      the whole page changes in one frame — and point the browser bar's
 *      theme-color and the color-scheme tag at the same theme, as the
 *      next server render would (viewport.ts);
 *   2. persist the cookie in the background over the SAME url the <a>
 *      would have navigated to (redirect: "manual": the 302's Set-Cookie
 *      is applied at the network layer; the redirected page body is
 *      never downloaded).
 *
 * If the persist fails (offline), the flip stands for this page-view and
 * the next full load honestly reverts to the cookie's truth.
 *
 * The root layout never re-renders on a client navigation, so <html> keeps
 * the flip, but Next's router cache restores a route's head as it was
 * rendered (Back, Forward, a cached revisit), which can predate the flip.
 * keepThemeViewport() puts the tags back on the theme <html> wears.
 */

import { isThemeId } from "./themes";
import { themeViewport } from "./viewport";

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
  head: ParentNode = document.head,
): void {
  root.setAttribute("data-theme", target);
  applyThemeViewport(target, head);
  void fetchFn(href, { redirect: "manual" }).catch(() => {
    // Offline/failed persist: the instant flip already happened; the
    // cookie keeps its old truth and the next load wears that.
  });
}

/**
 * Rewrite the theme-color and color-scheme tags the layout rendered.
 * React owns those tags, so only their content changes: none is added or
 * removed. One colour goes on every theme-color tag (a page that followed
 * the system has two, one per media query); a pair puts each colour on
 * the tag with its media. A tag that already says the right thing is not
 * written, so keepThemeViewport's observer settles after one pass.
 */
export function applyThemeViewport(theme: string, head: ParentNode): void {
  const { themeColor, colorScheme } = themeViewport(isThemeId(theme) ? theme : null);
  for (const meta of head.querySelectorAll('meta[name="theme-color"]')) {
    const media = meta.getAttribute("media");
    const colour = typeof themeColor === "string"
      ? themeColor
      : (themeColor.find((entry) => entry.media === media) ?? themeColor[0]).color;
    setContent(meta, colour);
  }
  const scheme = head.querySelector('meta[name="color-scheme"]');
  if (scheme) setContent(scheme, colorScheme);
}

function setContent(meta: Element, content: string): void {
  if (meta.getAttribute("content") !== content) meta.setAttribute("content", content);
}

/**
 * Hold the head's theme-color and color-scheme tags to the theme <html>
 * wears, now and whenever React re-renders them. Returns the disconnect.
 */
export function keepThemeViewport(
  root: Element = document.documentElement,
  head: Node & ParentNode = document.head,
): () => void {
  const sync = () => applyThemeViewport(root.getAttribute("data-theme") ?? "", head);
  const observer = new MutationObserver(sync);
  observer.observe(head, { subtree: true, childList: true, attributes: true, attributeFilter: ["content"] });
  sync();
  return () => observer.disconnect();
}
