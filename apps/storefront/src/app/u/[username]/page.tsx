"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MessageButton, TrustTier, UserMention, WhyLink } from "@/lib/ui";
import type {
  PublicProfile,
  ShowcaseCard,
  WishlistItem,
  ActivityEvent,
  Achievement,
} from "@/lib/social/types";
import type { TradeReview } from "@/lib/escrow/types";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseCard[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [reviews, setReviews] = useState<TradeReview[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [commerce, setCommerce] = useState<{
    tradesSold: number;
    tradesBought: number;
    auctionsSold: number;
    totalVolumeGbp: number;
    disputeRate: number;
    disputes: number;
    trustScore: number;
    trustTier: { name: string; color: string; minScore: number };
    commissionRate: number;
    memberSince: string;
    vacation: { ends_at: string; message: string | null } | null;
  } | null>(null);

  // Activity stats — outward-facing meta-pattern, see
  // @/lib/journey/public-stats. Public, cached 5 min at the edge.
  const [activityStats, setActivityStats] = useState<{
    joined_at: string | null;
    last_active_at: string | null;
    is_suspended: boolean;
    trades: { completed: number; refunded: number; cancelled: number };
    prizes: { shipped: number };
    vault: { items_shipped: number };
    reviews: { received_5_star: number; received_total: number; given_total: number };
    external_rep: { verified_platforms: string[] };
    payment_health: { chargebacks: number; completed_payment_count_proxy: number };
  } | null>(null);

  useEffect(() => {
    // Commerce stats are public and username-keyed; fetched in parallel with
    // the social profile. Failure is silent — card just won't render.
    fetch(`/api/u/${encodeURIComponent(username)}/commerce`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setCommerce(d); })
      .catch(() => {});

    // Activity aggregator — separate parallel fetch (cached at edge so
    // hot profiles don't re-hit the DB).
    fetch(`/api/u/${encodeURIComponent(username)}/activity`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.stats) setActivityStats(d.stats); })
      .catch(() => {});

    fetch(`/api/social/profile?user=${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.private) {
          setIsPrivate(true);
        } else {
          setProfile(data.profile);
          setShowcase(data.showcase ?? []);
          setWishlist(data.wishlist ?? []);
          setActivity(data.activity ?? []);
          setAchievements(data.achievements ?? []);
          setReviews(data.reviews ?? []);
          setIsFollowing(data.following ?? false);
          setIsOwnProfile(data.isOwn ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  async function toggleFollow() {
    if (!profile) return;
    setFollowLoading(true);
    try {
      const res = await fetch("/api/social/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.user_id }),
      });
      if (res.ok) setIsFollowing((p) => !p);
    } catch {}
    setFollowLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isPrivate) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-display font-semibold text-ink mb-2">This profile is private</h1>
          <p className="text-ink-muted text-sm">This collector has chosen to keep their profile private.</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-ink-muted">Profile not found.</p>
      </div>
    );
  }

  // users.tier_color rides as a 2px underline accent only (design doc) —
  // never as backgrounds or rings. Fallback: the quiet bronze.
  const tierColor = profile.tier_color ?? "#96762f";
  const initial = (profile.name ?? profile.username ?? "?")[0].toUpperCase();

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-display font-semibold bg-surface-subtle border border-border-subtle text-ink-muted"
              style={
                profile.avatar_url
                  ? { background: `url(${profile.avatar_url}) center/cover` }
                  : undefined
              }
            >
              {!profile.avatar_url && <span>{initial}</span>}
            </div>
            {/* Trust score */}
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface border border-border-strong flex items-center justify-center text-xs font-mono font-semibold text-ink">
              {profile.trust_score}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-display font-semibold text-ink truncate">
                <UserMention user={profile} form="third-person" fallback={profile.username ?? "user"} />
              </h1>
              {profile.tier_name && (
                <span
                  className="inline-flex items-center pb-px text-xs font-semibold text-ink-muted"
                  style={{ borderBottom: `2px solid ${tierColor}` }}
                >
                  {profile.tier_name}
                </span>
              )}
              <WhyLink href="/methodology/trust-score" tooltip="How is the trust score computed?" />
              <UserMention user={profile} form="pronouns-only" />
            </div>
            <p className="text-ink-faint text-sm mt-0.5">@{profile.username}</p>
            {profile.bio && (
              <p className="text-ink-muted text-sm mt-2 max-w-lg">{profile.bio}</p>
            )}

            {/* Follow + Message buttons */}
            {!isOwnProfile && (
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  onClick={toggleFollow}
                  disabled={followLoading}
                  className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition ${
                    isFollowing
                      ? "bg-surface-subtle text-ink-muted border border-border-subtle hover:text-ink"
                      : "bg-ink text-page hover:opacity-90"
                  }`}
                >
                  {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
                </button>
                {/* Message button — finds-or-creates a thread, then deep-
                    links to the inbox with that thread selected. */}
                <MessageButton otherUserId={profile.user_id} />
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {[
            { label: "Followers", val: profile.follower_count },
            { label: "Following", val: profile.following_count },
            { label: "Collection", val: profile.portfolio_count },
            { label: "Trades", val: profile.trade_count },
            { label: "Avg Rating", val: profile.avg_rating?.toFixed(1) ?? "N/A" },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border-subtle rounded-lg p-3 text-center">
              <div className="text-lg font-mono font-semibold text-ink">{s.val}</div>
              <div className="text-xs text-ink-faint">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Vacation banner — when the seller is currently on vacation,
            their listings are paused and response windows are extended
            on in-flight items. Render above the reputation block so
            anyone considering a trade sees it first. */}
        {commerce?.vacation && (
          <section className="mb-8 bg-warning/10 border border-warning/30 rounded-lg p-4">
            <p className="text-sm font-semibold text-warning">
              On vacation until {new Date(commerce.vacation.ends_at).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              Listings are paused and won't fulfil. Response times on offers, returns, and
              cancellation requests are extended automatically.
            </p>
            {commerce.vacation.message && (
              <p className="text-xs text-warning/80 italic mt-2">
                “{commerce.vacation.message}”
              </p>
            )}
          </section>
        )}

        {/* Seller reputation — only rendered when there's commerce activity */}
        {commerce && (commerce.tradesSold > 0 || commerce.auctionsSold > 0 || commerce.tradesBought > 0) && (
          <section className="bg-surface border border-border-subtle rounded-lg p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Seller Reputation</h2>
              <TrustTier name={commerce.trustTier.name} score={commerce.trustScore} showScore={false} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-lg font-semibold text-ink">{commerce.tradesSold}</div>
                <div className="text-[11px] text-ink-faint">sold (trades)</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-ink">{commerce.auctionsSold}</div>
                <div className="text-[11px] text-ink-faint">sold (auctions)</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-ink">£{commerce.totalVolumeGbp.toFixed(2)}</div>
                <div className="text-[11px] text-ink-faint">total paid out</div>
              </div>
              <div>
                <div className={`text-lg font-semibold ${commerce.disputeRate > 5 ? "text-warning" : commerce.disputeRate > 0 ? "text-ink-muted" : "text-ok"}`}>
                  {commerce.disputeRate.toFixed(1)}%
                </div>
                <div className="text-[11px] text-ink-faint">
                  dispute rate {commerce.disputes > 0 ? `(${commerce.disputes})` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-border-subtle">
              <p className="text-[11px] text-ink-faint">
                Member since {new Date(commerce.memberSince).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </p>
              <p className="text-[11px] text-ink-faint">
                Current commission rate: <span className="font-mono text-ok">{(commerce.commissionRate * 100).toFixed(0)}%</span>
                <WhyLink href="/methodology/commission-rate" tooltip="How is the commission rate decided?" />
                {commerce.commissionRate < 0.08 && (
                  <span className="text-accent ml-1">&middot; earned by reputation</span>
                )}
              </p>
            </div>
          </section>
        )}

        {/* Activity — outward-facing meta-pattern aggregator. Renders
            only when there's something concrete to show (avoids an
            empty card on brand-new accounts). */}
        {activityStats && (activityStats.trades.completed > 0 || activityStats.prizes.shipped > 0
          || activityStats.vault.items_shipped > 0 || activityStats.reviews.received_total > 0
          || activityStats.external_rep.verified_platforms.length > 0) && (
          <section className="bg-surface border border-border-subtle rounded-lg p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Activity</h2>
              {activityStats.is_suspended && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30">
                  Suspended
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {activityStats.trades.completed > 0 && (
                <ActivityStat label="trades completed" value={activityStats.trades.completed} tone="emerald" />
              )}
              {activityStats.prizes.shipped > 0 && (
                <ActivityStat label="prizes shipped" value={activityStats.prizes.shipped} tone="amber" />
              )}
              {activityStats.vault.items_shipped > 0 && (
                <ActivityStat label="vault items shipped" value={activityStats.vault.items_shipped} />
              )}
              {activityStats.reviews.received_total > 0 && (
                <ActivityStat
                  label={`5-star / total reviews`}
                  value={`${activityStats.reviews.received_5_star}/${activityStats.reviews.received_total}`}
                  tone={activityStats.reviews.received_5_star === activityStats.reviews.received_total ? "emerald" : "default"}
                />
              )}
              {activityStats.payment_health.chargebacks > 0 && (
                <ActivityStat label="chargebacks" value={activityStats.payment_health.chargebacks} tone="red" />
              )}
              {activityStats.reviews.given_total > 0 && (
                <ActivityStat label="reviews given" value={activityStats.reviews.given_total} />
              )}
            </div>
            {activityStats.external_rep.verified_platforms.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border-subtle">
                <span className="text-[11px] text-ink-faint uppercase tracking-wider">Verified on</span>
                {activityStats.external_rep.verified_platforms.map((p) => (
                  <span key={p} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-ok/10 text-ok border border-ok/30">
                    {p}
                  </span>
                ))}
              </div>
            )}
            {activityStats.last_active_at && (
              <p className="text-[11px] text-ink-faint mt-3 pt-3 border-t border-border-subtle">
                Last active {timeAgo(activityStats.last_active_at)}
              </p>
            )}
          </section>
        )}

        {/* Showcase */}
        {showcase.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-display font-semibold text-ink mb-4">Showcase</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
              {showcase.map((card) => (
                <div
                  key={card.id}
                  className="shrink-0 w-44 bg-surface rounded-lg overflow-hidden border border-border-subtle"
                >
                  <div className="aspect-[3/4] bg-surface-subtle relative">
                    {card.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.card_name ?? "Card"}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-ink-faint text-sm">
                        No Image
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-ink text-sm font-semibold truncate">
                      {card.card_name}
                    </p>
                    {card.set_name && (
                      <p className="text-ink-faint text-xs truncate">{card.set_name}</p>
                    )}
                    {card.caption && (
                      <p className="text-ink-muted text-xs mt-1 italic line-clamp-2">
                        {card.caption}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Want List */}
        {wishlist.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-display font-semibold text-ink mb-4">Want List</h2>
            <div className="space-y-2">
              {wishlist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 bg-surface rounded-lg p-3 border border-border-subtle"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.card_name}
                      className="w-10 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-surface-subtle rounded flex items-center justify-center text-ink-faint text-xs">
                      ?
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm font-semibold truncate">{item.card_name}</p>
                    <p className="text-ink-faint text-xs">
                      {item.set_name && <span>{item.set_name}</span>}
                      {item.condition_min && (
                        <span className="ml-2">Min: {item.condition_min}</span>
                      )}
                      {item.max_price && (
                        <span className="ml-2">Max: ${item.max_price}</span>
                      )}
                    </p>
                  </div>
                  {item.sku && (
                    <Link
                      href={`/market/${item.sku}`}
                      className="shrink-0 px-3 py-1.5 bg-accent-wash text-accent-strong text-xs font-semibold rounded-lg hover:opacity-90 transition"
                    >
                      Offer to trade
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-display font-semibold text-ink mb-4">Achievements</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
              {achievements.map((a) => {
                const earned = !!a.earned_at;
                return (
                  <div
                    key={a.id}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg text-center transition ${
                      earned
                        ? "bg-surface border border-border-subtle"
                        : "bg-surface-subtle opacity-40"
                    }`}
                    title={a.description}
                  >
                    <span className="text-2xl">{a.icon}</span>
                    <span
                      className={`text-[10px] font-medium leading-tight ${
                        earned ? "text-ink-muted" : "text-ink-faint"
                      }`}
                    >
                      {a.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Reviews — star breakdown + recent comments. Trust
            reputation lives on the profile page, not behind an
            admin-only report. */}
        {reviews.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-semibold text-ink">Reviews</h2>
              <span className="text-xs text-ink-faint">
                {profile.total_reviews} total &middot; avg {profile.avg_rating?.toFixed(1) ?? "—"}/5
              </span>
            </div>

            {/* Rating distribution: 5★ → 1★ */}
            <div className="bg-surface rounded-lg p-4 mb-4 border border-border-subtle">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviews.filter((r) => r.rating === star).length;
                const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3 text-xs py-1">
                    <span className="w-6 text-warning shrink-0">{star}★</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                      <div
                        className="h-full bg-warning"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-ink-faint shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Recent reviews (limit 5, show "N more" hint) */}
            <div className="space-y-3">
              {reviews.slice(0, 5).map((rv) => (
                <div
                  key={rv.id}
                  className="bg-surface rounded-lg p-4 border border-border-subtle"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-warning text-sm">
                        {"★".repeat(rv.rating)}
                        <span className="text-border-strong">{"★".repeat(5 - rv.rating)}</span>
                      </span>
                      <span className="text-ink-muted text-xs truncate">
                        {rv.reviewer_name ?? "Trader"}
                        {rv.role && (
                          <span className="text-ink-faint ml-1.5">
                            (as {rv.role})
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-ink-faint text-xs shrink-0">
                      {timeAgo(rv.created_at)}
                    </span>
                  </div>
                  {rv.comment && (
                    <p className="text-ink-muted text-sm mt-2">{rv.comment}</p>
                  )}
                  {(rv.card_accuracy || rv.shipping_speed || rv.communication) && (
                    <div className="flex gap-3 mt-2.5 pt-2.5 border-t border-border-subtle text-[11px] text-ink-faint">
                      {rv.card_accuracy != null && (
                        <span>Accuracy: <span className="text-ink-muted">{rv.card_accuracy}/5</span></span>
                      )}
                      {rv.shipping_speed != null && (
                        <span>Shipping: <span className="text-ink-muted">{rv.shipping_speed}/5</span></span>
                      )}
                      {rv.communication != null && (
                        <span>Comms: <span className="text-ink-muted">{rv.communication}/5</span></span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {reviews.length > 5 && (
                <p className="text-ink-faint text-xs text-center pt-1">
                  + {reviews.length - 5} more review{reviews.length - 5 === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Activity */}
        {activity.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold text-ink mb-4">Recent Activity</h2>
            <div className="space-y-2">
              {activity.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 bg-surface rounded-lg p-3 border border-border-subtle"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm font-medium truncate">{ev.title}</p>
                    {ev.description && (
                      <p className="text-ink-faint text-xs truncate">{ev.description}</p>
                    )}
                  </div>
                  <span className="text-ink-faint text-xs shrink-0">
                    {timeAgo(ev.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ActivityStat({ label, value, tone = "default" }: {
  label: string;
  value: number | string;
  tone?: "default" | "emerald" | "amber" | "red";
}) {
  const toneClass =
    tone === "emerald" ? "text-ok" :
    tone === "amber"   ? "text-warning" :
    tone === "red"     ? "text-danger" :
                         "text-ink";
  return (
    <div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
