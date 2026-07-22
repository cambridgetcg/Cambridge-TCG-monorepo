"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ActivityEvent, TradeMatch } from "@/lib/social/types";
import {
  ACTIVITY_PUBLICATION_NOTICE_VERSION,
  ACTIVITY_PUBLICATION_NOTICE_PATH,
} from "@/lib/social/publication";

type Tab = "trending" | "following" | "matches" | "agents";

/**
 * The loving, one-tap door into the feed. A signed-in member sees a warm
 * invitation to share their wins (or a quiet "you're sharing" note once they
 * do) right where the feed lives — no trip to settings. `publishing` is null
 * while unknown / signed-out.
 */
function ShareYourWins({
  publishing,
  busy,
  onToggle,
  signedIn,
}: {
  publishing: boolean | null;
  busy: boolean;
  onToggle: (next: boolean) => void;
  signedIn: boolean;
}) {
  if (publishing === null && !signedIn) {
    return (
      <p className="mb-6 text-sm text-ink-muted">
        <Link href="/login" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">
          Sign in
        </Link>{" "}
        to share your own wins here.
      </p>
    );
  }
  if (publishing === true) {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-subtle px-4 py-2.5">
        <span className="text-sm text-ink-muted">
          <span className="text-ok">✓</span> You&apos;re sharing your wins with the community.
        </span>
        <button
          type="button"
          onClick={() => onToggle(false)}
          disabled={busy}
          className="text-xs text-ink-faint hover:text-ink underline underline-offset-2 disabled:opacity-50"
        >
          {busy ? "…" : "Turn off"}
        </button>
      </div>
    );
  }
  if (publishing === false) {
    return (
      <div className="mb-6 rounded-lg border border-accent/30 bg-accent-wash px-4 py-4">
        <p className="font-display text-ink">🎉 Share your wins</p>
        <p className="mt-1 text-sm text-ink-muted leading-relaxed">
          Finish a trade, win an auction, earn an achievement, complete a set? Let the
          community celebrate with you. Only those wins — never your collection, prices,
          or messages — and you can turn it off any time.
        </p>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => onToggle(true)}
            disabled={busy}
            className="rounded-lg bg-ink text-page px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? "Turning on…" : "Share my milestones"}
          </button>
          <Link href={ACTIVITY_PUBLICATION_NOTICE_PATH} className="text-xs text-ink-faint hover:text-accent underline underline-offset-2">
            read the full notice
          </Link>
        </div>
      </div>
    );
  }
  return null;
}

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
    <div className="bg-surface rounded-lg p-4 border border-border-subtle">
      <div className="flex items-start gap-3">
        {/* User avatar */}
        <Link
          href={`/u/${ev.user_username ?? ""}`}
          className="shrink-0 w-10 h-10 rounded-full bg-surface-subtle flex items-center justify-center text-sm font-semibold text-ink-muted overflow-hidden"
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
              className="text-ink text-sm font-semibold hover:underline"
            >
              {ev.user_name ?? ev.user_username}
            </Link>
            <span className="text-ink-faint text-xs">{timeAgo(ev.created_at)}</span>
          </div>

          {/* Event content */}
          <div className="mt-1">
            <p className="text-ink-muted text-sm font-medium">{ev.title}</p>
          </div>
          {ev.description && (
            <p className="text-ink-faint text-xs mt-1">{ev.description}</p>
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
    <div className="bg-surface rounded-lg p-4 border border-border-subtle">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-surface-subtle flex items-center justify-center text-sm font-semibold text-ink-muted overflow-hidden">
          {match.avatar_url ? (
            <img src={match.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            (match.name ?? match.username ?? "?")[0].toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-ink text-sm font-semibold truncate">
            {match.name ?? match.username}
          </p>
          <p className="text-ink-faint text-xs">
            Trust Score: <span className="text-accent font-semibold">{match.trust_score}</span>
          </p>
        </div>
        <Link
          href={`/u/${match.username ?? ""}`}
          className="shrink-0 px-3 py-1.5 bg-surface text-ink-muted border border-border-subtle text-xs font-semibold rounded-lg hover:bg-surface-subtle transition"
        >
          View Profile
        </Link>
      </div>

      {match.your_cards.length > 0 && (
        <p className="text-xs text-ink-muted mb-1">
          <span className="text-ok font-semibold">You have cards they want:</span>{" "}
          {match.your_cards.map((c) => c.card_name).join(", ")}
        </p>
      )}
      {match.their_cards.length > 0 && (
        <p className="text-xs text-ink-muted">
          <span className="text-accent font-semibold">They have cards you want:</span>{" "}
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
  const [publicationReason, setPublicationReason] = useState<string | null>(null);
  // The viewer's own activity-publish state — null while unknown / signed-out.
  const [publishing, setPublishing] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  // One read on mount: am I signed in, and am I already sharing my wins?
  useEffect(() => {
    fetch("/api/social/profile?user=me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) return;
        setSignedIn(true);
        const p = data.profile;
        setPublishing(Boolean(
          p.activity_publication_notice_version === ACTIVITY_PUBLICATION_NOTICE_VERSION &&
          p.activity_published_at,
        ));
      })
      .catch(() => {});
  }, []);

  async function togglePublish(next: boolean) {
    setPublishBusy(true);
    try {
      const res = await fetch("/api/social/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_public: next,
          activity_publication_notice_version: next
            ? ACTIVITY_PUBLICATION_NOTICE_VERSION
            : undefined,
        }),
      });
      if (res.ok) setPublishing(next);
    } catch {}
    setPublishBusy(false);
  }

  useEffect(() => {
    setLoading(true);
    setAuthError(false);
    setPublicationReason(null);

    if (tab === "agents") {
      // The agents tab is a static status panel. No participant read occurs.
      setLoading(false);
      return;
    }

    if (tab === "matches") {
      fetch("/api/social/matches")
        .then((r) => {
          if (r.status === 401) {
            setAuthError(true);
            return { matches: [] };
          }
          return r.json();
        })
        .then((data) => {
          setMatches(data.matches ?? []);
          setPublicationReason(typeof data.reason === "string" ? data.reason : null);
        })
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
        .then((data) => {
          setFeed(data.feed ?? []);
          setPublicationReason(typeof data.reason === "string" ? data.reason : null);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "trending", label: "Activity" },
    { key: "following", label: "Following" },
    { key: "matches", label: "Matching" },
    { key: "agents", label: "Agents" },
  ];

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between gap-3 mb-6 flex-wrap">
          <h1 className="text-2xl font-display font-semibold text-ink">Community</h1>
          <Link
            href="/methodology/community"
            className="text-[11px] uppercase tracking-wider text-ink-faint hover:text-accent transition"
          >
            how this works ?
          </Link>
        </div>

        {/* Lead with what WORKS — the living social layer — so /community
            doesn't read as three paused tabs and nothing else. The public
            feeds are paused on purpose (consent-first); we say so plainly. */}
        <p className="text-sm text-ink-muted leading-relaxed mb-4">
          Set up a public profile, follow other collectors, and message them
          directly. The <strong className="text-ink font-medium">Activity</strong>{" "}
          feed is live too — opt-in: it shows only the milestones of members who
          chose to publish them (you control yours in{" "}
          <Link
            href="/account/profile"
            className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2"
          >
            profile settings
          </Link>
). Trade-matching is live too — but only on explicit, per-card intent: mark a
          wishlist card <span className="text-ink">&ldquo;open to trade for&rdquo;</span>{" "}
          and it can meet members who hold it. Nothing else is ever inferred.{" "}
          <Link
            href="/methodology/community"
            className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2"
          >
            Who&apos;s welcome here →
          </Link>
        </p>

        {/* The living parts, one tap away — profile, follows, messages. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {[
            ["Your profile", "/account/profile"],
            ["Followers", "/account/followers"],
            ["Following", "/account/following"],
            ["Messages", "/account/messages"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink-muted hover:text-ink hover:bg-surface-subtle transition text-center"
            >
              {label}
            </Link>
          ))}
        </div>

        <nav aria-label="Community links" className="flex flex-wrap gap-2 mb-6">
          {[
            ["Rewards", "/rewards"],
            ["Ranking policy", "/leaderboards"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle bg-surface px-3 text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-ink"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.key
                  ? "bg-accent-wash text-accent-strong"
                  : "bg-surface text-ink-muted hover:text-ink hover:bg-surface-subtle"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* The one-tap door to sharing your own wins — only on the two activity
            tabs, where the feed lives. */}
        {(tab === "trending" || tab === "following") && (
          <ShareYourWins
            publishing={publishing}
            signedIn={signedIn}
            busy={publishBusy}
            onToggle={togglePublish}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : authError ? (
          <div className="text-center py-16">
            <p className="text-ink-muted mb-4">Sign in to view this tab.</p>
            <Link
              href="/login"
              className="px-5 py-2 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 transition"
            >
              Sign In
            </Link>
          </div>
        ) : tab === "agents" ? (
          /* Agents — status and operator-managed entry points only. */
          <section className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <h2 className="text-sm font-semibold text-ink mb-2 uppercase tracking-wider">
                Agents
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed mb-3">
                Operator-managed agents are linked to the human account that can revoke
                their keys. Earlier self-serve keys are read-only because their external
                controller is not represented truthfully. Global agent identity, model,
                and rating publication is paused pending a versioned participant choice.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Link
                  href="/leaderboards/agents"
                  className="px-3 py-1.5 bg-ink text-page rounded-lg font-medium hover:opacity-90 transition"
                >
                  Ladder status →
                </Link>
                <Link
                  href="/account/agents"
                  className="px-3 py-1.5 bg-surface text-ink-muted border border-border-subtle rounded-lg font-medium hover:bg-surface-subtle transition"
                >
                  Register an agent
                </Link>
                <Link
                  href="/methodology/agents"
                  className="px-3 py-1.5 bg-surface text-ink-muted border border-border-subtle rounded-lg font-medium hover:bg-surface-subtle transition"
                >
                  How agents work
                </Link>
              </div>
            </div>
            <p className="text-xs text-ink-faint leading-relaxed">
              <strong>Note:</strong> agent activity, identities, and ratings are not
              published in the Trending feed or a global ladder. Existing rows remain
              internal. See{" "}
              <Link href="/methodology/community" className="text-accent underline">
                /methodology/community
              </Link>{" "}
              and{" "}
              <a
                href="https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-commons.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                the-commons.md
              </a>{" "}
              for the broader posture.
            </p>
          </section>
        ) : tab === "matches" ? (
          matches.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-ink-faint mb-4">
                No matches yet — these are members openly looking to trade for
                cards you hold.
              </p>
              <p className="text-sm text-ink-faint">
                To appear in others&apos; matches, make your profile public and
                mark a wishlist card &ldquo;open to trade for&rdquo; in your{" "}
                <Link href="/account/profile" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">
                  profile settings
                </Link>
                . Nothing is inferred — only cards you explicitly open.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => (
                <MatchCard key={m.user_id} match={m} />
              ))}
            </div>
          )
        ) : feed.length === 0 ? (
          /* Live but empty — the feed fills as members opt in. Point them at
             the switch, and somewhere alive meanwhile. */
          <div className="text-center py-16">
            <p className="text-ink-faint mb-4">
              {publicationReason ??
                (tab === "following"
                  ? "No milestones yet from people you follow who publish theirs."
                  : "No published milestones yet — be the first.")}
            </p>
            <p className="text-sm text-ink-faint">
              Share your milestones by turning on activity publishing in your{" "}
              <Link href="/account/profile" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">
                profile settings
              </Link>
              , or{" "}
              <Link href="/play" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">
                play a match
              </Link>
              .
            </p>
          </div>
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
