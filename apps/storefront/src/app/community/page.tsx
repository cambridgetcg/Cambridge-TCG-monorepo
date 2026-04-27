"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ActivityEvent, TradeMatch } from "@/lib/social/types";

const EVENT_ICONS: Record<string, string> = {
  trade_completed: "\u{1F91D}",
  auction_listed: "\u{1F528}",
  auction_won: "\u{1F389}",
  raffle_won: "\u{1F3B0}",
  mystery_box_opened: "\u{1F4E6}",
  tier_upgraded: "\u2B06\uFE0F",
  achievement_earned: "\u{1F3C6}",
  card_added: "\u{1F0CF}",
  wishlist_fulfilled: "\u2705",
  review_received: "\u2B50",
  set_completed: "\u2705",
};

type Tab = "trending" | "following" | "matches";

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

function EventCard({ ev }: { ev: ActivityEvent }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <div className="flex items-start gap-3">
        {/* User avatar */}
        <Link
          href={`/u/${ev.user_username ?? ""}`}
          className="shrink-0 w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-400 overflow-hidden"
        >
          {ev.user_avatar ? (
            <img
              src={ev.user_avatar}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            (ev.user_name ?? ev.user_username ?? "?")[0].toUpperCase()
          )}
        </Link>

        <div className="flex-1 min-w-0">
          {/* User info + time */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/u/${ev.user_username ?? ""}`}
              className="text-white text-sm font-semibold hover:underline"
            >
              {ev.user_name ?? ev.user_username}
            </Link>
            {ev.tier_icon && <span className="text-xs">{ev.tier_icon}</span>}
            <span className="text-neutral-600 text-xs">{timeAgo(ev.created_at)}</span>
          </div>

          {/* Event content */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg">{EVENT_ICONS[ev.event_type] ?? "\u{1F4AC}"}</span>
            <p className="text-neutral-300 text-sm font-medium">{ev.title}</p>
          </div>
          {ev.description && (
            <p className="text-neutral-500 text-xs mt-1">{ev.description}</p>
          )}
        </div>

        {/* Event image */}
        {ev.image_url && (
          <img
            src={ev.image_url}
            alt=""
            className="shrink-0 w-16 h-22 object-cover rounded-lg"
          />
        )}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: TradeMatch }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-400 overflow-hidden">
          {match.avatar_url ? (
            <img src={match.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            (match.name ?? match.username ?? "?")[0].toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            {match.name ?? match.username}
          </p>
          <p className="text-neutral-500 text-xs">
            Trust Score: <span className="text-amber-400 font-bold">{match.trust_score}</span>
          </p>
        </div>
        <Link
          href={`/u/${match.username ?? ""}`}
          className="shrink-0 px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-lg hover:bg-neutral-700 transition"
        >
          View Profile
        </Link>
      </div>

      {match.your_cards.length > 0 && (
        <p className="text-xs text-neutral-400 mb-1">
          <span className="text-emerald-400 font-semibold">You have cards they want:</span>{" "}
          {match.your_cards.map((c) => c.card_name).join(", ")}
        </p>
      )}
      {match.their_cards.length > 0 && (
        <p className="text-xs text-neutral-400">
          <span className="text-amber-400 font-semibold">They have cards you want:</span>{" "}
          {match.their_cards.map((c) => c.card_name).join(", ")}
        </p>
      )}
    </div>
  );
}

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("trending");
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAuthError(false);

    if (tab === "matches") {
      fetch("/api/social/matches")
        .then((r) => {
          if (r.status === 401) {
            setAuthError(true);
            return { matches: [] };
          }
          return r.json();
        })
        .then((data) => setMatches(data.matches ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      const endpoint =
        tab === "following"
          ? "/api/social/feed?tab=following"
          : "/api/social/feed?tab=latest";
      fetch(endpoint)
        .then((r) => {
          if (r.status === 401 && tab === "following") {
            setAuthError(true);
            return { feed: [] };
          }
          return r.json();
        })
        .then((data) => setFeed(data.feed ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "trending", label: "Trending" },
    { key: "following", label: "Following" },
    { key: "matches", label: "Trade Matches" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-black text-white mb-6">Community</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                tab === t.key
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : authError ? (
          <div className="text-center py-16">
            <p className="text-neutral-400 mb-4">Sign in to view this tab.</p>
            <Link
              href="/login"
              className="px-5 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 transition"
            >
              Sign In
            </Link>
          </div>
        ) : tab === "matches" ? (
          matches.length === 0 ? (
            <p className="text-neutral-500 text-center py-16">No trade matches found yet. Add cards to your wishlist and portfolio to discover matches.</p>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => (
                <MatchCard key={m.user_id} match={m} />
              ))}
            </div>
          )
        ) : feed.length === 0 ? (
          <p className="text-neutral-500 text-center py-16">
            {tab === "following"
              ? "No activity from people you follow yet."
              : "No activity to show yet."}
          </p>
        ) : (
          <div className="space-y-3">
            {feed.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
