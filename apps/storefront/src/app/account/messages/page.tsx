"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { Audience } from "@/lib/ui";
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
export default function MessagesPage() {
  return (
    <Suspense fallback={<p className="text-ink-faint text-sm">Loading…</p>}>
      <Audience kind="consumer" />
      <MessagesPageInner />
    </Suspense>
  );
}

function MessagesPageInner() {
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
  const [otherUser, setOtherUser] = useState<{
    id: string; username: string | null; name: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingPending, setSendingPending] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    const res = await fetch("/api/messages/conversations");
    const data = await res.json();
    if (data.conversations) setConversations(data.conversations);
    setLoading(false);
  }, []);

  // Resolve me-id once via the auth session helper.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (d?.user?.id) setMeId(d.user.id); })
      .catch(() => {});
    loadInbox();
  }, [loadInbox]);

  // Load active conversation thread + mark read.
  const loadThread = useCallback(async (convId: string) => {
    setError(null);
    const res = await fetch(`/api/messages/conversations/${convId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load thread");
      return;
    }
    setMessages(data.messages || []);
    const c = data.conversation as Conversation;
    setOtherUser({
      id: c.other_user_id, username: c.other_username, name: c.other_name,
    });
    // Fire-and-forget mark-read; refresh the inbox unread state after.
    fetch(`/api/messages/conversations/${convId}/read`, { method: "POST" })
      .then(() => loadInbox());
  }, [loadInbox]);

  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
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
      // Reload thread + inbox so the new message + cache update show.
      if (activeId) {
        await loadThread(activeId);
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
      <h1 className="text-2xl font-black text-ink mb-2">Messages</h1>
      <p className="text-sm text-ink-muted mb-6">
        Direct messages with other traders. Different from dispute messages — those live on
        the trade. Block list is bidirectional; profile setting controls whether you accept
        unsolicited messages.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 bg-page border border-border-subtle rounded-xl overflow-hidden h-[600px]">
          {/* Inbox list */}
          <aside className="border-r border-border-subtle overflow-y-auto bg-surface">
            {conversations.length === 0 ? (
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
                          active ? "bg-accent/10" : "hover:bg-surface-elevated/60"
                        }`}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{
                            background: c.other_avatar_url
                              ? `url(${c.other_avatar_url}) center/cover`
                              : "rgb(38,38,38)",
                          }}
                        >
                          {!c.other_avatar_url && <span className="text-accent-strong">{initial}</span>}
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
                            {c.last_message_preview || "(no messages)"}
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
                        className="text-[10px] text-accent-strong hover:text-accent-strong"
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
                      className="px-2 py-1 text-[10px] font-medium text-red-400 hover:text-red-300 transition"
                    >
                      Block
                    </button>
                  </div>
                </header>

                {/* Messages scroll area */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
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
                              ? "bg-accent/15 text-amber-100 border border-accent/20"
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
                      className="px-4 py-2 text-xs font-bold bg-accent text-black rounded-lg hover:bg-accent-strong transition disabled:opacity-50 self-end"
                    >
                      {sendingPending ? "..." : "Send"}
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-600 mt-1">
                    {composeText.length}/2000 · Enter to send · Shift-Enter for newline
                  </p>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
