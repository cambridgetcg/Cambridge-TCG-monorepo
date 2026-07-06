"use client";

// DM inbox + thread client. The server shell (page.tsx) passes meId so
// bubble attribution is certain. Freshness is polling, not sockets:
// the open thread refreshes every 15s, the inbox list every 45s —
// stated in the UI so nobody mistakes the surface for push-live.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { WhyLink } from "@/lib/ui";
import { mergeThreadMessages } from "@/lib/messages/thread";

const THREAD_POLL_MS = 15_000;
const INBOX_POLL_MS = 45_000;
// Newest page sizes. The poll page (30) outruns the send rate limit
// (10/min) by a wide margin, so a 15s poll can't miss messages.
const THREAD_PAGE_LIMIT = 100;
const THREAD_POLL_LIMIT = 30;

interface Conversation {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string | null;
  last_sender_id: string | null;
  last_message_preview: string | null;
  message_count: number;
  archived_a: boolean;
  archived_b: boolean;
  other_user_id: string;
  other_username: string | null;
  other_name: string | null;
  other_avatar_url: string | null;
  unread: boolean;
}

interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// Suspense boundary for useSearchParams (Next 16 CSR-bailout guard)
export default function MessagesClient({ meId }: { meId: string }) {
  return (
    <Suspense fallback={<p className="text-ink-faint text-sm">Loading…</p>}>
      <MessagesInner meId={meId} />
    </Suspense>
  );
}

