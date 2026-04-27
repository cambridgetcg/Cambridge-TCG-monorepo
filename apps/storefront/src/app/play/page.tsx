"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PublicRoom {
  id: string;
  code: string;
  status: string;
  player1Name: string | null;
  player2Name: string | null;
  isPublic: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Lobby Page                                                         */
/* ------------------------------------------------------------------ */

export default function PlayLobby() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);

  /* ---- Fetch public rooms ---- */
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/game/rooms");
      if (res.ok) {
        const data = await res.json();
        setPublicRooms(data.rooms || []);
      }
    } catch {
      /* ignore fetch errors */
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 8000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  /* ---- Create a room ---- */
  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/game/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", isPublic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create room.");
        return;
      }
      setCreatedCode(data.room.code);
      router.push(`/play/${data.room.code}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ---- Join a room ---- */
  async function handleJoin(code?: string) {
    const roomCode = (code || joinCode).trim().toUpperCase();
    if (!roomCode) {
      setError("Enter a room code.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/game/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: roomCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to join room.");
        return;
      }
      router.push(`/play/${roomCode}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden border-b border-neutral-800">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-neutral-950 to-red-900/10" />
        <div className="relative mx-auto max-w-4xl px-4 py-16 sm:py-24 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Play <span className="text-amber-400">One Piece TCG</span>
          </h1>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto mb-2">
            Virtual tabletop for the One Piece Card Game. Create a room, share the
            code with a friend, load your decks, and battle.
          </p>
          <Link
            href="/deck-builder"
            className="inline-block text-amber-400 hover:text-amber-300 text-sm font-medium mt-2 transition-colors"
          >
            Build a deck first &rarr;
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-12 space-y-12">
        {/* ---- Error banner ---- */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ---- Create / Join ---- */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Create */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-1">Create Room</h2>
            <p className="text-neutral-500 text-sm mb-5">
              Start a new game and get a 6-character code to share.
            </p>
            <label className="flex items-center gap-2 text-sm text-neutral-400 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              List as public room
            </label>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg py-3 transition-colors"
            >
              {loading && !joinCode ? "Creating..." : "Create Room"}
            </button>
            {createdCode && (
              <p className="mt-3 text-sm text-neutral-400">
                Room code:{" "}
                <span className="font-mono text-amber-400 font-bold text-base">
                  {createdCode}
                </span>
              </p>
            )}
          </div>

          {/* Join */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-1">Join Room</h2>
            <p className="text-neutral-500 text-sm mb-5">
              Enter the 6-character code your opponent shared.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                placeholder="ABC123"
                maxLength={6}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3 text-center font-mono text-lg tracking-widest placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <button
              onClick={() => handleJoin()}
              disabled={loading || joinCode.length < 3}
              className="w-full bg-white hover:bg-neutral-200 disabled:opacity-50 text-black font-bold rounded-lg py-3 transition-colors"
            >
              {loading && joinCode ? "Joining..." : "Join Room"}
            </button>
          </div>
        </div>

        {/* ---- Public Rooms ---- */}
        {publicRooms.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4">Public Rooms</h2>
            <div className="space-y-2">
              {publicRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="font-mono text-amber-400 font-bold mr-3">
                      {room.code}
                    </span>
                    <span className="text-sm text-neutral-400">
                      {room.player1Name || "Waiting"}
                      {room.player2Name ? ` vs ${room.player2Name}` : " — waiting for opponent"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        room.status === "waiting"
                          ? "bg-green-900/50 text-green-400"
                          : "bg-neutral-700 text-neutral-400"
                      }`}
                    >
                      {room.status}
                    </span>
                    {room.status === "waiting" && !room.player2Name && (
                      <button
                        onClick={() => handleJoin(room.code)}
                        className="text-sm bg-amber-500 hover:bg-amber-400 text-black font-bold rounded px-3 py-1 transition-colors"
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- How It Works ---- */}
        <section>
          <h2 className="text-xl font-bold mb-6">How It Works</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { step: "1", title: "Create Room", desc: "Generate a private 6-character room code." },
              { step: "2", title: "Share Code", desc: "Send the code to your opponent." },
              { step: "3", title: "Load Decks", desc: "Both players select a deck from the deck builder." },
              { step: "4", title: "Play!", desc: "Take turns on the virtual tabletop." },
            ].map((s) => (
              <div
                key={s.step}
                className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 text-center"
              >
                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 font-bold text-lg flex items-center justify-center mx-auto mb-3">
                  {s.step}
                </div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-neutral-500 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Bottom CTA ---- */}
        <div className="text-center pb-8">
          <p className="text-neutral-500 text-sm mb-3">
            Don&apos;t have a deck yet?
          </p>
          <Link
            href="/deck-builder"
            className="inline-block bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            Open Deck Builder
          </Link>
        </div>
      </div>
    </main>
  );
}
