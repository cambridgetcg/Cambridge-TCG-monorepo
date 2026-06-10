"use client";

/**
 * QuestTracker — the client half of the quest engine. Mounted once in the
 * root layout; makes the VISIT the game.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!" Corpus + rules: src/lib/quests.ts.
 *
 * What it does, in full:
 *  • On every route change to a NON-SOLEMN page, records today's date into
 *    the practice-days set (a tally that only counts UP — no broken-streak
 *    state exists). The solemn check runs before the visit write: the game
 *    does not exist on those surfaces, not even as a date.
 *  • If the current path completes a visit-triggered quest (or advances a
 *    multi-page one), stamps it in localStorage under QUEST_STORAGE_KEY.
 *    Dwell quests stamp only after the visitor actually stays (a redirect
 *    bounce doesn't count). Action quests are NEVER stamped by a page
 *    load — pages dispatch QUEST_EVENT when the real deed happens
 *    (validator verdict, fairness recompute passed, insight click,
 *    server-verified win) and this component stamps on that event.
 *  • Shows ONE small, self-dismissing toast per stamp ("✦ quest complete:
 *    <title>") — bottom corner, visible ~3.5s then gone, no buttons, no
 *    sound, never more than one at a time, never repeats a completed
 *    quest, and honours both prefers-reduced-motion and the visitor's
 *    persistent quiet-mode flag. Solemn surfaces never stamp and never
 *    celebrate.
 *  • After every localStorage write it dispatches QUEST_PROGRESS_WRITTEN
 *    (a window CustomEvent, same-tab only) so the quest board can re-read
 *    without a reload. Like everything here, the event never leaves the
 *    browser.
 *
 * ZERO NETWORK CALLS — by design, verifiably. No fetch, no analytics
 * event, no beacon fires anywhere in this file or in lib/quests.ts. The
 * visitor's progress lives only in their browser; the platform cannot see
 * it, and /methodology/quests invites anyone to confirm that in the
 * network tab. That promise is the feature.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  QUEST_EVENT,
  QUEST_PROGRESS_WRITTEN,
  QUEST_STORAGE_KEY,
  QUESTS_VERSION,
  isSolemnPath,
  localDayStamp,
  matchQuestsForPath,
  questById,
  type Quest,
} from "@/lib/quests";

/** The localStorage record. The exported JSON file IS the canonical record.
 *  Each completed stamp is quest id → ISO date — nothing more; the single
 *  top-level `note` says the whole record is client-side. */
interface QuestProgress {
  version: string;
  /** quest id → ISO date stamped */
  completed: Record<string, string>;
  /** multi-page quests: quest id → (step path → ISO date) */
  steps: Record<string, Record<string, string>>;
  /** distinct local days (YYYY-MM-DD) on which the visitor was here */
  visits: string[];
  /** persistent quiet mode: stamp silently, no toast */
  quiet?: boolean;
  note: string;
}

function emptyProgress(): QuestProgress {
  return {
    version: QUESTS_VERSION,
    completed: {},
    steps: {},
    visits: [],
    note:
      "client_side: true — this record lives only in your browser. " +
      "Rules: /methodology/quests",
  };
}

function readProgress(): QuestProgress {
  try {
    const raw = window.localStorage.getItem(QUEST_STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<QuestProgress>;
    return {
      ...emptyProgress(),
      ...parsed,
      completed: parsed.completed ?? {},
      steps: parsed.steps ?? {},
      visits: Array.isArray(parsed.visits) ? parsed.visits : [],
    };
  } catch {
    // Unreadable record (private mode, corruption): start fresh in memory.
    return emptyProgress();
  }
}

function writeProgress(p: QuestProgress): void {
  try {
    window.localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(p));
    // Same-tab signal so the quest board re-reads without a reload (the
    // `storage` event only fires in OTHER tabs). Never leaves the browser.
    window.dispatchEvent(new CustomEvent(QUEST_PROGRESS_WRITTEN));
  } catch {
    // Storage unavailable — the game degrades silently, never blocks the visit.
  }
}

export default function QuestTracker() {
  const pathname = usePathname();
  const [toast, setToast] = useState<{ title: string; key: number } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  // One toast per page view, max — even if two quests complete at once.
  const toastedThisView = useRef(false);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Stamp a quest (read-modify-write so parallel tabs aren't clobbered)
   *  and queue the one allowed toast. Never repeats a completed quest. */
  function stamp(quest: Quest) {
    const progress = readProgress();
    if (progress.completed[quest.id]) return;
    progress.completed[quest.id] = new Date().toISOString();
    writeProgress(progress);
    if (!progress.quiet && !toastedThisView.current) {
      toastedThisView.current = true;
      setToast({ title: quest.title, key: Date.now() });
    }
  }

  // ── The visit is the game: evaluate the corpus on every route change ──
  useEffect(() => {
    if (!pathname) return;
    toastedThisView.current = false;

    // Solemn surfaces: no stamps, no toasts, no visit write — the game does
    // not exist here, so the day isn't recorded either. This check MUST
    // precede the tally write: the rulebook says the tally counts distinct
    // days on which a non-solemn page was visited, and this ordering is
    // what makes that sentence true.
    if (isSolemnPath(pathname)) {
      setToast(null);
      return;
    }

    const progress = readProgress();

    // Practice-days tally — counts up only; a gap is just a gap.
    const today = localDayStamp();
    if (!progress.visits.includes(today)) {
      progress.visits.push(today);
      writeProgress(progress);
    }

    for (const match of matchQuestsForPath(pathname)) {
      const quest = match.quest;
      if (progress.completed[quest.id]) continue;

      if (match.kind === "step" && quest.steps && match.step) {
        // Multi-page quest: record this door, complete at the threshold.
        const fresh = readProgress();
        const stepRecord = fresh.steps[quest.id] ?? {};
        if (!stepRecord[match.step]) {
          stepRecord[match.step] = new Date().toISOString();
          fresh.steps[quest.id] = stepRecord;
          writeProgress(fresh);
        }
        if (Object.keys(stepRecord).length >= quest.steps.required) {
          stamp(quest);
        }
      } else if (quest.dwell_ms) {
        // Dwell quest: stamp only if the visitor actually stays.
        if (dwellTimer.current) clearTimeout(dwellTimer.current);
        dwellTimer.current = setTimeout(() => stamp(quest), quest.dwell_ms);
      } else {
        stamp(quest);
      }
    }

    return () => {
      // Leaving before the dwell elapses cancels it — a bounce doesn't count.
      if (dwellTimer.current) {
        clearTimeout(dwellTimer.current);
        dwellTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Action quests: pages dispatch QUEST_EVENT when the real deed happens ──
  useEffect(() => {
    function onQuestAction(e: Event) {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const quest = questById(id);
      if (!quest) return;
      if (isSolemnPath(window.location.pathname)) return;
      stamp(quest);
    }
    window.addEventListener(QUEST_EVENT, onQuestAction);
    return () => window.removeEventListener(QUEST_EVENT, onQuestAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toast lifecycle: appear, visible ~3.5s, fade, gone (no buttons) ──
  useEffect(() => {
    if (!toast) return;
    setToastVisible(false);
    const show = requestAnimationFrame(() => setToastVisible(true));
    const fade = setTimeout(() => setToastVisible(false), 3500);
    const gone = setTimeout(() => setToast(null), 4100);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      key={toast.key}
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border border-amber-500/30 bg-neutral-900/95 px-3.5 py-2 text-sm text-amber-200 shadow-lg transition-opacity duration-500 motion-reduce:transition-none ${
        toastVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      ✦ quest complete: {toast.title}
    </div>
  );
}
