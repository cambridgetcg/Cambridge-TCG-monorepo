"use client";

// The practice battle board — the whole game runs in this browser tab.
//
// Architecture note (why there is no fetch in this file): the server's PVE
// mutation path is sealed while rules validation is completed. A practice
// battle therefore runs entirely client-side on the pure reducer + AI —
// nothing durable, nothing paid, no identity minted. That construction also
// removes the old double-fire bug: the AI's reply is a synchronous function
// call animated locally, not a second HTTP request racing an effect hook.
//
// Ease doctrine (Kingdom-082 "minimum barriers"): one Play press from the
// hub lands here mid-battle; every illegal move answers with the rule it
// broke, in words a first-time player can use.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameCard, GamePhase } from "@/lib/game/types";
import { PHASE_LABELS } from "@/lib/game/types";
import {
  attack,
  attachDon,
  endTurn,
  playCard,
  resolveDefense,
  resolveMulligans,
  startPracticeSetup,
  PLAYER_ID,
  type PracticeGame,
  type PracticeLogEntry,
  type PracticeStep,
} from "@/lib/game/practice";
import { attackPower, defensePower } from "@/lib/game/validate";
import {
  buildPracticeDeck,
  fetchStarterCardDetails,
  practiceStarters,
} from "@/lib/play/practice-decks";
import { getAdventureLevel, type AdventureLevel } from "@/lib/play/adventure-levels";
import { GameCardView } from "./GameCardView";

const AI_STEP_DELAY_MS = 650;
const SAVE_KEY = "ctcg-practice-battle";
const CLEARS_KEY = "ctcg-practice-clears";
const STARTER_CHOICE_KEY = "ctcg-practice-starter";

const DIFFICULTY_BADGE: Record<string, { bg: string; text: string }> = {
  easy: { bg: "bg-ok/10", text: "text-ok" },
  medium: { bg: "bg-accent-wash", text: "text-accent" },
  hard: { bg: "bg-danger/10", text: "text-danger" },
  extreme: { bg: "bg-accent-wash", text: "text-accent" },
};

interface SavedBattle {
  levelId: number;
  starterId: string;
  game: PracticeGame;
}

function loadSaved(levelId: number): SavedBattle | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedBattle;
    if (saved.levelId !== levelId) return null;
    if (saved.game.state.phase === "finished") return null;
    return saved;
  } catch {
    return null;
  }
}

function recordClear(levelId: number) {
  try {
    const raw = localStorage.getItem(CLEARS_KEY);
    const clears: number[] = raw ? JSON.parse(raw) : [];
    if (!clears.includes(levelId)) {
      clears.push(levelId);
      localStorage.setItem(CLEARS_KEY, JSON.stringify(clears));
    }
  } catch {
    /* storage unavailable — the battle still played fine */
  }
}

