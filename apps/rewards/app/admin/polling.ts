import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

/**
 * Reload the page's data every `everyMs` while `active` (Home while the
 * import runs or buyers are being placed, Tiers while buyers move). The next
 * reload is scheduled only once the last one has finished, so a slow reload
 * is never cut off by the next and two never overlap on the server; a hidden
 * tab skips its reload until it is shown again (OPERATIONS-5).
 */
export function usePolling(active: boolean, everyMs: number): void {
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  const idle = revalidator.state === "idle";

  useEffect(() => {
    if (!active || !idle) return;
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
        void revalidate.current();
      };
      document.addEventListener("visibilitychange", onVisible);
    }, everyMs);
    return () => {
      clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, idle, everyMs]);
}
