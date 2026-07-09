"use client";

// Full notifications inbox. Complements the nav bell's 10-item
// dropdown with a paginated page, unread/all filter, bulk actions,
// and per-row mark-read. Anchored on the same /api/account/notifications
// endpoints.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/notifications/db";

import { Audience } from "@/lib/ui";
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    const nextOffset = reset ? 0 : offset;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
      ...(filter === "unread" ? { unread: "1" } : {}),
    });
    try {
      const r = await fetch(`/api/account/notifications?${params.toString()}`);
      if (r.status === 401) { router.push("/login"); return; }
      if (!r.ok) return;
      const d = await r.json();
      const fresh = (d.notifications ?? []) as Notification[];
      setItems((prev) => reset ? fresh : [...prev, ...fresh]);
      setOffset(nextOffset + fresh.length);
      setHasMore(fresh.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [filter, offset, router]);

  // Reset page whenever filter flips
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    try {
      await fetch(`/api/account/notifications/${id}/read`, { method: "POST" });
    } catch {
      // tolerate; next load will re-sync
    }
  }

  async function markAllRead() {
    setMarking(true);
    try {
      const r = await fetch("/api/account/notifications/mark-all-read", { method: "POST" });
      if (r.ok) {
        setItems((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
      }
    } finally {
      setMarking(false);
    }
  }

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <div>
      <Audience kind="consumer" />
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-ink">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            className="text-sm text-accent hover:text-accent-strong transition disabled:opacity-50"
          >
            {marking ? "…" : "Mark all read"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(["all", "unread"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full transition ${
              filter === key
                ? "bg-ink text-page font-semibold"
                : "bg-surface text-ink-muted hover:text-ink border border-border-subtle"
            }`}
          >
            {key === "all" ? "All" : `Unread${unreadCount > 0 ? ` · ${unreadCount}` : ""}`}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : items.length === 0 ? (
        <div className="bg-surface rounded-lg p-8 text-center">
          <p className="text-ink-faint mb-2">
            {filter === "unread"
              ? "Nothing unread — you're caught up."
              : "No notifications yet."}
          </p>
          <Link href="/" className="text-sm text-accent hover:text-accent-strong">Back to site</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((n) => {
              const unread = !n.read_at;
              const card = (
                <div
                  className={`bg-surface hover:bg-surface-subtle border rounded-lg p-4 transition ${
                    unread ? "border-accent/30" : "border-border-subtle"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${unread ? "bg-accent" : "bg-border-strong"}`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${unread ? "text-ink font-semibold" : "text-ink-muted"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-ink-faint mt-0.5 whitespace-pre-wrap">{n.body}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-ink-faint">
                        <span>{formatWhen(n.created_at)}</span>
                        <code className="px-1.5 py-0.5 rounded bg-surface-subtle text-ink-faint">{n.kind}</code>
                      </div>
                    </div>
                    {unread && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markRead(n.id);
                        }}
                        className="text-[11px] text-ink-faint hover:text-accent-strong shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link_url ? (
                    <Link href={n.link_url} onClick={() => unread && markRead(n.id)}>
                      {card}
                    </Link>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="px-5 py-2.5 bg-surface border border-border-subtle text-sm text-ink-muted rounded-lg hover:bg-surface-subtle transition disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
