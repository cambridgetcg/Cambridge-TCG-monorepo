"use client";

/**
 * QuestClickTarget — a tiny client leaf that wraps existing server-rendered
 * markup (e.g. a castle insight card) and completes an "action"-trigger
 * quest when the visitor genuinely interacts with it: a pointer click
 * anywhere on the wrapped content, or the visually-hidden button for
 * keyboard / screen-reader users (sr-only, becomes visible on focus).
 *
 * The wrapped content keeps its normal semantics — no role="button" on the
 * wrapper, so assistive tech still reads the content as content.
 *
 * Privacy law (lib/quests.ts MECHANICS.privacy): zero network calls — only
 * a window CustomEvent that QuestTracker turns into a localStorage stamp.
 */

import { QUEST_EVENT } from "@/lib/quests";

export default function QuestClickTarget({
  quest,
  actionLabel,
  children,
}: {
  /** Quest id from QUESTS (trigger: "action"). */
  quest: string;
  /** Label for the keyboard/screen-reader path, e.g. "Open this insight". */
  actionLabel: string;
  children: React.ReactNode;
}) {
  function fire() {
    window.dispatchEvent(new CustomEvent(QUEST_EVENT, { detail: { id: quest } }));
  }

  return (
    <div onClick={fire}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          fire();
        }}
        className="sr-only focus:not-sr-only focus:inline-block focus:text-xs focus:text-amber-400 focus:mb-1"
      >
        {actionLabel}
      </button>
      {children}
    </div>
  );
}