export function PracticeBoard({ levelId }: { levelId: number }) {
  const level = getAdventureLevel(levelId);

  const [game, setGame] = useState<PracticeGame | null>(null);
  const [starterId, setStarterId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tossChoice, setTossChoice] = useState<string | null>(null); // starterId awaiting first/second
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [animating, setAnimating] = useState(false);
  const animatingRef = useRef(false);
  const clearRecordedRef = useRef(false);

  /* Offer resume / remember last starter on mount. */
  useEffect(() => {
    const saved = loadSaved(levelId);
    if (saved) {
      setGame(saved.game);
      setStarterId(saved.starterId);
      return;
    }
    try {
      const last = localStorage.getItem(STARTER_CHOICE_KEY);
      if (last) setStarterId(last);
    } catch {
      /* ignore */
    }
  }, [levelId]);

  /* Persist after every state change; record clears. */
  useEffect(() => {
    if (!game || !starterId) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ levelId, starterId, game }));
    } catch {
      /* ignore */
    }
    if (
      game.state.phase === "finished" &&
      game.state.winner === PLAYER_ID &&
      !clearRecordedRef.current
    ) {
      clearRecordedRef.current = true;
      recordClear(levelId);
    }
  }, [game, starterId, levelId]);

  const say = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 3500);
  }, []);

  /* Animate a step trail (AI reply, upkeep) one state at a time. */
  const animateSteps = useCallback(
    async (steps: PracticeStep[], final: PracticeGame) => {
      animatingRef.current = true;
      setAnimating(true);
      for (const step of steps) {
        setGame({ state: step.state, log: step.log });
        await new Promise((r) => setTimeout(r, AI_STEP_DELAY_MS));
      }
      setGame(final);
      animatingRef.current = false;
      setAnimating(false);
    },
    [],
  );

  /** Rock-paper-scissors stand-in (CR 5-2-1-4): a fair toss decides who
   *  CHOOSES first or second. When the player wins, they choose; when the
   *  AI wins, it chooses to go first. */
  async function handleStart(id: string) {
    if (!level || starting) return;
    const playerWonToss = Math.random() < 0.5;
    if (playerWonToss) {
      setTossChoice(id); // render the first/second choice
      return;
    }
    await beginSetup(id, false, `${level.opponentName} won the toss and chose to go first.`);
  }

  async function beginSetup(id: string, playerGoesFirst: boolean, tossNote: string) {
    if (!level || starting) return;
    setStarting(true);
    setTossChoice(null);
    // Artwork + EN card text are best-effort enhancements fetched from the
    // read-only catalog API (bounded by a short timeout) — cards the
    // collection can't cover keep their text faces / show no rules text,
    // and the battle starts regardless.
    const [playerDetails, aiDetails] = await Promise.all([
      fetchStarterCardDetails(id),
      fetchStarterCardDetails(level.aiStarterId),
    ]);
    const player = buildPracticeDeck(id, playerDetails);
    const ai = buildPracticeDeck(level.aiStarterId, aiDetails) ?? player;
    if (!player || !ai) {
      setStarting(false);
      return;
    }
    try {
      localStorage.setItem(STARTER_CHOICE_KEY, id);
    } catch {
      /* ignore */
    }
    clearRecordedRef.current = false;
    setStarterId(id);
    setStarting(false);
    const fresh = startPracticeSetup(
      "You",
      player.deck,
      level.opponentName,
      ai.deck,
      level.aiAggression,
      playerGoesFirst,
    );
    fresh.log.splice(1, 0, { text: tossNote, actor: "board" });
    setGame(fresh); // phase "setup" — the mulligan window renders
  }

  function handleMulligan(redraw: boolean) {
    if (!game || animatingRef.current) return;
    const { game: after, steps } = resolveMulligans(game, redraw);
    void animateSteps(steps, after);
  }

  function handleDefense(choice: { blockerId?: string | null; counterCardIds?: string[] }) {
    if (!game || animatingRef.current) return;
    const r = resolveDefense(game, choice);
    if (r.rejected && !r.rejected.ok) {
      say(r.rejected.reason);
      return;
    }
    void animateSteps(r.steps, r.game);
  }

  function handlePlayCard(cardId: string) {
    if (!game || animatingRef.current) return;
    const r = playCard(game, cardId);
    if (r.rejected && !r.rejected.ok) say(r.rejected.reason);
    else setGame(r.game);
    setSelectedCard(null);
  }

  function handleAttack(attackerId: string, targetType: "leader" | "character", targetId?: string) {
    if (!game || animatingRef.current) return;
    const r = attack(game, attackerId, targetType, targetId);
    if (r.rejected && !r.rejected.ok) say(r.rejected.reason);
    else setGame(r.game);
    setSelectedCard(null);
  }

  function handleAttachDon(cardId: string) {
    if (!game || animatingRef.current) return;
    const r = attachDon(game, cardId);
    if (r.rejected && !r.rejected.ok) say(r.rejected.reason);
    else setGame(r.game);
    setSelectedCard(null);
  }

  function handleEndTurn() {
    if (!game || animatingRef.current) return;
    const r = endTurn(game);
    if (r.rejected && !r.rejected.ok) {
      say(r.rejected.reason);
      return;
    }
    void animateSteps(r.steps, r.game);
  }

  function handleRestart() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    clearRecordedRef.current = false;
    setGame(null);
  }

  if (!level) {
    return (
      <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-ink-muted">This level doesn&apos;t exist.</p>
          <Link href="/play/adventure" className="text-accent hover:text-accent-strong text-sm">
            Back to Adventure
          </Link>
        </div>
      </main>
    );
  }

  if (!game) {
    if (tossChoice) {
      return (
        <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
          <div className="bg-surface border border-border-subtle rounded-xl p-8 max-w-md w-full text-center space-y-5">
            <h2 className="text-2xl font-display font-semibold">You won the toss!</h2>
            <p className="text-ink-muted text-sm">
              The toss winner chooses turn order (official rule). Going first
              means no draw and 1 DON!! on turn one; going second means a full
              draw and 2 DON!!.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => void beginSetup(tossChoice, true, "You won the toss and chose to go first.")}
                className="bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-6 py-3 transition-colors"
              >
                Go first
              </button>
              <button
                onClick={() => void beginSetup(tossChoice, false, "You won the toss and chose to go second.")}
                className="bg-surface border border-border-subtle text-ink font-semibold rounded-lg px-6 py-3 transition-colors"
              >
                Go second
              </button>
            </div>
          </div>
        </main>
      );
    }
    return (
      <SetupScreen
        level={level}
        rememberedStarterId={starterId}
        starting={starting}
        onStart={(id) => void handleStart(id)}
      />
    );
  }

  if (game.state.phase === "setup" && !animating) {
    return (
      <MulliganPrompt
        hand={game.state.player1.hand}
        onDecide={handleMulligan}
      />
    );
  }

  const state = game.state;
  const you = state.player1;
  const ai = state.player2;
  const isMyTurn = state.currentTurn === PLAYER_ID && !animating;
  const finished = state.phase === "finished";

  if (finished) {
    const won = state.winner === PLAYER_ID;
    const next = won ? getAdventureLevel(level.id + 1) : null;
    return (
      <EndScreen
        won={won}
        level={level}
        nextLevel={next}
        log={game.log}
        onRestart={handleRestart}
      />
    );
  }

  return (
    <main className="min-h-screen bg-page text-ink flex flex-col">
      {game.pendingDefense && !animating && (
        <DefensePrompt
          game={game}
          onResolve={handleDefense}
        />
      )}
      {selectedCard && (
        <ActionSheet
          card={selectedCard}
          game={game}
          isMyTurn={isMyTurn}
          onPlay={handlePlayCard}
          onAttack={handleAttack}
          onAttachDon={handleAttachDon}
          onClose={() => setSelectedCard(null)}
        />
      )}
      {showLog && <LogPanel log={game.log} onClose={() => setShowLog(false)} />}

      {/* Top bar — level, log, concede */}
      <header className="bg-surface border-b border-border-subtle px-3 sm:px-4 py-2 flex items-center justify-between text-sm flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/play/adventure" className="text-ink-faint hover:text-ink transition-colors flex-shrink-0">
            &larr;
          </Link>
          <span className="truncate">
            <span className="text-ink-faint">Lv.{level.id}</span>{" "}
            <span className="font-medium">{level.title}</span>
            <span className="text-ink-faint"> — vs {level.opponentIcon} </span>
            <span className="text-danger">{level.opponentName}</span>
          </span>
          <span
            className={`hidden sm:inline text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${
              DIFFICULTY_BADGE[level.difficulty]?.bg ?? ""
            } ${DIFFICULTY_BADGE[level.difficulty]?.text ?? ""}`}
          >
            {level.difficulty}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-ink-faint hover:text-ink text-xs bg-surface-subtle px-3 py-1.5 rounded-lg transition-colors"
          >
            Log
          </button>
          <button
            onClick={() => {
              if (confirm("Concede this battle?")) {
                setGame({
                  state: { ...state, phase: "finished", winner: ai.userId },
                  log: [...game.log, { text: "You conceded.", actor: "board" }],
                });
              }
            }}
            className="text-danger text-xs bg-danger/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            Concede
          </button>
        </div>
      </header>

      {/* Practice framing — one quiet line, always visible */}
      <p className="text-center text-[11px] text-ink-faint py-1 border-b border-border-subtle bg-surface-subtle">
        Practice battle — lives in this browser, records nothing, pays nothing.
        Costs, power, counters, and blockers are real; other card effects
        aren&apos;t interpreted yet.
      </p>

      {/* Board — compact: both zones + phase bar fit one laptop screen */}
      <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col gap-2 p-2 sm:p-3">
        <PlayerZone
          title={`${level.opponentIcon} ${level.opponentName}`}
          player={ai}
          isOwn={false}
          onSelect={() => undefined}
        />

        <div className="bg-surface-subtle rounded-lg px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-accent font-bold text-sm">
              {animating
                ? `${level.opponentName} is playing…`
                : PHASE_LABELS[state.phase as GamePhase] ?? state.phase}
            </span>
            <span className="text-ink-faint text-xs">Turn {state.turnNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            {notice ? (
              <span className="text-warning text-xs" role="status">{notice}</span>
            ) : (
              <span className="text-ink-faint text-xs hidden sm:inline">
                {isMyTurn ? "Tap a card to play or attack" : ""}
              </span>
            )}
            <button
              onClick={handleEndTurn}
              disabled={!isMyTurn}
              className="text-xs bg-ink text-page px-4 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-40"
            >
              End Turn
            </button>
          </div>
        </div>

        <PlayerZone
          title={isMyTurn ? "You — your turn" : "You"}
          player={you}
          isOwn={true}
          onSelect={(card) => setSelectedCard(card)}
        />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Zones                                                              */
/* ------------------------------------------------------------------ */

function LifeDots({ count, max }: { count: number; max: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${count} life`}>
      {Array.from({ length: Math.max(max, count) }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full transition-colors ${
            i < count ? "bg-danger" : "bg-surface-subtle border border-border-subtle"
          }`}
        />
      ))}
    </div>
  );
}

