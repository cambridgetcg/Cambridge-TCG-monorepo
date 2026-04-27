"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    clear_count: number;
    best_turns: number | null;
  } | null;
  unlocked: boolean;
}

interface PVEData {
  levels: PVELevel[];
  highestCleared: number;
}

interface SavedDeckCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
  tradein_credit: number | null;
}

interface SavedDeck {
  name: string;
  leader: SavedDeckCard | null;
  entries: { sku: string; quantity: number; card: SavedDeckCard }[];
  savedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "ctcg-deck-builder-decks";

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  easy:    { bg: "bg-green-900/30",  text: "text-green-400",  border: "border-green-700/50",  glow: "shadow-green-500/20" },
  medium:  { bg: "bg-amber-900/30",  text: "text-amber-400",  border: "border-amber-700/50",  glow: "shadow-amber-500/20" },
  hard:    { bg: "bg-red-900/30",    text: "text-red-400",    border: "border-red-700/50",    glow: "shadow-red-500/20" },
  extreme: { bg: "bg-purple-900/30", text: "text-purple-400", border: "border-purple-700/50", glow: "shadow-purple-500/20" },
};

const DIFFICULTY_NODE: Record<string, string> = {
  easy: "border-green-500",
  medium: "border-amber-500",
  hard: "border-red-500",
  extreme: "border-purple-500",
};

