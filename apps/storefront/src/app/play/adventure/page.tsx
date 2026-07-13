"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";

interface PVELevel {
  id: string;
  level_number: number;
  title: string;
  description: string;
  opponent_name: string;
  opponent_icon: string;
  difficulty: "easy" | "medium" | "hard" | "extreme";
  progress: {
    cleared: boolean;
    clearCount: number;
    bestTurns: number | null;
  } | null;
  unlocked: boolean;
}

interface PVEData {
  levels: PVELevel[];
  highestCleared: number;
  activeGame: { gameId: string; levelId: number } | null;
  mode: "read_only";
  mutations_enabled: false;
  rewards_enabled: false;
  reason: string;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-ok/10 text-ok border-ok/40",
  medium: "bg-accent-wash text-accent border-accent/40",
  hard: "bg-danger/10 text-danger border-danger/40",
  extreme: "bg-surface-subtle text-ink-muted border-border-strong",
};

export default function AdventureModePage() {
  const [data, setData] = useState<PVEData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/game/pve", { cache: "no-store" })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("status unavailable")),
      )
      .then((body: PVEData) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Adventure status is unavailable right now.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reason = data?.reason ?? PVE_AVAILABILITY.reason;

  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
          <h1 className="text-3xl sm:text-4xl font-display font-semibold">
            Adventure mode
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base text-ink-muted">
            Levels and your existing progress remain readable. Battle actions
            and rewards are not available.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <section
          aria-labelledby="pve-status"
          className="border-y border-warning/40 bg-warning/10 px-4 py-4"
        >
          <h2 id="pve-status" className="font-semibold text-ink">
            Battles paused
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{reason}</p>
          {data?.activeGame && (
            <p className="mt-2 text-xs text-ink-faint">
              An unfinished battle is recorded for this account. It remains
              read-only during the pause.
            </p>
          )}
        </section>

        {error && (
          <p className="border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        {!data && !error && (
          <p className="py-8 text-sm text-ink-muted">Loading level status...</p>
        )}

        {data && (
          <section aria-labelledby="level-status">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 id="level-status" className="text-xl font-semibold">
                  Level status
                </h2>
                <p className="mt-1 text-xs text-ink-faint">
                  Highest recorded clear: {data.highestCleared}
                </p>
              </div>
              <span className="text-xs font-medium uppercase text-ink-faint">
                Read only
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.levels.map((level) => {
                const progress = level.progress;
                return (
                  <article
                    key={level.id}
                    className="rounded-lg border border-border-subtle bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border text-lg ${
                          DIFFICULTY_STYLES[level.difficulty] ??
                          "border-border-subtle bg-surface-subtle text-ink-muted"
                        }`}
                        aria-hidden="true"
                      >
                        {level.opponent_icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-ink-faint">
                            Level {level.level_number}
                          </span>
                          <span className="text-xs uppercase text-ink-muted">
                            {level.difficulty}
                          </span>
                        </div>
                        <h3 className="mt-0.5 font-semibold">{level.title}</h3>
                        <p className="text-sm text-ink-muted">
                          {level.opponent_name}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                      {level.description}
                    </p>
                    <p className="mt-3 border-t border-border-subtle pt-3 text-xs text-ink-faint">
                      {progress?.cleared
                        ? `Previously cleared ${progress.clearCount} time${
                            progress.clearCount === 1 ? "" : "s"
                          }${
                            progress.bestTurns
                              ? `; best ${progress.bestTurns} turns`
                              : ""
                          }.`
                        : level.unlocked
                          ? "No recorded clear."
                          : "Not previously unlocked."}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <nav className="flex flex-wrap gap-3 border-t border-border-subtle pt-5 text-sm">
          <Link href="/play" className="text-accent hover:text-accent-strong">
            Back to play status
          </Link>
          <Link
            href="/play/tutorial"
            className="text-accent hover:text-accent-strong"
          >
            Read the tutorial
          </Link>
          <Link
            href="/deck-builder"
            className="text-accent hover:text-accent-strong"
          >
            Open deck builder
          </Link>
        </nav>
      </div>
    </main>
  );
}
