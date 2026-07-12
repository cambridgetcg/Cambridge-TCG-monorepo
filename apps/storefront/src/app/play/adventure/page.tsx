"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  loadSavedDecks,
  deckToCards,
  fetchStarterAsSavedDeck,
  type SavedDeck,
} from "@/lib/play/client-deck";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PVELevel {
  id: string;
  level_number: number;
  title: string;
  description: string;
  opponent_name: string;
  opponent_icon: string;
  difficulty: "easy" | "medium" | "hard" | "extreme";
  first_clear_points: number;
  first_clear_credit: number;
  repeat_points: number;
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
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  easy:    { bg: "bg-ok/10",  text: "text-ok",  border: "border-ok/50" },
  medium:  { bg: "bg-accent-wash",  text: "text-accent",  border: "border-accent/50" },
  hard:    { bg: "bg-danger/10",  text: "text-danger",  border: "border-danger/50" },
  extreme: { bg: "bg-[#6a5a8f]/15", text: "text-[#6a5a8f]", border: "border-[#6a5a8f]/50" },
};

const DIFFICULTY_NODE: Record<string, string> = {
  easy: "border-ok",
  medium: "border-accent",
  hard: "border-danger",
  extreme: "border-[#6a5a8f]/40",
};


/* ================================================================== */
/*  Adventure Mode — Level Select                                      */
/* ================================================================== */

interface EarnMultipliers {
  tierMultiplier: number;
  streakMultiplier: number;
  currentStreak: number;
  clearsTodayByLevel: Record<string, number>;
  eligible: boolean;
}

// Same diminishing curve as src/lib/bounty/earn.ts — mirrored here for
// the pre-play preview so we don't have to round-trip to the server for
// every level card render.
function dailyMultiplier(nth: number): number {
  if (nth <= 0) return 1.0;
  if (nth === 1) return 0.5;
  if (nth === 2) return 0.25;
  return 0.10;
}

