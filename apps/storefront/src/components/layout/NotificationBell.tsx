"use client";

// Nav bell — shows unread count + opens a dropdown with the 10 most
// recent notifications. Poll cadence is 60s; overkill polling would
// hit the partial-index COUNT cheaply but the user won't notice sub-
// minute latency on the badge. Opening the dropdown refreshes the
// list and marks anything the user clicks on as read.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notification } from "@/lib/notifications/db";

// Icon emojis per kind prefix. Free-form kinds mean we fall back to a
// generic bell if unknown.
const KIND_ICON: Record<string, string> = {
  tradein: "📤",
  quote: "💷",
  dispute: "⚖️",
  verification: "🪪",
  auction: "🔨",
  subscription: "💎",
};

function iconFor(kind: string): string {
  const prefix = kind.split(".")[0];
  return KIND_ICON[prefix] ?? "🔔";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const r = await fetch("/api/account/notifications/unread-count");
      if (r.ok) {
        const d = await r.json();
        setCount(d.count ?? 0);
      }
    } catch {
      // Ignore — nav bell polling shouldn't surface transient errors.
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/account/notifications?limit=10");
      if (r.ok) {
        const d = await r.json();
        setItems(d.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 60s poll for the badge count.
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Click-outside to close. Attached lazily so resting cost is zero.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await fetchItems();
  }

  async function handleClick(notif: Notification) {
    if (!notif.read_at) {
      // Optimistic: drop the badge immediately; the server call
      // confirms. If it fails we'd only miscount by 1 until next poll.
      setItems((prev) => prev.map((n) => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n));
      setCount((c) => Math.max(0, c - 1));
      fetch(`/api/account/notifications/${notif.id}/read`, { method: "POST" }).catch(() => {});
    }
    setOpen(false);
  }

  async function markAllRead() {
    // Optimistic clear
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setCount(0);
    try {
      await fetch("/api/account/notifications/mark-all-read", { method: "POST" });
    } catch {
      // Re-sync on failure
      fetchCount();
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggle}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
        className="relative p-2 text-neutral-300 hover:text-white transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {count > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-amber-400 hover:text-amber-300 transition"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-neutral-500 text-center py-8">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-8">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {items.map((n) => {
                  const row = (
                    <div className={`px-4 py-3 hover:bg-neutral-800/50 transition ${!n.read_at ? "bg-neutral-900/80" : ""}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-xl shrink-0">{iconFor(n.kind)}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${!n.read_at ? "text-white font-semibold" : "text-neutral-400"}`}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-neutral-600 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                        {!n.read_at && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" aria-hidden />
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.link_url ? (
                        <Link href={n.link_url} onClick={() => handleClick(n)}>
                          {row}
                        </Link>
                      ) : (
                        <button type="button" onClick={() => handleClick(n)} className="w-full text-left">
                          {row}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-neutral-800 px-4 py-2 text-center">
            <Link
              href="/account/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-amber-400 hover:text-amber-300 transition"
            >
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
