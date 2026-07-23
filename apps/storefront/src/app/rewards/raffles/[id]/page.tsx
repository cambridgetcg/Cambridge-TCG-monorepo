// New raffles store a seed and commitment in the database at creation when
// commitSeed succeeds. The public active-raffle list returns that commitment,
// so an entrant can retain it before entry; draft raffles and the seed itself
// are not public. There is no external anchor, so the commitment becomes an
// independent witness only when someone stores it outside our control. After
// the draw, the public proof reproduces the seed hash and weighted index but
// withholds the participant manifest.

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
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!raffle) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center text-ink">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Raffle not found</h1>
          <Link href="/rewards" className="text-accent hover:underline">
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
  const isWinner = isCompleted && raffle.is_winner === true;

  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/rewards" className="text-sm text-ink-muted hover:text-ink mb-6 inline-block">
          &larr; Back to Rewards
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: Image */}
          <div>
            <div className="aspect-square rounded-lg bg-surface-subtle overflow-hidden">
              {raffle.image_url ? (
                <img src={raffle.image_url} alt={raffle.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-faint">
                  <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Right: Details */}
          <div>
            <h1 className="text-3xl font-display font-semibold mb-2">{raffle.title}</h1>
            {raffle.description && (
              <p className="text-ink-muted mb-6">{raffle.description}</p>
            )}

            {/* Prize showcase */}
            <div className="rounded-lg border border-accent/30 bg-accent-wash p-5 mb-6">
              <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">Prize</h3>
              <div className="flex gap-4">
                {raffle.prize_image_url && (
                  <div className="w-20 h-20 rounded-lg bg-surface-subtle overflow-hidden flex-shrink-0">
                    <img src={raffle.prize_image_url} alt="Prize" className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-lg">{raffle.prize_description}</p>
                  {raffle.prize_value && (
                    <p className="text-accent/70 text-sm">Value: {raffle.prize_value}</p>
                  )}
                  <p className="text-ink-faint text-xs mt-1 capitalize">Type: {raffle.prize_type}</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-lg bg-surface border border-border-subtle p-3 text-center">
                <p className="text-2xl font-bold text-accent">{raffle.entry_cost_points.toLocaleString()}</p>
                <p className="text-xs text-ink-faint">Berries / entry</p>
              </div>
              <div className="rounded-lg bg-surface border border-border-subtle p-3 text-center">
                <p className="text-2xl font-bold">{raffle.total_entries.toLocaleString()}</p>
                <p className="text-xs text-ink-faint">total entries</p>
              </div>
              <div className="rounded-lg bg-surface border border-border-subtle p-3 text-center">
                <p className="text-2xl font-bold text-accent/80">{countdown}</p>
                <p className="text-xs text-ink-faint">{isCompleted ? "completed" : "until draw"}</p>
              </div>
            </div>

            {isActive && (
              <div className="rounded-lg bg-surface border border-border-subtle p-4 mb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-2">
                  Pre-entry commitment
                </h3>
                {raffle.seed_commitment ? (
                  <>
                    <code className="block text-[11px] font-mono text-ink-muted break-all">
                      {raffle.seed_commitment}
                    </code>
                    <p className="text-xs text-ink-faint mt-2">
                      This hash is stored in our database and returned by the public active-raffle API.
                      Save it outside our control before entering if you want an independent before/after witness.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-danger">
                    Entry is paused because no draw commitment is available.
                  </p>
                )}
              </div>
            )}

            {/* Winner announcement */}
            {isCompleted && (
              <div className={`rounded-lg border p-5 mb-6 ${isWinner ? "border-accent bg-accent-wash" : "border-border-subtle bg-surface"}`}>
                <h3 className="font-bold text-lg mb-1">
                  {isWinner ? "You won!" : "Winner Drawn"}
                </h3>
                <p className={isWinner ? "text-accent" : "text-ink-muted"}>
                  {isWinner
                    ? "Congratulations! Check your email for prize details."
                    : "A winner has been selected; participant identity is withheld."}
                </p>
                <a
                  href={`/api/rewards/raffles/${raffle.id}/proof`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-ok hover:text-ok underline"
                >
                  ✓ View draw proof ↗
                </a>
              </div>
            )}

            {/* Your entries */}
            {loggedIn && raffle.user_entries != null && raffle.user_entries > 0 && (
              <div className="rounded-lg bg-surface border border-border-subtle p-4 mb-6">
                <p className="text-sm">
                  You have <span className="font-bold text-accent">{raffle.user_entries}</span>{" "}
                  {raffle.user_entries === 1 ? "entry" : "entries"}
                </p>
                {raffle.total_entries > 0 && (
                  <p className="text-xs text-ink-muted mt-1">
                    Your current chance:{" "}
                    {((raffle.user_entries / raffle.total_entries) * 100).toFixed(1)}%
                    <span className="text-ink-faint"> — changes as others enter.</span>
                  </p>
                )}
              </div>
            )}

            {/* Entry form */}
            {isActive && raffle.seed_commitment && (
              <>
                {loggedIn ? (
                  maxEntries > 0 ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-ink-muted mb-2 block">Number of entries</label>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEntries(Math.max(1, entries - 1))}
                            className="w-10 h-10 rounded-lg bg-surface-subtle border border-border-subtle text-ink font-bold hover:bg-surface transition"
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
                            className="w-20 text-center bg-surface border border-border-subtle rounded-lg px-3 py-2 text-ink"
                          />
                          <button
                            onClick={() => setEntries(Math.min(maxEntries, entries + 1))}
                            className="w-10 h-10 rounded-lg bg-surface-subtle border border-border-subtle text-ink font-bold hover:bg-surface transition"
                          >
                            +
                          </button>
                          <span className="text-sm text-ink-faint">
                            of {maxEntries} remaining
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-ink-muted">
                        Total cost: <span className="font-bold text-accent">{totalCost.toLocaleString()} Berries</span>
                        {totalCost > points && (
                          <span className="text-danger ml-2">(not enough Berries)</span>
                        )}
                      </div>
                      <button
                        onClick={handleEnter}
                        disabled={submitting || totalCost > points}
                        className="w-full py-3 bg-ink hover:bg-ink/85 disabled:bg-surface-subtle disabled:text-ink-faint text-page font-bold rounded-lg transition"
                      >
                        {submitting ? "Entering..." : `Enter Raffle (${totalCost.toLocaleString()} Berries)`}
                      </button>
                    </div>
                  ) : (
                    <p className="text-ink-faint text-sm">
                      You have used all your entries for this raffle.
                    </p>
                  )
                ) : (
                  <div className="rounded-lg border border-border-subtle bg-surface p-6 text-center">
                    <p className="text-ink-muted mb-3">Sign in to enter this raffle</p>
                    <Link
                      href="/login"
                      className="inline-block px-6 py-2 bg-ink text-page font-bold rounded-lg hover:bg-ink/85 transition"
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
                    ? "bg-ok/10 border border-ok/30 text-ok"
                    : "bg-danger/10 border border-danger/30 text-danger"
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