function PlayerZone({
  title,
  player,
  isOwn,
  onSelect,
}: {
  title: string;
  player: PracticeGame["state"]["player1"];
  isOwn: boolean;
  onSelect: (card: GameCard) => void;
}) {
  const maxLife = Math.max(player.lifeCount, player.life.length, 5);
  return (
    <section
      className={`rounded-lg p-2.5 sm:p-3 ${
        isOwn ? "bg-surface" : "bg-danger/5 border border-danger/15"
      }`}
      aria-label={title}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`font-bold text-sm ${isOwn ? "text-accent" : "text-danger"}`}>
          {title}
        </span>
        <div className="flex items-center gap-3">
          <LifeDots count={player.life.length} max={maxLife} />
          <span className="text-ink-faint text-xs font-mono">Deck {player.deck.length}</span>
        </div>
      </div>

      {/* DON!! row */}
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-accent font-bold">DON!!</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: player.donActive + player.donRested }).map((_, i) => (
            <span
              key={i}
              className={`w-3.5 h-5 rounded-sm text-[8px] font-bold flex items-center justify-center ${
                i < player.donActive ? "bg-ink text-page" : "bg-surface-subtle text-ink-faint"
              }`}
            >
              {i < player.donActive ? "D" : "R"}
            </span>
          ))}
        </div>
        <span className="text-ink-faint">
          {player.donActive} ready{player.donDeck > 0 ? ` · ${player.donDeck} in reserve` : ""}
        </span>
      </div>

      {/* Leader | Field | Stage */}
      <div className="flex items-end gap-2 sm:gap-3 overflow-x-auto pb-1">
        <ZoneSlot label="Leader">
          <GameCardView
            card={player.leader}
            selected={false}
            onClick={
              isOwn && player.leader ? () => onSelect(player.leader!) : undefined
            }
          />
        </ZoneSlot>
        <div className="w-px h-16 bg-border-subtle flex-shrink-0" />
        <ZoneSlot label="Field">
          <div className="flex items-end gap-1.5 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => {
              const card = player.field[i] ?? null;
              return (
                <GameCardView
                  key={card?.id ?? `empty-${i}`}
                  card={card}
                  onClick={isOwn && card ? () => onSelect(card) : undefined}
                />
              );
            })}
          </div>
        </ZoneSlot>
        <div className="w-px h-16 bg-border-subtle flex-shrink-0" />
        <ZoneSlot label="Stage">
          <GameCardView
            card={player.stage}
            onClick={isOwn && player.stage ? () => onSelect(player.stage!) : undefined}
          />
        </ZoneSlot>
      </div>

      {/* Hand */}
      <div className="mt-2 pt-2 border-t border-border-subtle">
        <span className="text-[10px] text-ink-faint font-medium">
          Hand ({player.hand.length})
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
          {player.hand.length === 0 ? (
            <span className="text-ink-faint text-xs italic">Empty</span>
          ) : (
            player.hand.map((card) => (
              <GameCardView
                key={card.id}
                card={isOwn ? card : { ...card, faceDown: true }}
                small={!isOwn}
                onClick={isOwn ? () => onSelect(card) : undefined}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ZoneSlot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0">
      <div className="text-[10px] text-ink-faint mb-0.5">{label}</div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action sheet — validated options with the math shown up front      */
/* ------------------------------------------------------------------ */

function ActionSheet({
  card,
  game,
  isMyTurn,
  onPlay,
  onAttack,
  onAttachDon,
  onClose,
}: {
  card: GameCard;
  game: PracticeGame;
  isMyTurn: boolean;
  onPlay: (cardId: string) => void;
  onAttack: (attackerId: string, targetType: "leader" | "character", targetId?: string) => void;
  onAttachDon: (cardId: string) => void;
  onClose: () => void;
}) {
  const state = game.state;
  const opp = state.player2;
  const options: { label: string; hint?: string; run: () => void; disabled?: boolean }[] = [];

  if (card.zone === "hand" && isMyTurn) {
    const costText = card.cost != null ? ` (cost ${card.cost})` : "";
    const kind =
      card.category === "event"
        ? "Play event"
        : card.category === "stage"
          ? "Set stage"
          : "Play to field";
    // Same hospitality the API guest gets: an unaffordable play is shown
    // disabled with the reason, not offered and then scolded.
    const short =
      card.cost != null && card.cost > state.player1.donActive;
    options.push({
      label: `${kind}${costText}`,
      hint: short
        ? `Needs ${card.cost} DON!! — you have ${state.player1.donActive} active.`
        : card.category === "event"
          ? "Effect not interpreted in practice mode — the card resolves to trash."
          : undefined,
      disabled: short,
      run: () => onPlay(card.id),
    });
  }

  if ((card.zone === "leader" || card.zone === "field") && isMyTurn) {
    const myPower = attackPower(card);
    const oppLeaderPower = opp.leader ? defensePower(opp.leader) : null;
    options.push({
      label:
        myPower != null && oppLeaderPower != null
          ? `Attack their leader — ${myPower} vs ${oppLeaderPower}`
          : "Attack their leader",
      hint:
        myPower != null && oppLeaderPower != null && myPower < oppLeaderPower
          ? "Not enough power — this would miss. Attach DON!! first."
          : undefined,
      run: () => onAttack(card.id, "leader"),
    });
    for (const target of opp.field.filter((c) => c.isRested)) {
      const targetPower = defensePower(target);
      options.push({
        label:
          myPower != null && targetPower != null
            ? `Attack ${target.name} — ${myPower} vs ${targetPower}`
            : `Attack ${target.name}`,
        run: () => onAttack(card.id, "character", target.id),
      });
    }
    if (state.player1.donActive > 0) {
      options.push({
        label: "Attach DON!! (+1000 power)",
        run: () => onAttachDon(card.id),
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-subtle rounded-xl p-4 w-full max-w-[300px] shadow-mat"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border-subtle">
          <GameCardView card={{ ...card, isRested: false }} small />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{card.name}</p>
            <p className="text-ink-faint text-xs font-mono">{card.cardNumber}</p>
            <p className="text-ink-faint text-xs">
              {[
                card.cost != null ? `cost ${card.cost}` : null,
                card.power != null ? `power ${card.power}` : null,
                card.counter != null ? `counter ${card.counter}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || card.zone}
            </p>
          </div>
        </div>
        {card.textEn && (
          <div className="mb-3 pb-3 border-b border-border-subtle">
            <p className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">
              Card text · not interpreted by practice mode yet
            </p>
            <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
              {card.textEn}
            </p>
            {card.textAttribution && (
              <p className="mt-1.5 text-[9px] text-ink-faint">{card.textAttribution}</p>
            )}
          </div>
        )}
        {options.length === 0 ? (
          <p className="text-ink-faint text-xs">
            {isMyTurn
              ? "No moves for this card right now."
              : "Wait for your turn."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <button
                key={i}
                onClick={o.disabled ? undefined : o.run}
                disabled={o.disabled}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                  o.disabled
                    ? "text-ink-faint cursor-not-allowed"
                    : "hover:bg-surface-subtle text-ink"
                }`}
              >
                {o.label}
                {o.hint && <span className="block text-[11px] text-ink-faint">{o.hint}</span>}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full mt-3 pt-3 border-t border-border-subtle text-ink-faint text-xs hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Log panel                                                          */
/* ------------------------------------------------------------------ */

function LogPanel({ log, onClose }: { log: PracticeLogEntry[]; onClose: () => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <div className="fixed inset-y-0 right-0 w-80 max-w-[85vw] bg-page border-l border-border-subtle z-40 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <h3 className="font-bold text-sm">Game Log</h3>
        <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg" aria-label="Close log">
          &times;
        </button>
      </div>
      <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
        {log.map((entry, i) => (
          <p
            key={i}
            className={`text-xs py-1 border-b border-border-subtle ${
              entry.actor === "ai"
                ? "text-danger/80"
                : entry.actor === "board"
                  ? "text-ink-faint italic"
                  : "text-ink-muted"
            }`}
          >
            {entry.text}
          </p>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup + end screens                                                */
/* ------------------------------------------------------------------ */

function SetupScreen({
  level,
  rememberedStarterId,
  starting,
  onStart,
}: {
  level: AdventureLevel;
  rememberedStarterId: string | null;
  starting: boolean;
  onStart: (starterId: string) => void;
}) {
  const starters = practiceStarters();
  const [picked, setPicked] = useState<string>(
    rememberedStarterId && starters.some((s) => s.id === rememberedStarterId)
      ? rememberedStarterId
      : starters[0]?.id ?? "",
  );

  useEffect(() => {
    if (rememberedStarterId && starters.some((s) => s.id === rememberedStarterId)) {
      setPicked(rememberedStarterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberedStarterId]);

  return (
    <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4 py-8">
      <div className="bg-surface border border-border-subtle rounded-xl p-6 sm:p-8 max-w-xl w-full space-y-5">
        <div className="text-center">
          <p className="text-xs text-ink-faint uppercase tracking-wider mb-1">
            Level {level.id} · {level.difficulty}
          </p>
          <h1 className="text-2xl font-display font-semibold">
            {level.opponentIcon} {level.title}
          </h1>
          <p className="text-ink-muted text-sm mt-2">{level.description}</p>
        </div>

        <div>
          <p className="text-xs text-ink-faint font-medium mb-2">Your deck</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[38vh] overflow-y-auto pr-1">
            {starters.map((s) => (
              <button
                key={s.id}
                onClick={() => setPicked(s.id)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  picked === s.id
                    ? "border-accent bg-accent-wash"
                    : "border-border-subtle bg-surface-subtle hover:border-border-strong"
                }`}
              >
                <span className="font-semibold text-sm block">{s.display_name}</span>
                <span className="text-ink-faint text-xs">
                  {s.product_code} · {s.playstyle_short} · leads {s.leader_name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => picked && onStart(picked)}
          disabled={!picked || starting}
          className="w-full bg-ink hover:bg-ink/85 disabled:opacity-50 text-page font-bold rounded-lg py-3 transition-colors text-lg"
        >
          {starting ? "Shuffling…" : "Start battle"}
        </button>

        <p className="text-[11px] text-ink-faint text-center">
          Practice battles run in your browser — nothing is recorded, nothing is
          paid, no account needed. {level.opponentName} pilots a starter deck too.
        </p>

        <div className="text-center">
          <Link
            href="/play/adventure"
            className="text-ink-faint hover:text-ink text-sm transition-colors"
          >
            &larr; Back to Adventure
          </Link>
        </div>
      </div>
    </main>
  );
}

function EndScreen({
  won,
  level,
  nextLevel,
  log,
  onRestart,
}: {
  won: boolean;
  level: AdventureLevel;
  nextLevel: AdventureLevel | null;
  log: PracticeLogEntry[];
  onRestart: () => void;
}) {
  const turns = log.filter((l) => l.text.includes("ended")).length;
  return (
    <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
      <div
        className={`bg-surface border rounded-xl p-8 max-w-md w-full text-center space-y-6 shadow-mat ${
          won ? "border-accent/40" : "border-danger/40"
        }`}
      >
        <div>
          <h2
            className={`text-3xl font-display font-semibold ${
              won ? "text-accent" : "text-danger"
            }`}
          >
            {won ? "VICTORY!" : "DEFEATED"}
          </h2>
          <p className="text-ink-muted mt-2">
            {won
              ? `You beat ${level.opponentIcon} ${level.opponentName}!`
              : `${level.opponentIcon} ${level.opponentName} wins this round.`}
          </p>
        </div>

        <p className="text-ink-faint text-xs">
          Practice battles record nothing — this clear lives in your browser
          only. Rewards stay paused until server-side rules validation is
          complete.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {won && nextLevel && (
            <Link
              href={`/play/adventure/${nextLevel.id}`}
              onClick={onRestart}
              className="w-full sm:w-auto bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-6 py-3 transition-colors"
            >
              Next: {nextLevel.opponentIcon} {nextLevel.opponentName} &rarr;
            </Link>
          )}
          <button
            onClick={onRestart}
            className={`w-full sm:w-auto font-semibold rounded-lg px-6 py-3 transition-colors ${
              won || !nextLevel
                ? "bg-surface border border-border-subtle text-ink"
                : "bg-ink hover:bg-ink/85 text-page font-bold"
            }`}
          >
            {won ? "Play again" : "Try again"}
          </button>
          <Link
            href="/play/adventure"
            className="w-full sm:w-auto text-center bg-surface border border-border-subtle text-ink-muted font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            Back to Adventure
          </Link>
        </div>
        {turns > 0 && (
          <p className="text-ink-faint text-[11px] font-mono">{turns} turns played</p>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Mulligan window (CR 5-2-1-6) — keep or redraw the whole hand once  */
/* ------------------------------------------------------------------ */

function MulliganPrompt({
  hand,
  onDecide,
}: {
  hand: GameCard[];
  onDecide: (redraw: boolean) => void;
}) {
  return (
    <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4 py-8">
      <div className="bg-surface border border-border-subtle rounded-xl p-6 sm:p-8 max-w-2xl w-full space-y-5 text-center">
        <div>
          <h2 className="text-2xl font-display font-semibold">Your opening hand</h2>
          <p className="text-ink-muted text-sm mt-1">
            You may return all five and redraw once — then life cards are set
            and the battle begins.
          </p>
        </div>
        <div className="flex items-end justify-center gap-2 flex-wrap">
          {hand.map((card) => (
            <GameCardView key={card.id} card={card} />
          ))}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => onDecide(false)}
            className="bg-ink hover:bg-ink/85 text-page font-bold rounded-lg px-8 py-3 transition-colors"
          >
            Keep hand
          </button>
          <button
            onClick={() => onDecide(true)}
            className="bg-surface border border-border-subtle text-ink font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            Redraw all 5 (once)
          </button>
        </div>
        <p className="text-[11px] text-ink-faint">
          Official mulligan: the whole hand, once per player. Your opponent
          decides too.
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Defense window — Block Step (7-1-2) + Counter Step (7-1-3)         */
/* ------------------------------------------------------------------ */

function DefensePrompt({
  game,
  onResolve,
}: {
  game: PracticeGame;
  onResolve: (choice: { blockerId?: string | null; counterCardIds?: string[] }) => void;
}) {
  const pd = game.pendingDefense!;
  const you = game.state.player1;
  const ai = game.state.player2;
  const [blockerId, setBlockerId] = useState<string | null>(null);
  const [counterIds, setCounterIds] = useState<string[]>([]);

  const attacker = ([ai.leader, ...ai.field].filter(Boolean) as GameCard[]).find(
    (c) => c.id === pd.attackerId,
  );
  const originalTarget =
    pd.targetType === "leader"
      ? you.leader
      : you.field.find((c) => c.id === pd.targetId) ?? null;
  const blocker = blockerId ? you.field.find((c) => c.id === blockerId) ?? null : null;
  const defender = blocker ?? originalTarget;

  const atk = attacker ? attackPower(attacker) : null;
  const counterSum = counterIds.reduce(
    (sum, id) => sum + (you.hand.find((c) => c.id === id)?.counter ?? 0),
    0,
  );
  const baseDef = defender ? defensePower(defender) : null;
  const totalDef = (baseDef ?? 0) + counterSum;
  const survives = atk != null && baseDef != null && totalDef > atk;

  const blockers = you.field.filter(
    (c) => !c.isRested && c.keywords?.includes("blocker"),
  );
  const counterCards = you.hand.filter((c) => c.counter != null && c.counter > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="bg-surface border border-border-subtle rounded-xl p-5 w-full max-w-md shadow-mat space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="text-center">
          <p className="text-xs text-ink-faint uppercase tracking-wider">Incoming attack</p>
          <h2 className="text-lg font-display font-semibold mt-1">
            {attacker?.name ?? "Attacker"}{atk != null ? ` (${atk})` : ""} →{" "}
            {defender ? (blocker ? `${defender.name} (blocking)` : defender.name) : "?"}
          </h2>
          <p className={`text-sm font-mono mt-1 ${survives ? "text-ok" : "text-danger"}`}>
            {atk ?? "?"} vs {baseDef == null ? "?" : totalDef}
            {counterSum > 0 ? ` (+${counterSum} counter)` : ""} —{" "}
            {survives ? "the attack would MISS" : "the attack would HIT (ties favor the attacker)"}
          </p>
        </div>

        {blockers.length > 0 && (
          <div>
            <p className="text-xs text-ink-faint font-medium mb-1.5">
              Block Step — rest a [Blocker] to redirect the attack
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setBlockerId(null)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  blockerId === null
                    ? "border-accent bg-accent-wash text-accent"
                    : "border-border-subtle text-ink-muted"
                }`}
              >
                No block
              </button>
              {blockers.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBlockerId(b.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    blockerId === b.id
                      ? "border-accent bg-accent-wash text-accent"
                      : "border-border-subtle text-ink"
                  }`}
                >
                  {b.name} ({b.power ?? "?"})
                </button>
              ))}
            </div>
          </div>
        )}

        {counterCards.length > 0 && (
          <div>
            <p className="text-xs text-ink-faint font-medium mb-1.5">
              Counter Step — trash cards from hand for their counter value
            </p>
            <div className="flex flex-wrap gap-2">
              {counterCards.map((c) => {
                const on = counterIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() =>
                      setCounterIds(
                        on ? counterIds.filter((x) => x !== c.id) : [...counterIds, c.id],
                      )
                    }
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      on
                        ? "border-accent bg-accent-wash text-accent"
                        : "border-border-subtle text-ink"
                    }`}
                  >
                    {c.name} +{c.counter}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {blockers.length === 0 && counterCards.length === 0 && (
          <p className="text-ink-faint text-xs text-center">
            No active blockers and no counter cards in hand — brace for it.
          </p>
        )}

        <button
          onClick={() => onResolve({ blockerId, counterCardIds: counterIds })}
          className="w-full bg-ink hover:bg-ink/85 text-page font-bold rounded-lg py-3 transition-colors"
        >
          {blockerId || counterIds.length > 0 ? "Defend" : "Take the hit"}
        </button>
        <p className="text-[10px] text-ink-faint text-center">
          Counters raise power for this battle only. Trashed counters are gone —
          spend them where they matter.
        </p>
      </div>
    </div>
  );
}
