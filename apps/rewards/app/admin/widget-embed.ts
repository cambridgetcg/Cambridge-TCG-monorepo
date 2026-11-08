import { useCallback, useEffect, useRef, useState } from "react";
import { widgetEmbedOn } from "~/admin/home-rules";

/** Focus and visibilitychange both fire on one return to the tab; closer returns than this count once. */
const RETURN_GAP_MS = 10_000;

export interface WidgetEmbed {
  /** Whether the widget embed is on, once App Bridge says; null until then or when it can't. */
  on: boolean | null;
  /** Ask App Bridge again ("Check again"). */
  recheck: () => void;
  /** How many times the merchant has come back to the tab, so the page can restart its polling. */
  returns: number;
}

/**
 * The guide's widget check (spec 4.7, Built for Shopify 4.2.3): Home's
 * `useWidgetEmbed` (app._index.tsx), asked again when the merchant comes back
 * from the theme editor (window focus, or the tab shown again) and on
 * `recheck()`. Only the latest ask's answer is kept, and none after unmount.
 */
export function useWidgetEmbed(): WidgetEmbed {
  const [on, setOn] = useState<boolean | null>(null);
  const [returns, setReturns] = useState(0);
  const live = useRef(false);
  const latest = useRef(0);

  const ask = useCallback(() => {
    if (typeof shopify === "undefined" || typeof shopify.app?.extensions !== "function") return;
    const n = ++latest.current;
    const current = () => live.current && n === latest.current;
    // Inside the chain, so a throw at once from App Bridge, or from reading its
    // answer, is "can't tell" like a refusal, never an error out of the page
    Promise.resolve()
      .then(() => shopify.app.extensions())
      .then((extensions) => widgetEmbedOn(extensions))
      .then(
        (embedOn) => current() && setOn(embedOn),
        () => current() && setOn(null),
      );
  }, []);

  useEffect(() => {
    live.current = true;
    let lastReturn = -Infinity;
    const onReturn = () => {
      const now = Date.now();
      if (now - lastReturn < RETURN_GAP_MS) return;
      lastReturn = now;
      setReturns((count) => count + 1);
      ask();
    };
    const onVisibility = () => {
      if (!document.hidden) onReturn();
    };
    ask();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live.current = false;
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ask]);

  return { on, recheck: ask, returns };
}