function MessagesInner({ meId }: { meId: string }) {
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get("c") ?? null;
  // ?ref=<type>:<id> — set by MessageButton deep-links. Attached to the
  // FIRST message sent in the linked thread, then cleared; the server
  // re-validates the reference before storing the chip.
  const initialRef = searchParams.get("ref");
  const [pendingRef, setPendingRef] = useState<{ type: string; id: string } | null>(() => {
    if (!initialRef) return null;
    const i = initialRef.indexOf(":");
    return i > 0 ? { type: initialRef.slice(0, i), id: initialRef.slice(i + 1) } : null;
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConvId);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [otherUser, setOtherUser] = useState<{
    id: string; username: string | null; name: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [inboxError, setInboxError] = useState(false);
  const [sendingPending, setSendingPending] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Poll callbacks read messages via ref so the intervals never re-arm
  // on every new message.
  const messagesRef = useRef<DmMessage[]>([]);
  messagesRef.current = messages;
  const lastMessageIdRef = useRef<string | null>(null);

  const loadInbox = useCallback(async (opts?: { initial?: boolean }) => {
    // Timeout so a stalled first load can't spin the skeleton forever — the
    // walker watched this page render nothing (no list, no error, no retry)
    // after a hung conversations fetch. Poll refreshes stay silent and
    // recover on the next tick; only the INITIAL load surfaces an error.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch("/api/messages/conversations", { signal: controller.signal });
      const data = await res.json();
      if (res.ok && data.conversations) {
        setConversations(data.conversations);
        setInboxError(false);
      } else if (opts?.initial) {
        setInboxError(true);
      }
    } catch {
      if (opts?.initial) setInboxError(true);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInbox({ initial: true });
  }, [loadInbox]);

  const markRead = useCallback((convId: string) => {
    // Fire-and-forget mark-read; refresh the inbox unread state after.
    fetch(`/api/messages/conversations/${convId}/read`, { method: "POST" })
      .then(() => loadInbox())
      .catch(() => {});
  }, [loadInbox]);

  // Load active conversation thread (newest page) + mark read.
  const loadThread = useCallback(async (convId: string) => {
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(
        `/api/messages/conversations/${convId}?limit=${THREAD_PAGE_LIMIT}`,
        { signal: controller.signal },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load thread");
        return;
      }
      setMessages(data.messages || []);
      setHasEarlier(Boolean(data.hasEarlier));
      const c = data.conversation as Conversation;
      setOtherUser({
        id: c.other_user_id, username: c.other_username, name: c.other_name,
      });
      markRead(convId);
    } catch (err) {
      setError(
        (err as Error).name === "AbortError"
          ? "This thread is taking too long to load — try again."
          : "Couldn't load this conversation. Try again.",
      );
    } finally {
      clearTimeout(timer);
    }
  }, [markRead]);

  // Merge-poll the open thread: fetch the newest few, append what's
  // new, keep any earlier history the user has paged in.
  const pollThread = useCallback(async (convId: string) => {
    try {
      const res = await fetch(
        `/api/messages/conversations/${convId}?limit=${THREAD_POLL_LIMIT}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const merged = mergeThreadMessages(messagesRef.current, data.messages || []);
      if (merged === messagesRef.current) return;
      const incomingFromOther = merged.some(
        (m) => m.sender_id !== meId && !messagesRef.current.some((k) => k.id === m.id),
      );
      setMessages(merged);
      // The thread is on screen, so what just arrived is read.
      if (incomingFromOther) markRead(convId);
    } catch {
      // Poll path — skip this tick.
    }
  }, [meId, markRead]);

  const loadEarlier = useCallback(async () => {
    const current = messagesRef.current;
    if (!activeId || current.length === 0 || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const before = encodeURIComponent(current[0].created_at);
      const res = await fetch(
        `/api/messages/conversations/${activeId}?before=${before}&limit=${THREAD_PAGE_LIMIT}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setMessages([...(data.messages || []), ...current]);
      setHasEarlier(Boolean(data.hasEarlier));
    } finally {
      setLoadingEarlier(false);
    }
  }, [activeId, loadingEarlier]);

  useEffect(() => {
    if (!activeId) return;
    setMessages([]);
    setHasEarlier(false);
    lastMessageIdRef.current = null;
    loadThread(activeId);
  }, [activeId, loadThread]);

  // Poll the open thread. Skips ticks while the tab is hidden — the
  // catch-up happens on the first visible tick.
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") pollThread(activeId);
    }, THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [activeId, pollThread]);

  // Poll the inbox list (unread dots, previews, new threads).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadInbox();
    }, INBOX_POLL_MS);
    return () => clearInterval(t);
  }, [loadInbox]);

  // Auto-scroll only when the NEWEST message changed — paging in
  // earlier history must not yank the view to the bottom.
  useEffect(() => {
    const last = messages.length > 0 ? messages[messages.length - 1].id : null;
    if (last && last !== lastMessageIdRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    lastMessageIdRef.current = last;
  }, [messages]);

  async function send() {
    if (!composeText.trim() || !otherUser || sendingPending) return;
    setSendingPending(true);
    setError(null);
    try {
      // Attach the deep-linked reference only in the thread it arrived
      // for, and only while it hasn't been sent yet.
      const ref = pendingRef && activeId === initialConvId ? pendingRef : null;
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: otherUser.id,
          body: composeText.trim(),
          ...(ref ? { referenceType: ref.type, referenceId: ref.id } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Send failed");
        return;
      }
      if (ref) setPendingRef(null);
      setComposeText("");
      // Merge-poll (keeps loaded history) + refresh the inbox preview.
      if (activeId) {
        await pollThread(activeId);
        await loadInbox();
      }
    } finally {
      setSendingPending(false);
    }
  }

  async function archive(convId: string) {
    await fetch(`/api/messages/conversations/${convId}/archive`, { method: "POST" });
    if (activeId === convId) setActiveId(null);
    loadInbox();
  }

  async function block() {
    if (!otherUser) return;
    if (!confirm(`Block @${otherUser.username || otherUser.name || "this user"}? They won't be able to message you.`)) return;
    await fetch("/api/messages/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: otherUser.id }),
    });
    setActiveId(null);
    setOtherUser(null);
    loadInbox();
  }

  return (
    <div>
      <h1 className="text-2xl font-display font-semibold text-ink mb-2">Messages</h1>
      <p className="text-sm text-ink-muted mb-6">
        Direct messages with other traders. Different from dispute messages — those live on
        the trade. Block list is bidirectional; profile setting controls whether you accept
        unsolicited messages. This page refreshes itself (open thread every 15s, list every
        45s) — no push.
        <WhyLink href="/methodology/messaging" tooltip="Messaging limits, blocks, and email notifications" />
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 bg-page border border-border-subtle rounded-lg overflow-hidden h-[600px]">
          {/* Inbox list */}
          <aside className="border-r border-border-subtle overflow-y-auto bg-surface">
            {inboxError && conversations.length === 0 ? (
              <div className="p-4 text-xs">
                <p className="text-danger mb-2">
                  Couldn&apos;t load your conversations — the network or server may be busy.
                  Your messages are safe.
                </p>
                <button
                  onClick={() => {
                    setLoading(true);
                    setInboxError(false);
                    void loadInbox({ initial: true });
                  }}
                  className="px-3 py-1.5 bg-accent text-page font-bold rounded-md hover:bg-accent-strong transition"
                >
                  Retry
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-xs text-ink-faint">
                No conversations yet. Start one from a profile or trade.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {conversations.map((c) => {
                  const initial = (c.other_name ?? c.other_username ?? "?")[0].toUpperCase();
                  const active = activeId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setActiveId(c.id)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition ${
                          active ? "bg-accent-wash" : "hover:bg-surface-subtle"
                        }`}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-surface-subtle border border-border-subtle"
                          style={
                            c.other_avatar_url
                              ? { background: `url(${c.other_avatar_url}) center/cover` }
                              : undefined
                          }
                        >
                          {!c.other_avatar_url && <span className="text-accent">{initial}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-sm truncate ${c.unread ? "font-bold text-ink" : "text-ink"}`}>
                              {c.other_name || (c.other_username ? `@${c.other_username}` : "Anonymous")}
                            </p>
                            <span className="text-[10px] text-ink-faint shrink-0">
                              {timeAgo(c.last_message_at)}
                            </span>
                          </div>
                          <p className="text-xs text-ink-faint truncate">
                            {c.last_message_preview || "(no messages yet — say hello)"}
                          </p>
                        </div>
                        {c.unread && (
                          <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Active thread */}
          <section className="flex flex-col bg-page min-h-0">
            {!activeId || !otherUser ? (
              <div className="flex-1 flex items-center justify-center text-sm text-ink-faint">
                Select a conversation to view messages.
              </div>
            ) : (
              <>
                {/* Thread header */}
                <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
                  <div className="min-w-0">
                    <p className="text-ink font-bold text-sm truncate">
                      {otherUser.name || (otherUser.username ? `@${otherUser.username}` : "Anonymous")}
                    </p>
                    {otherUser.username && (
                      <Link
                        href={`/u/${otherUser.username}`}
                        className="text-[10px] text-accent hover:text-accent-strong"
                      >
                        View profile →
                      </Link>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => archive(activeId)}
                      className="px-2 py-1 text-[10px] font-medium text-ink-muted hover:text-ink transition"
                    >
                      Archive
                    </button>
                    <button
                      onClick={block}
                      className="px-2 py-1 text-[10px] font-medium text-danger hover:text-danger transition"
                    >
                      Block
                    </button>
                  </div>
                </header>

                {/* Messages scroll area */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {hasEarlier && (
                    <div className="flex justify-center pb-1">
                      <button
                        onClick={loadEarlier}
                        disabled={loadingEarlier}
                        className="px-3 py-1 text-[11px] font-medium text-accent hover:text-accent-strong border border-border-subtle rounded-full transition disabled:opacity-50"
                      >
                        {loadingEarlier ? "Loading…" : "Load earlier messages"}
                      </button>
                    </div>
                  )}
                  {messages.map((m) => {
                    const mine = m.sender_id === meId;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            mine
                              ? "bg-accent-wash text-accent border border-accent/30"
                              : "bg-surface text-ink border border-border-subtle"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          {m.reference_type && (
                            <p className="text-[9px] text-ink-faint mt-1 uppercase tracking-wide">
                              re: {m.reference_type.replace(/_/g, " ")}
                            </p>
                          )}
                          <p className="text-[9px] text-ink-faint mt-1">
                            {new Date(m.created_at).toLocaleString("en-GB", {
                              day: "numeric", month: "short",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <footer className="border-t border-border-subtle p-3">
                  <div className="flex gap-2">
                    <textarea
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter without shift sends
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      placeholder="Type a message…"
                      rows={2}
                      maxLength={2000}
                      className="flex-1 px-3 py-2 bg-surface border border-border-subtle rounded-lg text-ink text-sm resize-none"
                    />
                    <button
                      onClick={send}
                      disabled={sendingPending || !composeText.trim()}
                      className="px-4 py-2 text-xs font-semibold bg-ink text-page rounded-lg hover:opacity-90 transition disabled:opacity-50 self-end"
                    >
                      {sendingPending ? "..." : "Send"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-[10px] text-ink-faint">
                      {composeText.length}/2000 · Enter to send · Shift-Enter for newline
                    </p>
                    {otherUser.username && (
                      <Link
                        href={`/account/swaps/new?to=${encodeURIComponent(otherUser.username)}`}
                        className="text-[10px] font-medium text-accent hover:text-accent-strong shrink-0"
                        title="Propose a card-for-card swap — recorded on-platform, settled between you directly"
                      >
                        Propose swap →
                      </Link>
                    )}
                  </div>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
