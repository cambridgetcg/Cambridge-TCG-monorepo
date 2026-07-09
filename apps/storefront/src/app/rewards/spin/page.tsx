"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Segment {
  label: string;
  color: string;
}

interface SpinConfig {
  segments: Segment[];
  freeSpinsPerDay: number;
  premiumCost: number;
  spinsUsedToday: number;
  streak: number;
  canFreeSpin: boolean;
}

interface SpinResult {
  segmentIndex: number;
  reward: { type: string; value: number; label: string };
  drawId?: string;
}

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;
  totalVisits: number;
}

interface HistoryEntry {
  label: string;
  type: string;
  timestamp: number;
}

/* ------------------------------------------------------------------ */
/*  Confetti particles                                                 */
/* ------------------------------------------------------------------ */

function Confetti({ active }: { active: boolean }) {
  if (!active) return null;

  const particles = Array.from({ length: 40 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const duration = 1.8 + Math.random() * 1.2;
    const size = 4 + Math.random() * 6;
  // Muted celebration — the quiet-gallery tone family (bronze, viridian,
  // plum, brick, slate, warning gold).
    const colors = [
      "#96762f",
      "#41775c",
      "#6a5a8f",
      "#9e4433",
      "#4e6e96",
      "#a97e24",
    ];
    const color = colors[i % colors.length];
    const drift = -30 + Math.random() * 60;

    return (
      <span
        key={i}
        className="absolute rounded-sm pointer-events-none"
        style={{
          left: `${left}%`,
          top: "-8px",
          width: size,
          height: size,
          backgroundColor: color,
          opacity: 0,
          animation: `confettiFall ${duration}s ease-out ${delay}s forwards`,
          "--drift": `${drift}px`,
        } as React.CSSProperties}
      />
    );
  });

  return <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">{particles}</div>;
}

/* ------------------------------------------------------------------ */
/*  Spin Wheel component                                               */
/* ------------------------------------------------------------------ */

