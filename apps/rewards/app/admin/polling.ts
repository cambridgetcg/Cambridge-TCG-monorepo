import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

/**
 * How long a page follows a requested tier pass (Ruling 82): a pass the
 * after-save run doesn't finish waits for the nightly one, and an open tab
 * must not ask Shopify every few seconds for hours. The page still says
 * what is pending; the next load follows again.
 */
export const PASS_FOLLOW_MS = 2 * 60 * 1000;

/**
 * Reload the page's data every `everyMs` while `active` (Home while the
 * import runs or buyers are being placed, Tiers while buyers move). The next
 * reload is scheduled only once the last one has finished, so a slow reload
 * is never cut off by the next and two never overlap on the server; a hidden
 * tab skips its reload until it is shown again (OPERATIONS-5).
 *
 * With `forMs`, it follows for that long only, counted from the page load,
 * from each time `active` turns on, and from each change of `restartKey` (a
 * change the page made); no reload starts after that (Ruling 82).
 */
export function usePolling(active: boolean, everyMs: number, o: { forMs?: number; restartKey?: string | number } = {}): void {
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  const idle = revalidator.state === "idle";
  const { forMs, restartKey } = o;

  // When the time to follow started
  const [since, setSince] = useState(() => Date.now());
  const seen = useRef({ active, restartKey });
  useEffect(() => {
    const before = seen.current;
    seen.current = { active, restartKey };
    if ((active && !before.active) || restartKey !== before.restartKey) setSince(Date.now());
  }, [active, restartKey]);

  useEffect(() => {
    if (!active || !idle) return;
    const until = forMs === undefined ? Infinity : since + forMs;
    if (Date.now() + everyMs > until) return;
    let onVisible: (() => void) | null = null;
    const timer = setTimeout(() => {
      if (!document.hidden) {
        void revalidate.current();
        return;
      }
      onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", onVisible!);
        onVisible = null;
        if (Date.now() <= until) void revalidate.current();
      };
      document.addEventListener("visibilitychange", onVisible);
    }, everyMs);
    return () => {
      clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, idle, everyMs, forMs, since]);
}
