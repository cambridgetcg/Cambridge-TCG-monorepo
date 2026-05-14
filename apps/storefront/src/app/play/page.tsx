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
  progress: { cleared: boolean; clear_count: number; best_turns: number | null } | null;
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

interface PublicRoom {
  id: string;
  code: string;
  status: string;
  player1Name: string | null;
  player2Name: string | null;
  isPublic: boolean;
  createdAt: string;
}

interface SessionResponse {
  user?: { id?: string; email?: string | null } | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "ctcg-deck-builder-decks";

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  easy:    { bg: "bg-green-900/30",  text: "text-green-400",  border: "border-green-700/50" },
  medium:  { bg: "bg-amber-900/30",  text: "text-amber-400",  border: "border-amber-700/50" },
  hard:    { bg: "bg-red-900/30",    text: "text-red-400",    border: "border-red-700/50" },
  extreme: { bg: "bg-purple-900/30", text: "text-purple-400", border: "border-purple-700/50" },
};

/* ================================================================== */
/*  Play Page — PVE-first entry                                        */
/* ================================================================== */

export default function PlayPage() {
  const router = useRouter();

  /* ---- Session ---- */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  /* ---- PVE ---- */
  const [pve, setPve] = useState<PVEData | null>(null);
  const [pveError, setPveError] = useState<string | null>(null);

  /* ---- Decks ---- */
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckIdx, setSelectedDeckIdx] = useState<number>(0);

  /* ---- Start-battle state ---- */
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  /* ---- Multiplayer (collapsed by default) ---- */
  const [mpOpen, setMpOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [mpLoading, setMpLoading] = useState(false);
  const [mpError, setMpError] = useState<string | null>(null);
  const [isPublicRoom, setIsPublicRoom] = useState(false);

  /* ---- Fetch session ---- */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s: SessionResponse) => {
        if (!cancelled) setSignedIn(!!s?.user?.id);
      })
      .catch(() => { if (!cancelled) setSignedIn(false); });
    return () => { cancelled = true; };
  }, []);

  /* ---- Fetch PVE levels ---- */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/game/pve")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((d: PVEData) => { if (!cancelled) setPve(d); })
      .catch(() => { if (!cancelled) setPveError("Couldn't load opponents."); });
    return () => { cancelled = true; };
  }, []);

  /* ---- Load saved decks ---- */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: SavedDeck[] = JSON.parse(stored);
        setSavedDecks(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  /* ---- Fetch public rooms (only when multiplayer panel opened) ---- */
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/game/rooms");
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data.rooms || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!mpOpen) return;
    fetchRooms();
    const id = setInterval(fetchRooms, 8000);
    return () => clearInterval(id);
  }, [mpOpen, fetchRooms]);

  /* ---- Derived ---- */
  const levels = pve?.levels ?? [];
  // "Next opponent" = first unlocked & not cleared. Fallback: last unlocked (replay).
  const nextOpponent =
    levels.find((l) => l.unlocked && !l.progress?.cleared) ??
    [...levels].reverse().find((l) => l.unlocked) ??
    null;
  const selectedDeck = savedDecks[selectedDeckIdx] ?? null;

  /* ================================================================ */
  /*  Start a battle (PVE)                                            */
  /* ================================================================ */

  async function handleStartBattle() {
    if (!nextOpponent || !selectedDeck) return;
    setStartError(null);
    setStarting(true);

    const cards: { sku: string; name: string; cardNumber: string; imageUrl: string | null; rarity: string | null; isLeader?: boolean }[] = [];
    if (selectedDeck.leader) {
      cards.push({
        sku: selectedDeck.leader.sku,
        name: selectedDeck.leader.name,
        cardNumber: selectedDeck.leader.card_number,
        imageUrl: selectedDeck.leader.image_url,
        rarity: selectedDeck.leader.rarity,
        isLeader: true,
      });
    }
    for (const entry of selectedDeck.entries) {
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
      setStartError("This deck has fewer than 10 cards. Add more in the deck builder before playing.");
      setStarting(false);
      return;
    }

    try {
      const res = await fetch(`/api/game/pve/${nextOpponent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", deck: cards }),
      });
      const result = await res.json();
      if (!res.ok) {
        setStartError(result.error || "Couldn't start the battle.");
        setStarting(false);
        return;
      }
      router.push(`/play/adventure/${nextOpponent.id}?gameId=${result.gameId}`);
    } catch {
      setStartError("Network error. Please try again.");
      setStarting(false);
    }
  }

  /* ================================================================ */
  /*  Multiplayer actions                                             */
  /* ================================================================ */

  async function handleCreateRoom() {
    setMpError(null);
    setMpLoading(true);
    try {
      const res = await fetch("/api/game/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", isPublic: isPublicRoom }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMpError(data.error || "Couldn't create the room.");
        return;
      }
      router.push(`/play/${data.room.code}`);
    } catch {
      setMpError("Network error. Please try again.");
    } finally {
      setMpLoading(false);
    }
  }

  async function handleJoinRoom(code?: string) {
    const roomCode = (code || joinCode).trim().toUpperCase();
    if (!roomCode) { setMpError("Enter a room code."); return; }
    setMpError(null);
    setMpLoading(true);
    try {
      const res = await fetch("/api/game/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: roomCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMpError(data.error || "Couldn't join the room.");
        return;
      }
      router.push(`/play/${roomCode}`);
    } catch {
      setMpError("Network error. Please try again.");
    } finally {
      setMpLoading(false);
    }
  }

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  const hasDecks = savedDecks.length > 0;
  const canStart = hasDecks && nextOpponent !== null;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* ---- Hero (tight) ---- */}
      <section className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Play <span className="text-amber-400">One Piece TCG</span>
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base mt-1">
            Pick a deck. Hit Play. You&apos;re in a battle.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">

        {/* ============================================================ */}
        {/*  PRIMARY — Start a battle (PVE)                              */}
        {/* ============================================================ */}

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {/* Loading shimmer */}
          {(signedIn === null || pve === null) && !pveError && (
            <div className="p-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {pveError && (
            <div className="p-6 text-sm text-red-300 bg-red-900/30 border-b border-red-800">
              {pveError}
            </div>
          )}

          {signedIn !== null && pve !== null && (
            <>
              {/* ---- No decks (signed-in or guest, same CTA) ---- */}
              {!hasDecks && (
                <div className="p-6 sm:p-8">
                  <h2 className="text-xl font-bold mb-1">Build your first deck</h2>
                  <p className="text-neutral-400 text-sm mb-5">
                    You&apos;ll need at least one saved deck (10+ cards) before you can battle.
                    The deck builder takes a few minutes — no sign-in required.
                  </p>
                  <Link
                    href="/deck-builder"
                    className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg px-6 py-3 transition-colors"
                  >
                    Open Deck Builder
                  </Link>
                </div>
              )}

              {/* ---- Has decks — the real play surface ---- */}
              {hasDecks && (
                <div className="grid md:grid-cols-[1fr_1fr] divide-y md:divide-y-0 md:divide-x divide-neutral-800">

                  {/* Deck picker */}
                  <div className="p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                        Your deck
                      </h2>
                      <Link
                        href="/deck-builder"
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Edit decks →
                      </Link>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {savedDecks.map((deck, i) => {
                        const totalCards = deck.entries.reduce((s, e) => s + e.quantity, 0);
                        const isSelected = selectedDeckIdx === i;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedDeckIdx(i)}
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                              isSelected
                                ? "border-amber-500 bg-amber-500/10"
                                : "border-neutral-800 bg-neutral-800/40 hover:border-neutral-600"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold truncate">{deck.name}</div>
                                {deck.leader && (
                                  <div className="text-xs text-amber-400/80 truncate mt-0.5">
                                    Leader: {deck.leader.name}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-neutral-500 flex-shrink-0">
                                {totalCards} cards
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Opponent + Play */}
                  <div className="p-5 sm:p-6 bg-neutral-950/40">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
                        Next opponent
                      </h2>
                      <Link
                        href="/play/adventure"
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        Pick a different one →
                      </Link>
                    </div>

                    {nextOpponent ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                            DIFFICULTY_STYLES[nextOpponent.difficulty]?.bg ?? "bg-neutral-800"
                          } border ${DIFFICULTY_STYLES[nextOpponent.difficulty]?.border ?? "border-neutral-700"}`}>
                            {nextOpponent.opponent_icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-neutral-500 text-xs font-mono">
                                Lv.{nextOpponent.level_number}
                              </span>
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                DIFFICULTY_STYLES[nextOpponent.difficulty]?.bg ?? "bg-neutral-800"
                              } ${DIFFICULTY_STYLES[nextOpponent.difficulty]?.text ?? "text-neutral-300"}`}>
                                {nextOpponent.difficulty}
                              </span>
                              {nextOpponent.progress?.cleared && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-900/40 text-green-400">
                                  ✓ rematch
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold mt-0.5 truncate">{nextOpponent.title}</h3>
                            <div className="text-sm text-neutral-400 truncate">
                              vs {nextOpponent.opponent_name}
                            </div>
                          </div>
                        </div>

                        {startError && (
                          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">
                            {startError}
                          </div>
                        )}

                        <button
                          onClick={handleStartBattle}
                          disabled={!canStart || starting}
                          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg py-3.5 text-lg transition-colors"
                        >
                          {starting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                              Starting...
                            </span>
                          ) : (
                            "▶ Play"
                          )}
                        </button>
                        <p className="text-[11px] text-neutral-600 text-center">
                          Solo vs AI · take your time · no rating shown
                        </p>
                        {signedIn === false && (
                          <p className="text-[11px] text-amber-500/80 text-center">
                            Playing as guest — progress lives in this browser.{" "}
                            <Link
                              href="/api/auth/signin?callbackUrl=/play"
                              className="underline hover:text-amber-400"
                            >
                              Sign in
                            </Link>{" "}
                            to save it across devices and earn Berries.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-500 py-4">
                        No opponents loaded yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ============================================================ */}
        {/*  SECONDARY — Play someone else (multiplayer rooms)           */}
        {/* ============================================================ */}

        <section className="bg-neutral-900/50 border border-neutral-800 rounded-xl">
          <button
            onClick={() => setMpOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-neutral-900 transition-colors rounded-xl"
            aria-expanded={mpOpen}
          >
            <div>
              <h2 className="text-base font-bold">Play someone else</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Create a private room and share the code, or join a friend&apos;s room.
                {publicRooms.length > 0 && (
                  <span className="text-amber-400 ml-1">
                    · {publicRooms.length} open public {publicRooms.length === 1 ? "room" : "rooms"}
                  </span>
                )}
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-neutral-500 transition-transform ${mpOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {mpOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-neutral-800 pt-4">
              {mpError && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">
                  {mpError}
                </div>
              )}

              {/* Create + Join row */}
              <div className="grid sm:grid-cols-2 gap-3">
                {/* Create */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                  <h3 className="text-sm font-bold mb-1">Create a room</h3>
                  <p className="text-xs text-neutral-500 mb-3">
                    Get a 6-character code to share with your opponent.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-neutral-400 mb-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPublicRoom}
                      onChange={(e) => setIsPublicRoom(e.target.checked)}
                      className="accent-amber-500 w-3.5 h-3.5"
                    />
                    Also list as public
                  </label>
                  <button
                    onClick={handleCreateRoom}
                    disabled={mpLoading}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg py-2.5 text-sm transition-colors"
                  >
                    {mpLoading ? "Creating..." : "Create room"}
                  </button>
                </div>

                {/* Join */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                  <h3 className="text-sm font-bold mb-1">Join a room</h3>
                  <p className="text-xs text-neutral-500 mb-3">
                    Enter the 6-character code your opponent shared.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                      placeholder="ABC123"
                      maxLength={6}
                      className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-center font-mono text-base tracking-widest placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                    <button
                      onClick={() => handleJoinRoom()}
                      disabled={mpLoading || joinCode.length < 3}
                      className="bg-white hover:bg-neutral-200 disabled:opacity-50 text-black font-bold rounded-lg px-4 text-sm transition-colors"
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>

              {/* Public rooms list */}
              {publicRooms.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                    Public rooms
                  </h3>
                  <div className="space-y-1.5">
                    {publicRooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-amber-400 font-bold mr-2">
                            {room.code}
                          </span>
                          <span className="text-neutral-400 text-xs">
                            {room.player1Name || "Waiting"}
                            {room.player2Name ? ` vs ${room.player2Name}` : " — waiting for opponent"}
                          </span>
                        </div>
                        {room.status === "waiting" && !room.player2Name && (
                          <button
                            onClick={() => handleJoinRoom(room.code)}
                            className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold rounded px-3 py-1 transition-colors"
                          >
                            Join
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/*  Utility row — quick links                                   */}
        {/* ============================================================ */}

        <section className="grid sm:grid-cols-3 gap-3 text-sm">
          <Link
            href="/play/welcome"
            className="block bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 transition-colors"
          >
            <div className="font-semibold mb-0.5">New here?</div>
            <div className="text-xs text-neutral-500">Pick the path that fits why you&apos;re here.</div>
          </Link>
          <Link
            href="/guides/how-to-play"
            className="block bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 transition-colors"
          >
            <div className="font-semibold mb-0.5">Learn the rules</div>
            <div className="text-xs text-neutral-500">15-minute beginner&apos;s guide.</div>
          </Link>
          <Link
            href="/play/deck-check"
            className="block bg-neutral-900/50 hover:bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 transition-colors"
          >
            <div className="font-semibold mb-0.5">Check a deck</div>
            <div className="text-xs text-neutral-500">Validate a list before battle.</div>
          </Link>
        </section>
      </div>
    </main>
  );
}
