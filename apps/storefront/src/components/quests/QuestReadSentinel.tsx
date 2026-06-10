"use client";

/**
 * QuestReadSentinel — a tiny client leaf placed at the END of a long read
 * (tutorial, methodology page, card price story). It completes an
 * "action"-trigger quest when the reader genuinely reaches the end:
 *
 *   • scroll path — the sentinel must be in view, sustained ~1.5s
 *     (a drive-by render or redirect bounce never stamps), OR
 *   • explicit path — an "I read this" button, so screen-reader and
 *     keyboard users complete the quest the same way (the fifth question:
 *     never gate a stamp behind a sighted-scroll gesture alone).
 *
 * Privacy law (lib/quests.ts MECHANICS.privacy): this component makes
 * ZERO network calls — it only dispatches a window CustomEvent that
 * QuestTracker turns into a localStorage stamp. Solemn surfaces render
 * nothing. Already-completed quests render nothing (read-only peek at
 * the visitor's own localStorage record).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { QUEST_EVENT, QUEST_STORAGE_KEY, isSolemnPath } from "@/lib/quests";

/** The end of the page must stay in view this long before the stamp. */
const SUSTAIN_MS = 1500;

function questAlreadyComplete(quest: string): boolean {
  try {
    const raw = window.localStorage.getItem(QUEST_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { completed?: Record<string, string> };
    return Boolean(parsed?.completed?.[quest]);
  } catch {
    return false;
  }
}

export default function QuestReadSentinel({
  quest,
  label = "I read this",
  requirePathStartsWith,
}: {
  /** Quest id from QUESTS (trigger: "action"). */
  quest: string;
  /** The explicit-control label (keyboard / screen-reader path). */
  label?: string;
  /** Render only when the pathname starts with this prefix (e.g. mounted
   *  in a layout but only meaningful on sub-pages, not the index). */
  requirePathStartsWith?: string;
}) {
  const pathname = usePathname();
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  const active =
    Boolean(pathname) &&
    !isSolemnPath(pathname ?? "") &&
    (!requirePathStartsWith || (pathname ?? "").startsWith(requirePathStartsWith));

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    window.dispatchEvent(new CustomEvent(QUEST_EVENT, { detail: { id: quest } }));
    setDone(true);
  }

  useEffect(() => {
    firedRef.current = false;
    setDone(false);
    if (!active) return;
    if (questAlreadyComplete(quest)) {
      setHidden(true);
      return;
    }
    setHidden(false);

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          // Sustain before stamping — reaching the end means staying there
          // a beat, not flashing past it.
          if (!timer) timer = setTimeout(fire, SUSTAIN_MS);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
    };
    // fire is stable per mount via firedRef; pathname change re-arms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pathname, quest]);

  if (!active || hidden) return null;

  return (
    <div ref={ref} className="mt-8 text-xs text-neutral-500" data-quest-sentinel={quest}>
      {done ? (
        <span aria-live="polite">✓ noted — read to the end</span>
      ) : (
        <button
          type="button"
          onClick={fire}
          className="underline decoration-dotted underline-offset-2 hover:text-neutral-300 transition-colors"
        >
          {label} ✓
        </button>
      )}
    </div>
  );
}
