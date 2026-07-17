"use client";

// The hub's battle panel while durable PVE is paused: practice battles,
// straight from /play. Suggests the first uncleared ladder level (browser-
// local clears), one press to the board. Honest about what it is.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADVENTURE_LEVELS } from "@/lib/play/adventure-levels";

const CLEARS_KEY = "ctcg-practice-clears";

export function PracticeLaunch({ pausedReason }: { pausedReason: string }) {
  const [clears, setClears] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLEARS_KEY);
      if (raw) setClears(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const next =
    ADVENTURE_LEVELS.find((l) => !clears.includes(l.id)) ??
    ADVENTURE_LEVELS[ADVENTURE_LEVELS.length - 1];

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted">
          Next opponent
        </h2>
        <Link
          href="/play/adventure"
          className="text-xs text-accent hover:text-accent-strong transition-colors"
        >
          Pick a different one &rarr;
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-3xl" aria-hidden="true">
          {next.opponentIcon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-faint">Lv.{next.id}</span>
            <span className="text-xs uppercase text-ink-muted">{next.difficulty}</span>
            {clears.length > 0 && (
              <span className="text-xs text-ok">{clears.length}/10 cleared</span>
            )}
          </div>
          <p className="font-semibold truncate">{next.title}</p>
          <p className="text-sm text-ink-muted">vs {next.opponentName}</p>
        </div>
        <Link
          href={`/play/adventure/${next.id}`}
          className="bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-8 py-3 text-lg transition-colors flex-shrink-0"
        >
          Play
        </Link>
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Practice battle — solo vs AI, runs in your browser, records nothing,
        no account needed. {pausedReason} Rewards stay off until that lands.
      </p>
    </div>
  );
}
