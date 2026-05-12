"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { WhyLink } from "@/lib/ui";
import { TRUST_TIERS } from "@/lib/escrow/types";
import type { TrustProfile, TradeReview, ExternalRep } from "@/lib/escrow/types";

import { Audience } from "@/lib/ui";
type TrustTier = (typeof TRUST_TIERS)[number];

function scoreColor(score: number): string {
  if (score >= 95) return "text-purple-400";
  if (score >= 80) return "text-blue-400";
  if (score >= 50) return "text-emerald-400";
  if (score >= 20) return "text-amber-400";
  return "text-red-400";
}

function scoreRingColor(score: number): string {
  if (score >= 95) return "stroke-purple-400";
  if (score >= 80) return "stroke-blue-400";
  if (score >= 50) return "stroke-emerald-400";
  if (score >= 20) return "stroke-amber-400";
  return "stroke-red-400";
}

function scoreBg(score: number): string {
  if (score >= 95) return "bg-purple-400";
  if (score >= 80) return "bg-blue-400";
  if (score >= 50) return "bg-emerald-400";
  if (score >= 20) return "bg-amber-400";
  return "bg-red-400";
}

function tierBadgeClass(tier: TrustTier): string {
  const map: Record<string, string> = {
    neutral: "bg-neutral-700 text-neutral-300",
    blue: "bg-blue-500/20 text-blue-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/20 text-amber-400",
    purple: "bg-purple-500/20 text-purple-400",
  };
  return map[tier.color] || map.neutral;
}

function platformBadgeClass(platform: string): string {
  const p = platform.toLowerCase();
  if (p.includes("ebay")) return "bg-blue-500/20 text-blue-400";
  if (p.includes("cardmarket")) return "bg-emerald-500/20 text-emerald-400";
  if (p.includes("tcgplayer")) return "bg-amber-500/20 text-amber-400";
  return "bg-neutral-700 text-neutral-300";
}

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "text-lg" : "text-sm";
  return (
    <span className={`${cls} inline-flex gap-0.5`}>
      <Audience kind="consumer" />
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(rating) ? "text-amber-400" : "text-neutral-700"}>
          ★
        </span>
      ))}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-36 h-36">
      <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" className="stroke-neutral-800" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          className={scoreRingColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</span>
        <span className="text-xs text-neutral-500">/ 100</span>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-neutral-400 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${scoreBg(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-neutral-500 w-12 text-right font-mono">{value}/{max}</span>
    </div>
  );
}

interface HistoryPoint {
  snapshot_date: string;
  trust_score: number;
}

