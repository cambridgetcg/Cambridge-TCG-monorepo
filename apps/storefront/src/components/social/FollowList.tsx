"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  trust_score: number;
  trade_count: number;
  tier_icon: string | null;
  follows_back: boolean | null;
};

export function FollowList({ mode }: { mode: "followers" | "following" }) {
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/social/followers?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setUsers(data.users || []);
      })
      .catch(() => setError("Failed to load."))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode]);

  // Follow-back toggle (optimistic). If the server disagrees we revert.
  async function toggleBack(u: Row) {
    if (busy[u.user_id]) return;
    setBusy((b) => ({ ...b, [u.user_id]: true }));
    const prev = u.follows_back;
    setUsers((rs) => rs.map((r) => r.user_id === u.user_id ? { ...r, follows_back: !prev } : r));
    try {
      const res = await fetch("/api/social/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.user_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      // Server is truth — align state with its `following` field.
      setUsers((rs) => rs.map((r) => r.user_id === u.user_id ? { ...r, follows_back: data.following } : r));
    } catch {
      setUsers((rs) => rs.map((r) => r.user_id === u.user_id ? { ...r, follows_back: prev } : r));
    } finally {
      setBusy((b) => ({ ...b, [u.user_id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-red-300 text-sm">{error}</div>;
  }

  if (users.length === 0) {
    return (
      <div className="bg-surface rounded-xl p-8 text-center">
        <p className="text-ink-muted text-sm">
          {mode === "followers" ? "No followers yet." : "You aren't following anyone yet."}
        </p>
        {mode === "following" && (
          <Link href="/u" className="inline-block mt-3 text-accent-strong text-xs font-semibold hover:text-accent-strong">
            Find traders to follow →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {users.map((u) => {
        const initial = (u.name ?? u.username ?? "?")[0].toUpperCase();
        const href = u.username ? `/u/${u.username}` : `/u/${u.user_id}`;
        return (
          <div
            key={u.user_id}
            className="flex items-center gap-3 bg-surface rounded-xl p-3 border border-border-subtle"
          >
            <Link href={href} className="shrink-0">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black bg-surface-elevated"
                style={{
                  background: u.avatar_url ? `url(${u.avatar_url}) center/cover` : "rgb(38,38,38)",
                }}
              >
                {!u.avatar_url && <span className="text-accent-strong">{initial}</span>}
              </div>
            </Link>
            <Link href={href} className="flex-1 min-w-0">
              <p className="text-ink text-sm font-semibold truncate flex items-center gap-1.5">
                {u.name ?? u.username ?? "Anonymous"}
                {u.tier_icon && <span className="text-xs">{u.tier_icon}</span>}
              </p>
              <p className="text-ink-faint text-xs truncate">
                {u.username && <span>@{u.username}</span>}
                <span className="ml-2">Trust {u.trust_score}</span>
                {u.trade_count > 0 && <span className="ml-2">· {u.trade_count} trades</span>}
              </p>
            </Link>

            {/* follows_back === null means this row is *you* — never show a button */}
            {u.follows_back !== null && (
              <button
                onClick={() => toggleBack(u)}
                disabled={!!busy[u.user_id]}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  u.follows_back
                    ? "bg-surface-elevated text-ink-muted hover:bg-neutral-700"
                    : "bg-accent text-black hover:bg-accent-strong"
                }`}
              >
                {busy[u.user_id] ? "..." : u.follows_back ? "Following" : "Follow"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
