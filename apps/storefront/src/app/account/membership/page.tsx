"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WhyLink, Money } from "@/lib/ui";
import TierBadge from "@/components/membership/TierBadge";
import type { Tier, MemberProfile, PointsEntry, CreditEntry } from "@/lib/membership/types";

import { Audience } from "@/lib/ui";
// ── Tier tone maps keyed by the tier `color` field. The quiet gallery:
// hairline cards, a small tone accent per tier — never gradients or glow.
// Keyed by the DB HEX value (tiers.color, seeded '#CD7F32' etc.); the old
// tailwind-name keys never matched, so every tier fell to the default tone.
const TIER_COLORS: Record<string, {
  border: string; text: string; bg: string; progressBg: string; progressBar: string;
}> = {
  "#CD7F32": {   // Bronze
    border: "border-[#8a6544]/40", text: "text-[#8a6544]", bg: "bg-surface",
    progressBg: "bg-surface-subtle", progressBar: "bg-[#8a6544]",
  },
  "#C0C0C0": {   // Silver
    border: "border-border-strong", text: "text-ink-muted", bg: "bg-surface",
    progressBg: "bg-surface-subtle", progressBar: "bg-ink-faint",
  },
  "#FFD700": {   // Gold / OG
    border: "border-accent/40", text: "text-accent", bg: "bg-surface",
    progressBg: "bg-surface-subtle", progressBar: "bg-accent",
  },
};

const DEFAULT_TC = {
  border: "border-border-subtle", text: "text-ink-muted", bg: "bg-surface",
  progressBg: "bg-surface-subtle", progressBar: "bg-ink-faint",
};

function tc(color: string | undefined) {
  return TIER_COLORS[color ?? ""] ?? DEFAULT_TC;
}