function SpinWheel({
  segments,
  rotation,
  spinning,
  winIndex,
}: {
  segments: Segment[];
  rotation: number;
  spinning: boolean;
  winIndex: number | null;
}) {
  const count = segments.length;
  const segAngle = 360 / count;

  // Build conic-gradient stops
  const gradientStops = segments
    .map((seg, i) => {
      const start = (segAngle * i).toFixed(2);
      const end = (segAngle * (i + 1)).toFixed(2);
      return `${seg.color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="relative w-[320px] h-[320px] sm:w-[360px] sm:h-[360px] mx-auto select-none">
      {/* Outer ring border */}
      <div className="absolute inset-[-3px] rounded-full border-2 border-accent/30" />

      {/* Wheel body */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          background: `conic-gradient(${gradientStops})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
            : "none",
        }}
      >
        {/* Segment dividers + labels */}
        {segments.map((seg, i) => {
          const midAngle = segAngle * i + segAngle / 2;
          const isWinner = winIndex === i && !spinning;

          return (
            <div key={i} className="absolute inset-0">
              {/* Divider line */}
              <div
                className="absolute top-0 left-1/2 h-1/2 origin-bottom"
                style={{
                  width: "1px",
                  transform: `rotate(${segAngle * i}deg)`,
                  background:
                    "linear-gradient(to top, transparent 10%, rgba(255,255,255,0.15) 100%)",
                }}
              />

              {/* Label */}
              <div
                className="absolute top-0 left-0 w-full h-full flex items-start justify-center"
                style={{
                  transform: `rotate(${midAngle}deg)`,
                }}
              >
                <span
                  className={`mt-5 sm:mt-6 text-[10px] sm:text-xs font-bold px-1 text-center leading-tight max-w-[70px] sm:max-w-[80px] ${
                    isWinner ? "text-white scale-110" : "text-white/90"
                  }`}
                  style={{
                    transform: "rotate(180deg)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                    transition: "transform 0.3s, color 0.3s",
                  }}
                >
                  {seg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Winning segment pulse overlay */}
      {winIndex !== null && !spinning && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `conic-gradient(
              transparent ${(segAngle * winIndex).toFixed(2)}deg,
              rgba(255,255,255,0.12) ${(segAngle * winIndex).toFixed(2)}deg ${(segAngle * (winIndex + 1)).toFixed(2)}deg,
              transparent ${(segAngle * (winIndex + 1)).toFixed(2)}deg
            )`,
            transform: `rotate(${rotation}deg)`,
            animation: "winPulse 1.2s ease-in-out infinite",
          }}
        />
      )}

      {/* Pointer (fixed at top) */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
        <div
          className="w-0 h-0"
          style={{
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
  borderTop: "20px solid var(--color-accent)",
          }}
        />
      </div>

      {/* Center hub */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-surface border-2 border-accent/50 shadow-mat" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Streak display                                                     */
/* ------------------------------------------------------------------ */

function StreakDisplay({ streak }: { streak: StreakInfo }) {
  const maxDisplay = 7;
  const currentDay = ((streak.currentStreak - 1) % maxDisplay) + 1;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-subtle p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-bold text-ink">Daily Streak</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <p className="text-2xl font-display font-semibold text-accent">{streak.currentStreak}</p>
          <p className="text-[10px] text-ink-faint uppercase tracking-wider">Days</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-display font-semibold text-ink">{streak.multiplier.toFixed(2)}x</p>
          <p className="text-[10px] text-ink-faint uppercase tracking-wider">Multiplier</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-display font-semibold text-ink-muted">{streak.longestStreak}</p>
          <p className="text-[10px] text-ink-faint uppercase tracking-wider">Best</p>
        </div>
      </div>

      {/* Day dots */}
      <div className="flex items-center justify-center gap-2 mb-3">
        {Array.from({ length: maxDisplay }, (_, i) => {
          const dayNum = i + 1;
          const filled = dayNum < currentDay;
          const current = dayNum === currentDay;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all ${
                  filled
                    ? "bg-ink border-accent text-page"
                    : current
                    ? "bg-accent-wash border-accent text-accent animate-pulse"
                    : "bg-surface-subtle border-border-subtle text-ink-faint"
                }`}
              >
                {dayNum}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-faint text-center">
        {streak.currentStreak > 0
          ? "Keep your streak alive! Visit daily for bonus multiplier."
          : "Spin today to start a streak!"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Result slide-up panel                                              */
/* ------------------------------------------------------------------ */

function ResultPanel({
  result,
  onClose,
  onPremiumSpin,
  canPremiumSpin,
  premiumCost,
  spinning,
}: {
  result: SpinResult | null;
  onClose: () => void;
  onPremiumSpin: () => void;
  canPremiumSpin: boolean;
  premiumCost: number;
  spinning: boolean;
}) {
  if (!result) return null;

  const isBigWin = result.reward.type === "credit" || result.reward.value >= 500;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full sm:w-auto sm:min-w-[380px] bg-surface border border-border-subtle rounded-t-xl sm:rounded-lg p-8 text-center z-10"
        style={{
          animation: "slideUp 0.4s ease-out",
        }}
      >
        <Confetti active={isBigWin} />

        <p className="text-ink-muted text-sm mb-1">You won</p>
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-ink mb-1">
          {result.reward.label}
        </h2>
        <p className="text-sm text-ink-faint mb-6 capitalize">{result.reward.type} reward</p>

        <div className="flex flex-col gap-3">
          {canPremiumSpin && (
            <button
              onClick={onPremiumSpin}
              disabled={spinning}
              className="w-full py-3 bg-ink hover:bg-ink/85 disabled:bg-surface-subtle disabled:text-ink-faint text-page font-bold rounded-lg transition"
            >
              {spinning ? "Spinning..." : `Spin Again (${premiumCost.toLocaleString()} Berries)`}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 bg-surface-subtle hover:bg-surface text-ink font-bold rounded-lg transition"
          >
            {canPremiumSpin ? "Done" : "Come back tomorrow!"}
          </button>
          {result.drawId && (
            <a
              href={`/verify/draw/${result.drawId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-ok hover:text-ok underline mt-1"
            >
              ✓ Verify this spin was fair ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SpinWheelPage() {
  const [config, setConfig] = useState<SpinConfig | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [winIndex, setWinIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const baseRotationRef = useRef(0);

  /* ---------- Initial data fetch ---------- */

  useEffect(() => {
    Promise.all([
      fetch("/api/rewards/spin").then((r) => r.json()).catch(() => null),
      fetch("/api/rewards/streak").then((r) => r.json()).catch(() => null),
      fetch("/api/auth/session").then((r) => r.json()).catch(() => null),
      fetch("/api/membership").then((r) => r.json()).catch(() => null),
    ]).then(([spinData, streakData, session, memberData]) => {
      if (spinData?.segments) setConfig(spinData as SpinConfig);
      if (streakData?.currentStreak != null) setStreak(streakData as StreakInfo);
      if (session?.user?.email) setLoggedIn(true);
      if (memberData?.profile?.points_balance != null) setPoints(memberData.profile.points_balance);
      setLoading(false);
    });
  }, []);

  /* ---------- Spin logic ---------- */

  const doSpin = useCallback(
    async (premium: boolean) => {
      if (!config || spinning) return;
      setSpinning(true);
      setError(null);
      setResult(null);
      setShowResult(false);
      setWinIndex(null);

      try {
        const res = await fetch("/api/rewards/spin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ premium }),
        });
        const data: SpinResult = await res.json();

        if (!res.ok) {
          setError((data as unknown as { error: string }).error ?? "Spin failed.");
          setSpinning(false);
          return;
        }

        const segCount = config.segments.length;
        const segAngle = 360 / segCount;

        // The pointer is at the top (0deg). When the wheel is at 0 rotation,
        // segment 0 occupies 0deg..segAngle. We need to rotate so that the
        // winning segment's middle lands under the pointer.
        // Pointer reads from the top, but conic-gradient starts at 12 o'clock
        // and goes clockwise. CSS rotation also goes clockwise. So to bring
        // segment N to the top, we rotate by -(N * segAngle + segAngle/2),
        // or equivalently 360 - (N * segAngle + segAngle/2).
        const targetOffset = 360 - (data.segmentIndex * segAngle + segAngle / 2);

        // Add 3-5 full extra spins for drama
        const extraSpins = (3 + Math.floor(Math.random() * 3)) * 360;

        // Small random jitter within the segment (stay well inside)
        const jitter = (Math.random() - 0.5) * segAngle * 0.5;

        const newRotation = baseRotationRef.current + extraSpins + targetOffset + jitter;
        setRotation(newRotation);

        // Wait for animation to finish (4s transition + buffer)
        setTimeout(() => {
          baseRotationRef.current = newRotation % 360;
          setWinIndex(data.segmentIndex);
          setResult(data);
          setSpinning(false);
          setShowResult(true);

          // Update local state
          setConfig((prev) =>
            prev
              ? {
                  ...prev,
                  spinsUsedToday: prev.spinsUsedToday + 1,
                  canFreeSpin: !premium ? false : prev.canFreeSpin,
                }
              : prev
          );

          if (premium && points != null) {
            setPoints(points - config.premiumCost);
          }

          // Add to history
          setHistory((prev) =>
            [
              { label: data.reward.label, type: data.reward.type, timestamp: Date.now() },
              ...prev,
            ].slice(0, 5)
          );
        }, 4300);
      } catch {
        setError("Something went wrong. Please try again.");
        setSpinning(false);
      }
    },
    [config, spinning, points]
  );

  const canFreeSpin = loggedIn && config?.canFreeSpin === true;
  const canPremiumSpin =
    loggedIn && config != null && points != null && points >= config.premiumCost;

  /* ---------- Loading state ---------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ---------- No config (API error) ---------- */

  if (!config) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center text-ink">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Spin wheel unavailable</h1>
          <p className="text-ink-muted mb-4">Please try again later.</p>
          <Link href="/rewards" className="text-accent hover:underline">
            Back to Rewards
          </Link>
        </div>
      </div>
    );
  }

  const freeSpinsLeft = config.freeSpinsPerDay - config.spinsUsedToday;
  const noSpinsLeft = !canFreeSpin && !canPremiumSpin;

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Keyframe styles */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes bounceIn {
          0%   { transform: scale(0); }
          60%  { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @keyframes winPulse {
          0%, 100% { opacity: 0.15; }
          50%      { opacity: 0.35; }
        }
        @keyframes confettiFall {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(420px) translateX(var(--drift)) rotate(720deg); opacity: 0; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link href="/rewards" className="text-sm text-ink-muted hover:text-ink mb-4 inline-block">
            &larr; Back to Rewards
          </Link>
          <h1 className="text-3xl font-display font-semibold mb-2">Daily Spin</h1>
          <p className="text-ink-muted">
            Spin the wheel every day to win Berries, store credit, and more.
          </p>
        </div>

        {/* Berries balance bar */}
        {points !== null && (
          <div className="mb-8 inline-flex items-center gap-2 bg-accent-wash border border-accent/30 rounded-lg px-5 py-3">
            <span className="text-lg font-bold text-accent">
              {points.toLocaleString()} Berries
            </span>
          </div>
        )}

        {/* Main layout */}
        <div className="grid lg:grid-cols-[1fr_300px] gap-8">
          {/* Left column: wheel */}
          <div className="flex flex-col items-center">
            {/* Spins remaining badge */}
            <div className="mb-6 flex items-center gap-3">
              {canFreeSpin && (
                <span className="inline-flex items-center gap-1.5 bg-ok/10 border border-ok/30 text-ok text-sm font-semibold px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
                  Free spin available!
                </span>
              )}
              {!canFreeSpin && freeSpinsLeft <= 0 && (
                <span className="inline-flex items-center gap-1.5 bg-surface-subtle border border-border-subtle text-ink-muted text-sm font-semibold px-3 py-1.5 rounded-full">
                  Free spins used today
                </span>
              )}
            </div>

            {/* The wheel */}
            <SpinWheel
              segments={config.segments}
              rotation={rotation}
              spinning={spinning}
              winIndex={winIndex}
            />

            {/* Spin button */}
            <div className="mt-8 w-full max-w-xs">
              {!loggedIn ? (
                <Link
                  href="/login"
                  className="block w-full py-4 bg-surface-subtle border border-border-subtle text-center text-ink font-bold rounded-lg hover:bg-surface transition text-lg"
                >
                  Sign in to Spin
                </Link>
              ) : canFreeSpin ? (
                <button
                  onClick={() => doSpin(false)}
                  disabled={spinning}
                  className="w-full py-4 bg-ink hover:bg-ink/85 disabled:bg-surface-subtle disabled:text-ink-faint text-page font-display font-semibold rounded-lg transition text-lg shadow-mat"
                >
                  {spinning ? "Spinning..." : "SPIN!"}
                </button>
              ) : canPremiumSpin ? (
                <button
                  onClick={() => doSpin(true)}
                  disabled={spinning}
                  className="w-full py-4 bg-ink hover:bg-ink/85 disabled:bg-surface-subtle disabled:text-ink-faint text-page font-bold rounded-lg transition text-lg shadow-mat"
                >
                  {spinning
                    ? "Spinning..."
                    : `Spin Again (${config.premiumCost.toLocaleString()} Berries)`}
                </button>
              ) : (
                <div className="w-full py-4 bg-surface-subtle border border-border-subtle text-center text-ink-faint font-bold rounded-lg text-lg">
                  Come back tomorrow!
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-4 w-full max-w-xs rounded-lg bg-danger/10 border border-danger/30 p-3 text-sm text-danger text-center">
                {error}
              </div>
            )}

            {/* Spins info */}
            <div className="mt-4 text-xs text-ink-faint text-center">
              {config.freeSpinsPerDay > 0 && (
                <span>
                  {Math.max(0, freeSpinsLeft)} / {config.freeSpinsPerDay} free spin
                  {config.freeSpinsPerDay !== 1 ? "s" : ""} remaining today
                </span>
              )}
              {config.premiumCost > 0 && (
                <span className="ml-3">
                  Extra spins: {config.premiumCost.toLocaleString()} Berries each
                </span>
              )}
            </div>
          </div>

          {/* Right column: streak + history */}
          <div className="flex flex-col gap-6">
            {/* Streak */}
            {streak && <StreakDisplay streak={streak} />}

            {/* Streak warning */}
            {streak && streak.currentStreak > 0 && !canFreeSpin && noSpinsLeft && (
              <div className="rounded-lg border border-accent/30 bg-accent-wash p-4">
                <p className="text-sm text-accent font-semibold flex items-center gap-2">
                  Streak at risk!
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Come back tomorrow to keep your {streak.currentStreak}-day streak alive.
                </p>
              </div>
            )}

            {/* Recent spins */}
            <div className="rounded-lg border border-border-subtle bg-surface-subtle p-5">
              <h3 className="font-bold text-ink mb-3 text-sm uppercase tracking-wider text-ink-muted">
                Recent Spins
              </h3>
              {history.length === 0 ? (
                <p className="text-sm text-ink-faint">No spins yet this session.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry, i) => (
                    <div
                      key={entry.timestamp}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-ink font-medium truncate">{entry.label}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          entry.type === "credit"
                            ? "bg-ok/10 text-ok"
                            : entry.type === "points"
                            ? "bg-accent-wash text-accent"
                            : "bg-[#6a5a8f]/15 text-[#6a5a8f]"
                        }`}
                      >
                        {entry.type === "points" ? "Berries" : entry.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Multiplier info */}
            {streak && streak.multiplier > 1 && (
              <div className="rounded-lg border border-border-subtle bg-surface-subtle p-5">
                <h3 className="font-bold text-sm uppercase tracking-wider text-ink-muted mb-2">
                  Streak Bonus
                </h3>
                <p className="text-sm text-ink-muted">
                  Your {streak.currentStreak}-day streak gives you a{" "}
                  <span className="text-accent font-bold">
                    {((streak.multiplier - 1) * 100).toFixed(0)}% bonus
                  </span>{" "}
                  on spin rewards. Multiplier increases 2% per day, up to 50%.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result overlay */}
      <ResultPanel
        result={showResult ? result : null}
        onClose={() => setShowResult(false)}
        onPremiumSpin={() => {
          setShowResult(false);
          doSpin(true);
        }}
        canPremiumSpin={canPremiumSpin}
        premiumCost={config.premiumCost}
        spinning={spinning}
      />
    </div>
  );
}
