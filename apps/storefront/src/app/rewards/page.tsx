"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MysteryBox, Raffle } from "@/lib/rewards/types";

export default function RewardsHubPage() {
  const [points, setPoints] = useState<number | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [canSpin, setCanSpin] = useState(false);
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [boxes, setBoxes] = useState<MysteryBox[]>([]);
  const [packCount, setPackCount] = useState(0);

  useEffect(() => {
    // Fetch all reward data in parallel
    Promise.all([
      fetch("/api/membership").then(r => r.json()).catch(() => null),
      fetch("/api/rewards/spin").then(r => r.json()).catch(() => null),
      fetch("/api/rewards/raffles").then(r => r.json()).catch(() => ({ raffles: [] })),
      fetch("/api/rewards/mystery-boxes").then(r => r.json()).catch(() => ({ boxes: [] })),
      fetch("/api/rewards/packs").then(r => r.json()).catch(() => ({ packs: [] })),
    ]).then(([member, spin, raffleData, boxData, packs]) => {
      if (member?.profile?.points_balance != null) setPoints(member.profile.points_balance);
      if (spin?.streak) setStreak(spin.streak);
      if (spin?.canFreeSpin) setCanSpin(true);
      setMultiplier(1 + Math.max(0, (spin?.streak || 1) - 1) * 0.02);
      setRaffles(raffleData?.raffles ?? []);
      setBoxes(boxData?.boxes ?? []);
      setPackCount(packs?.packs?.length || 0);
    });
  }, []);

  return (
    <main className="min-h-screen bg-page">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-semibold text-ink">
            Rewards <span className="text-accent">Hub</span>
          </h1>
          <p className="text-ink-muted mt-2">
            Earn Berries with daily spins and streaks. Spend them on packs, raffles, and mystery boxes.
          </p>
        </div>

        {/* Berries + Streak Bar */}
        <div className="flex flex-wrap gap-4 justify-center mb-10">
          {points !== null && (
            <div className="bg-surface border border-border-subtle rounded-lg px-6 py-3 text-center">
              <p className="text-2xl font-bold text-accent">{points.toLocaleString()}</p>
              <p className="text-xs text-ink-faint">Your Berries</p>
            </div>
          )}
          {streak > 0 && (
            <div className="bg-surface border border-border-subtle rounded-lg px-6 py-3 text-center">
              <p className="text-2xl font-bold text-warning">{streak} day{streak !== 1 ? "s" : ""}</p>
              <p className="text-xs text-ink-faint">Daily Streak ({multiplier.toFixed(2)}x bonus)</p>
            </div>
          )}
          {canSpin && (
            <Link href="/rewards/spin" className="bg-ok/10 border border-ok/30 rounded-lg px-6 py-3 text-center hover:bg-ok/15 transition">
              <p className="text-lg font-bold text-ok">Free Spin!</p>
              <p className="text-xs text-ink-muted">Available now</p>
            </Link>
          )}
        </div>

        {/* Main Reward Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-12">
          {/* Pack Opening */}
          <Link href="/rewards/packs" className="group bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-strong transition">
            <h2 className="text-lg font-bold text-ink group-hover:text-accent transition">Pack Opening</h2>
            <p className="text-sm text-ink-muted mt-1">Open virtual booster packs. 5 cards per pack with animated reveals.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs bg-accent-wash text-accent px-2 py-0.5 rounded-full">{packCount} pack{packCount !== 1 ? "s" : ""}</span>
              <span className="text-xs text-ink-faint">from 1,500 Berries</span>
            </div>
          </Link>

          {/* Daily Spin */}
          <Link href="/rewards/spin" className="group bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-strong transition">
            <h2 className="text-lg font-bold text-ink group-hover:text-accent transition">Daily Spin</h2>
            <p className="text-sm text-ink-muted mt-1">Spin the wheel for Berries, credit, and surprises. 1 free spin daily.</p>
            <div className="mt-3 flex items-center gap-2">
              {canSpin ? (
                <span className="text-xs bg-ok/10 text-ok px-2 py-0.5 rounded-full animate-pulse">Free spin ready!</span>
              ) : (
                <span className="text-xs text-ink-faint">500 Berries per premium spin</span>
              )}
            </div>
          </Link>

          {/* Raffles — anchors down to the inline list below */}
          <Link href="#raffles" className="group bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-strong transition">
            <h2 className="text-lg font-bold text-ink group-hover:text-accent transition">Raffles</h2>
            <p className="text-sm text-ink-muted mt-1">Enter for a chance to win high-value cards. More entries = better odds.</p>
            <div className="mt-3">
              <span className="text-xs bg-surface-subtle text-ink-muted px-2 py-0.5 rounded-full">{raffles.length} active</span>
            </div>
          </Link>

          {/* Mystery Boxes — anchors down to the inline list below */}
          <Link href="#mystery-boxes" className="group bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-strong transition">
            <h2 className="text-lg font-bold text-ink group-hover:text-accent transition">Mystery Boxes</h2>
            <p className="text-sm text-ink-muted mt-1">Every box is a winner. Berries, credit, or real cards.</p>
            <div className="mt-3">
              <span className="text-xs bg-surface-subtle text-ink-muted px-2 py-0.5 rounded-full">{boxes.length} available</span>
            </div>
          </Link>
        </div>

        {/* Active Raffles — inline rows so the headline card's promise is
            kept on this page; each row opens the raffle's own page. */}
        <section id="raffles" className="scroll-mt-24 mb-12">
          <h2 className="text-lg font-bold text-ink mb-4">Active Raffles</h2>
          {raffles.length === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-ink-faint text-sm">
              No raffles running right now. New draws appear here when they open.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {raffles.map((raffle) => (
                <Link
                  key={raffle.id}
                  href={`/rewards/raffles/${raffle.id}`}
                  className="group flex gap-4 bg-surface border border-[#6a5a8f]/20 rounded-lg p-4 hover:border-[#6a5a8f]/40 transition"
                >
                  <div className="w-16 h-16 rounded-lg bg-surface-subtle overflow-hidden shrink-0">
                    {(raffle.image_url || raffle.prize_image_url) && (
                      <img
                        src={raffle.image_url ?? raffle.prize_image_url ?? undefined}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-ink group-hover:text-[#6a5a8f] transition truncate">{raffle.title}</p>
                    <p className="text-xs text-ink-muted truncate">{raffle.prize_description}</p>
                    <p className="text-xs text-ink-faint mt-1">
                      <span className="text-[#6a5a8f]">{raffle.entry_cost_points.toLocaleString()} Berries</span> / entry
                      {" · "}draws {new Date(raffle.draw_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Mystery Boxes — same promise-keeping list for the second card. */}
        <section id="mystery-boxes" className="scroll-mt-24 mb-12">
          <h2 className="text-lg font-bold text-ink mb-4">Mystery Boxes</h2>
          {boxes.length === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-ink-faint text-sm">
              No mystery boxes available right now. New boxes appear here when they open.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {boxes.map((box) => (
                <Link
                  key={box.id}
                  href={`/rewards/mystery-boxes/${box.id}`}
                  className="group flex gap-4 bg-surface border border-border-subtle rounded-lg p-4 hover:border-border-strong transition"
                >
                  <div className="w-16 h-16 rounded-lg bg-surface-subtle overflow-hidden shrink-0">
                    {box.image_url && (
                      <img src={box.image_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-ink group-hover:text-accent transition truncate">{box.title}</p>
                    {box.description && (
                      <p className="text-xs text-ink-muted truncate">{box.description}</p>
                    )}
                    <p className="text-xs text-ink-faint mt-1">
                      <span className="text-accent">{box.cost_points.toLocaleString()} Berries</span> to open
                      {" · "}{box.total_opens.toLocaleString()} opened so far
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* How to Earn */}
        <div className="bg-surface border border-border-subtle rounded-lg p-6 mb-8">
          <h2 className="text-lg font-bold text-ink mb-4">How to Earn Berries</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div className="flex items-start gap-3">
              <p className="text-ink-muted"><strong className="text-ink">Daily spin</strong> — a free spin every day can land bonus Berries</p>
            </div>
            <div className="flex items-start gap-3">
              <p className="text-ink-muted"><strong className="text-ink">Daily streak</strong> — visit daily for up to a 1.5x multiplier on Berries you earn</p>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/market" className="bg-surface rounded-lg p-4 hover:bg-surface transition text-center">
            <p className="text-sm font-bold text-ink">The Collectors&rsquo; Market</p>
            <p className="text-xs text-ink-faint mt-1">Buy &amp; sell — 0% commission</p>
          </Link>
          <Link href="/guides/how-to-play" className="bg-surface rounded-lg p-4 hover:bg-surface transition text-center">
            <p className="text-sm font-bold text-ink">How to Play OPTCG</p>
            <p className="text-xs text-ink-faint mt-1">Learn the game, build decks</p>
          </Link>
          <Link href="/about" className="bg-surface rounded-lg p-4 hover:bg-surface transition text-center">
            <p className="text-sm font-bold text-ink">About Cambridge TCG</p>
            <p className="text-xs text-ink-faint mt-1">Our mission and community</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
