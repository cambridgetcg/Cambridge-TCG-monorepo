"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface SavedSearch {
  id: string;
  name: string;
  query: {
    text?: string;
    set_codes?: string[];
    conditions?: string[];
    max_price?: number;
    min_price?: number;
  };
  status: "active" | "paused" | "expired" | "archived";
  last_scanned_at: string | null;
  last_match_at: string | null;
  match_count: number;
  created_at: string;
  expires_at: string;
}

interface MatchRow {
  id: string;
  order_id: string;
  matched_at: string;
  matched_price: string;
  card_name: string | null;
  sku: string;
  current_status: string;
  seller_username: string | null;
}

const STATUS_BADGE: Record<SavedSearch["status"], { label: string; className: string }> = {
  active:   { label: "Active",   className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  paused:   { label: "Paused",   className: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  expired:  { label: "Expired",  className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  archived: { label: "Archived", className: "bg-neutral-500/15 text-neutral-500 border-neutral-500/30" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [matchesById, setMatchesById] = useState<Record<string, MatchRow[]>>({});

  function load() {
    setLoading(true);
    fetch("/api/market/searches")
      .then((r) => r.json())
      .then((d) => setSearches(d.searches || []))
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function act(searchId: string, path: string, method: "POST" | "DELETE" = "POST") {
    setBusy(searchId);
    setError(null);
    try {
      const res = await fetch(`/api/market/searches/${searchId}${path ? "/" + path : ""}`, { method });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Action failed");
      else load();
    } finally {
      setBusy(null);
    }
  }

  async function expand(searchId: string) {
    if (expanded === searchId) {
      setExpanded(null);
      return;
    }
    setExpanded(searchId);
    if (!matchesById[searchId]) {
      const res = await fetch(`/api/market/searches/${searchId}`).then((r) => r.json()).catch(() => null);
      if (res?.matches) {
        setMatchesById((m) => ({ ...m, [searchId]: res.matches }));
      }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-2">Saved Searches</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Criteria-based stock alerts. The platform scans new market listings every minute and
        notifies you when an ask matches your filter. Different from Watchlist (per-SKU price
        alerts) and Wishlist (per-card max-price).
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowNew((s) => !s)}
          className="px-4 py-2 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition"
        >
          {showNew ? "Cancel" : "+ New saved search"}
        </button>
      </div>

      {showNew && <NewSearchForm onCreated={() => { setShowNew(false); load(); }} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : searches.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-400 text-sm">
            No saved searches yet. Create one above to start getting matched-listing notifications.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {searches.map((s) => (
            <SearchCard
              key={s.id}
              search={s}
              busy={busy === s.id}
              expanded={expanded === s.id}
              matches={matchesById[s.id] || []}
              onAct={(path, method) => act(s.id, path, method)}
              onExpand={() => expand(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchCard({
  search,
  busy,
  expanded,
  matches,
  onAct,
  onExpand,
}: {
  search: SavedSearch;
  busy: boolean;
  expanded: boolean;
  matches: MatchRow[];
  onAct: (path: string, method?: "POST" | "DELETE") => void;
  onExpand: () => void;
}) {
  const badge = STATUS_BADGE[search.status];
  const summary = formatQuery(search.query);

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{search.name}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{summary}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-500 mt-2 flex-wrap">
          <span>
            <span className="text-neutral-300 font-mono">{search.match_count}</span> match{search.match_count === 1 ? "" : "es"}
          </span>
          <span>
            Last match <span className="text-neutral-300">{timeAgo(search.last_match_at)}</span>
          </span>
          <span>
            Last scan <span className="text-neutral-300">{timeAgo(search.last_scanned_at)}</span>
          </span>
          <span>
            Expires{" "}
            <span className="text-neutral-300">
              {new Date(search.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={onExpand}
            disabled={search.match_count === 0}
            className="px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 disabled:text-neutral-600 transition"
          >
            {expanded ? "Hide matches ▲" : `View matches ▼`}
          </button>

          {search.status === "active" && (
            <button
              disabled={busy}
              onClick={() => onAct("pause")}
              className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {search.status === "paused" && (
            <button
              disabled={busy}
              onClick={() => onAct("resume")}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
            >
              Resume
            </button>
          )}
          {(search.status === "expired" || search.status === "active" || search.status === "paused") && (
            <button
              disabled={busy}
              onClick={() => onAct("extend")}
              className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
            >
              Extend 90d
            </button>
          )}
          {search.status !== "archived" && (
            <button
              disabled={busy}
              onClick={() => onAct("", "DELETE")}
              className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition disabled:opacity-50"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-800 p-4 bg-neutral-950/40">
          {matches.length === 0 ? (
            <p className="text-xs text-neutral-500">No matches yet. We'll notify you when one hits the book.</p>
          ) : (
            <div className="space-y-1.5">
              {matches.map((m) => (
                <Link
                  key={m.id}
                  href={`/market/${encodeURIComponent(m.sku)}`}
                  className="flex items-center justify-between text-xs hover:bg-neutral-800/50 rounded p-2 transition"
                >
                  <div className="min-w-0">
                    <p className="text-neutral-200 truncate">{m.card_name || m.sku}</p>
                    <p className="text-[10px] text-neutral-500">
                      {timeAgo(m.matched_at)}
                      {m.seller_username && (
                        <> · @{m.seller_username}</>
                      )}
                      <> · {m.current_status}</>
                    </p>
                  </div>
                  <span className="font-mono text-amber-400 shrink-0 ml-3">
                    {formatPrice(parseFloat(m.matched_price))}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatQuery(q: SavedSearch["query"]): string {
  const parts: string[] = [];
  if (q.text) parts.push(`"${q.text}"`);
  if (q.set_codes && q.set_codes.length > 0) parts.push(`set: ${q.set_codes.join(", ")}`);
  if (q.conditions && q.conditions.length > 0) parts.push(`condition: ${q.conditions.join("/")}`);
  if (q.min_price !== undefined && q.max_price !== undefined) parts.push(`£${q.min_price}-£${q.max_price}`);
  else if (q.max_price !== undefined) parts.push(`≤ £${q.max_price}`);
  else if (q.min_price !== undefined) parts.push(`≥ £${q.min_price}`);
  return parts.join(" · ") || "(empty)";
}

function NewSearchForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [setCodes, setSetCodes] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleCondition(c: string) {
    setConditions((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);
  }

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const query: Record<string, unknown> = {};
      if (text.trim()) query.text = text.trim();
      const setList = setCodes.split(",").map((s) => s.trim()).filter(Boolean);
      if (setList.length > 0) query.set_codes = setList;
      if (conditions.length > 0) query.conditions = conditions;
      if (maxPrice) query.max_price = parseFloat(maxPrice);
      if (minPrice) query.min_price = parseFloat(minPrice);

      const res = await fetch("/api/market/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-neutral-900 rounded-xl border border-amber-500/30 p-5 mb-4">
      <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide mb-3">New saved search</h2>

      <label className="block text-xs text-neutral-500 mb-1">Name (visible only to you)</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Cheap Charizards"
        className="w-full px-3 py-2 mb-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
      />

      <label className="block text-xs text-neutral-500 mb-1">Card name or SKU contains</label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="charizard"
        className="w-full px-3 py-2 mb-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
      />

      <label className="block text-xs text-neutral-500 mb-1">Set codes (comma-separated)</label>
      <input
        type="text"
        value={setCodes}
        onChange={(e) => setSetCodes(e.target.value)}
        placeholder="OP01, OP02"
        className="w-full px-3 py-2 mb-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm font-mono uppercase"
      />

      <label className="block text-xs text-neutral-500 mb-2">Conditions</label>
      <div className="flex gap-1 mb-3 flex-wrap">
        {["NM", "M", "LP", "MP", "HP", "DMG"].map((c) => (
          <button
            key={c}
            onClick={() => toggleCondition(c)}
            className={`text-xs px-2.5 py-1 rounded-full transition ${
              conditions.includes(c)
                ? "bg-amber-500 text-black font-bold"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Min price (£)</label>
          <input
            type="number"
            step="0.01"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Max price (£)</label>
          <input
            type="number"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
          />
        </div>
      </div>

      {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

      <div className="flex justify-end gap-2">
        <button
          disabled={submitting || !name.trim()}
          onClick={submit}
          className="px-4 py-2 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save search"}
        </button>
      </div>
    </div>
  );
}
