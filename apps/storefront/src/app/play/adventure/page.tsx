"use client";

// Adventure mode — ten practice battles tracing the One Piece storyline.
//
// The ladder is embedded data (adventure-levels.ts): every level is
// playable as a browser-local practice battle with no account and no
// database. Durable battles and rewards are paused while server-side
// rules validation is completed; any historical recorded progress stays
// readable below, clearly separated from browser-local practice clears.

import Link from "next/link";
import { useEffect, useState } from "react";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";
import { ADVENTURE_LEVELS } from "@/lib/play/adventure-levels";

interface RecordedProgress {
  levels: {
    level_number: number;
    progress: { cleared: boolean; clearCount: number; bestTurns: number | null } | null;
  }[];
  highestCleared: number;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-ok/10 text-ok border-ok/40",
  medium: "bg-accent-wash text-accent border-accent/40",
  hard: "bg-danger/10 text-danger border-danger/40",
  extreme: "bg-surface-subtle text-ink-muted border-border-strong",
};

const CLEARS_KEY = "ctcg-practice-clears";

export default function AdventureModePage() {
  const [localClears, setLocalClears] = useState<number[]>([]);
  const [recorded, setRecorded] = useState<RecordedProgress | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLEARS_KEY);
      if (raw) setLocalClears(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    // Historical recorded progress (signed-in accounts, read-only during
    // the pause). Degrades silently — practice needs none of it.
    let cancelled = false;
    fetch("/api/game/pve", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled && body?.levels) setRecorded(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-display font-semibold">
            Adventure mode
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-ink-muted">
            Ten battles trace the storyline, Alvida to Kaido. Practice battles
            run in your browser — free, no account, nothing recorded.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <section
          aria-labelledby="pve-status"
          className="rounded-lg border border-border-subtle bg-surface-subtle px-4 py-4"
        >
          <h2 id="pve-status" className="font-semibold text-ink text-sm">
            Rewards paused · practice open
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {PVE_AVAILABILITY.reason} Practice battles are open — they run
            locally in this browser, record nothing durable, and pay nothing.
          </p>
        </section>

        <section aria-labelledby="levels">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 id="levels" className="text-xl font-semibold">
              The ladder
            </h2>
            {localClears.length > 0 && (
              <span className="text-xs text-ink-faint">
                {localClears.length}/10 cleared in this browser
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ADVENTURE_LEVELS.map((level) => {
              const clearedHere = localClears.includes(level.id);
              const history = recorded?.levels.find(
                (l) => l.level_number === level.id,
              )?.progress;
              return (
                <article
                  key={level.id}
                  className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border text-lg ${
                        DIFFICULTY_STYLES[level.difficulty] ??
                        "border-border-subtle bg-surface-subtle text-ink-muted"
                      }`}
                      aria-hidden="true"
                    >
                      {level.opponentIcon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-ink-faint">
                          Level {level.id}
                        </span>
                        <span className="text-xs uppercase text-ink-muted">
                          {level.difficulty}
                        </span>
                        {clearedHere && (
                          <span className="text-xs text-ok font-medium">
                            ✓ cleared here
                          </span>
                        )}
                      </div>
                      <h3 className="mt-0.5 font-semibold">{level.title}</h3>
                      <p className="text-sm text-ink-muted">{level.opponentName}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-ink-muted flex-1">
                    {level.description}
                  </p>

                  <div className="mt-3 border-t border-border-subtle pt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-ink-faint">
                      {history?.cleared
                        ? `Recorded: cleared ${history.clearCount}× before the pause.`
                        : ""}
                    </span>
                    <Link
                      href={`/play/adventure/${level.id}`}
                      className="bg-ink hover:bg-ink/85 text-page text-sm font-semibold rounded-lg px-4 py-2 transition-colors flex-shrink-0"
                    >
                      Practice battle
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <nav className="flex flex-wrap gap-3 border-t border-border-subtle pt-5 text-sm">
          <Link href="/play" className="text-accent hover:text-accent-strong">
            Back to play
          </Link>
          <Link href="/play/tutorial" className="text-accent hover:text-accent-strong">
            Read the tutorial
          </Link>
          <Link href="/play/starters" className="text-accent hover:text-accent-strong">
            Pick a starter
          </Link>
        </nav>
      </div>
    </main>
  );
}