function formatPrice(n: number) {
  return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Type badge colors ────────────────────────────────────────────────────────
const POINTS_TYPE_STYLE: Record<string, string> = {
  order_earned:  "bg-ok/15 text-ok",
  tradein_earned: "bg-[#3e7d8f]/15 text-[#3e7d8f]",
  manual_credit: "bg-info/15 text-info",
  manual_debit:  "bg-danger/15 text-danger",
  redeemed:      "bg-warning/15 text-warning",
  expired:       "bg-ink-faint/15 text-ink-faint",
  migration:     "bg-[#6a5a8f]/15 text-[#6a5a8f]",
};

const CREDIT_TYPE_STYLE: Record<string, string> = {
  cashback:          "bg-ok/15 text-ok",
  tradein_credit:    "bg-[#3e7d8f]/15 text-[#3e7d8f]",
  manual_adjustment: "bg-info/15 text-info",
  redeemed_checkout: "bg-warning/15 text-warning",
  migration:         "bg-[#6a5a8f]/15 text-[#6a5a8f]",
};

function typeLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function MembershipPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [pointsHistory, setPointsHistory] = useState<PointsEntry[]>([]);
  const [creditHistory, setCreditHistory] = useState<CreditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const [showAllCredits, setShowAllCredits] = useState(false);
  const [subscribing, setSubscribing] = useState<"monthly" | "annual" | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    // Check auth then fetch membership data
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(data => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        // Fetch all membership data in parallel
        return Promise.all([
          fetch("/api/membership").then(r => r.json()),
          fetch("/api/membership?tiers=true").then(r => r.json()),
          fetch("/api/membership/berries").then(r => r.json()),
          fetch("/api/membership/credit").then(r => r.json()),
        ]).then(([profileData, tiersData, pointsData, creditData]) => {
          setProfile(profileData.profile);
          setTiers(tiersData.tiers || []);
          setPointsHistory(pointsData.history || []);
          setCreditHistory(creditData.history || []);
          setLoading(false);
        });
      })
      // Without this, any failed fetch left loading=true and the page spun
      // forever. Drop out of loading so the "Unable to load" fallback shows.
      .catch(() => setLoading(false));
  }, [router]);

  async function handleSubscribe(plan: "monthly" | "annual", tierName: string = "Platinum") {
    setSubscribing(plan);
    setSubscribeError(null);
    try {
      const res = await fetch("/api/membership/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, tier: tierName }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // No URL means the API returned an error (already subscribed, tier
      // unpriced, payments down). Surface it and unstick the buttons instead
      // of leaving them disabled on "Redirecting..." forever.
      setSubscribeError(data.error || "Couldn't start checkout. Please try again.");
    } catch {
      setSubscribeError("Couldn't reach checkout. Please try again.");
    } finally {
      setSubscribing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-ink-faint animate-pulse">Loading membership...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-ink-muted">Unable to load membership data.</p>
      </div>
    );
  }

  const tier = profile.tier;
  const tierColor = tc(tier?.color);
  const nextTierColor = tc(profile.next_tier?.color);
  const isMaxTier = !profile.next_tier;
  const visiblePoints = showAllPoints ? pointsHistory : pointsHistory.slice(0, 5);
  const visibleCredits = showAllCredits ? creditHistory : creditHistory.slice(0, 5);
  const isPlatinum = tier?.name === "Platinum";
  const isPro = tier?.name === "Pro";

  // Pro tier pricing (for the Go-Pro banner)
  const proTier = tiers.find(t => t.name === "Pro");
  const proMonthly = proTier?.monthly_price ? parseFloat(proTier.monthly_price) : 3.99;
  const proAnnual = proTier?.annual_price ? parseFloat(proTier.annual_price) : 29.99;

  // Find Platinum tier from the tiers list for pricing info
  const platinumTier = tiers.find(t => t.name === "Platinum");
  const monthlyPrice = platinumTier?.monthly_price ? parseFloat(platinumTier.monthly_price) : 22;
  const annualPrice = platinumTier?.annual_price ? parseFloat(platinumTier.annual_price) : 222;
  const annualSavings = (monthlyPrice * 12) - annualPrice;
  const annualSavingsPercent = Math.round((annualSavings / (monthlyPrice * 12)) * 100);

  return (
    <div className="space-y-8">
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink">
        Membership
        <WhyLink href="/methodology/membership-tier" tooltip="How is my tier assigned?" />
      </h1>

      {subscribeError && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {subscribeError}
        </div>
      )}

      {/* ── Pro upgrade banner (non-Pro, non-Platinum members) ─────────────── */}
      {!isPlatinum && !isPro && (
        <div className="rounded-lg p-6 sm:p-8 border border-border-subtle bg-surface">
          <div>
            <div className="mb-1">
              <h2 className="text-xl font-display font-semibold text-ink">
                Go Pro — <Money value={proMonthly} />/mo
              </h2>
            </div>
            <p className="text-ink-muted mb-2">
              Lower selling fees on the market and at auction.
            </p>
            <p className="text-xs text-ink-faint mb-6">
              No catch — nothing free is taken away.{" "}
              <WhyLink href="/methodology/pro" tooltip="What is Pro?" />
            </p>
            <div className="grid gap-4 sm:grid-cols-2 max-w-md">
              <div className="rounded-lg border border-border-subtle bg-page p-4 text-center">
                <p className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-2">Monthly</p>
                <p className="text-2xl font-display font-semibold text-ink mb-1">
                  <Money value={proMonthly} />
                  <span className="text-sm font-normal text-ink-faint"> /month</span>
                </p>
                <button
                  onClick={() => handleSubscribe("monthly", "Pro")}
                  disabled={subscribing !== null}
                  className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
                >
                  {subscribing === "monthly" ? "Redirecting..." : "Go Pro"}
                </button>
              </div>
              <div className="rounded-lg border border-accent/30 bg-accent-wash p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wider mb-2 text-accent-strong">Annual</p>
                <p className="text-2xl font-display font-semibold text-ink mb-1">
                  <Money value={proAnnual} />
                  <span className="text-sm font-normal text-ink-faint"> /year</span>
                </p>
                <p className="text-xs text-ok font-medium">
                  Save <Money value={proMonthly * 12 - proAnnual} />
                </p>
                <button
                  onClick={() => handleSubscribe("annual", "Pro")}
                  disabled={subscribing !== null}
                  className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
                >
                  {subscribing === "annual" ? "Redirecting..." : "Go Pro"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 0. PLATINUM UPGRADE BANNER / PLATINUM STATUS ───────────────────── */}
      {isPlatinum ? (
        /* Platinum member status card */
        <div className="rounded-lg p-6 sm:p-8 border border-border-subtle bg-surface">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#6e6a80]/15 text-[#6e6a80] border border-[#6e6a80]/30">Platinum</span>
                <div>
                  <h2 className="text-xl font-display font-semibold text-ink">Platinum Member</h2>
                  <p className="text-sm text-ink-muted">
                    {profile.tier_source === "subscription" ? "Active subscription" : "Active"}
                  </p>
                </div>
              </div>
            </div>
            <a
              href="/account/billing"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-surface text-ink border border-border-subtle hover:bg-surface-subtle"
            >
              Manage Subscription
            </a>
          </div>
        </div>
      ) : (
        /* Platinum upgrade banner for non-Platinum members */
        <div className="rounded-lg p-6 sm:p-8 border border-border-subtle bg-surface">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#6e6a80]/15 text-[#6e6a80] border border-[#6e6a80]/30">Platinum</span>
              <h2 className="text-xl font-display font-semibold text-ink">Upgrade to Platinum</h2>
            </div>
            <p className="text-ink-muted mb-6">Zero commission on the market and at auction. Maximum rewards.</p>

            {/* Pricing cards */}
            <div className="grid gap-4 sm:grid-cols-2 max-w-md mb-6">
              {/* Monthly */}
              <div className="rounded-lg border border-border-subtle bg-page p-4 text-center">
                <p className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-2">Monthly</p>
                <p className="text-2xl font-display font-semibold text-ink mb-1">
                  <Money value={monthlyPrice} />
                  <span className="text-sm font-normal text-ink-faint"> /month</span>
                </p>
                <button
                  onClick={() => handleSubscribe("monthly")}
                  disabled={subscribing !== null}
                  className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
                >
                  {subscribing === "monthly" ? "Redirecting..." : "Subscribe"}
                </button>
              </div>

              {/* Annual */}
              <div className="rounded-lg border border-accent/30 bg-accent-wash p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wider mb-2 text-accent-strong">Annual</p>
                <p className="text-2xl font-display font-semibold text-ink mb-1">
                  <Money value={annualPrice} />
                  <span className="text-sm font-normal text-ink-faint"> /year</span>
                </p>
                <p className="text-xs text-ok font-medium">
                  Save <Money value={annualSavings} /> ({annualSavingsPercent}%)
                </p>
                <button
                  onClick={() => handleSubscribe("annual")}
                  disabled={subscribing !== null}
                  className="mt-3 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
                >
                  {subscribing === "annual" ? "Redirecting..." : "Subscribe"}
                </button>
              </div>
            </div>

            {/* Platinum perks checklist — the shop-era perks (store
                discount, cashback) retired 2026-07-06 with the shop. */}
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "0% P2P commission",
                "0% auction fees",
                "3x Berries",
                "Priority everything",
              ].map(perk => (
                <div key={perk} className="flex items-center gap-2 text-sm text-ink-muted">
                  <span className="text-ok shrink-0">&#10003;</span>
                  {perk}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 1. MEMBERSHIP CARD ─────────────────────────────────────────────── */}
      <div className={`rounded-lg border ${tierColor.border} ${tierColor.bg} p-6 sm:p-8`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div className="space-y-3">
            {tier ? (
              <TierBadge name={tier.name} color={tier.color} size="md" />
            ) : (
              <TierBadge name="Bronze" color="#CD7F32" size="md" />
            )}

            {!tier && (
              <p className="text-sm text-accent-strong font-medium">Start earning to unlock perks!</p>
            )}

            <div className="text-sm text-ink-muted">
              Annual spend: <span className="text-ink font-semibold"><Money value={profile.annual_spend} /></span>
            </div>
          </div>

          {/* Progress to next tier */}
          <div className="flex-1 max-w-sm w-full">
            {isMaxTier ? (
              <div className={`text-sm font-medium ${tierColor.text}`}>
                You&apos;re at the highest tier!
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-muted">Progress to {profile.next_tier!.icon} {profile.next_tier!.name}</span>
                  <span className="text-ink-muted font-medium">{profile.progress_to_next}%</span>
                </div>
                <div className={`h-3 rounded-full ${nextTierColor.progressBg} overflow-hidden`}>
                  <div
                    className={`h-full rounded-full ${nextTierColor.progressBar} transition-all duration-500`}
                    style={{ width: `${profile.progress_to_next}%` }}
                  />
                </div>
                <p className="text-xs text-ink-faint">
                  <Money value={profile.amount_to_next} /> more to reach {profile.next_tier!.name}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. PERKS GRID ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-ink mb-4">Your Perks</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PerkCard
            label="Berries"
            value={`${profile.perks.points_multiplier}x`}
            description="Berries multiplier"
            highlight={profile.perks.points_multiplier > 1}
          />
          <PerkCard
            label="P2P Commission"
            value={`${(profile.perks.p2p_commission_rate * 100).toFixed(0)}%`}
            description={profile.perks.p2p_commission_rate < 0.08 ? `commission (standard 8%)` : "commission"}
            highlight={profile.perks.p2p_commission_rate < 0.08}
          />
          <PerkCard
            label="Auction Commission"
            value={`${(profile.perks.auction_commission_rate * 100).toFixed(0)}%`}
            description={profile.perks.auction_commission_rate < 0.12 ? `commission (standard 12%)` : "commission"}
            highlight={profile.perks.auction_commission_rate < 0.12}
          />
          {profile.perks.auction_priority_approval && (
            <PerkCard
              label="Priority"
              value="Enabled"
              description="priority auction approval"
              highlight
            />
          )}
        </div>

        {/* Extra benefits from tier data */}
        {tier && tier.benefits.length > 0 && (
          <div className="mt-4 bg-surface rounded-lg p-4 border border-border-subtle">
            <p className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-2">Additional Benefits</p>
            <ul className="space-y-1.5">
              {tier.benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-muted">
                  <span className="text-ok mt-0.5 shrink-0">&#10003;</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── 3. POINTS & CREDIT ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Berries */}
        <div className="bg-surface rounded-lg border border-border-subtle p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-base font-semibold text-ink">Berries</h3>
            <span className="text-2xl font-bold text-accent">{profile.points_balance.toLocaleString()}</span>
          </div>
          <p className="text-xs text-ink-faint mb-4">
            Lifetime earned: <span className="text-ink-muted">{profile.lifetime_points.toLocaleString()}</span>
          </p>

          {visiblePoints.length > 0 ? (
            <div className="space-y-2">
              {visiblePoints.map(entry => (
                <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${POINTS_TYPE_STYLE[entry.type] ?? "bg-surface-subtle text-ink-muted"}`}>
                      {typeLabel(entry.type)}
                    </span>
                    <span className="text-xs text-ink-faint truncate">{entry.description}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className={`text-sm font-medium ${entry.amount > 0 ? "text-ok" : "text-danger"}`}>
                      {entry.amount > 0 ? "+" : ""}{entry.amount}
                    </span>
                    <span className="text-[10px] text-ink-faint w-14 text-right">{relativeDate(entry.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-faint">No Berries activity yet.</p>
          )}

          {pointsHistory.length > 5 && (
            <button
              onClick={() => setShowAllPoints(v => !v)}
              className="mt-3 text-xs text-accent hover:text-accent-strong transition-colors"
            >
              {showAllPoints ? "Show less" : `View all (${pointsHistory.length})`}
            </button>
          )}
        </div>

        {/* Store Credit — history stays; the earning/spending doors closed
            with the shop on 2026-07-06 (zero balances were outstanding). */}
        <div className="bg-surface rounded-lg border border-border-subtle p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-base font-semibold text-ink">
              Store Credit{" "}
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint border border-border-subtle rounded px-1.5 py-0.5 align-middle">legacy</span>
            </h3>
            <span className="text-2xl font-bold text-ok"><Money value={profile.store_credit_balance} /></span>
          </div>
          <p className="text-xs text-ink-faint mb-4">
            Shop-era history. The shop closed 2026-07-06 with no balances outstanding —{" "}
            <WhyLink href="/methodology/store-credit" tooltip="The shop era and how it closed" label="the record" />
          </p>

          {visibleCredits.length > 0 ? (
            <div className="space-y-2">
              {visibleCredits.map(entry => {
                const amt = parseFloat(entry.amount);
                return (
                  <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CREDIT_TYPE_STYLE[entry.type] ?? "bg-surface-subtle text-ink-muted"}`}>
                        {typeLabel(entry.type)}
                      </span>
                      <span className="text-xs text-ink-faint truncate">{entry.description}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className={`text-sm font-medium ${amt > 0 ? "text-ok" : "text-danger"}`}>
                        {amt > 0 ? "+" : ""}<Money value={Math.abs(amt)} />
                      </span>
                      <span className="text-[10px] text-ink-faint w-14 text-right">{relativeDate(entry.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-faint">No credit activity yet.</p>
          )}

          {creditHistory.length > 5 && (
            <button
              onClick={() => setShowAllCredits(v => !v)}
              className="mt-3 text-xs text-ok hover:text-ok transition-colors"
            >
              {showAllCredits ? "Show less" : `View all (${creditHistory.length})`}
            </button>
          )}
        </div>
      </div>

      {/* ── 4. ALL TIERS COMPARISON ────────────────────────────────────────── */}
      {tiers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-ink mb-4">All Tiers</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map(t => {
              const isCurrent = tier?.id === t.id;
              const c = tc(t.color);
              return (
                <div
                  key={t.id}
                  className={`rounded-lg p-5 bg-surface border transition ${
                    isCurrent ? c.border : "border-border-subtle"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <TierBadge name={t.name} color={t.color} />
                    {isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ok">Current</span>
                    )}
                  </div>

                  <p className="text-xs text-ink-faint mb-3">
                    {t.is_paid && t.monthly_price && t.annual_price
                      ? `${formatPrice(parseFloat(t.monthly_price))}/mo or ${formatPrice(parseFloat(t.annual_price))}/yr`
                      : parseFloat(t.min_annual_spend) === 0
                        ? "Free — all members"
                        : `${formatPrice(parseFloat(t.min_annual_spend))}+ annual spend`}
                  </p>

                  <div className="space-y-2 mb-4">
                    <TierStat label="Berries" value={`${parseFloat(t.points_multiplier)}x`} />
                    <TierStat
                      label="P2P commission"
                      value={`${(parseFloat(t.p2p_commission_rate) * 100).toFixed(0)}%`}
                      highlight={parseFloat(t.p2p_commission_rate) === 0}
                    />
                    <TierStat
                      label="Auction commission"
                      value={`${(parseFloat(t.auction_commission_rate) * 100).toFixed(0)}%`}
                      highlight={parseFloat(t.auction_commission_rate) === 0}
                    />
                    {t.auction_priority_approval && (
                      <TierStat label="Priority approval" value="Yes" />
                    )}
                  </div>

                  {t.benefits.length > 0 && (
                    <ul className="space-y-1.5 border-t border-border-subtle pt-3">
                      {t.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-ink-muted">
                          <span className="text-ok mt-0.5 shrink-0">&#10003;</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function PerkCard({ label, value, description, highlight }: {
  label: string; value: string; description: string; highlight: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${
      highlight
        ? "border-ok/30 bg-ok/5"
        : "border-border-subtle bg-surface"
    }`}>
      <p className="text-xs font-medium text-ink-faint uppercase tracking-wider mb-1">{label}</p>
      <p className="text-ink">
        <span className={`text-xl font-bold ${highlight ? "text-ok" : "text-ink-muted"}`}>{value}</span>
        {" "}
        <span className="text-sm text-ink-muted">{description}</span>
      </p>
    </div>
  );
}

function TierStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-ink-faint">{label}</span>
      <span className={`font-medium ${highlight ? "text-ok" : "text-ink-muted"}`}>{value}</span>
    </div>
  );
}
