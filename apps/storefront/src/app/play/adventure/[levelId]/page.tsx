"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type {
  GameCard,
  PlayerState,
  GameState,
  GamePhase,
  GameAction,
} from "@/lib/game/types";
import { PHASE_LABELS } from "@/lib/game/types";
import { applyAction } from "@/lib/game/reducer";
import {
  loadSavedDecks,
  deckToCards,
  fetchStarterAsSavedDeck,
  type SavedDeck,
} from "@/lib/play/client-deck";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AI_ACTION_DELAY_MS = 600;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OpponentInfo {
  name: string;
  icon: string;
  difficulty: "easy" | "medium" | "hard" | "extreme";
  level_number: number;
  title: string;
}

interface EarnBreakdown {
  base: number;
  dailyMultiplier: number;
  streakMultiplier: number;
  tierMultiplier: number;
  clearsToday: number;
  currentStreak: number;
}

interface VictoryResult {
  victory: boolean;
  firstClear: boolean;
  pointsEarned: number;
  creditEarned: number;
  pullTokenEarned?: "common" | "uncommon" | "rare" | "super_rare" | "legendary" | null;
  earnBreakdown?: EarnBreakdown | null;
  nextLevelId: number | null;
  guestMode?: boolean;
  signInPromptUrl?: string;
}

interface DefeatResult {
  defeat: boolean;
  message: string;
}

interface AITurnResult {
  actions: GameAction[];
  thinking: string;
}

/* ------------------------------------------------------------------ */
/*  Difficulty styling                                                 */
/* ------------------------------------------------------------------ */

const DIFFICULTY_BADGE: Record<string, { bg: string; text: string }> = {
  easy:    { bg: "bg-green-900/40",  text: "text-green-400" },
  medium:  { bg: "bg-amber-900/40",  text: "text-accent-strong" },
  hard:    { bg: "bg-red-900/40",    text: "text-red-400" },
  extreme: { bg: "bg-purple-900/40", text: "text-purple-400" },
};

/* ================================================================== */
/*  PVE Game Board                                                     */
/* ================================================================== */

