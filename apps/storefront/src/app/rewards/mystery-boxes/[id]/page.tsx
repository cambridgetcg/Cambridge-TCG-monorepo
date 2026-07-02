"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { MysteryBox, MysteryBoxReward } from "@/lib/rewards/types";
import { Badge, Palettes } from "@/lib/ui";

const RARITY_GLOW: Record<string, string> = {
  common: "shadow-neutral-500/30",
  uncommon: "shadow-blue-500/40",
  rare: "shadow-purple-500/50",
  legendary: "shadow-amber-500/60",
};

const RARITY_BORDER: Record<string, string> = {
  common: "border-neutral-500",
  uncommon: "border-blue-500",
  rare: "border-purple-500",
  legendary: "border-accent-strong",
};

type RevealState = "idle" | "opening" | "revealed";

export default function MysteryBoxDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [box, setBox] = useState<MysteryBox | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [points, setPoints] = useState<number>(0);
  const [revealState, setRevealState] = useState<RevealState>("idle");
  const [wonReward, setWonReward] = useState<MysteryBoxReward | null>(null);
  const [drawId, setDrawId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/rewards/mystery-boxes").then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()).catch(() => null),
      fetch("/api/membership").then((r) => r.json()).catch(() => null),
    ]).then(([boxData, session, memberData]) => {
      const found = (boxData?.boxes ?? []).find((b: MysteryBox) => b.id === id);
      setBox(found ?? null);
      if (session?.user?.email) setLoggedIn(true);
      if (memberData?.profile?.points_balance != null) setPoints(memberData.profile.points_balance);
      setLoading(false);
    });
  }, [id]);

  async function handleOpen() {
    if (!box) return;
    setRevealState("opening");
    setMessage(null);
    setWonReward(null);

    try {
      const res = await fetch(`/api/rewards/mystery-boxes/${box.id}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      // Hold the opening animation for a moment
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (data.success) {
        setWonReward(data.reward ?? null);
        setDrawId(data.drawId ?? null);
        setRevealState("revealed");
        setBox((prev) =>
          prev
            ? {
                ...prev,
                total_opens: prev.total_opens + 1,
                user_opens: (prev.user_opens ?? 0) + 1,
              }
            : prev
        );
        setPoints((prev) => prev - box.cost_points);
      } else {
        setMessage({ type: "error", text: data.error ?? "Failed to open box." });
        setRevealState("idle");
      }
    } catch {
      setMessage({ type: "error", text: "Something went wrong." });
      setRevealState("idle");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!box) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center text-ink">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Mystery Box not found</h1>
          <Link href="/rewards" className="text-purple-400 hover:underline">
            Back to Rewards
          </Link>
        </div>
      </div>
    );
  }

  const opensLeft = box.max_opens_per_user - (box.user_opens ?? 0);
  const canOpen = loggedIn && opensLeft > 0 && points >= box.cost_points && box.status === "active";
  const rewards = (box.rewards ?? []).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link href="/rewards" className="text-sm text-ink-muted hover:text-ink mb-6 inline-block">
          &larr; Back to Rewards
        </Link>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          {/* Left: Image + Open action */}
          <div>
            <div className="aspect-square rounded-xl bg-surface-elevated overflow-hidden relative">
              {box.image_url ? (
                <img src={box.image_url} alt={box.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-neutral-900">
                  <svg className="w-24 h-24 text-purple-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              )}

              {/* Opening overlay */}
              {revealState === "opening" && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-purple-300 text-lg font-bold animate-pulse">Opening...</p>
                  </div>
                </div>
              )}

              {/* Reveal overlay */}
              {revealState === "revealed" && wonReward && (
                <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
                  <div
                    className={`text-center p-8 rounded-2xl border-2 shadow-2xl ${RARITY_BORDER[wonReward.rarity] ?? "border-neutral-500"} ${RARITY_GLOW[wonReward.rarity] ?? ""} bg-surface/90`}
                  >
                    {wonReward.image_url && (
                      <img
                        src={wonReward.image_url}
                        alt={wonReward.name}
                        className="w-24 h-24 rounded-lg object-cover mx-auto mb-3"
                      />
                    )}
                    <div className="mb-2">
                      <Badge status={wonReward.rarity} palette={Palettes.MysteryBoxRarityPalette} size="md" />
                    </div>
                    <h3 className="text-xl font-black mb-1">{wonReward.name}</h3>
                    {wonReward.description && (
                      <p className="text-ink-muted text-sm mb-3">{wonReward.description}</p>
                    )}
                    <button
                      onClick={() => {
                        setRevealState("idle");
                        setWonReward(null);
                        setDrawId(null);
                      }}
                      className="mt-2 px-4 py-2 bg-purple-500 hover:bg-purple-400 text-ink text-sm font-bold rounded-lg transition"
                    >
                      Close
                    </button>
                    {drawId && (
                      <a
                        href={`/verify/draw/${drawId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2 text-xs text-secondary hover:text-emerald-300 underline"
                      >
                        ✓ Verify this box was fair ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Open button */}
            <div className="mt-6">
              {loggedIn ? (
                <>
                  <button
                    onClick={handleOpen}
                    disabled={!canOpen || revealState !== "idle"}
                    className="w-full py-3 bg-purple-500 hover:bg-purple-400 disabled:bg-neutral-700 disabled:text-ink-faint text-ink font-bold rounded-xl transition text-lg"
                  >
                    {revealState === "opening"
                      ? "Opening..."
                      : `Open Box (${box.cost_points.toLocaleString()} Berries)`}
                  </button>
                  {opensLeft <= 0 && (
                    <p className="text-ink-faint text-sm mt-2 text-center">
                      You have used all your opens for this box.
                    </p>
                  )}
                  {points < box.cost_points && opensLeft > 0 && (
                    <p className="text-red-400 text-sm mt-2 text-center">
                      Not enough Berries ({points.toLocaleString()} / {box.cost_points.toLocaleString()})
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-border-strong bg-surface p-6 text-center">
                  <p className="text-ink-muted mb-3">Sign in to open this box</p>
                  <Link
                    href="/login"
                    className="inline-block px-6 py-2 bg-purple-500 text-ink font-bold rounded-lg hover:bg-purple-400 transition"
                  >
                    Sign In
                  </Link>
                </div>
              )}
            </div>

            {message && (
              <div
                className={`mt-4 rounded-lg p-3 text-sm ${
                  message.type === "success"
                    ? "bg-green-500/10 border border-green-500/30 text-green-400"
                    : "bg-danger/10 border border-danger/30 text-red-400"
                }`}
              >
                {message.text}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div>
            <h1 className="text-3xl font-black mb-2">{box.title}</h1>
            {box.description && (
              <p className="text-ink-muted mb-6">{box.description}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-lg bg-surface border border-border-subtle p-3 text-center">
                <p className="text-2xl font-bold text-purple-400">{box.cost_points.toLocaleString()}</p>
                <p className="text-xs text-ink-faint">Berries to open</p>
              </div>
              <div className="rounded-lg bg-surface border border-border-subtle p-3 text-center">
                <p className="text-2xl font-bold">{box.total_opens.toLocaleString()}</p>
                <p className="text-xs text-ink-faint">total opens</p>
              </div>
              {loggedIn && box.user_opens != null && (
                <div className="rounded-lg bg-surface border border-border-subtle p-3 text-center">
                  <p className="text-2xl font-bold text-purple-400/80">
                    {box.user_opens} / {box.max_opens_per_user}
                  </p>
                  <p className="text-xs text-ink-faint">your opens</p>
                </div>
              )}
            </div>

            {/* Reward table */}
            {rewards.length > 0 && (
              <div className="rounded-xl border border-border-subtle overflow-hidden">
                <div className="bg-surface px-4 py-3 border-b border-border-subtle">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-ink-muted">
                    Possible Rewards
                  </h3>
                </div>
                <div className="divide-y divide-border-subtle/50">
                  {rewards.map((reward) => (
                    <div key={reward.id} className="px-4 py-3 flex items-center gap-3">
                      {reward.image_url ? (
                        <img
                          src={reward.image_url}
                          alt={reward.name}
                          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-surface-elevated flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{reward.name}</p>
                        <p className="text-xs text-ink-faint capitalize">{reward.reward_type}</p>
                      </div>
                      <span className="flex-shrink-0">
                        <Badge status={reward.rarity} palette={Palettes.MysteryBoxRarityPalette} />
                      </span>
                      <span className="text-sm text-ink-muted flex-shrink-0 w-14 text-right">
                        {(parseFloat(reward.probability) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
