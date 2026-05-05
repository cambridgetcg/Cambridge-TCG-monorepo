// Raffle detail page — the theatre.
//
// ── What this page is for ────────────────────────────────────────────────
//
// This is the page where the user stands in front of the sealed envelope.
// The countdown ticks. The prize sits in its image. The entry counter
// climbs. This page does almost no math; the cryptography happens in
// apps/storefront/src/lib/rewards/provable-fair.ts. What this page does
// is *hold the suspense*.
//
// Every other page on the platform is utilitarian. Market detail tells
// you a price. Account standing tells you a state. Audit log tells you
// a history. This page tells you: *something will happen at this
// moment, and it will be fair, and you have a stake in it*. That's a
// different kind of UI. It is allowed to have an animated countdown.
// It is allowed to have an amber gradient. It is allowed to be theatre.
//
// The page is theatre with a load-bearing back wall: every visible beat
// is anchored in a verifiable substrate. The countdown ticks toward a
// real cron-driven draw (apps/storefront/src/lib/rewards/raffle-sweep.ts).
// The entry button hits an atomic spend (apps/storefront/src/lib/
// rewards/atomic-spend.ts) — your Berries are deducted in the same
// transaction your leaves are written, and not before, and not after.
// The seal on the envelope was published when the raffle was created
// (commitSeed at apps/storefront/src/lib/rewards/provable-fair.ts:36)
// and the Word inside cannot be changed.
//
// When the draw fires, this page rerenders into the proof view: winner
// announced, seed revealed, link to /verify/draw/[id] where any reader
// can replay the math themselves. The page is the most theatrical thing
// on the platform AND the most cryptographically rigorous. Those are not
// in tension; they are the same fact in two costumes.
//
// See docs/connections/the-sealed-word.md for the full story.
//
// ── What this page reaches toward ────────────────────────────────────────
//
//   - apps/storefront/src/lib/rewards/provable-fair.ts — the wizard's
//     vault. Where the Word is born, sealed, and revealed.
//
//   - apps/storefront/src/lib/rewards/atomic-spend.ts — the
//     accounting that cannot lie. The Berries are real because this
//     module insists they be.
//
//   - apps/storefront/src/lib/rewards/raffle-sweep.ts — the cron that
//     opens the envelope. Runs at draw_at; reads the answer that has
//     been mathematically determined since the moment entries closed.
//
//   - apps/storefront/src/app/verify/draw/[id]/page.tsx — the bulletin.
//     Where the proof goes after the draw, for anyone (especially the
//     losers) to inspect.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Raffle } from "@/lib/rewards/types";

