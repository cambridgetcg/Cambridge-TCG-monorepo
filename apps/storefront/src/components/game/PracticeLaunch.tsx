"use client";

// Browser practice is independent of account and server-progress availability.
// Suggest the first uncleared level from the local practice ladder.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADVENTURE_LEVELS } from "@/lib/play/adventure-levels";
import { LinkButton } from "@/lib/ui/Button";

const CLEARS_KEY = "ctcg-practice-clears";

export function PracticeLaunch() {
  const [clears, setClears] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLEARS_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const knownLevels = new Set(ADVENTURE_LEVELS.map((level) => level.id));
      setClears([...new Set(saved.filter((id): id is number =>
        typeof id === "number" && Number.isInteger(id) && knownLevels.has(id),
      ))]);
    } catch {
      /* ignore */
    }
  }, []);

  const next =
    ADVENTURE_LEVELS.find((l) => !clears.includes(l.id)) ??
    ADVENTURE_LEVELS[ADVENTURE_LEVELS.length - 1];

  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-ink">
          Browser practice
        </h2>
        <Link
          href="/play/adventure"
          className="inline-flex min-h-11 items-center text-sm text-accent hover:underline"
        >
          Choose an opponent
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>Level {next.id}</span>
            <span className="capitalize">{next.difficulty}</span>
            {clears.length > 0 && (
              <span>{clears.length}/{ADVENTURE_LEVELS.length} cleared in this browser</span>
            )}
          </div>
          <h3 className="mt-1 font-semibold text-ink">{next.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">Practice against {next.opponentName}</p>
        </div>
        <LinkButton
          href={`/play/adventure/${next.id}`}
          className="w-full sm:w-auto sm:shrink-0"
        >
          Start practice
        </LinkButton>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink-muted">
        Solo practice against AI, no account needed. Battle state, starter
        choice, and clears can be saved in this browser only; no results are
        recorded on the server. Practice does not award rewards.
      </p>
    </div>
  );
}