const DIFFICULTY_NODE_BG: Record<string, string> = {
  easy: "bg-green-500",
  medium: "bg-amber-500",
  hard: "bg-red-500",
  extreme: "bg-purple-500",
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

  /* ---- Load saved decks from localStorage ---- */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSavedDecks(JSON.parse(stored));
    } catch { /* ignore */ }
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

    // Build deck payload
    const cards: { sku: string; name: string; cardNumber: string; imageUrl: string | null; rarity: string | null; isLeader?: boolean }[] = [];

    if (deck.leader) {
      cards.push({
        sku: deck.leader.sku,
        name: deck.leader.name,
        cardNumber: deck.leader.card_number,
        imageUrl: deck.leader.image_url,
        rarity: deck.leader.rarity,
        isLeader: true,
      });
    }

    for (const entry of deck.entries) {
      for (let i = 0; i < entry.quantity; i++) {
        cards.push({
          sku: entry.card.sku,
          name: entry.card.name,
          cardNumber: entry.card.card_number,
          imageUrl: entry.card.image_url,
          rarity: entry.card.rarity,
        });
      }
    }

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
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-neutral-950 to-amber-900/10" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Adventure <span className="text-amber-400">Mode</span>
          </h1>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto mb-2">
            Set sail on the Grand Line and prove your strength against legendary opponents.
            Each victory brings you closer to becoming the Pirate King — earning Berries
            and store credit along the way.
          </p>
          <div className="flex items-center justify-center gap-4 mt-6">
            <Link
              href="/play"
              className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
            >
              &larr; Back to Play
            </Link>
            <Link
              href="/deck-builder"
              className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              Build a Deck &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Loading ---- */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ---- Error ---- */}
      {error && !loading && (
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* ---- Level Map + Cards ---- */}
      {data && !loading && (
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">

          {/* ---- Multiplier strip (live) ---- */}
          {mult?.eligible && (mult.tierMultiplier > 1 || mult.streakMultiplier > 1) && (
            <section className="bg-gradient-to-r from-amber-500/10 via-neutral-900 to-fuchsia-500/10 border border-amber-500/20 rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Your multiplier right now</p>
                <p className="text-xl font-extrabold mt-0.5">
                  {(mult.tierMultiplier * mult.streakMultiplier).toFixed(2)}×
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono">
                {mult.tierMultiplier > 1 && (
                  <span><span className="text-purple-400">{mult.tierMultiplier.toFixed(2)}×</span> tier</span>
                )}
                {mult.streakMultiplier > 1 && (
                  <span><span className="text-orange-400">{mult.streakMultiplier.toFixed(2)}×</span> {mult.currentStreak}-day streak</span>
                )}
              </div>
            </section>
          )}

          {/* ---- Visual Level Map ---- */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 sm:p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">&#127988;&#8205;&#9760;&#65039;</span>
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
                            ? `border-green-500 bg-green-500/20 text-green-400 shadow-lg shadow-green-500/30`
                            : isCurrent
                              ? `${DIFFICULTY_NODE[diff]} ${DIFFICULTY_NODE_BG[diff]}/20 ${DIFFICULTY_STYLES[diff]?.text ?? "text-white"} animate-pulse shadow-lg ${DIFFICULTY_STYLES[diff]?.glow ?? ""}`
                              : "border-neutral-700 bg-neutral-800/50 text-neutral-600"
                          }
                          ${!isLocked ? "cursor-pointer hover:scale-110" : "cursor-not-allowed"}
                        `}
                        disabled={isLocked}
                        title={isLocked ? `Complete Level ${level.level_number - 1} first` : level.title}
                      >
                        {isCleared ? (
                          <span className="text-green-400">&#10003;</span>
                        ) : isCurrent ? (
                          <span>{level.level_number}</span>
                        ) : (
                          <span className="text-neutral-600">&#128274;</span>
                        )}

                        {/* Level number label below */}
                        <span className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap ${
                          isCleared ? "text-green-500" : isCurrent ? (DIFFICULTY_STYLES[diff]?.text ?? "text-white") : "text-neutral-600"
                        }`}>
                          {level.level_number}
                        </span>
                      </button>

                      {/* Connector line */}
                      {i < levels.length - 1 && (
                        <div className={`w-8 sm:w-12 h-0.5 flex-shrink-0 ${
                          isCleared ? "bg-green-500/50" : "bg-neutral-700"
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-6 text-xs text-neutral-500">
                <div className="flex items-center gap-1.5">
                  <span className="text-green-400">&#10003;</span>
                  <span>Cleared</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-amber-500/60 animate-pulse" />
                  <span>Current</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-neutral-600">&#128274;</span>
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
                    rounded-xl border transition-all
                    ${isCleared
                      ? "bg-neutral-900/80 border-green-800/40 shadow-md shadow-green-500/5"
                      : isCurrent
                        ? `bg-neutral-900 ${styles.border} shadow-lg ${styles.glow}`
                        : isLocked
                          ? "bg-neutral-900/40 border-neutral-800 opacity-60"
                          : "bg-neutral-900/80 border-neutral-800"
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
                      w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl
                      ${isCleared
                        ? "bg-green-900/30 border border-green-700/40"
                        : isCurrent
                          ? `${styles.bg} border ${styles.border}`
                          : "bg-neutral-800 border border-neutral-700"
                      }
                    `}>
                      {isLocked ? (
                        <span className="text-neutral-600">&#128274;</span>
                      ) : (
                        <span>{level.opponent_icon}</span>
                      )}
                    </div>

                    {/* Title + opponent */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-neutral-500 text-xs font-mono">
                          Lv.{level.level_number}
                        </span>
                        <h3 className={`font-bold truncate ${isLocked ? "text-neutral-500" : "text-white"}`}>
                          {level.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-sm ${isLocked ? "text-neutral-600" : "text-neutral-400"}`}>
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
                        <span className="text-xs bg-green-900/40 text-green-400 px-2.5 py-1 rounded-full font-medium">
                          &#10003; Cleared
                        </span>
                      )}
                      {isCurrent && (
                        <span className={`text-xs ${styles.bg} ${styles.text} px-2.5 py-1 rounded-full font-medium animate-pulse`}>
                          &#9679; Current
                        </span>
                      )}
                      {isLocked && (
                        <span className="text-xs bg-neutral-800 text-neutral-600 px-2.5 py-1 rounded-full">
                          Locked
                        </span>
                      )}
                      {/* Expand arrow */}
                      <svg
                        className={`w-4 h-4 text-neutral-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
                    <div className="px-4 sm:px-5 pb-4 pt-1 border-t border-neutral-800/60 space-y-4">
                      {/* Description */}
                      <p className="text-neutral-400 text-sm leading-relaxed">
                        {level.description}
                      </p>

                      {/* Rewards */}
                      <div className="bg-neutral-800/50 rounded-lg p-3 space-y-1.5">
                        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Rewards</h4>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-amber-400">&#11088;</span>
                          <span className="text-neutral-300">
                            First clear: {level.first_clear_points} Berries
                            {level.first_clear_credit > 0 && (
                              <span className="text-green-400 ml-1">
                                + &pound;{Number(level.first_clear_credit).toFixed(2)} store credit
                              </span>
                            )}
                          </span>
                          {isCleared && (
                            <span className="text-green-400/60 text-xs">(claimed)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-neutral-500">&#128260;</span>
                          <span className="text-neutral-400">
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
                            <div className="pt-2 mt-1 border-t border-neutral-700/40 flex items-center gap-2 text-sm">
                              <span className="text-neutral-600">▸</span>
                              <span className="text-neutral-400">If you clear now:</span>
                              <span className="text-amber-400 font-bold">+{expected} Berries</span>
                              {(daily < 1 || mult.streakMultiplier > 1 || mult.tierMultiplier > 1) && (
                                <span className="text-[10px] text-neutral-600 font-mono ml-auto">
                                  {base}
                                  {daily < 1 && <span className="text-red-400"> ×{Math.round(daily * 100)}%</span>}
                                  {mult.streakMultiplier > 1 && <span className="text-orange-400"> ×{mult.streakMultiplier.toFixed(2)}</span>}
                                  {mult.tierMultiplier > 1 && <span className="text-purple-400"> ×{mult.tierMultiplier.toFixed(2)}</span>}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Progress stats */}
                      {level.progress && (
                        <div className="flex items-center gap-4 text-xs text-neutral-500">
                          <span>
                            Clears: <span className="text-neutral-300 font-medium">{level.progress.clear_count}</span>
                          </span>
                          {level.progress.best_turns && (
                            <span>
                              Best: <span className="text-neutral-300 font-medium">{level.progress.best_turns} turns</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action */}
                      <div className="pt-1">
                        {isLocked ? (
                          <p className="text-neutral-600 text-sm">
                            &#128274; Complete Level {level.level_number - 1} first
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
                                ? "bg-amber-500 hover:bg-amber-400 text-black"
                                : isCleared
                                  ? "bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white"
                                  : "bg-amber-500 hover:bg-amber-400 text-black"
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
            <p className="text-neutral-500 text-sm mb-3">
              Need a better deck to take on tougher opponents?
            </p>
            <Link
              href="/deck-builder"
              className="inline-block bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => { if (!starting) setShowDeckModal(false); }}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 sm:p-8 max-w-xl w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-1">Select Your Deck</h2>
              <p className="text-neutral-400 text-sm">
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
              <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm mb-4">
                {startError}
              </div>
            )}

            {savedDecks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-neutral-500 mb-4">No saved decks found.</p>
                <Link
                  href="/deck-builder"
                  className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-6 py-3 transition-colors"
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
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-neutral-800 bg-neutral-800/50 hover:border-neutral-600"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold">{deck.name}</span>
                            {deck.leader && (
                              <span className="text-amber-400 text-xs ml-2">
                                Leader: {deck.leader.name}
                              </span>
                            )}
                          </div>
                          <span className="text-neutral-500 text-sm">{totalCards} cards</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleStartGame}
                    disabled={selectedDeckIdx === null || starting}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg py-3 transition-colors text-lg"
                  >
                    {starting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                        Starting...
                      </span>
                    ) : (
                      "Start Battle"
                    )}
                  </button>
                  <button
                    onClick={() => setShowDeckModal(false)}
                    disabled={starting}
                    className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 font-semibold rounded-lg px-5 py-3 transition-colors"
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