export default function AdventureModePage() {
  const router = useRouter();
  const [data, setData] = useState<PVEData | null>(null);
  const [mult, setMult] = useState<EarnMultipliers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

  /* ---- Deck selector modal state ---- */
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [targetLevelId, setTargetLevelId] = useState<string | null>(null);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckIdx, setSelectedDeckIdx] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  /* ---- Fetch levels + earn multipliers ---- */
  const fetchLevels = useCallback(async () => {
    try {
      const [levelsRes, multRes] = await Promise.all([
        fetch("/api/game/pve"),
        fetch("/api/bounty/earn-multipliers"),
      ]);
      if (!levelsRes.ok) {
        const d = await levelsRes.json().catch(() => ({}));
        setError(d.error || "Failed to load adventure data.");
        return;
      }
      const json: PVEData = await levelsRes.json();
      setData(json);
      setError(null);
      if (multRes.ok) {
        const m: EarnMultipliers = await multRes.json();
        setMult(m);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLevels();
  }, [fetchLevels]);

  /* ---- Load saved decks. The starter compatibility helper currently
   *      returns null without network work while publication is paused. ---- */
  useEffect(() => {
    let cancelled = false;
    const stored = loadSavedDecks();
    if (stored.length > 0) {
      setSavedDecks(stored);
      return;
    }
    fetchStarterAsSavedDeck().then((starter) => {
      if (cancelled || !starter) return;
      setSavedDecks([starter]);
    });
    return () => { cancelled = true; };
  }, []);

  /* ---- Open deck selector ---- */
  function handlePlay(levelId: string) {
    setTargetLevelId(levelId);
    setSelectedDeckIdx(null);
    setStartError(null);
    setShowDeckModal(true);
  }

  /* ---- Start game ---- */
  async function handleStartGame() {
    if (selectedDeckIdx === null || !targetLevelId) return;
    const deck = savedDecks[selectedDeckIdx];
    if (!deck) return;

    setStartError(null);
    setStarting(true);

    const cards = deckToCards(deck);

    if (cards.length < 10) {
      setStartError("Deck must have at least 10 cards.");
      setStarting(false);
      return;
    }

    try {
      const res = await fetch(`/api/game/pve/${targetLevelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", deck: cards }),
      });
      const result = await res.json();
      if (!res.ok) {
        setStartError(result.error || "Failed to start game.");
        setStarting(false);
        return;
      }
      // Navigate to the game board
      router.push(`/play/adventure/${targetLevelId}?gameId=${result.gameId}`);
    } catch {
      setStartError("Network error.");
      setStarting(false);
    }
  }

  /* ---- Determine current level ---- */
  const highestCleared = data?.highestCleared ?? 0;
  const levels = data?.levels ?? [];

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <main className="min-h-screen bg-page text-ink">
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden border-b border-border-subtle">
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-display font-semibold tracking-tight mb-4">
            Adventure <span className="text-accent">Mode</span>
          </h1>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto mb-2">
            Battle legendary opponents up the Grand Line. Win Berries as you go.
          </p>
          <div className="flex items-center justify-center gap-4 mt-6">
            <Link
              href="/play"
              className="text-ink-faint hover:text-ink text-sm transition-colors"
            >
              &larr; Back to Play
            </Link>
            <Link
              href="/deck-builder"
              className="text-accent hover:text-accent-strong text-sm font-medium transition-colors"
            >
              Build a Deck &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Loading ---- */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ---- Error ---- */}
      {error && !loading && (
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="bg-danger/10 border border-danger text-danger rounded-lg px-4 py-3 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* ---- Level Map + Cards ---- */}
      {data && !loading && (
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">

          {/* ---- Resume in-progress battle ---- */}
          {data.activeGame && (() => {
            const lvl = levels.find((l) => String(l.id) === String(data.activeGame!.levelId));
            return (
              <section className="bg-accent-wash border border-accent/30 rounded-lg px-5 py-3 flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-accent">
                  Battle in progress{lvl ? <> vs {lvl.opponent_icon} {lvl.opponent_name}</> : null}
                </p>
                <Link
                  href={`/play/adventure/${data.activeGame.levelId}?gameId=${data.activeGame.gameId}`}
                  className="bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-4 py-1.5 text-sm transition-colors"
                >
                  Resume &rarr;
                </Link>
              </section>
            );
          })()}

          {/* ---- Multiplier strip (live) ---- */}
          {mult?.eligible && (mult.tierMultiplier > 1 || mult.streakMultiplier > 1) && (
            <section className="bg-accent-wash border border-accent/20 rounded-lg px-5 py-3 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-accent font-bold">Your multiplier right now</p>
                <p className="text-xl font-display font-semibold mt-0.5">
                  {(mult.tierMultiplier * mult.streakMultiplier).toFixed(2)}×
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-muted font-mono">
                {mult.tierMultiplier > 1 && (
                  <span><span className="text-[#6a5a8f]">{mult.tierMultiplier.toFixed(2)}×</span> tier</span>
                )}
                {mult.streakMultiplier > 1 && (
                  <span><span className="text-warning">{mult.streakMultiplier.toFixed(2)}×</span> {mult.currentStreak}-day streak</span>
                )}
              </div>
            </section>
          )}

          {/* ---- Visual Level Map ---- */}
          <section className="bg-surface border border-border-subtle rounded-lg p-5 sm:p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-lg">The Grand Line</h2>
            </div>

            {/* Progress track */}
            <div className="overflow-x-auto pb-2">
              <div className="flex items-center gap-0 min-w-max px-2 py-4">
                {levels.map((level, i) => {
                  const isCleared = level.progress?.cleared ?? false;
                  const isCurrent = level.unlocked && !isCleared;
                  const isLocked = !level.unlocked;
                  const diff = level.difficulty;

                  return (
                    <div key={level.id} className="flex items-center">
                      {/* Node */}
                      <button
                        onClick={() => {
                          if (!isLocked) {
                            setExpandedLevel(expandedLevel === level.id ? null : level.id);
                          }
                        }}
                        className={`
                          relative flex-shrink-0 w-12 h-12 rounded-full border-3 flex items-center justify-center
                          font-bold text-sm transition-all
                          ${isCleared
                            ? `border-ok bg-ok/10 text-ok shadow-mat`
                            : isCurrent
                              ? `${DIFFICULTY_NODE[diff]} ${DIFFICULTY_STYLES[diff]?.bg ?? "bg-surface-subtle"} ${DIFFICULTY_STYLES[diff]?.text ?? "text-ink"} animate-pulse shadow-mat`
                              : "border-border-subtle bg-surface-subtle text-ink-faint"
                          }
                          ${!isLocked ? "cursor-pointer hover:scale-110" : "cursor-not-allowed"}
                        `}
                        disabled={isLocked}
                        title={isLocked ? `Complete Level ${level.level_number - 1} first` : level.title}
                      >
                        {isCleared ? (
                          <span className="text-ok">&#10003;</span>
                        ) : isCurrent ? (
                          <span>{level.level_number}</span>
                        ) : (
                          <span className="text-ink-faint">{level.level_number}</span>
                        )}

                        {/* Level number label below */}
                        <span className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap ${
                          isCleared ? "text-ok" : isCurrent ? (DIFFICULTY_STYLES[diff]?.text ?? "text-ink") : "text-ink-faint"
                        }`}>
                          {level.level_number}
                        </span>
                      </button>

                      {/* Connector line */}
                      {i < levels.length - 1 && (
                        <div className={`w-8 sm:w-12 h-0.5 flex-shrink-0 ${
                          isCleared ? "bg-ok/10" : "bg-surface-subtle"
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-6 text-xs text-ink-faint">
                <div className="flex items-center gap-1.5">
                  <span className="text-ok">&#10003;</span>
                  <span>Cleared</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
                  <span>Current</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-surface-subtle border border-border-subtle" />
                  <span>Locked</span>
                </div>
              </div>
            </div>
          </section>

          {/* ---- Level Cards ---- */}
          <section className="space-y-3">
            <h2 className="font-bold text-lg mb-4">All Levels</h2>
            {levels.map((level) => {
              const isCleared = level.progress?.cleared ?? false;
              const isCurrent = level.unlocked && !isCleared;
              const isLocked = !level.unlocked;
              const isExpanded = expandedLevel === level.id;
              const diff = level.difficulty;
              const styles = DIFFICULTY_STYLES[diff] ?? DIFFICULTY_STYLES.easy;

              return (
                <div
                  key={level.id}
                  className={`
                    rounded-lg border transition-all
                    ${isCleared
                      ? "bg-surface border-ok/40 shadow-mat"
                      : isCurrent
                        ? `bg-surface ${styles.border} shadow-mat`
                        : isLocked
                          ? "bg-surface-subtle border-border-subtle opacity-60"
                          : "bg-surface border-border-subtle"
                    }
                  `}
                >
                  {/* Header row — always visible */}
                  <button
                    onClick={() => setExpandedLevel(isExpanded ? null : level.id)}
                    className="w-full text-left px-4 sm:px-5 py-4 flex items-center gap-4"
                  >
                    {/* Icon */}
                    <div className={`
                      w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 text-xl
                      ${isCleared
                        ? "bg-ok/10 border border-ok/40"
                        : isCurrent
                          ? `${styles.bg} border ${styles.border}`
                          : "bg-surface-subtle border border-border-subtle"
                      }
                    `}>
                      {isLocked ? (
                        <span className="text-ink-faint">–</span>
                      ) : (
                        <span>{level.opponent_icon}</span>
                      )}
                    </div>

                    {/* Title + opponent */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-ink-faint text-xs font-mono">
                          Lv.{level.level_number}
                        </span>
                        <h3 className={`font-bold truncate ${isLocked ? "text-ink-faint" : "text-ink"}`}>
                          {level.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-sm ${isLocked ? "text-ink-faint" : "text-ink-muted"}`}>
                          vs {level.opponent_name}
                        </span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}>
                          {diff}
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {isCleared && (
                        <span className="text-xs bg-ok/10 text-ok px-2.5 py-1 rounded-full font-medium">
                          &#10003; Cleared
                        </span>
                      )}
                      {isCurrent && (
                        <span className={`text-xs ${styles.bg} ${styles.text} px-2.5 py-1 rounded-full font-medium animate-pulse`}>
                          &#9679; Current
                        </span>
                      )}
                      {isLocked && (
                        <span className="text-xs bg-surface-subtle text-ink-faint px-2.5 py-1 rounded-full">
                          Locked
                        </span>
                      )}
                      {/* Expand arrow */}
                      <svg
                        className={`w-4 h-4 text-ink-faint transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 sm:px-5 pb-4 pt-1 border-t border-border-subtle space-y-4">
                      {/* Description */}
                      <p className="text-ink-muted text-sm leading-relaxed">
                        {level.description}
                      </p>

                      {/* Rewards */}
                      <div className="bg-surface-subtle rounded-lg p-3 space-y-1.5">
                        <h4 className="text-xs font-bold text-ink-faint uppercase tracking-wider mb-2">Rewards</h4>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-ink-muted">
                            First clear: {level.first_clear_points} Berries
                          </span>
                          {isCleared && (
                            <span className="text-ok/60 text-xs">(claimed)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-ink-muted">
                            Repeat: {level.repeat_points} Berries
                          </span>
                        </div>

                        {/* Expected-earn preview — what you'd actually get if you cleared this NOW */}
                        {mult?.eligible && !isLocked && (() => {
                          const clearsToday = mult.clearsTodayByLevel[String(level.id)] ?? 0;
                          // If they've never first-cleared, next clear is a first — full first_clear_points at 1.0 daily.
                          const isNextFirstClear = !isCleared;
                          const base = isNextFirstClear ? level.first_clear_points : level.repeat_points;
                          const daily = isNextFirstClear ? 1.0 : dailyMultiplier(clearsToday);
                          const expected = Math.max(0, Math.floor(base * daily * mult.streakMultiplier * mult.tierMultiplier));
                          return (
                            <div className="pt-2 mt-1 border-t border-border-subtle flex items-center gap-2 text-sm">
                              <span className="text-ink-faint">▸</span>
                              <span className="text-ink-muted">If you clear now:</span>
                              <span className="text-accent font-bold">+{expected} Berries</span>
                              {(daily < 1 || mult.streakMultiplier > 1 || mult.tierMultiplier > 1) && (
                                <span className="text-[10px] text-ink-faint font-mono ml-auto">
                                  {base}
                                  {daily < 1 && <span className="text-danger"> ×{Math.round(daily * 100)}%</span>}
                                  {mult.streakMultiplier > 1 && <span className="text-warning"> ×{mult.streakMultiplier.toFixed(2)}</span>}
                                  {mult.tierMultiplier > 1 && <span className="text-[#6a5a8f]"> ×{mult.tierMultiplier.toFixed(2)}</span>}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Progress stats */}
                      {level.progress && (
                        <div className="flex items-center gap-4 text-xs text-ink-faint">
                          <span>
                            Clears: <span className="text-ink-muted font-medium">{level.progress.clearCount}</span>
                          </span>
                          {level.progress.bestTurns && (
                            <span>
                              Best: <span className="text-ink-muted font-medium">{level.progress.bestTurns} turns</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action */}
                      <div className="pt-1">
                        {isLocked ? (
                          <p className="text-ink-faint text-sm">
                            Complete Level {level.level_number - 1} first
                          </p>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlay(level.id);
                            }}
                            className={`
                              font-bold rounded-lg px-6 py-2.5 transition-colors text-sm
                              ${isCurrent
                                ? "bg-ink hover:bg-ink/85 text-page"
                                : isCleared
                                  ? "bg-surface hover:bg-surface border border-border-subtle text-ink"
                                  : "bg-ink hover:bg-ink/85 text-page"
                              }
                            `}
                          >
                            {isCleared ? "Play Again" : "Play"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* ---- Bottom CTA ---- */}
          <div className="text-center pb-8">
            <p className="text-ink-faint text-sm mb-3">
              Need a better deck to take on tougher opponents?
            </p>
            <Link
              href="/deck-builder"
              className="inline-block bg-surface hover:bg-surface border border-border-subtle text-ink font-semibold rounded-lg px-6 py-3 transition-colors"
            >
              Open Deck Builder
            </Link>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/*  Deck Selector Modal                                             */}
      {/* ================================================================ */}

      {showDeckModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4"
          onClick={() => { if (!starting) setShowDeckModal(false); }}
        >
          <div
            className="bg-surface border border-border-subtle rounded-lg p-6 sm:p-8 max-w-xl w-full shadow-mat max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-1">Select Your Deck</h2>
              <p className="text-ink-muted text-sm">
                Choose a deck to battle with.
                {targetLevelId && data?.levels && (() => {
                  const lvl = data.levels.find(l => l.id === targetLevelId);
                  return lvl ? (
                    <span className="block mt-1">
                      vs {lvl.opponent_icon} {lvl.opponent_name} &#8212; {lvl.title}
                    </span>
                  ) : null;
                })()}
              </p>
            </div>

            {startError && (
              <div className="bg-danger/10 border border-danger text-danger rounded-lg px-4 py-2 text-sm mb-4">
                {startError}
              </div>
            )}

            {savedDecks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-ink-faint mb-4">
                  No saved deck found. Automatic starter loading is paused
                  while its public data lineage is rebuilt.
                </p>
                <Link
                  href="/deck-builder"
                  className="inline-block bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-6 py-3 transition-colors"
                >
                  Open Deck Builder
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto mb-4">
                  {savedDecks.map((deck, i) => {
                    const totalCards = deck.entries.reduce((s, e) => s + e.quantity, 0);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDeckIdx(i)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedDeckIdx === i
                            ? "border-accent bg-accent-wash"
                            : "border-border-subtle bg-surface-subtle hover:border-border-strong"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold">{deck.name}</span>
                            {deck.leader && (
                              <span className="text-accent text-xs ml-2">
                                Leader: {deck.leader.name}
                              </span>
                            )}
                          </div>
                          <span className="text-ink-faint text-sm">{totalCards} cards</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleStartGame}
                    disabled={selectedDeckIdx === null || starting}
                    className="flex-1 bg-ink hover:bg-ink/85 disabled:opacity-50 text-page font-bold rounded-lg py-3 transition-colors text-lg"
                  >
                    {starting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-page/40 border-t-page rounded-full animate-spin" />
                        Starting...
                      </span>
                    ) : (
                      "Start Battle"
                    )}
                  </button>
                  <button
                    onClick={() => setShowDeckModal(false)}
                    disabled={starting}
                    className="bg-surface hover:bg-surface border border-border-subtle text-ink-muted font-semibold rounded-lg px-5 py-3 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
