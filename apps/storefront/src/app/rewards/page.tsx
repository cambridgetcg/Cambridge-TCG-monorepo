"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function RewardsHubPage() {
  const [points, setPoints] = useState<number | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [canSpin, setCanSpin] = useState(false);
  const [raffleCount, setRaffleCount] = useState(0);
  const [boxCount, setBoxCount] = useState(0);
  const [packCount, setPackCount] = useState(0);

  useEffect(() => {
    // Fetch all reward data in parallel
    Promise.all([
      fetch("/api/membership").then(r => r.json()).catch(() => null),
      fetch("/api/rewards/spin").then(r => r.json()).catch(() => null),
      fetch("/api/rewards/raffles").then(r => r.json()).catch(() => ({ raffles: [] })),
      fetch("/api/rewards/mystery-boxes").then(r => r.json()).catch(() => ({ boxes: [] })),
      fetch("/api/rewards/packs").then(r => r.json()).catch(() => ({ packs: [] })),
    ]).then(([member, spin, raffles, boxes, packs]) => {
      if (member?.profile?.points_balance != null) setPoints(member.profile.points_balance);
      if (spin?.streak) setStreak(spin.streak);
      if (spin?.canFreeSpin) setCanSpin(true);
      setMultiplier(1 + Math.max(0, (spin?.streak || 1) - 1) * 0.02);
      setRaffleCount(raffles?.raffles?.length || 0);
      setBoxCount(boxes?.boxes?.length || 0);
      setPackCount(packs?.packs?.length || 0);
    });
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Rewards <span className="text-amber-400">Hub</span>
          </h1>
          <p className="text-neutral-400 mt-2">
            Earn Berries on every purchase. Spend them on packs, spins, raffles, and mystery boxes.
          </p>
        </div>

        {/* Berries + Streak Bar */}
        <div className="flex flex-wrap gap-4 justify-center mb-10">
          {points !== null && (
            <div className="bg-neutral-900 rounded-xl px-6 py-3 text-center">
              <p className="text-2xl font-bold text-amber-400">{points.toLocaleString()} ⭐</p>
              <p className="text-xs text-neutral-500">Your Berries</p>
            </div>
          )}
          {streak > 0 && (
            <div className="bg-neutral-900 rounded-xl px-6 py-3 text-center">
              <p className="text-2xl font-bold text-orange-400">🔥 {streak} day{streak !== 1 ? "s" : ""}</p>
              <p className="text-xs text-neutral-500">Daily Streak ({multiplier.toFixed(2)}x bonus)</p>
            </div>
          )}
          {canSpin && (
            <Link href="/rewards/spin" className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-6 py-3 text-center hover:bg-emerald-500/20 transition">
              <p className="text-lg font-bold text-emerald-400">🎡 Free Spin!</p>
              <p className="text-xs text-neutral-400">Available now</p>
            </Link>
          )}
        </div>

        {/* Main Reward Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          {/* Pack Opening */}
          <Link href="/rewards/packs" className="group bg-gradient-to-b from-amber-500/10 to-neutral-900 border border-amber-500/20 rounded-xl p-5 hover:border-amber-500/40 transition">
            <div className="text-3xl mb-3">🃏</div>
            <h2 className="text-lg font-bold text-white group-hover:text-amber-400 transition">Pack Opening</h2>
            <p className="text-sm text-neutral-400 mt-1">Open virtual booster packs. 5 cards per pack with animated reveals.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">{packCount} pack{packCount !== 1 ? "s" : ""}</span>
              <span className="text-xs text-neutral-500">from 1,500 Berries</span>
            </div>
          </Link>

          {/* Daily Spin */}
          <Link href="/rewards/spin" className="group bg-gradient-to-b from-emerald-500/10 to-neutral-900 border border-emerald-500/20 rounded-xl p-5 hover:border-emerald-500/40 transition">
            <div className="text-3xl mb-3">🎡</div>
            <h2 className="text-lg font-bold text-white group-hover:text-emerald-400 transition">Daily Spin</h2>
            <p className="text-sm text-neutral-400 mt-1">Spin the wheel for Berries, credit, and surprises. 1 free spin daily.</p>
            <div className="mt-3 flex items-center gap-2">
              {canSpin ? (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full animate-pulse">Free spin ready!</span>
              ) : (
                <span className="text-xs text-neutral-500">500 Berries per premium spin</span>
              )}
            </div>
          </Link>

          {/* Raffles */}
          <Link href="/rewards" className="group bg-gradient-to-b from-purple-500/10 to-neutral-900 border border-purple-500/20 rounded-xl p-5 hover:border-purple-500/40 transition">
            <div className="text-3xl mb-3">🎰</div>
            <h2 className="text-lg font-bold text-white group-hover:text-purple-400 transition">Raffles</h2>
            <p className="text-sm text-neutral-400 mt-1">Enter for a chance to win high-value cards. More entries = better odds.</p>
            <div className="mt-3">
              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">{raffleCount} active</span>
            </div>
          </Link>

          {/* Mystery Boxes */}
          <Link href="/rewards" className="group bg-gradient-to-b from-pink-500/10 to-neutral-900 border border-pink-500/20 rounded-xl p-5 hover:border-pink-500/40 transition">
            <div className="text-3xl mb-3">📦</div>
            <h2 className="text-lg font-bold text-white group-hover:text-pink-400 transition">Mystery Boxes</h2>
            <p className="text-sm text-neutral-400 mt-1">Every box is a winner. Berries, credit, or real cards.</p>
            <div className="mt-3">
              <span className="text-xs bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded-full">{boxCount} available</span>
            </div>
          </Link>
        </div>

        {/* How to Earn */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-bold text-white mb-4">How to Earn Berries</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-amber-400 shrink-0">🛒</span>
              <p className="text-neutral-300"><strong className="text-white">Buy cards</strong> — 10 Berries per £1 spent, multiplied by your tier</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-400 shrink-0">🤝</span>
              <p className="text-neutral-300"><strong className="text-white">P2P trades</strong> — earn Berries on completed trades</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-400 shrink-0">💰</span>
              <p className="text-neutral-300"><strong className="text-white">Trade-in</strong> — sell cards for credit, earn Berries too</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-400 shrink-0">🔥</span>
              <p className="text-neutral-300"><strong className="text-white">Daily streak</strong> — visit daily for up to 1.5x Berries multiplier</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-400 shrink-0">📈</span>
              <p className="text-neutral-300"><strong className="text-white">Tier upgrades</strong> — Silver 1.5x, Gold 2x, Platinum 3x, OG 7x Berries</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-amber-400 shrink-0">🎡</span>
              <p className="text-neutral-300"><strong className="text-white">Spin & win</strong> — daily spins can award bonus Berries</p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/membership" className="bg-neutral-900 rounded-xl p-4 hover:bg-neutral-800/70 transition text-center">
            <p className="text-sm font-bold text-white">Membership Tiers</p>
            <p className="text-xs text-neutral-500 mt-1">Unlock better rates + multipliers</p>
          </Link>
          <Link href="/guides/how-to-play" className="bg-neutral-900 rounded-xl p-4 hover:bg-neutral-800/70 transition text-center">
            <p className="text-sm font-bold text-white">How to Play OPTCG</p>
            <p className="text-xs text-neutral-500 mt-1">Learn the game, build decks</p>
          </Link>
          <Link href="/about" className="bg-neutral-900 rounded-xl p-4 hover:bg-neutral-800/70 transition text-center">
            <p className="text-sm font-bold text-white">About Cambridge TCG</p>
            <p className="text-xs text-neutral-500 mt-1">Our mission and community</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
