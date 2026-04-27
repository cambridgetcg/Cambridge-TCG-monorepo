"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Pack {
  id: string;
  title: string;
  description: string | null;
  set_code: string | null;
  image_url: string | null;
  cost_points: number;
  total_opens: number;
  pool_size: number;
}

interface PulledCard {
  card_name: string;
  card_number: string | null;
  image_url: string | null;
  rarity: string;
  reward_type: string;
  reward_value: number;
}

type Phase =
  | "select"       // browsing packs
  | "confirm"      // pack selected, pre-open
  | "waiting"      // API in flight
  | "glow"         // pack on screen with glow
  | "prompt"       // "Click to open!"
  | "tear"         // pack tears open
  | "deal"         // cards dealt face-down
  | "flip"         // flipping one by one
  | "summary";     // all revealed

/* ------------------------------------------------------------------ */
/*  Rarity helpers                                                     */
/* ------------------------------------------------------------------ */

const RARITY_RANK: Record<string, number> = {
  C: 1, UC: 2, R: 3, SR: 4, SP: 5, L: 5, SEC: 6,
};

function isHighRarity(r: string) {
  return (RARITY_RANK[r.toUpperCase()] ?? 0) >= 5;
}
function isSuperRare(r: string) {
  return r.toUpperCase() === "SR";
}
function isRare(r: string) {
  return r.toUpperCase() === "R";
}

function rarityBadgeClass(r: string): string {
  const u = r.toUpperCase();
  if (["SEC", "SP", "L"].includes(u))
    return "bg-gradient-to-r from-amber-400 via-pink-400 to-violet-400 text-black font-black";
  if (u === "SR") return "bg-amber-500/90 text-black font-bold";
  if (u === "R") return "bg-purple-500/80 text-white font-bold";
  if (u === "UC") return "bg-blue-500/60 text-white font-semibold";
  return "bg-neutral-600/60 text-neutral-300 font-medium";
}