export default function PVEGameBoard() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const levelId = params.levelId as string;
  const initialGameId = searchParams.get("gameId");

  /* ---- Core game state ---- */
  const [gameId, setGameId] = useState<string | null>(initialGameId);
  const [state, setState] = useState<GameState | null>(null);
  const [opponent, setOpponent] = useState<OpponentInfo | null>(null);
  const [gameLog, setGameLog] = useState<{ text: string; isAI: boolean; time: string }[]>([]);

  /* ---- UI state ---- */
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [hoverCard, setHoverCard] = useState<GameCard | null>(null);
  const [donRestCount, setDonRestCount] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  /* ---- AI turn state ---- */
  const [aiThinking, setAiThinking] = useState(false);
  const [aiThinkingText, setAiThinkingText] = useState("");
  const replayingRef = useRef(false);

  /* ---- End-game state ---- */
  const [victoryResult, setVictoryResult] = useState<VictoryResult | null>(null);
  const [defeatResult, setDefeatResult] = useState<DefeatResult | null>(null);

  /* ---- Setup state (if no gameId in URL) ---- */
  const [needsSetup, setNeedsSetup] = useState(!initialGameId);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckIdx, setSelectedDeckIdx] = useState<number | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  /* ---- Error state ---- */
  const [error, setError] = useState<string | null>(null);

  /* ---- Derived ---- */
  const myState: PlayerState | null = state?.player1 ?? null;
  const oppState: PlayerState | null = state?.player2 ?? null;
  const isMyTurn = state ? state.currentTurn === state.player1?.userId : false;
  const gameActive = state?.phase !== "finished" && state?.phase !== "setup" && !victoryResult && !defeatResult;

  /* ================================================================ */
  /*  Load saved decks                                                */
  /* ================================================================ */

  useEffect(() => {
    let cancelled = false;
    const stored = loadSavedDecks();
    if (stored.length > 0) {
      setSavedDecks(stored);
      return;
    }
    // No saved decks — auto-mount the default starter so a new player is
    // never walled behind the deck builder (same flow as the /play hub).
    fetchStarterAsSavedDeck().then((starter) => {
      if (cancelled || !starter) return;
      setSavedDecks([starter]);
      setSelectedDeckIdx(0);
    });
    return () => { cancelled = true; };
  }, []);

  /* ================================================================ */
  /*  Start Game (if arrived without gameId)                          */
  /* ================================================================ */

  async function handleStart() {
    if (selectedDeckIdx === null) return;
    const deck = savedDecks[selectedDeckIdx];
    if (!deck) return;

    setSetupError(null);
    setSetupLoading(true);

    const cards = deckToCards(deck);

    if (cards.length < 10) {
      setSetupError("Deck must have at least 10 cards.");
      setSetupLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/game/pve/${levelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", deck: cards }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSetupError(result.error || "Failed to start.");
        setSetupLoading(false);
        return;
      }
      setGameId(result.gameId);
      setState(result.state);
      setOpponent(result.opponent);
      setNeedsSetup(false);
      addLog("Game started!", false);
    } catch {
      setSetupError("Network error.");
    } finally {
      setSetupLoading(false);
    }
  }

  /* ================================================================ */
  /*  Fetch initial state if gameId provided via URL                   */
  /* ================================================================ */

  const initialFetched = useRef(false);

  useEffect(() => {
    if (!gameId || initialFetched.current || state) return;
    initialFetched.current = true;

    async function fetchInitial() {
      try {
        const res = await fetch(`/api/game/pve/${levelId}?gameId=${gameId}`);
        if (!res.ok) {
          setNeedsSetup(true);
          return;
        }
        const data = await res.json();
        if (data.state && data.status === "playing") {
          setState(data.state);
          setOpponent(data.opponent);
          setNeedsSetup(false);
        } else {
          // Game already finished or abandoned — bounce to setup
          setNeedsSetup(true);
        }
      } catch {
        setError("Failed to load game state.");
        setNeedsSetup(true);
      }
    }
    fetchInitial();
  }, [gameId, levelId, state]);

  /* ================================================================ */
  /*  Game Log                                                        */
  /* ================================================================ */

  function addLog(text: string, isAI: boolean) {
    setGameLog(prev => [...prev, {
      text,
      isAI,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
  }

  /* ================================================================ */
  /*  Send Action (player actions)                                    */
  /* ================================================================ */

  const sendAction = useCallback(async (type: string, data: Record<string, unknown> = {}) => {
    if (actionLoading || !state || !myState || !gameId) return;
    setActionLoading(true);
    setError(null);

    // Optimistic: render immediately, reconcile from server.
    const optimistic = applyAction(state, "player1", type, data);
    setState(optimistic);
    addLog(formatActionText(type, data), false);

    try {
      const res = await fetch(`/api/game/pve/${levelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "action", gameId, type, data }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Server rejected — roll back to the pre-action state
        setState(state);
        setError(result.error || "Action rejected.");
        return;
      }
      if (result.state) setState(result.state);
    } catch {
      setState(state);
      setError("Network error.");
    } finally {
      setActionLoading(false);
      setSelectedCard(null);
    }
  }, [actionLoading, state, myState, gameId, levelId]);

  /* ================================================================ */
  /*  AI turn — runs whenever it's the AI's turn (after End Turn, or  */
  /*  immediately when the AI is randomly chosen as first player)     */
  /* ================================================================ */

  const runAiTurn = useCallback(async (baseState: GameState) => {
    if (!gameId || replayingRef.current) return;
    setAiThinking(true);
    setAiThinkingText(`${opponent?.name ?? "AI"} is thinking`);

    try {
      const res = await fetch(`/api/game/pve/${levelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ai_turn", gameId }),
      });
      const result: AITurnResult & { state?: GameState; error?: string } = await res.json();
      if (!res.ok) {
        addLog(result.error || "AI turn failed. Your turn again.", true);
        return;
      }

      if (result.thinking) addLog(result.thinking, true);

      // Replay the AI actions client-side purely for animation timing.
      // The server already applied them — we use the returned state as truth.
      if (result.actions && result.actions.length > 0) {
        replayingRef.current = true;
        let animState = baseState;
        for (const action of result.actions) {
          await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY_MS));
          animState = applyAction(animState, "player2", action.type, action.data);
          setState({ ...animState });
          addLog(`${opponent?.name ?? "AI"}: ${formatActionText(action.type, action.data)}`, true);
          if (animState.phase === "finished") break;
        }
        replayingRef.current = false;
      }

      // Reconcile with the server's authoritative final state.
      if (result.state) setState(result.state);
    } catch {
      addLog("AI turn failed. Your turn again.", true);
    } finally {
      setAiThinking(false);
      setAiThinkingText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, levelId, opponent?.name]);

  async function handleEndTurn() {
    if (!state || !gameId) return;

    // End the human turn via the server (server applies + persists).
    // The reducer is deterministic for end_turn, so the optimistic state
    // sendAction renders is the correct animation baseline for the AI.
    await sendAction("end_turn", {});
    await runAiTurn(applyAction(state, "player1", "end_turn", {}));
  }

  /* When the AI has the turn and isn't already animating, run it. This
   * covers the AI-going-first opening (previously the board soft-locked
   * waiting for an End Turn that could never come) and resume-mid-AI-turn. */
  useEffect(() => {
    if (!state || !gameId || aiThinking || replayingRef.current) return;
    if (state.phase === "finished" || victoryResult || defeatResult) return;
    if (state.currentTurn === state.player1?.userId) return;
    runAiTurn(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentTurn, state?.phase, gameId, aiThinking]);

  /* Auto-upkeep: at the start of the player's turn run the composite
   * begin_turn (refresh + draw + DON!!) server-side. The board teaches the
   * ritual by doing it — no +DON!!/Refresh/Draw buttons to forget. */
  const upkeepSentForTurn = useRef<number>(0);
  useEffect(() => {
    if (!state || !gameId || aiThinking || actionLoading || replayingRef.current) return;
    if (state.phase === "finished" || victoryResult || defeatResult) return;
    if (state.currentTurn !== state.player1?.userId) return;
    if (state.lastUpkeepTurn === state.turnNumber) return;
    if (upkeepSentForTurn.current === state.turnNumber) return;
    upkeepSentForTurn.current = state.turnNumber;
    sendAction("begin_turn", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentTurn, state?.turnNumber, state?.lastUpkeepTurn, gameId, aiThinking, actionLoading]);

  /* ================================================================ */
  /*  Claim Victory                                                   */
  /* ================================================================ */

  async function handleClaimVictory() {
    if (!gameId || !state) return;
    setActionLoading(true);

    try {
      // The server derives turns/life from its persisted state — the
      // client sends nothing it could lie about.
      const res = await fetch(`/api/game/pve/${levelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "victory", gameId }),
      });
      const result: VictoryResult & { error?: string } = await res.json();
      if (!res.ok) {
        setError(result.error || "Victory not confirmed by the server.");
        return;
      }
      setVictoryResult(result);
    } catch {
      setError("Failed to claim victory.");
    } finally {
      setActionLoading(false);
    }
  }

  /* ================================================================ */
  /*  Concede / Defeat                                                */
  /* ================================================================ */

  async function handleConcede(manual: boolean = true) {
    if (!gameId) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/game/pve/${levelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "defeat", gameId, concede: manual }),
      });
      const result: DefeatResult = await res.json();
      setDefeatResult(result);
    } catch {
      setError("Failed to concede.");
    } finally {
      setActionLoading(false);
    }
  }

  /* ================================================================ */
  /*  Auto finalize when state.phase flips to "finished"              */
  /* ================================================================ */

  const finalizedRef = useRef(false);

  useEffect(() => {
    if (!state || !gameId) return;
    if (state.phase !== "finished") return;
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    const youWon = state.winner && state.winner === state.player1.userId;

    if (youWon) {
      addLog("You defeated your opponent!", false);
      handleClaimVictory();
    } else {
      addLog("You were defeated.", true);
      handleConcede(false);
    }
    // handleClaimVictory/handleConcede close over current state; running once
    // on the finished transition is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.winner, gameId]);


  /* ================================================================ */
  /*  Format action text                                              */
  /* ================================================================ */

  function formatActionText(type: string, data: Record<string, unknown>): string {
    switch (type) {
      case "move_card": return `moved a card to ${data.toZone}`;
      case "toggle_rest": return "toggled rest on a card";
      case "attach_don": return "attached DON!! to a card";
      case "detach_don": return "detached DON!! from a card";
      case "rest_don": return `rested ${data.count} DON!!`;
      case "begin_turn": return "started the turn (refresh, draw, DON!!)";
      case "refresh_all": return "refreshed all cards";
      case "draw_card": return "drew a card";
      case "add_don": return "added DON!! from deck";
      case "take_damage": return "took damage (life to hand)";
      case "attack":
        return data.targetType === "leader"
          ? "attacks the leader!"
          : "attacks a character!";
      case "next_phase": return "advanced to next phase";
      case "end_turn": return "ended turn";
      default: return type;
    }
  }

  /* ================================================================ */
  /*  Renderers                                                       */
  /* ================================================================ */

  /* ---- Single card ---- */
  function CardSlot({
    card,
    faceUp = true,
    small = false,
    onClick,
    className = "",
  }: {
    card: GameCard | null;
    faceUp?: boolean;
    small?: boolean;
    onClick?: () => void;
    className?: string;
  }) {
    if (!card) {
      return (
        <div
          className={`${
            small ? "w-12 h-[66px]" : "w-16 h-[88px]"
          } rounded-lg border border-border-subtle bg-surface/50 flex-shrink-0 ${className}`}
        />
      );
    }

    const isRested = card.isRested;
    const isSelected = selectedCard?.id === card.id;
    const showFace = faceUp && !card.faceDown && card.imageUrl;

    return (
      <div className="relative flex-shrink-0">
        <button
          onClick={onClick}
          onMouseEnter={() => faceUp && !card.faceDown ? setHoverCard(card) : null}
          onMouseLeave={() => setHoverCard(null)}
          className={`${
            small ? "w-12 h-[66px]" : "w-16 h-[88px]"
          } rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
            isSelected
              ? "border-accent-strong ring-2 ring-amber-400/40 scale-105"
              : "border-border-strong hover:border-neutral-500"
          } ${isRested ? "rotate-90 origin-center" : ""} ${className}`}
          style={isRested ? { margin: "0 12px" } : undefined}
        >
          {showFace ? (
            <Image
              src={card.imageUrl!}
              alt={card.name}
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-700 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-neutral-600 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-neutral-600" />
              </div>
            </div>
          )}
        </button>
        {card.attachedDon > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-accent text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow z-10">
            +{card.attachedDon}
          </span>
        )}
      </div>
    );
  }

  /* ---- Deck stack ---- */
  function DeckStack({ count, label, onClick }: { count: number; label: string; onClick?: () => void }) {
    return (
      <button
        onClick={onClick}
        className="relative w-16 h-[88px] rounded-lg bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-700 border-2 border-neutral-600 hover:border-neutral-500 flex-shrink-0 transition-colors"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-ink-muted text-[10px] font-medium">{label}</span>
          <span className="text-ink font-bold text-lg">{count}</span>
        </div>
      </button>
    );
  }

  /* ---- Life dots ---- */
  function LifeDots({ count, max = 5 }: { count: number; max?: number }) {
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              i < count ? "bg-danger shadow-[0_0_6px_rgba(239,68,68,0.5)]" : "bg-neutral-700"
            }`}
          />
        ))}
      </div>
    );
  }

  /* ---- DON!! display ---- */
  function DonDisplay({
    active,
    rested,
    total,
    isOwn,
  }: {
    active: number;
    rested: number;
    total: number;
    isOwn: boolean;
  }) {
    const used = active + rested;
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-accent-strong font-bold text-xs">DON!!</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: used }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-5 rounded-sm text-[8px] font-bold flex items-center justify-center ${
                i < active
                  ? "bg-accent text-black"
                  : "bg-neutral-700 text-ink-faint"
              }`}
            >
              {i < active ? "D" : "R"}
            </div>
          ))}
        </div>
        <span className="text-ink-faint text-xs">
          {active}/{used}{total > 0 ? ` (+${total} deck)` : ""}
        </span>
        {isOwn && gameActive && isMyTurn && !aiThinking && (
          <div className="flex items-center gap-1 ml-2">
            <input
              type="number"
              min={1}
              max={active}
              value={donRestCount}
              onChange={(e) => setDonRestCount(Math.max(1, Math.min(active, parseInt(e.target.value) || 1)))}
              className="w-10 bg-surface-elevated border border-border-strong rounded text-center text-xs py-0.5"
            />
            <button
              onClick={() => sendAction("rest_don", { count: donRestCount })}
              className="text-xs bg-accent/20 text-accent-strong hover:bg-accent/30 px-2 py-0.5 rounded transition-colors"
            >
              Rest
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ---- Card action menu ---- */
  function CardActionMenu() {
    if (!selectedCard || !gameActive) return null;
    const card = selectedCard;
    const zone = card.zone;

    const actions: { label: string; action: () => void; variant?: "danger" }[] = [];

    const canAttack = (zone === "leader" || zone === "field") && !card.isRested && isMyTurn;
    const restedOppChars = oppState?.field.filter(c => c.isRested) ?? [];

    if (zone === "hand") {
      actions.push({ label: "Play to Field", action: () => sendAction("move_card", { cardId: card.id, toZone: "field", faceDown: false }) });
      actions.push({ label: "Play as Stage", action: () => sendAction("move_card", { cardId: card.id, toZone: "stage", faceDown: false }) });
    }
    if (canAttack) {
      actions.push({
        label: "⚔ Attack Opponent Leader",
        action: () => sendAction("attack", { attackerId: card.id, targetType: "leader" }),
      });
      for (const target of restedOppChars) {
        actions.push({
          label: `⚔ Attack ${target.name}`,
          action: () => sendAction("attack", { attackerId: card.id, targetType: "character", targetId: target.id }),
        });
      }
    }
    if (zone === "field") {
      actions.push({ label: card.isRested ? "Set Active" : "Rest", action: () => sendAction("toggle_rest", { cardId: card.id }) });
      actions.push({ label: "Attach DON!!", action: () => sendAction("attach_don", { cardId: card.id }) });
      if (card.attachedDon > 0) {
        actions.push({ label: "Detach DON!!", action: () => sendAction("detach_don", { cardId: card.id }) });
      }
      actions.push({ label: "Send to Trash", action: () => sendAction("move_card", { cardId: card.id, toZone: "trash", faceDown: false }), variant: "danger" });
    }
    if (zone === "leader") {
      actions.push({ label: card.isRested ? "Set Active" : "Rest", action: () => sendAction("toggle_rest", { cardId: card.id }) });
      actions.push({ label: "Attach DON!!", action: () => sendAction("attach_don", { cardId: card.id }) });
      if (card.attachedDon > 0) {
        actions.push({ label: "Detach DON!!", action: () => sendAction("detach_don", { cardId: card.id }) });
      }
    }
    if (zone === "stage") {
      actions.push({ label: card.isRested ? "Set Active" : "Rest", action: () => sendAction("toggle_rest", { cardId: card.id }) });
      actions.push({ label: "Send to Trash", action: () => sendAction("move_card", { cardId: card.id, toZone: "trash", faceDown: false }), variant: "danger" });
    }

    if (actions.length === 0) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedCard(null)}>
        <div className="bg-surface border border-border-strong rounded-xl p-4 min-w-[220px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border-subtle">
            {!card.faceDown && card.imageUrl ? (
              <div className="w-10 h-14 rounded overflow-hidden relative flex-shrink-0">
                <Image src={card.imageUrl} alt={card.name} fill sizes="40px" className="object-cover" />
              </div>
            ) : (
              <div className="w-10 h-14 rounded bg-surface-elevated flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{card.faceDown ? "Face-down card" : card.name}</p>
              <p className="text-ink-faint text-xs">{card.zone} {card.isRested ? "(rested)" : ""}</p>
              {card.attachedDon > 0 && <p className="text-accent-strong text-xs">+{card.attachedDon} DON!!</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { a.action(); setSelectedCard(null); }}
                disabled={actionLoading || !isMyTurn || aiThinking}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40 ${
                  a.variant === "danger"
                    ? "hover:bg-red-900/40 text-red-400"
                    : "hover:bg-surface-elevated text-ink"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSelectedCard(null)}
            className="w-full mt-3 pt-3 border-t border-border-subtle text-ink-faint text-xs hover:text-ink-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /* ---- Hover preview ---- */
  function HoverPreview() {
    if (!hoverCard || hoverCard.faceDown || !hoverCard.imageUrl) return null;
    return (
      <div className="fixed top-4 right-4 z-40 pointer-events-none">
        <div className="w-48 h-[264px] rounded-xl overflow-hidden border-2 border-neutral-600 shadow-2xl relative">
          <Image src={hoverCard.imageUrl} alt={hoverCard.name} fill sizes="192px" className="object-cover" />
        </div>
        <p className="text-ink text-sm font-semibold mt-2 text-center max-w-[192px] truncate">{hoverCard.name}</p>
        {hoverCard.cardNumber && (
          <p className="text-ink-muted text-xs text-center">{hoverCard.cardNumber}</p>
        )}
      </div>
    );
  }

  /* ---- Player area ---- */
  function PlayerArea({
    player,
    isOwn,
    label,
    isAI = false,
  }: {
    player: PlayerState;
    isOwn: boolean;
    label: string;
    isAI?: boolean;
  }) {
    const fieldCards = player.field || [];
    const handCards = player.hand || [];

    return (
      <div className={`rounded-xl p-3 sm:p-4 ${
        isAI
          ? "bg-red-950/20 border border-red-900/20"
          : isOwn
            ? "bg-surface/80"
            : "bg-surface/40"
      }`}>
        {/* Label row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isAI && opponent && (
              <span className="text-lg">{opponent.icon}</span>
            )}
            <span className={`font-bold text-sm ${isOwn ? "text-accent-strong" : isAI ? "text-red-400" : "text-ink-muted"}`}>
              {label}
            </span>
            {isAI && opponent && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                DIFFICULTY_BADGE[opponent.difficulty]?.bg ?? ""
              } ${DIFFICULTY_BADGE[opponent.difficulty]?.text ?? ""}`}>
                {opponent.difficulty}
              </span>
            )}
            {isOwn && isMyTurn && !aiThinking && (
              <span className="text-[10px] bg-accent/20 text-accent-strong px-2 py-0.5 rounded-full font-medium">
                Your Turn
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LifeDots count={player.lifeCount} />
            <span className="text-ink-faint text-xs">
              Deck: {player.deck?.length ?? 0}
            </span>
          </div>
        </div>

        {/* DON!! display */}
        <div className="mb-3">
          <DonDisplay
            active={player.donActive}
            rested={player.donRested}
            total={player.donDeck}
            isOwn={isOwn}
          />
        </div>

        {/* Board: Deck | Leader | Field (x5) | Stage */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2">
          <DeckStack
            count={player.deck?.length ?? 0}
            label="Deck"
            onClick={isOwn && isMyTurn && !aiThinking ? () => sendAction("draw_card") : undefined}
          />

          <div className="flex-shrink-0">
            <div className="text-[10px] text-ink-faint text-center mb-0.5">Leader</div>
            <CardSlot
              card={player.leader}
              faceUp={true}
              onClick={isOwn && player.leader ? () => setSelectedCard(player.leader!) : undefined}
            />
          </div>

          <div className="w-px h-16 bg-neutral-700 flex-shrink-0 mx-1" />

          <div className="flex items-end gap-1.5 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => {
              const card = fieldCards[i] ?? null;
              return (
                <div key={i} className="flex-shrink-0">
                  {i === 0 && <div className="text-[10px] text-ink-faint text-center mb-0.5">Field</div>}
                  {i !== 0 && <div className="h-[14px]" />}
                  <CardSlot
                    card={card}
                    faceUp={true}
                    onClick={isOwn && card ? () => setSelectedCard(card) : undefined}
                  />
                </div>
              );
            })}
          </div>

          <div className="w-px h-16 bg-neutral-700 flex-shrink-0 mx-1" />

          <div className="flex-shrink-0">
            <div className="text-[10px] text-ink-faint text-center mb-0.5">Stage</div>
            <CardSlot
              card={player.stage}
              faceUp={true}
              onClick={isOwn && player.stage ? () => setSelectedCard(player.stage!) : undefined}
            />
          </div>
        </div>

        {/* Hand */}
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-ink-faint font-medium">
              Hand ({handCards.length})
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {handCards.length === 0 ? (
              <span className="text-neutral-600 text-xs italic">Empty</span>
            ) : (
              handCards.map((card) => (
                <CardSlot
                  key={card.id}
                  card={card}
                  faceUp={isOwn}
                  small={!isOwn}
                  onClick={isOwn ? () => setSelectedCard(card) : undefined}
                />
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---- AI thinking indicator ---- */
  function AIThinkingBanner() {
    if (!aiThinking) return null;
    return (
      <div className="bg-red-950/30 border border-red-900/30 rounded-lg px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        <span className="text-red-400 text-sm font-medium">
          {aiThinkingText || "AI is thinking"}...
        </span>
      </div>
    );
  }

  /* ---- Game log panel ---- */
  function GameLogPanel() {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [gameLog.length]);

    return (
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-page border-l border-border-subtle z-30 transform transition-transform ${
          showLog ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h3 className="font-bold text-sm">Game Log</h3>
          <button onClick={() => setShowLog(false)} className="text-ink-faint hover:text-ink text-lg">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-56px)] p-3 space-y-1.5">
          {gameLog.length === 0 ? (
            <p className="text-neutral-600 text-xs italic">No actions yet.</p>
          ) : (
            gameLog.map((entry, i) => (
              <div key={i} className={`text-xs py-1 border-b border-neutral-900 ${entry.isAI ? "text-red-400/80" : "text-ink-muted"}`}>
                <span className="text-neutral-600 mr-1">{entry.time}</span>
                {entry.text}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Screens                                                         */
  /* ================================================================ */

  /* ---- Setup / Deck selection screen ---- */
  if (needsSetup) {
    return (
      <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div className="bg-surface border border-border-subtle rounded-xl p-6 sm:p-8 max-w-xl w-full space-y-5">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-1">Adventure Mode</h2>
            <p className="text-ink-muted text-sm">
              Select a deck to begin your battle.
            </p>
          </div>

          {setupError && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">
              {setupError}
            </div>
          )}

          {savedDecks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-ink-faint mb-4">No saved decks found.</p>
              <Link
                href="/deck-builder"
                className="inline-block bg-accent hover:bg-accent-strong text-black font-bold rounded-lg px-6 py-3 transition-colors"
              >
                Open Deck Builder
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {savedDecks.map((deck, i) => {
                  const totalCards = deck.entries.reduce((s, e) => s + e.quantity, 0);
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDeckIdx(i)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedDeckIdx === i
                          ? "border-accent bg-accent/10"
                          : "border-border-subtle bg-surface-elevated/50 hover:border-neutral-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">{deck.name}</span>
                          {deck.leader && (
                            <span className="text-accent-strong text-xs ml-2">
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
              <button
                onClick={handleStart}
                disabled={selectedDeckIdx === null || setupLoading}
                className="w-full bg-accent hover:bg-accent-strong disabled:opacity-50 text-black font-bold rounded-lg py-3 transition-colors text-lg"
              >
                {setupLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                    Starting...
                  </span>
                ) : (
                  "Start Battle"
                )}
              </button>
            </>
          )}

          <div className="text-center">
            <Link href="/play/adventure" className="text-ink-faint hover:text-ink-muted text-sm transition-colors">
              &larr; Back to Adventure
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /* ---- Loading (no state yet) ---- */
  if (!state || !myState || !oppState) {
    return (
      <main className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-ink-muted">Loading game...</p>
        </div>
      </main>
    );
  }

  /* ---- Victory screen ---- */
  if (victoryResult) {
    return (
      <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div className="relative">
          {/* Confetti-style decorative elements */}
          <div className="absolute -top-10 -left-10 w-20 h-20 bg-accent/10 rounded-full blur-xl animate-pulse" />
          <div className="absolute -top-6 -right-8 w-16 h-16 bg-green-500/10 rounded-full blur-xl animate-pulse" style={{ animationDelay: "500ms" }} />
          <div className="absolute -bottom-8 left-1/2 w-24 h-24 bg-accent/5 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "1000ms" }} />

          <div className="bg-surface border border-amber-700/40 rounded-2xl p-8 max-w-md text-center space-y-6 shadow-2xl shadow-amber-500/10 relative">
            {/* Victory header */}
            <div>
              <div className="text-5xl mb-3">&#127881;</div>
              <h2 className="text-3xl font-extrabold text-accent-strong">VICTORY!</h2>
              <p className="text-ink-muted mt-2">
                You defeated {opponent?.icon} {opponent?.name}!
              </p>
            </div>

            {/* Rewards */}
            <div className="bg-surface-elevated/60 rounded-xl p-4 space-y-3">
              {victoryResult.firstClear && (
                <div className="text-xs text-accent-strong font-bold uppercase tracking-wider mb-2">
                  First Clear Bonus
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-lg">
                <span>&#11088;</span>
                <span className="text-accent-strong font-bold">+{victoryResult.pointsEarned} Berries</span>
              </div>

              {/* Earn breakdown — shown when any multiplier is in play */}
              {victoryResult.earnBreakdown && (() => {
                const b = victoryResult.earnBreakdown;
                const hasDaily = b.dailyMultiplier < 1;
                const hasStreak = b.streakMultiplier > 1;
                const hasTier = b.tierMultiplier > 1;
                if (!hasDaily && !hasStreak && !hasTier) return null;
                return (
                  <div className="text-xs text-ink-muted font-mono bg-surface/50 rounded-lg p-2 leading-relaxed">
                    <span>{b.base} base</span>
                    {hasDaily && (
                      <>
                        <span className="text-neutral-600"> × </span>
                        <span className="text-red-400">
                          {Math.round(b.dailyMultiplier * 100)}%
                          <span className="text-ink-faint"> (clear #{b.clearsToday} today)</span>
                        </span>
                      </>
                    )}
                    {hasStreak && (
                      <>
                        <span className="text-neutral-600"> × </span>
                        <span className="text-orange-400">
                          {b.streakMultiplier.toFixed(2)}x
                          <span className="text-ink-faint"> ({b.currentStreak}-day streak)</span>
                        </span>
                      </>
                    )}
                    {hasTier && (
                      <>
                        <span className="text-neutral-600"> × </span>
                        <span className="text-purple-400">{b.tierMultiplier.toFixed(2)}x tier</span>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Yu 2026-05-14: store-credit reward removed from victory
                  screen — play module is fun-only. The server may still
                  emit creditEarned for backwards compatibility, but it's
                  no longer surfaced on the play surface. */}

              {victoryResult.pullTokenEarned && (
                <div className="flex items-center justify-center gap-2 text-sm bg-gradient-to-r from-amber-500/20 to-fuchsia-500/20 border border-accent/30 rounded-lg py-2 px-3">
                  <span>&#127891;</span>
                  <span className="text-accent-strong font-bold">
                    {victoryResult.pullTokenEarned.replace("_", " ").toUpperCase()} Pull Token
                  </span>
                </div>
              )}

              {victoryResult.guestMode && (
                <a
                  href={victoryResult.signInPromptUrl || "/api/auth/signin?callbackUrl=/play"}
                  className="block text-xs text-accent-strong/90 bg-accent/10 border border-accent/20 rounded-lg py-2 px-3 hover:bg-accent/20 transition-colors"
                >
                  Playing as guest — sign in to earn Berries for wins like this one.
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {victoryResult.nextLevelId != null && (
                <button
                  onClick={() => {
                    router.push(`/play/adventure/${victoryResult.nextLevelId}`);
                    setVictoryResult(null);
                    setNeedsSetup(true);
                    setGameId(null);
                    setState(null);
                    setGameLog([]);
                  }}
                  className="w-full sm:w-auto bg-accent hover:bg-accent-strong text-black font-bold rounded-lg px-6 py-3 transition-colors"
                >
                  Next Level &rarr;
                </button>
              )}
              <button
                onClick={() => {
                  setVictoryResult(null);
                  setNeedsSetup(true);
                  setGameId(null);
                  setState(null);
                  setGameLog([]);
                }}
                className="w-full sm:w-auto bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-ink font-semibold rounded-lg px-6 py-3 transition-colors"
              >
                Play Again
              </button>
              <Link
                href="/play/adventure"
                className="w-full sm:w-auto text-center bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-ink-muted font-semibold rounded-lg px-6 py-3 transition-colors"
              >
                Back to Adventure
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ---- Defeat screen ---- */
  if (defeatResult) {
    return (
      <main className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <div className="bg-surface border border-red-900/40 rounded-2xl p-8 max-w-md text-center space-y-6 shadow-2xl shadow-red-500/10">
          <div>
            <div className="text-5xl mb-3">&#128128;</div>
            <h2 className="text-3xl font-extrabold text-red-400">DEFEATED</h2>
            <p className="text-ink-muted mt-2">
              {opponent?.icon} {opponent?.name} wins this round.
            </p>
          </div>

          <div className="bg-surface-elevated/60 rounded-xl p-4">
            <p className="text-ink-muted text-sm">
              {defeatResult.message || "Your deck is still ready. Try a different strategy!"}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setDefeatResult(null);
                setNeedsSetup(true);
                setGameId(null);
                setState(null);
                setGameLog([]);
              }}
              className="w-full sm:w-auto bg-accent hover:bg-accent-strong text-black font-bold rounded-lg px-6 py-3 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                setDefeatResult(null);
                setNeedsSetup(true);
                setGameId(null);
                setState(null);
                setGameLog([]);
                setSelectedDeckIdx(null);
              }}
              className="w-full sm:w-auto bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-ink font-semibold rounded-lg px-6 py-3 transition-colors"
            >
              Change Deck
            </button>
            <Link
              href="/play/adventure"
              className="w-full sm:w-auto text-center bg-surface-elevated hover:bg-neutral-700 border border-border-strong text-ink-muted font-semibold rounded-lg px-6 py-3 transition-colors"
            >
              Back to Adventure
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /* ================================================================ */
  /*  Main Game Board                                                 */
  /* ================================================================ */

  return (
    <main className="min-h-screen bg-page text-ink flex flex-col">
      <HoverPreview />
      <CardActionMenu />
      <GameLogPanel />

      {/* ---- Level info bar ---- */}
      <div className="bg-surface/60 border-b border-border-subtle px-3 py-1.5 text-center">
        <span className="text-sm">
          <span className="text-ink-faint">Level {opponent?.level_number ?? "?"}:</span>{" "}
          <span className="text-ink font-medium">{opponent?.title ?? "Unknown"}</span>
          <span className="text-ink-faint mx-2">&#8212;</span>
          <span className="text-ink-muted">vs</span>{" "}
          <span>{opponent?.icon ?? ""}</span>{" "}
          <span className="text-red-400 font-medium">{opponent?.name ?? "AI"}</span>
          {opponent?.difficulty && (
            <span className={`ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              DIFFICULTY_BADGE[opponent.difficulty]?.bg ?? ""
            } ${DIFFICULTY_BADGE[opponent.difficulty]?.text ?? ""}`}>
              {opponent.difficulty}
            </span>
          )}
        </span>
      </div>

      {/* ---- Top bar ---- */}
      <header className="bg-surface/80 border-b border-border-subtle px-3 sm:px-4 py-2 flex items-center justify-between text-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/play/adventure" className="text-ink-faint hover:text-ink-muted transition-colors">
            &larr;
          </Link>
          <span className="text-ink-muted font-medium">Adventure Mode</span>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-red-400 text-xs">{error}</span>}
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-ink-faint hover:text-ink text-xs bg-surface-elevated px-3 py-1.5 rounded transition-colors"
          >
            Log
          </button>
          {gameActive && (
            <button
              onClick={() => { if (confirm("Concede this battle?")) handleConcede(); }}
              className="text-danger hover:text-red-400 text-xs bg-surface-elevated px-3 py-1.5 rounded transition-colors"
            >
              Concede
            </button>
          )}
        </div>
      </header>

      {/* ---- Board ---- */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3">
        {/* Opponent area (AI) */}
        <PlayerArea
          player={oppState}
          isOwn={false}
          label={opponent?.name ?? "AI Opponent"}
          isAI={true}
        />

        {/* ---- AI thinking / Phase divider ---- */}
        {aiThinking ? (
          <AIThinkingBanner />
        ) : (
          <div className="bg-surface-elevated/60 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-accent-strong font-bold text-sm">
                {PHASE_LABELS[state.phase as GamePhase] || state.phase}
              </span>
              <span className="text-ink-faint text-xs">
                Turn {state.turnNumber}
              </span>
              {!isMyTurn && (
                <span className="text-red-400/70 text-xs italic">
                  {opponent?.name ?? "AI"}&apos;s turn
                </span>
              )}
            </div>
            {isMyTurn && gameActive && (
              <div className="flex items-center gap-2">
                <span className="text-ink-faint text-xs hidden sm:inline">
                  Tap a card to play or attack
                </span>
                <button
                  onClick={handleEndTurn}
                  disabled={actionLoading}
                  className="text-xs bg-white/10 hover:bg-white/20 text-ink px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  End Turn &#127937;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Your area */}
        <PlayerArea
          player={myState}
          isOwn={true}
          label={myState.name || "You"}
        />
      </div>

      {/* ---- Quick actions (mobile) ---- */}
      {isMyTurn && gameActive && !aiThinking && (
        <div className="sm:hidden bg-surface border-t border-border-subtle px-3 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0">
          <span className="text-ink-faint text-xs whitespace-nowrap">Tap a card to play or attack</span>
          <button
            onClick={handleEndTurn}
            disabled={actionLoading}
            className="text-xs bg-white/10 text-ink px-3 py-2 rounded-lg whitespace-nowrap ml-auto"
          >
            End Turn
          </button>
          <button
            onClick={() => { if (confirm("Concede?")) handleConcede(); }}
            className="text-xs bg-red-900/40 text-red-400 px-3 py-2 rounded-lg whitespace-nowrap"
          >
            Concede
          </button>
        </div>
      )}
    </main>
  );
}