function useCountdown(target: string) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    function update() {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Draw complete");
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0) setRemaining(`${d}d ${h}h ${m}m ${s}s`);
      else if (h > 0) setRemaining(`${h}h ${m}m ${s}s`);
      else setRemaining(`${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

export default function RaffleDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [points, setPoints] = useState<number>(0);
  const [entries, setEntries] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/rewards/raffles`).then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()).catch(() => null),
      fetch("/api/membership").then((r) => r.json()).catch(() => null),
    ]).then(([raffleData, session, memberData]) => {
      const found = (raffleData?.raffles ?? []).find((r: Raffle) => r.id === id);
      setRaffle(found ?? null);
      if (session?.user?.email) {
        setLoggedIn(true);
        setUserId(session.user.id ?? null);
      }
      if (memberData?.profile?.points_balance != null) setPoints(memberData.profile.points_balance);
      setLoading(false);
    });
  }, [id]);

  const countdown = useCountdown(raffle?.draw_at ?? new Date().toISOString());

  async function handleEnter() {
    if (!raffle) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/rewards/raffles/${raffle.id}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `Entered ${entries} time${entries > 1 ? "s" : ""}! Good luck!` });
        setRaffle((prev) =>
          prev
            ? {
                ...prev,
                total_entries: prev.total_entries + entries,
                user_entries: (prev.user_entries ?? 0) + entries,
              }
            : prev
        );
        setPoints((prev) => prev - entries * raffle.entry_cost_points);
      } else {
        setMessage({ type: "error", text: data.error ?? "Failed to enter raffle." });
      }
    } catch {
      setMessage({ type: "error", text: "Something went wrong." });
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!raffle) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Raffle not found</h1>
          <Link href="/rewards" className="text-amber-400 hover:underline">
            Back to Rewards
          </Link>
        </div>
      </div>
    );
  }

  const isCompleted = raffle.status === "completed";
  const isActive = raffle.status === "active";
  const maxEntries = raffle.max_entries_per_user - (raffle.user_entries ?? 0);
  const totalCost = entries * raffle.entry_cost_points;
  const isWinner = isCompleted && raffle.winner_user_id === userId;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/rewards" className="text-sm text-neutral-400 hover:text-white mb-6 inline-block">
          &larr; Back to Rewards
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: Image */}
          <div>
            <div className="aspect-square rounded-xl bg-neutral-800 overflow-hidden">
              {raffle.image_url ? (
                <img src={raffle.image_url} alt={raffle.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600">
                  <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Right: Details */}
          <div>
            <h1 className="text-3xl font-black mb-2">{raffle.title}</h1>
            {raffle.description && (
              <p className="text-neutral-400 mb-6">{raffle.description}</p>
            )}

            {/* Prize showcase */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 mb-6">
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-3">Prize</h3>
              <div className="flex gap-4">
                {raffle.prize_image_url && (
                  <div className="w-20 h-20 rounded-lg bg-neutral-800 overflow-hidden flex-shrink-0">
                    <img src={raffle.prize_image_url} alt="Prize" className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-lg">{raffle.prize_description}</p>
                  {raffle.prize_value && (
                    <p className="text-amber-400/70 text-sm">Value: {raffle.prize_value}</p>
                  )}
                  <p className="text-neutral-500 text-xs mt-1 capitalize">Type: {raffle.prize_type}</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-center">
                <p className="text-2xl font-bold text-amber-400">{raffle.entry_cost_points.toLocaleString()}</p>
                <p className="text-xs text-neutral-500">Berries / entry</p>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-center">
                <p className="text-2xl font-bold">{raffle.total_entries.toLocaleString()}</p>
                <p className="text-xs text-neutral-500">total entries</p>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-center">
                <p className="text-2xl font-bold text-amber-400/80">{countdown}</p>
                <p className="text-xs text-neutral-500">{isCompleted ? "completed" : "until draw"}</p>
              </div>
            </div>

            {/* Winner announcement */}
            {isCompleted && (
              <div className={`rounded-xl border p-5 mb-6 ${isWinner ? "border-amber-400 bg-amber-500/10" : "border-neutral-700 bg-neutral-900"}`}>
                <h3 className="font-bold text-lg mb-1">
                  {isWinner ? "🎉 You won!" : "Winner Drawn"}
                </h3>
                <p className={isWinner ? "text-amber-400" : "text-neutral-400"}>
                  {isWinner
                    ? "Congratulations! Check your email for prize details."
                    : raffle.winner_name
                    ? `Winner: ${raffle.winner_name}`
                    : "A winner has been selected."}
                </p>
                <a
                  href={`/api/rewards/raffles/${raffle.id}/proof`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-emerald-400 hover:text-emerald-300 underline"
                >
                  ✓ View provably-fair proof ↗
                </a>
              </div>
            )}

            {/* Your entries */}
            {loggedIn && raffle.user_entries != null && raffle.user_entries > 0 && (
              <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4 mb-6">
                <p className="text-sm">
                  You have <span className="font-bold text-amber-400">{raffle.user_entries}</span>{" "}
                  {raffle.user_entries === 1 ? "entry" : "entries"}
                </p>
              </div>
            )}

            {/* Entry form */}
            {isActive && (
              <>
                {loggedIn ? (
                  maxEntries > 0 ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-neutral-400 mb-2 block">Number of entries</label>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEntries(Math.max(1, entries - 1))}
                            className="w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 text-white font-bold hover:bg-neutral-700 transition"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={maxEntries}
                            value={entries}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 1;
                              setEntries(Math.min(Math.max(1, v), maxEntries));
                            }}
                            className="w-20 text-center bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                          />
                          <button
                            onClick={() => setEntries(Math.min(maxEntries, entries + 1))}
                            className="w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 text-white font-bold hover:bg-neutral-700 transition"
                          >
                            +
                          </button>
                          <span className="text-sm text-neutral-500">
                            of {maxEntries} remaining
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-neutral-400">
                        Total cost: <span className="font-bold text-amber-400">{totalCost.toLocaleString()} Berries</span>
                        {totalCost > points && (
                          <span className="text-red-400 ml-2">(not enough Berries)</span>
                        )}
                      </div>
                      <button
                        onClick={handleEnter}
                        disabled={submitting || totalCost > points}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-bold rounded-xl transition"
                      >
                        {submitting ? "Entering..." : `Enter Raffle (${totalCost.toLocaleString()} Berries)`}
                      </button>
                    </div>
                  ) : (
                    <p className="text-neutral-500 text-sm">
                      You have used all your entries for this raffle.
                    </p>
                  )
                ) : (
                  <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-center">
                    <p className="text-neutral-400 mb-3">Sign in to enter this raffle</p>
                    <Link
                      href="/login"
                      className="inline-block px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
                    >
                      Sign In
                    </Link>
                  </div>
                )}
              </>
            )}

            {/* Feedback message */}
            {message && (
              <div
                className={`mt-4 rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-green-500/10 border border-green-500/30 text-green-400"
                    : "bg-red-500/10 border border-red-500/30 text-red-400"
                }`}
              >
                {message.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
