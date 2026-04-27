"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const POLL_MS = 1500;
const STORAGE_KEY = "ctcg-deck-builder-decks";

/* ------------------------------------------------------------------ */
/*  Saved deck types (matches deck-builder localStorage)               */
/* ------------------------------------------------------------------ */

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
/*  API response shape                                                 */
/* ------------------------------------------------------------------ */

interface StateResponse {
  room: {
    id: string;
    code: string;
    status: "waiting" | "playing" | "finished" | "abandoned";
    player1Name: string | null;
    player2Name: string | null;
    player1Id: string | null;
    player2Id: string | null;
    turnNumber: number;
    phase: string;
    isPublic: boolean;
    lastActionAt: string;
  };
  state: GameState | null;
  log: GameAction[];
  you: "player1" | "player2" | "spectator";
}

/* ================================================================== */
/*  Game Board Page                                                    */
/* ================================================================== */

export default function GameBoard() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string || "").toUpperCase();

  /* ---- Core state ---- */
  const [resp, setResp] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastActionRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- UI state ---- */
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [hoverCard, setHoverCard] = useState<GameCard | null>(null);
  const [donRestCount, setDonRestCount] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  /* ---- Setup state ---- */
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckIdx, setSelectedDeckIdx] = useState<number | null>(null);
  const [deckSubmitted, setDeckSubmitted] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  /* ---- Derived ---- */
  const room = resp?.room ?? null;
  const state = resp?.state ?? null;
  const you = resp?.you ?? "spectator";
  const log = resp?.log ?? [];
  const isPlayer = you === "player1" || you === "player2";
  const isMyTurn = state ? (you === "player1" ? state.currentTurn === state.player1.userId : state.currentTurn === state.player2.userId) : false;
  const myState: PlayerState | null = state ? (you === "player1" ? state.player1 : you === "player2" ? state.player2 : state.player1) : null;
  const oppState: PlayerState | null = state ? (you === "player1" ? state.player2 : you === "player2" ? state.player1 : state.player2) : null;
  const gameActive = room?.status === "playing" && state?.phase !== "finished";

  /* ================================================================ */
  /*  Polling                                                         */
  /* ================================================================ */

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/game/${code}/state`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to load game.");
        return;
      }
      const data: StateResponse = await res.json();
      // Only update if state changed
      if (data.room.lastActionAt !== lastActionRef.current) {
        lastActionRef.current = data.room.lastActionAt;
        setResp(data);
        setError(null);
      } else if (!resp) {
        // First load
        setResp(data);
        setError(null);
      }
    } catch {
      setError("Connection lost. Retrying...");
    }
  }, [code, resp]);

  useEffect(() => {
    fetchState();
    pollRef.current = setInterval(fetchState, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchState]);

  // Stop polling when game is finished
  useEffect(() => {
    if (room?.status === "finished" || room?.status === "abandoned" || state?.phase === "finished") {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [room?.status, state?.phase]);

  /* ================================================================ */
  /*  Deck Setup                                                      */
  /* ================================================================ */

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSavedDecks(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  async function submitDeck() {
    if (selectedDeckIdx === null) return;
    const deck = savedDecks[selectedDeckIdx];
    if (!deck) return;

    setSetupError(null);

    // Build the deck payload
    const cards: { sku: string; name: string; cardNumber: string; imageUrl: string | null; rarity: string | null; isLeader?: boolean }[] = [];

    // Leader
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

    // Main deck cards (expand quantities)
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
      setSetupError("Deck must have at least 10 cards.");
      return;
    }

    try {
      const res = await fetch(`/api/game/${code}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck: cards }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSetupError(data.error || "Failed to submit deck.");
        return;
      }
      setDeckSubmitted(true);
      // Trigger a re-fetch
      fetchState();
    } catch {
      setSetupError("Network error.");
    }
  }

  /* ================================================================ */
  /*  Game Actions                                                    */
  /* ================================================================ */

  async function sendAction(type: string, data: Record<string, unknown> = {}) {
    if (!isPlayer || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/game/${code}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Action failed.");
      } else {
        setSelectedCard(null);
        fetchState();
      }
    } catch {
      setError("Network error.");
    } finally {
      setActionLoading(false);
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
          } rounded-lg border border-neutral-800 bg-neutral-900/50 flex-shrink-0 ${className}`}
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
              ? "border-amber-400 ring-2 ring-amber-400/40 scale-105"
              : "border-neutral-700 hover:border-neutral-500"
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
        {/* DON!! badge */}
        {card.attachedDon > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow z-10">
            +{card.attachedDon}
          </span>
        )}
      </div>
    );
  }

  /* ---- Deck (face-down stack) ---- */
  function DeckStack({ count, label, onClick }: { count: number; label: string; onClick?: () => void }) {
    return (
      <button
        onClick={onClick}
        className="relative w-16 h-[88px] rounded-lg bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-700 border-2 border-neutral-600 hover:border-neutral-500 flex-shrink-0 transition-colors"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-neutral-400 text-[10px] font-medium">{label}</span>
          <span className="text-white font-bold text-lg">{count}</span>
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
              i < count ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" : "bg-neutral-700"
            }`}
          />
        ))}
      </div>
    );
  }

  /* ---- DON!! indicators ---- */
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
        <span className="text-amber-400 font-bold text-xs">DON!!</span>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: used }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-5 rounded-sm text-[8px] font-bold flex items-center justify-center ${
                i < active
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-700 text-neutral-500"
              }`}
            >
              {i < active ? "D" : "R"}
            </div>
          ))}
        </div>
        <span className="text-neutral-500 text-xs">
          {active}/{used}{total > 0 ? ` (+${total} deck)` : ""}
        </span>
        {isOwn && gameActive && isMyTurn && (
          <div className="flex items-center gap-1 ml-2">
            <input
              type="number"
              min={1}
              max={active}
              value={donRestCount}
              onChange={(e) => setDonRestCount(Math.max(1, Math.min(active, parseInt(e.target.value) || 1)))}
              className="w-10 bg-neutral-800 border border-neutral-700 rounded text-center text-xs py-0.5"
            />
            <button
              onClick={() => sendAction("rest_don", { count: donRestCount })}
              className="text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 px-2 py-0.5 rounded transition-colors"
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
    if (!selectedCard || !isPlayer || !gameActive) return null;

    const card = selectedCard;
    const zone = card.zone;

    const actions: { label: string; action: () => void; variant?: "danger" }[] = [];

    if (zone === "hand") {
      actions.push({ label: "Play to Field", action: () => sendAction("move_card", { cardId: card.id, toZone: "field", faceDown: false }) });
      actions.push({ label: "Play as Stage", action: () => sendAction("move_card", { cardId: card.id, toZone: "stage", faceDown: false }) });
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
    if (zone === "life") {
      actions.push({ label: "Reveal to Hand", action: () => sendAction("take_damage") });
    }
    if (zone === "stage") {
      actions.push({ label: card.isRested ? "Set Active" : "Rest", action: () => sendAction("toggle_rest", { cardId: card.id }) });
      actions.push({ label: "Send to Trash", action: () => sendAction("move_card", { cardId: card.id, toZone: "trash", faceDown: false }), variant: "danger" });
    }

    if (actions.length === 0) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedCard(null)}>
        <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 min-w-[220px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Card info */}
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-neutral-800">
            {!card.faceDown && card.imageUrl ? (
              <div className="w-10 h-14 rounded overflow-hidden relative flex-shrink-0">
                <Image src={card.imageUrl} alt={card.name} fill sizes="40px" className="object-cover" />
              </div>
            ) : (
              <div className="w-10 h-14 rounded bg-neutral-800 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{card.faceDown ? "Face-down card" : card.name}</p>
              <p className="text-neutral-500 text-xs">{card.zone} {card.isRested ? "(rested)" : ""}</p>
              {card.attachedDon > 0 && <p className="text-amber-400 text-xs">+{card.attachedDon} DON!!</p>}
            </div>
          </div>
          {/* Actions */}
          <div className="space-y-1.5">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={() => { a.action(); setSelectedCard(null); }}
                disabled={actionLoading || !isMyTurn}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40 ${
                  a.variant === "danger"
                    ? "hover:bg-red-900/40 text-red-400"
                    : "hover:bg-neutral-800 text-white"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSelectedCard(null)}
            className="w-full mt-3 pt-3 border-t border-neutral-800 text-neutral-500 text-xs hover:text-neutral-300 transition-colors"
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
        <p className="text-white text-sm font-semibold mt-2 text-center max-w-[192px] truncate">{hoverCard.name}</p>
        {hoverCard.cardNumber && (
          <p className="text-neutral-400 text-xs text-center">{hoverCard.cardNumber}</p>
        )}
      </div>
    );
  }

  /* ---- Player area ---- */
  function PlayerArea({
    player,
    isOwn,
    label,
  }: {
    player: PlayerState;
    isOwn: boolean;
    label: string;
  }) {
    const fieldCards = player.field || [];
    const handCards = player.hand || [];

    return (
      <div className={`rounded-xl p-3 sm:p-4 ${isOwn ? "bg-neutral-900/80" : "bg-neutral-900/40"}`}>
        {/* Label row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`font-bold text-sm ${isOwn ? "text-amber-400" : "text-neutral-300"}`}>
              {label}
            </span>
            {isOwn && isMyTurn && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                Your Turn
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LifeDots count={player.lifeCount} />
            <span className="text-neutral-500 text-xs">
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

        {/* Board row: Deck | Leader | Field (x5) | Stage */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2">
          {/* Deck */}
          <DeckStack
            count={player.deck?.length ?? 0}
            label="Deck"
            onClick={isOwn && isMyTurn ? () => sendAction("draw_card") : undefined}
          />

          {/* Leader */}
          <div className="flex-shrink-0">
            <div className="text-[10px] text-neutral-500 text-center mb-0.5">Leader</div>
            <CardSlot
              card={player.leader}
              faceUp={true}
              onClick={isOwn && player.leader ? () => setSelectedCard(player.leader!) : undefined}
            />
          </div>

          {/* Divider */}
          <div className="w-px h-16 bg-neutral-700 flex-shrink-0 mx-1" />

          {/* Field (5 slots) */}
          <div className="flex items-end gap-1.5 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => {
              const card = fieldCards[i] ?? null;
              return (
                <div key={i} className="flex-shrink-0">
                  {i === 0 && <div className="text-[10px] text-neutral-500 text-center mb-0.5">Field</div>}
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

          {/* Divider */}
          <div className="w-px h-16 bg-neutral-700 flex-shrink-0 mx-1" />

          {/* Stage */}
          <div className="flex-shrink-0">
            <div className="text-[10px] text-neutral-500 text-center mb-0.5">Stage</div>
            <CardSlot
              card={player.stage}
              faceUp={true}
              onClick={isOwn && player.stage ? () => setSelectedCard(player.stage!) : undefined}
            />
          </div>
        </div>

        {/* Hand */}
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-neutral-500 font-medium">
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

  /* ---- Game log panel ---- */
  function GameLog() {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [log.length]);

    return (
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-neutral-950 border-l border-neutral-800 z-30 transform transition-transform ${
          showLog ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h3 className="font-bold text-sm">Game Log</h3>
          <button onClick={() => setShowLog(false)} className="text-neutral-500 hover:text-white text-lg">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-56px)] p-3 space-y-1.5">
          {log.length === 0 ? (
            <p className="text-neutral-600 text-xs italic">No actions yet.</p>
          ) : (
            log.map((entry, i) => (
              <div key={i} className="text-xs text-neutral-400 py-1 border-b border-neutral-900">
                <span className="text-neutral-600 mr-1">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-neutral-300">{entry.playerId === myState?.userId ? "You" : "Opponent"}</span>{" "}
                {formatAction(entry)}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    );
  }

  function formatAction(action: GameAction): string {
    switch (action.type) {
      case "move_card": return `moved a card to ${(action.data as Record<string, unknown>).toZone}`;
      case "toggle_rest": return "toggled rest on a card";
      case "attach_don": return "attached DON!! to a card";
      case "detach_don": return "detached DON!! from a card";
      case "rest_don": return `rested ${(action.data as Record<string, unknown>).count} DON!!`;
      case "refresh_all": return "refreshed all cards";
      case "draw_card": return "drew a card";
      case "add_don": return "added DON!! from deck";
      case "take_damage": return "took damage (life to hand)";
      case "next_phase": return "advanced to next phase";
      case "end_turn": return "ended their turn";
      case "concede": return "conceded the game";
      default: return action.type;
    }
  }

  /* ================================================================ */
  /*  Screens                                                         */
  /* ================================================================ */

  /* ---- Loading ---- */
  if (!resp && !error) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">Connecting to room {code}...</p>
        </div>
      </main>
    );
  }

  /* ---- Error ---- */
  if (error && !resp) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 max-w-md text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/play" className="text-amber-400 hover:text-amber-300 text-sm">
            &larr; Back to Lobby
          </Link>
        </div>
      </main>
    );
  }

  /* ---- Waiting for opponent ---- */
  if (room?.status === "waiting" && isPlayer) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 max-w-lg text-center space-y-5">
          <h2 className="text-2xl font-bold">Waiting for Opponent</h2>
          <p className="text-neutral-400">Share this room code:</p>
          <div className="bg-neutral-800 rounded-lg px-6 py-4">
            <span className="font-mono text-amber-400 text-4xl font-extrabold tracking-[0.3em]">
              {code}
            </span>
          </div>
          <p className="text-neutral-500 text-sm">
            {room.player1Name || "Player 1"} is waiting...
          </p>
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <Link href="/play" className="block text-neutral-500 hover:text-neutral-300 text-sm transition-colors">
            &larr; Back to Lobby
          </Link>
        </div>
      </main>
    );
  }

  /* ---- Deck setup phase ---- */
  if (room?.status === "waiting" || (room?.status === "playing" && !state?.player1?.leader && !state?.player2?.leader)) {
    // Show deck selection if we haven't submitted yet
    if (!deckSubmitted && isPlayer) {
      return (
        <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 sm:p-8 max-w-xl w-full space-y-5">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-1">Load Your Deck</h2>
              <p className="text-neutral-400 text-sm">
                Room <span className="font-mono text-amber-400 font-bold">{code}</span>
                {" "}&#8212; {room?.player1Name} vs {room?.player2Name || "..."}
              </p>
            </div>

            {setupError && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">
                {setupError}
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
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
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
                <button
                  onClick={submitDeck}
                  disabled={selectedDeckIdx === null}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg py-3 transition-colors text-lg"
                >
                  Ready!
                </button>
              </>
            )}
          </div>
        </main>
      );
    }

    // Deck submitted, waiting for opponent
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 max-w-md text-center space-y-4">
          <div className="text-green-400 text-4xl mb-2">&#10003;</div>
          <h2 className="text-xl font-bold">Deck Submitted</h2>
          <p className="text-neutral-400 text-sm">Waiting for opponent to load their deck...</p>
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </main>
    );
  }

  /* ---- Game Over ---- */
  if (room?.status === "finished" || state?.phase === "finished") {
    const p1Life = state?.player1?.lifeCount ?? 0;
    const p2Life = state?.player2?.lifeCount ?? 0;

    let winnerText = "Game Over";
    if (p1Life <= 0 && p2Life > 0) {
      winnerText = you === "player2" ? "You Win!" : `${room?.player2Name || "Player 2"} Wins!`;
    } else if (p2Life <= 0 && p1Life > 0) {
      winnerText = you === "player1" ? "You Win!" : `${room?.player1Name || "Player 1"} Wins!`;
    }

    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 max-w-md text-center space-y-5">
          <h2 className="text-3xl font-extrabold">{winnerText}</h2>
          <div className="text-neutral-400 text-sm space-y-1">
            <p>{room?.player1Name}: {p1Life} life remaining</p>
            <p>{room?.player2Name}: {p2Life} life remaining</p>
            <p>Turn {room?.turnNumber ?? state?.turnNumber ?? "?"}</p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/play"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-6 py-3 transition-colors"
            >
              Play Again
            </Link>
            <Link
              href="/play"
              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
            >
              Back to Lobby
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /* ================================================================ */
  /*  Main Game Board                                                 */
  /* ================================================================ */

  if (!state || !myState || !oppState) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* ---- Hover Preview ---- */}
      <HoverPreview />

      {/* ---- Card Action Menu ---- */}
      <CardActionMenu />

      {/* ---- Game Log Panel ---- */}
      <GameLog />

      {/* ---- Top bar ---- */}
      <header className="bg-neutral-900/80 border-b border-neutral-800 px-3 sm:px-4 py-2 flex items-center justify-between text-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/play" className="text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr;
          </Link>
          <span className="font-mono text-amber-400 font-bold">{code}</span>
          <span className="text-neutral-600 hidden sm:inline">
            {room?.player1Name || "P1"} vs {room?.player2Name || "P2"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-red-400 text-xs">{error}</span>}
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-neutral-500 hover:text-white text-xs bg-neutral-800 px-3 py-1.5 rounded transition-colors"
          >
            Log
          </button>
          {isPlayer && gameActive && (
            <button
              onClick={() => { if (confirm("Concede this game?")) sendAction("concede"); }}
              className="text-red-500 hover:text-red-400 text-xs bg-neutral-800 px-3 py-1.5 rounded transition-colors"
            >
              Concede
            </button>
          )}
        </div>
      </header>

      {/* ---- Board ---- */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3">
        {/* Opponent area */}
        <PlayerArea
          player={oppState}
          isOwn={false}
          label={you === "player1" ? (room?.player2Name || "Opponent") : (room?.player1Name || "Opponent")}
        />

        {/* ---- Phase / Turn Divider ---- */}
        <div className="bg-neutral-800/60 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-amber-400 font-bold text-sm">
              {PHASE_LABELS[state.phase as GamePhase] || state.phase}
            </span>
            <span className="text-neutral-500 text-xs">
              Turn {state.turnNumber}
            </span>
            {!isMyTurn && isPlayer && (
              <span className="text-neutral-600 text-xs italic">Opponent&apos;s turn</span>
            )}
          </div>
          {isPlayer && isMyTurn && gameActive && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => sendAction("add_don")}
                className="text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                +DON!!
              </button>
              <button
                onClick={() => sendAction("refresh_all")}
                className="text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Refresh All
              </button>
              <button
                onClick={() => sendAction("next_phase")}
                className="text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                Next Phase &#9193;
              </button>
              <button
                onClick={() => sendAction("end_turn")}
                className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                End Turn &#127937;
              </button>
            </div>
          )}
        </div>

        {/* Your area */}
        <PlayerArea
          player={myState}
          isOwn={true}
          label={you === "player1" ? (room?.player1Name || "You") : (room?.player2Name || "You")}
        />
      </div>

      {/* ---- Quick Actions (Mobile-friendly bottom bar) ---- */}
      {isPlayer && isMyTurn && gameActive && (
        <div className="sm:hidden bg-neutral-900 border-t border-neutral-800 px-3 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => sendAction("draw_card")}
            className="text-xs bg-neutral-800 text-white px-3 py-2 rounded-lg whitespace-nowrap"
          >
            Draw
          </button>
          <button
            onClick={() => sendAction("add_don")}
            className="text-xs bg-amber-500/20 text-amber-400 px-3 py-2 rounded-lg whitespace-nowrap"
          >
            +DON!!
          </button>
          <button
            onClick={() => sendAction("refresh_all")}
            className="text-xs bg-neutral-800 text-neutral-300 px-3 py-2 rounded-lg whitespace-nowrap"
          >
            Refresh
          </button>
          <button
            onClick={() => sendAction("next_phase")}
            className="text-xs bg-neutral-800 text-white px-3 py-2 rounded-lg whitespace-nowrap"
          >
            Next Phase
          </button>
          <button
            onClick={() => sendAction("end_turn")}
            className="text-xs bg-white/10 text-white px-3 py-2 rounded-lg whitespace-nowrap"
          >
            End Turn
          </button>
          <button
            onClick={() => { if (confirm("Concede?")) sendAction("concede"); }}
            className="text-xs bg-red-900/40 text-red-400 px-3 py-2 rounded-lg whitespace-nowrap"
          >
            Concede
          </button>
        </div>
      )}

      {/* Spectator banner */}
      {you === "spectator" && (
        <div className="bg-neutral-800 text-center text-neutral-500 text-xs py-2 flex-shrink-0">
          Spectating &#8212; you cannot perform actions
        </div>
      )}
    </main>
  );
}