function TrustHistorySparkline() {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    fetch("/api/account/trust/history")
      .then((r) => r.json())
      .then((d) => setPoints(d?.history ?? []));
  }, []);

  if (!points || points.length < 2) return null;

  const W = 360;
  const H = 50;
  const padding = 4;
  const minScore = Math.min(...points.map((p) => p.trust_score));
  const maxScore = Math.max(...points.map((p) => p.trust_score));
  const span = Math.max(1, maxScore - minScore);
  const stepX = (W - padding * 2) / Math.max(1, points.length - 1);
  const y = (s: number) => H - padding - ((s - minScore) / span) * (H - padding * 2);

  const path = points
    .map((p, i) => {
      const x = padding + i * stepX;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y(p.trust_score).toFixed(1)}`;
    })
    .join(" ");

  const first = points[0].trust_score;
  const last = points[points.length - 1].trust_score;
  const delta = last - first;
  const deltaTone = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-neutral-500";

  return (
    <div className="mt-6 pt-4 border-t border-neutral-800">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs uppercase tracking-wider text-neutral-500">Last 90 days</p>
        <p className={`text-xs font-mono ${deltaTone}`}>
          {delta > 0 ? "+" : ""}{delta} points
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12 block">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" />
      </svg>
      <p className="text-[10px] text-neutral-600">
        {points.length} daily snapshot{points.length === 1 ? "" : "s"} ·
        range {minScore} – {maxScore}
      </p>
    </div>
  );
}

// ── Escrow thresholds section ──

interface ThresholdsData {
  thresholds: {
    directMax: number;
    verifiedMax: number;
    trustTier: string;
  };
}

function EscrowThresholdsSection({ trustScore }: { trustScore: number }) {
  const [data, setData] = useState<ThresholdsData | null>(null);

  useEffect(() => {
    fetch("/api/escrow/routing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const { directMax, verifiedMax } = data.thresholds;

  // Build the next-tier improvements hint
  const improvements: string[] = [];
  if (trustScore < 20) {
    improvements.push("Reach Starter (20+) to unlock Direct Ship up to \u00a330");
  } else if (trustScore < 50) {
    improvements.push("Reach Trusted (50+) to unlock Direct Ship up to \u00a350");
  } else if (trustScore < 80) {
    improvements.push("Reach Veteran (80+) to unlock Direct Ship up to \u00a3100");
  } else if (trustScore < 95) {
    improvements.push("Reach Elite (95+) to unlock Direct Ship up to \u00a3500");
  }

  return (
    <div className="bg-neutral-900 rounded-xl p-6 mb-6">
      <h3 className="text-lg font-semibold text-white mb-4">Your Trade Thresholds</h3>
      <p className="text-sm text-neutral-400 mb-4">
        Based on your trust score ({trustScore}):
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Direct Ship</span>
          </div>
          <span className="text-sm text-neutral-300">
            trades up to <span className="font-mono font-semibold text-emerald-400">{formatPrice(directMax)}</span>
          </span>
        </div>
        {directMax !== verifiedMax && (
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-sm font-medium text-blue-400">Verified Ship</span>
            </div>
            <span className="text-sm text-neutral-300">
              trades up to <span className="font-mono font-semibold text-blue-400">{formatPrice(verifiedMax)}</span>
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-amber-400">Full Escrow</span>
          </div>
          <span className="text-sm text-neutral-300">
            trades above <span className="font-mono font-semibold text-amber-400">{formatPrice(verifiedMax)}</span>
          </span>
        </div>
      </div>
      {improvements.length > 0 && (
        <div className="mt-4 pt-3 border-t border-neutral-800">
          {improvements.map((tip, i) => (
            <p key={i} className="text-xs text-neutral-500 flex items-center gap-1.5">
              <span className="text-amber-400">&uarr;</span>
              {tip}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

const PLATFORM_OPTIONS = ["eBay", "Cardmarket", "TCGPlayer", "Discord", "Facebook", "Other"];

export default function TrustProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [reviews, setReviews] = useState<TradeReview[]>([]);
  const [tier, setTier] = useState<TrustTier>(TRUST_TIERS[0]);
  const [externalAccounts, setExternalAccounts] = useState<ExternalRep[]>([]);

  // Link form
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkPlatform, setLinkPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [linkUsername, setLinkUsername] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkScreenshot, setLinkScreenshot] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        return Promise.all([
          fetch("/api/escrow/trust").then((r) => r.json()),
          fetch("/api/escrow/external-rep").then((r) => r.json()),
        ]);
      })
      .then((results) => {
        if (!results) return;
        const [trustData, repData] = results;
        setProfile(trustData.profile);
        setReviews(trustData.reviews || []);
        if (trustData.tier) {
          const found = TRUST_TIERS.find((t) => t.name === trustData.tier);
          if (found) setTier(found);
        }
        setExternalAccounts(repData.accounts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault();
    setLinkSubmitting(true);
    setLinkError("");
    try {
      const res = await fetch("/api/escrow/external-rep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: linkPlatform,
          username: linkUsername,
          profileUrl: linkUrl || undefined,
          screenshotUrl: linkScreenshot || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to link account");
      }
      const repData = await fetch("/api/escrow/external-rep").then((r) => r.json());
      setExternalAccounts(repData.accounts || []);
      setShowLinkForm(false);
      setLinkUsername("");
      setLinkUrl("");
      setLinkScreenshot("");
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link account");
    } finally {
      setLinkSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Could not load trust profile.</p>
      </div>
    );
  }

  const score = profile.trust_score;
  const nextTier = TRUST_TIERS.find((t) => t.minScore > score);
  const winRate =
    profile.disputed_trades > 0
      ? Math.round((profile.disputes_won / profile.disputed_trades) * 100)
      : null;

  // Real per-component contributions — same formulas as the trust
  // engine. Replaces the prior "estimate proportional to trust score"
  // bars (which weren't tied to the engine math at all).
  //
  //   Completion rate   → 30 pts max
  //   Reviews (avg/5)   → 25 pts max
  //   Trade volume      → 15 pts max (logarithmic)
  //   Verification      → 10 pts (all-or-nothing flag)
  //   External rep      → 10 pts (5 pts per verified platform, max 2)
  const completionRate = profile.total_trades > 0
    ? profile.completed_trades / profile.total_trades : 0;
  const completionContrib = Math.round(completionRate * 30);
  const reviewContrib = Math.round((parseFloat(profile.avg_rating) / 5) * 25);
  const totalVolumeNum = parseFloat(profile.total_volume) || 0;
  const volumeContrib = Math.min(15, Math.round(Math.log10(Math.max(1, totalVolumeNum)) * 5));
  const verifiedReps = profile.external_rep.filter((e) => e.verified).length;
  const externalContrib = Math.min(10, verifiedReps * 5);
  const verificationContrib = profile.external_rep.some((e) => e.verified) ? 10 : 0;

  // Penalties — pulled directly from profile counts (now populated
  // by Phase A's real dispute-outcome capture).
  const lostPenalty = profile.disputes_lost * 15;
  const openPenalty = Math.max(0, (profile.disputed_trades - profile.disputes_won - profile.disputes_lost)) * 10;
  const totalPenalty = lostPenalty + openPenalty;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">
        Trust Score
        <WhyLink href="/methodology/trust-score" tooltip="How is the trust score computed?" />
      </h1>

      {/* Trust Score Card */}
      <div className="bg-neutral-900 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreRing score={score} />
          <div className="text-center sm:text-left">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <h2 className="text-xl font-bold text-white">{tier.name} Tier</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tierBadgeClass(tier)}`}>
                {tier.name}
              </span>
            </div>
            <p className="text-neutral-400 text-sm mt-2">
              {profile.total_reviews > 0
                ? `${parseFloat(profile.avg_rating).toFixed(1)} avg rating from ${profile.total_reviews} reviews`
                : "No reviews yet"}
            </p>
            {profile.is_suspended && (
              <p className="text-red-400 text-sm mt-2 font-medium">
                Account suspended{profile.suspended_reason ? `: ${profile.suspended_reason}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Score Breakdown — real per-component contributions, not estimates */}
      <div className="bg-neutral-900 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-1">Score Breakdown</h3>
        <p className="text-xs text-neutral-500 mb-4">
          Sum of components minus penalties = current score ({score}).
        </p>
        <div className="space-y-3">
          <BreakdownBar label="Completion rate" value={completionContrib} max={30} />
          <BreakdownBar label="Reviews"         value={reviewContrib}     max={25} />
          <BreakdownBar label="Trade volume"    value={volumeContrib}     max={15} />
          <BreakdownBar label="Verification"    value={verificationContrib} max={10} />
          <BreakdownBar label="External rep"    value={externalContrib}   max={10} />
          {totalPenalty > 0 && (
            <div className="pt-2 mt-2 border-t border-neutral-800">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-red-400">Penalties</span>
                <span className="text-red-400 font-mono">−{totalPenalty}</span>
              </div>
              <p className="text-[10px] text-neutral-500 mt-0.5">
                {profile.disputes_lost} disputes lost (−15 each){openPenalty > 0 ? ` · ${openPenalty / 10} open (−10 each)` : ""}
              </p>
            </div>
          )}
        </div>
        <TrustHistorySparkline />
      </div>

      {/* Escrow Trade Thresholds */}
      <EscrowThresholdsSection trustScore={score} />

      {/* Trade Stats */}
      <div className="bg-neutral-900 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Trade Statistics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-white">{profile.completed_trades}</p>
            <p className="text-xs text-neutral-500">Completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{profile.cancelled_trades}</p>
            <p className="text-xs text-neutral-500">Cancelled</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{profile.disputed_trades}</p>
            <p className="text-xs text-neutral-500">Disputed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">
              {winRate !== null ? `${winRate}%` : "--"}
            </p>
            <p className="text-xs text-neutral-500">Dispute Win Rate</p>
          </div>
        </div>
      </div>

      {/* Trade Limits & Payout Hold */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-neutral-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-3">Trade Limits</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-neutral-400">Per-trade limit</span>
              <span className="text-sm font-medium text-white">{formatPrice(tier.tradeLimit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-400">Daily limit</span>
              <span className="text-sm font-medium text-white">{formatPrice(tier.dailyLimit)}</span>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-3">Payout Hold</h3>
          <p className="text-sm text-neutral-400">
            {tier.payoutHoldDays === 0
              ? "Your payouts are released instantly."
              : `Your payouts are held for ${tier.payoutHoldDays} day${tier.payoutHoldDays !== 1 ? "s" : ""}.`}
          </p>
          {tier.requiresInspection && (
            <p className="text-xs text-amber-400 mt-2">Escrow inspection required for trades.</p>
          )}
        </div>
      </div>

      {/* Tier Progress */}
      {nextTier && (
        <div className="bg-neutral-900 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Next Tier: {nextTier.name}</h3>
          <div className="mb-2">
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
              <span>{score} / {nextTier.minScore}</span>
              <span>{nextTier.minScore - score} score needed</span>
            </div>
            <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreBg(score)}`}
                style={{ width: `${Math.min(100, (score / nextTier.minScore) * 100)}%` }}
              />
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-500 space-y-1">
            <p>At {nextTier.name}: trade limit {formatPrice(nextTier.tradeLimit)}, daily limit {formatPrice(nextTier.dailyLimit)}</p>
            {nextTier.payoutHoldDays === 0 ? (
              <p>Instant payouts</p>
            ) : (
              <p>Payout hold: {nextTier.payoutHoldDays} day{nextTier.payoutHoldDays !== 1 ? "s" : ""}</p>
            )}
            {!nextTier.requiresInspection && tier.requiresInspection && (
              <p>No escrow inspection required</p>
            )}
          </div>
        </div>
      )}

      {/* Reviews */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Reviews</h3>
        {reviews.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-6 text-center">
            <p className="text-neutral-500">No reviews yet. Complete trades to receive reviews.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="bg-neutral-900 rounded-xl p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Stars rating={review.rating} />
                      <span className="text-xs text-neutral-500">
                        {review.role === "buyer" ? "as buyer" : "as seller"}
                      </span>
                    </div>
                    {review.reviewer_name && (
                      <p className="text-sm text-neutral-400 mt-1">by {review.reviewer_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-600">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                {review.card_name && (
                  <p className="text-xs text-neutral-500 mb-2">Trade: {review.card_name}{review.trade_price ? ` - ${formatPrice(parseFloat(review.trade_price))}` : ""}</p>
                )}
                {(review.card_accuracy || review.shipping_speed || review.communication) && (
                  <div className="flex gap-4 text-xs text-neutral-500 mb-2">
                    {review.card_accuracy && <span>Accuracy: {review.card_accuracy}/5</span>}
                    {review.shipping_speed && <span>Shipping: {review.shipping_speed}/5</span>}
                    {review.communication && <span>Comms: {review.communication}/5</span>}
                  </div>
                )}
                {review.comment && (
                  <p className="text-sm text-neutral-300">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* External Reputation */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">External Reputation</h3>
          <button
            onClick={() => setShowLinkForm(!showLinkForm)}
            className="text-sm font-medium text-amber-400 hover:text-amber-300 transition"
          >
            {showLinkForm ? "Cancel" : "Link Account"}
          </button>
        </div>

        {showLinkForm && (
          <form onSubmit={handleLinkAccount} className="bg-neutral-900 rounded-xl p-5 mb-4 space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Platform</label>
              <select
                value={linkPlatform}
                onChange={(e) => setLinkPlatform(e.target.value)}
                className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-amber-500 focus:outline-none"
              >
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Username</label>
              <input
                type="text"
                value={linkUsername}
                onChange={(e) => setLinkUsername(e.target.value)}
                required
                className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-amber-500 focus:outline-none"
                placeholder="Your username on this platform"
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Profile URL</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-amber-500 focus:outline-none"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Screenshot URL (optional)</label>
              <input
                type="url"
                value={linkScreenshot}
                onChange={(e) => setLinkScreenshot(e.target.value)}
                className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-amber-500 focus:outline-none"
                placeholder="Link to a screenshot of your profile"
              />
            </div>
            {linkError && <p className="text-red-400 text-sm">{linkError}</p>}
            <button
              type="submit"
              disabled={linkSubmitting || !linkUsername}
              className="w-full py-2.5 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 transition disabled:opacity-50"
            >
              {linkSubmitting ? "Linking..." : "Link Account"}
            </button>
          </form>
        )}

        {externalAccounts.length === 0 && !showLinkForm ? (
          <div className="bg-neutral-900 rounded-xl p-6 text-center">
            <p className="text-neutral-500">No linked accounts. Link your eBay, Cardmarket, or TCGPlayer profile to boost your trust score.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {externalAccounts.map((acct, i) => (
              <div key={i} className="bg-neutral-900 rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded text-xs font-semibold ${platformBadgeClass(acct.platform)}`}>
                    {acct.platform}
                  </span>
                  <div>
                    <p className="text-sm text-white font-medium">{acct.username}</p>
                    {acct.rating !== null && (
                      <p className="text-xs text-neutral-500">
                        {acct.positive_percent !== null ? `${acct.positive_percent}% positive` : `Rating: ${acct.rating}`}
                        {acct.total_sales !== null ? ` / ${acct.total_sales} sales` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  {acct.verified ? (
                    <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Verified
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-400">Pending verification</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