function rarityGlowClass(r: string): string {
  const u = r.toUpperCase();
  if (["SEC", "SP", "L"].includes(u))
    return "shadow-amber-300/60 shadow-2xl ring-2 ring-amber-300/50 rarity-legendary";
  if (u === "SR")
    return "shadow-amber-400/50 shadow-xl ring-2 ring-amber-400/30 rarity-sr";
  if (u === "R")
    return "shadow-purple-500/30 shadow-lg";
  return "";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [cards, setCards] = useState<PulledCard[]>([]);
  const [drawId, setDrawId] = useState<string | null>(null);
  const [flippedIndex, setFlippedIndex] = useState(-1);
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flipTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ----- data fetch ------------------------------------------------ */
  useEffect(() => {
    Promise.all([
      fetch("/api/rewards/packs").then((r) => r.json()),
      fetch("/api/membership").then((r) => r.json()).catch(() => null),
      fetch("/api/auth/session").then((r) => r.json()).catch(() => null),
    ]).then(([packData, memberData, session]) => {
      setPacks(packData?.packs ?? []);
      if (memberData?.profile?.points_balance != null) {
        setPoints(memberData.profile.points_balance);
      }
      if (session?.user?.email) setLoggedIn(true);
      setLoading(false);
    });
  }, []);

  /* ----- cleanup timers on unmount --------------------------------- */
  useEffect(() => {
    return () => flipTimers.current.forEach(clearTimeout);
  }, []);

  /* ----- select a pack --------------------------------------------- */
  const selectPack = useCallback((pack: Pack) => {
    setSelectedPack(pack);
    setPhase("confirm");
    setCards([]);
    setFlippedIndex(-1);
    setError(null);
  }, []);

  /* ----- open pack: API call then animation pipeline --------------- */
  const openPack = useCallback(async () => {
    if (!selectedPack) return;
    setPhase("waiting");
    setError(null);

    try {
      const res = await fetch(`/api/rewards/packs/${selectedPack.id}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok || !data.cards) {
        setError(data.error ?? "Failed to open pack.");
        setPhase("confirm");
        return;
      }

      const pulled: PulledCard[] = data.cards;
      setCards(pulled);
      setDrawId(data.drawId ?? null);
      setPoints((prev) => (prev != null ? prev - selectedPack.cost_points : prev));
      setPacks((prev) =>
        prev.map((p) =>
          p.id === selectedPack.id ? { ...p, total_opens: p.total_opens + 1 } : p
        )
      );

      // Phase 1: glow
      setPhase("glow");

      // Phase 2: prompt after 1.2s
      await wait(1200);
      setPhase("prompt");
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("confirm");
    }
  }, [selectedPack]);

  /* ----- user clicks "open" during prompt phase -------------------- */
  const tearOpen = useCallback(() => {
    if (phase !== "prompt") return;

    // Phase 3: tear
    setPhase("tear");

    setTimeout(() => {
      // Phase 4: deal cards face-down
      setPhase("deal");

      setTimeout(() => {
        // Phase 5: flip one by one
        setPhase("flip");
        flipTimers.current = [];

        cards.forEach((card, i) => {
          const timer = setTimeout(() => {
            setFlippedIndex(i);

            // Screen shake on rare+
            if (
              isRare(card.rarity) ||
              isSuperRare(card.rarity) ||
              isHighRarity(card.rarity)
            ) {
              setShaking(true);
              setTimeout(() => setShaking(false), 400);
            }
          }, i * 700 + 300);
          flipTimers.current.push(timer);
        });

        // Phase 6: summary after all flips
        const summaryTimer = setTimeout(() => {
          setPhase("summary");
        }, cards.length * 700 + 900);
        flipTimers.current.push(summaryTimer);
      }, 600);
    }, 800);
  }, [phase, cards]);

  /* ----- open another ---------------------------------------------- */
  const openAnother = useCallback(() => {
    setPhase("select");
    setSelectedPack(null);
    setCards([]);
    setDrawId(null);
    setFlippedIndex(-1);
    setError(null);
  }, []);

  /* ----- go back to same pack to reopen ---------------------------- */
  const reopenSamePack = useCallback(() => {
    setPhase("confirm");
    setCards([]);
    setDrawId(null);
    setFlippedIndex(-1);
    setError(null);
  }, []);

  /* ----- loading --------------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div className={`min-h-screen bg-neutral-950 text-white ${shaking ? "screen-shake" : ""}`}>
      <style jsx global>{`
        /* --- screen shake --- */
        @keyframes screenShake {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-4px, 2px); }
          20% { transform: translate(4px, -2px); }
          30% { transform: translate(-3px, -3px); }
          40% { transform: translate(3px, 3px); }
          50% { transform: translate(-2px, 1px); }
          60% { transform: translate(2px, -1px); }
          70% { transform: translate(-1px, 2px); }
          80% { transform: translate(1px, -2px); }
          90% { transform: translate(-1px, -1px); }
        }
        .screen-shake { animation: screenShake 0.4s ease-in-out; }

        /* --- pack glow pulse --- */
        @keyframes packPulse {
          0%, 100% { box-shadow: 0 0 30px 8px rgba(251,191,36,0.3), 0 0 60px 16px rgba(251,191,36,0.15); }
          50% { box-shadow: 0 0 50px 16px rgba(251,191,36,0.5), 0 0 90px 30px rgba(251,191,36,0.25); }
        }
        .pack-glow { animation: packPulse 1.5s ease-in-out infinite; }

        /* --- pack tear --- */
        @keyframes packTear {
          0% { opacity: 1; transform: scale(1) rotate(0deg); }
          30% { opacity: 1; transform: scale(1.1) rotate(-2deg); }
          60% { opacity: 0.7; transform: scale(1.2) rotate(3deg); }
          100% { opacity: 0; transform: scale(1.5) rotate(-8deg); }
        }
        .pack-tear { animation: packTear 0.8s ease-out forwards; }

        /* --- card flip --- */
        .card-flip { perspective: 1000px; }
        .card-inner {
          transition: transform 0.6s ease-in-out;
          transform-style: preserve-3d;
          position: relative;
          width: 100%;
          height: 100%;
        }
        .card-inner.flipped { transform: rotateY(180deg); }
        .card-front, .card-back {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          position: absolute;
          inset: 0;
          border-radius: 0.75rem;
          overflow: hidden;
        }
        .card-front { transform: rotateY(180deg); }

        /* --- deal-in --- */
        @keyframes dealIn {
          0% { opacity: 0; transform: translateY(-80px) scale(0.5) rotate(-15deg); }
          60% { opacity: 1; transform: translateY(4px) scale(1.02) rotate(1deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }
        .deal-card { animation: dealIn 0.5s ease-out forwards; opacity: 0; }

        /* --- SR pulse --- */
        @keyframes srPulse {
          0%, 100% { box-shadow: 0 0 15px 4px rgba(251,191,36,0.4); }
          50% { box-shadow: 0 0 30px 8px rgba(251,191,36,0.6); }
        }
        .rarity-sr { animation: srPulse 2s ease-in-out infinite; }

        /* --- legendary rainbow --- */
        @keyframes legendaryGlow {
          0%   { border-color: #f59e0b; box-shadow: 0 0 20px 6px rgba(245,158,11,0.5); }
          16%  { border-color: #ef4444; box-shadow: 0 0 20px 6px rgba(239,68,68,0.5); }
          33%  { border-color: #ec4899; box-shadow: 0 0 20px 6px rgba(236,72,153,0.5); }
          50%  { border-color: #8b5cf6; box-shadow: 0 0 20px 6px rgba(139,92,246,0.5); }
          66%  { border-color: #3b82f6; box-shadow: 0 0 20px 6px rgba(59,130,246,0.5); }
          83%  { border-color: #10b981; box-shadow: 0 0 20px 6px rgba(16,185,129,0.5); }
          100% { border-color: #f59e0b; box-shadow: 0 0 20px 6px rgba(245,158,11,0.5); }
        }
        @keyframes legendaryBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .rarity-legendary {
          animation: legendaryGlow 3s linear infinite, legendaryBounce 2s ease-in-out infinite;
          border: 2px solid transparent;
        }

        /* --- holographic shimmer overlay --- */
        @keyframes holoShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .holo-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 0.75rem;
          background: linear-gradient(
            105deg,
            transparent 30%,
            rgba(255,255,255,0.08) 40%,
            rgba(255,255,255,0.15) 50%,
            rgba(255,255,255,0.08) 60%,
            transparent 70%
          );
          background-size: 200% 100%;
          animation: holoShimmer 3s linear infinite;
          pointer-events: none;
        }

        /* --- prompt pulse text --- */
        @keyframes promptPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .prompt-pulse { animation: promptPulse 1.2s ease-in-out infinite; }

        /* --- particle-like sparkle on legendary cards --- */
        @keyframes sparkle1 { 0%,100%{opacity:0;transform:translate(0,0) scale(0);} 50%{opacity:1;transform:translate(-12px,-18px) scale(1);} }
        @keyframes sparkle2 { 0%,100%{opacity:0;transform:translate(0,0) scale(0);} 50%{opacity:1;transform:translate(14px,-22px) scale(1);} }
        @keyframes sparkle3 { 0%,100%{opacity:0;transform:translate(0,0) scale(0);} 50%{opacity:1;transform:translate(-8px,16px) scale(1);} }
        @keyframes sparkle4 { 0%,100%{opacity:0;transform:translate(0,0) scale(0);} 50%{opacity:1;transform:translate(16px,12px) scale(1);} }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Header — always visible */}
        <div className="mb-8">
          <Link
            href="/rewards"
            className="text-sm text-neutral-400 hover:text-white mb-4 inline-block transition-colors"
          >
            &larr; Back to Rewards
          </Link>
          <h1 className="text-3xl font-black mb-2">Virtual Packs</h1>
          <p className="text-neutral-400">
            Spend your Berries to rip virtual booster packs and win cards, credits,
            and bonus rewards.
          </p>
          {points !== null && (
            <div className="mt-4 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3">
              <span className="text-2xl font-bold text-amber-400">
                {points.toLocaleString()} Berries
              </span>
            </div>
          )}
        </div>

        {/* ===== PACK SELECTION ===== */}
        {phase === "select" && (
          <>
            {!loggedIn && (
              <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-center mb-8">
                <p className="text-neutral-400 mb-3">Sign in to open packs</p>
                <Link
                  href="/login"
                  className="inline-block px-6 py-2 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
                >
                  Sign In
                </Link>
              </div>
            )}
            {packs.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-12 text-center">
                <p className="text-neutral-500 text-lg">No packs available right now.</p>
                <p className="text-neutral-600 text-sm mt-1">
                  Check back soon for new packs to rip!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {packs.map((pack) => {
                  const canAfford = points !== null && points >= pack.cost_points;
                  return (
                    <button
                      key={pack.id}
                      onClick={() => loggedIn && selectPack(pack)}
                      disabled={!loggedIn}
                      className="group rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden hover:border-amber-500/50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="aspect-[3/4] bg-neutral-800 relative overflow-hidden">
                        {pack.image_url ? (
                          <img
                            src={pack.image_url}
                            alt={pack.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-900/20 to-neutral-900">
                            <svg
                              className="w-20 h-20 text-amber-500/30"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                              />
                            </svg>
                          </div>
                        )}
                        <div className="absolute top-3 right-3 bg-amber-500/90 text-black text-xs font-bold px-2.5 py-1 rounded-md">
                          {pack.cost_points.toLocaleString()} Berries
                        </div>
                        {pack.set_code && (
                          <div className="absolute top-3 left-3 bg-neutral-900/80 text-neutral-300 text-xs font-mono px-2 py-1 rounded-md">
                            {pack.set_code}
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <h3 className="text-lg font-bold mb-1 group-hover:text-amber-400 transition-colors">
                          {pack.title}
                        </h3>
                        {pack.description && (
                          <p className="text-neutral-500 text-sm mb-3 line-clamp-2">
                            {pack.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-sm text-neutral-400">
                          <span>
                            {pack.total_opens.toLocaleString()} opened
                          </span>
                          <span className="text-neutral-500">
                            {pack.pool_size} cards in pool
                          </span>
                        </div>
                        {loggedIn && !canAfford && (
                          <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-center">
                            Not enough Berries
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===== CONFIRM / ANIMATION / SUMMARY ===== */}
        {phase !== "select" && selectedPack && (
          <div className="flex flex-col items-center">
            {/* -- Confirm phase -- */}
            {phase === "confirm" && (
              <div className="w-full max-w-md text-center">
                <div className="aspect-[3/4] max-w-xs mx-auto rounded-xl overflow-hidden bg-neutral-800 mb-6">
                  {selectedPack.image_url ? (
                    <img
                      src={selectedPack.image_url}
                      alt={selectedPack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-900/20 to-neutral-900">
                      <svg
                        className="w-24 h-24 text-amber-500/30"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <h2 className="text-2xl font-black mb-1">{selectedPack.title}</h2>
                {selectedPack.set_code && (
                  <p className="text-neutral-500 text-sm font-mono mb-4">
                    {selectedPack.set_code}
                  </p>
                )}
                <p className="text-neutral-400 mb-6">
                  {selectedPack.cost_points.toLocaleString()} Berries for 5 cards
                </p>

                {error && (
                  <div className="mb-4 rounded-lg p-3 text-sm bg-red-500/10 border border-red-500/30 text-red-400">
                    {error}
                  </div>
                )}

                {points !== null && points < selectedPack.cost_points ? (
                  <div className="mb-4 rounded-lg p-3 text-sm bg-red-500/10 border border-red-500/30 text-red-400">
                    Not enough Berries ({points.toLocaleString()} /{" "}
                    {selectedPack.cost_points.toLocaleString()})
                  </div>
                ) : null}

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setPhase("select");
                      setSelectedPack(null);
                    }}
                    className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={openPack}
                    disabled={
                      points === null || points < selectedPack.cost_points
                    }
                    className="px-8 py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-bold rounded-xl transition text-lg"
                  >
                    Open Pack ({selectedPack.cost_points.toLocaleString()} Berries)
                  </button>
                </div>
              </div>
            )}

            {/* -- Waiting phase -- */}
            {phase === "waiting" && (
              <div className="flex flex-col items-center py-20">
                <div className="w-12 h-12 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-amber-300 text-lg font-bold animate-pulse">
                  Opening...
                </p>
              </div>
            )}

            {/* -- Glow + Prompt + Tear phase -- */}
            {(phase === "glow" || phase === "prompt" || phase === "tear") && (
              <div
                className="relative cursor-pointer select-none"
                onClick={tearOpen}
              >
                <div
                  className={`
                    aspect-[3/4] w-64 sm:w-72 md:w-80 rounded-xl overflow-hidden bg-neutral-800
                    ${phase === "glow" || phase === "prompt" ? "pack-glow" : ""}
                    ${phase === "tear" ? "pack-tear" : ""}
                    transition-all
                  `}
                >
                  {selectedPack.image_url ? (
                    <img
                      src={selectedPack.image_url}
                      alt={selectedPack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-900/30 to-neutral-900">
                      <svg
                        className="w-24 h-24 text-amber-500/40"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {phase === "prompt" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="prompt-pulse text-2xl sm:text-3xl font-black text-white drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] select-none">
                      Click to open!
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* -- Deal + Flip + Summary phases -- */}
            {(phase === "deal" || phase === "flip" || phase === "summary") && (
              <div className="w-full">
                {/* Cards row */}
                <div className="flex justify-center items-end gap-2 sm:gap-3 md:gap-4 mb-10 mt-4 px-2">
                  {cards.map((card, i) => {
                    const isFlipped =
                      phase === "summary" || (phase === "flip" && i <= flippedIndex);
                    const dealDelay = i * 100;

                    return (
                      <div
                        key={i}
                        className="deal-card card-flip w-[18%] sm:w-[17%] md:w-40 lg:w-44"
                        style={{
                          animationDelay: `${dealDelay}ms`,
                          zIndex: i,
                        }}
                      >
                        <div
                          className={`
                            aspect-[3/4] relative
                            ${isFlipped ? rarityGlowClass(card.rarity) : ""}
                            rounded-xl transition-shadow duration-500
                            ${isFlipped && isHighRarity(card.rarity) ? "holo-shimmer" : ""}
                          `}
                        >
                          <div
                            className={`card-inner ${isFlipped ? "flipped" : ""}`}
                          >
                            {/* BACK */}
                            <div className="card-back bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950 border-2 border-neutral-700 flex items-center justify-center">
                              <div className="text-center">
                                <div className="text-3xl sm:text-4xl font-black text-amber-500/40 tracking-tighter">
                                  CTCG
                                </div>
                                <div className="mt-1 w-10 h-0.5 bg-amber-500/20 mx-auto rounded-full" />
                              </div>
                            </div>

                            {/* FRONT */}
                            <div className="card-front bg-neutral-900 border-2 border-neutral-700 flex flex-col">
                              {/* Card image */}
                              <div className="flex-1 relative bg-neutral-800 overflow-hidden">
                                {card.image_url ? (
                                  <img
                                    src={card.image_url}
                                    alt={card.card_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-neutral-600">
                                    <svg
                                      className="w-8 h-8 sm:w-10 sm:h-10"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={1}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </div>
                                )}
                              </div>
                              {/* Card info */}
                              <div className="p-1.5 sm:p-2 text-center flex-shrink-0">
                                <p className="text-[10px] sm:text-xs font-bold text-white truncate leading-tight">
                                  {card.card_name}
                                </p>
                                <span
                                  className={`
                                    inline-block mt-0.5 text-[8px] sm:text-[10px] px-1.5 py-0.5 rounded-full
                                    ${rarityBadgeClass(card.rarity)}
                                  `}
                                >
                                  {card.rarity}
                                </span>
                              </div>

                              {/* Particle sparkles for legendary cards */}
                              {isHighRarity(card.rarity) && (
                                <>
                                  <div
                                    className="absolute w-1.5 h-1.5 bg-amber-300 rounded-full"
                                    style={{ top: "15%", left: "20%", animation: "sparkle1 1.8s ease-in-out infinite" }}
                                  />
                                  <div
                                    className="absolute w-1 h-1 bg-pink-300 rounded-full"
                                    style={{ top: "25%", right: "18%", animation: "sparkle2 2.2s ease-in-out infinite 0.3s" }}
                                  />
                                  <div
                                    className="absolute w-1.5 h-1.5 bg-violet-300 rounded-full"
                                    style={{ bottom: "30%", left: "15%", animation: "sparkle3 2s ease-in-out infinite 0.6s" }}
                                  />
                                  <div
                                    className="absolute w-1 h-1 bg-amber-200 rounded-full"
                                    style={{ bottom: "25%", right: "20%", animation: "sparkle4 1.6s ease-in-out infinite 0.9s" }}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary overlay */}
                {phase === "summary" && (
                  <div className="max-w-2xl mx-auto">
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-6">
                      <h3 className="text-xl font-black text-center mb-5">
                        Pack Results
                      </h3>
                      <div className="divide-y divide-neutral-800/50">
                        {cards.map((card, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 py-3"
                          >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
                              {card.image_url ? (
                                <img
                                  src={card.image_url}
                                  alt={card.card_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                                  ?
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {card.card_name}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {card.card_number ? `#${card.card_number}` : ""}{" "}
                                {card.reward_type === "points"
                                  ? `+${card.reward_value} Berries`
                                  : card.reward_type === "credit"
                                  ? `+$${card.reward_value.toFixed(2)} credit`
                                  : card.reward_type}
                              </p>
                            </div>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${rarityBadgeClass(card.rarity)}`}
                            >
                              {card.rarity}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Total value */}
                      <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center justify-between">
                        <span className="text-neutral-400 text-sm font-medium">
                          Total Value
                        </span>
                        <span className="text-amber-400 font-bold text-lg">
                          {(() => {
                            const pointsTotal = cards
                              .filter((c) => c.reward_type === "points")
                              .reduce((s, c) => s + c.reward_value, 0);
                            const creditTotal = cards
                              .filter((c) => c.reward_type === "credit")
                              .reduce((s, c) => s + c.reward_value, 0);
                            const parts: string[] = [];
                            if (pointsTotal > 0)
                              parts.push(`${pointsTotal.toLocaleString()} Berries`);
                            if (creditTotal > 0)
                              parts.push(`$${creditTotal.toFixed(2)} credit`);
                            const otherCount = cards.filter(
                              (c) =>
                                c.reward_type !== "points" &&
                                c.reward_type !== "credit"
                            ).length;
                            if (otherCount > 0)
                              parts.push(
                                `${otherCount} reward${otherCount > 1 ? "s" : ""}`
                              );
                            return parts.join(" + ") || "No value";
                          })()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="mt-6 flex gap-3 justify-center">
                        <button
                          onClick={openAnother}
                          className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition"
                        >
                          Browse Packs
                        </button>
                        {points !== null &&
                          points >= selectedPack.cost_points && (
                            <button
                              onClick={reopenSamePack}
                              className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl transition text-lg"
                            >
                              Open Another
                            </button>
                          )}
                      </div>
                      {drawId && (
                        <p className="mt-4 text-center text-xs">
                          <a
                            href={`/verify/draw/${drawId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 underline"
                          >
                            ✓ Verify this pack was rolled fairly ↗
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
