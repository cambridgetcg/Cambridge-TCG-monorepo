"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { Badge, Palettes, Money } from "@/lib/ui";

import { Audience } from "@/lib/ui";
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

const STATUS_LABELS: Record<SavedSearch["status"], string> = {
  active:   "Active",
  paused:   "Paused",
  expired:  "Expired",
  archived: "Archived",
};

const timeAgo = (iso: string | null) => (iso ? formatRelativeTime(iso) : "never");

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
      <Audience kind="consumer" />
      <h1 className="text-2xl font-black text-ink mb-2">Saved Searches</h1>
      <p className="text-sm text-ink-muted mb-6">
        Criteria-based stock alerts. The platform scans new market listings every minute and
        notifies you when an ask matches your filter. Different from Watchlist (per-SKU price
        alerts) and Wishlist (per-card max-price).
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowNew((s) => !s)}
          className="px-4 py-2 text-xs font-bold bg-accent text-black rounded-lg hover:bg-accent-strong transition"
        >
          {showNew ? "Cancel" : "+ New saved search"}
        </button>
      </div>

      {showNew && <NewSearchForm onCreated={() => { setShowNew(false); load(); }} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : searches.length === 0 ? (
        <div className="bg-surface rounded-xl p-8 text-center">
          <p className="text-ink-muted text-sm">
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
  const summary = formatQuery(search.query);

  return (
    <div className="bg-surface rounded-xl border border-border-subtle overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-ink font-semibold text-sm truncate">{search.name}</p>
            <p className="text-xs text-ink-faint mt-0.5">{summary}</p>
          </div>
          <Badge status={search.status} palette={Palettes.SavedSearchStatusPalette} labels={STATUS_LABELS} />
        </div>

        <div className="flex items-center gap-4 text-xs text-ink-faint mt-2 flex-wrap">
          <span>
            <span className="text-ink-muted font-mono">{search.match_count}</span> match{search.match_count === 1 ? "" : "es"}
          </span>
          <span>
            Last match <span className="text-ink-muted">{timeAgo(search.last_match_at)}</span>
          </span>
          <span>
            Last scan <span className="text-ink-muted">{timeAgo(search.last_scanned_at)}</span>
          </span>
          <span>
            Expires{" "}
            <span className="text-ink-muted">
              {new Date(search.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            onClick={onExpand}
            disabled={search.match_count === 0}
            className="px-3 py-1.5 text-xs font-medium text-accent-strong hover:text-accent-strong disabled:text-neutral-600 transition"
          >
            {expanded ? "Hide matches ▲" : `View matches ▼`}
          </button>

          {search.status === "active" && (
            <button
              disabled={busy}
              onClick={() => onAct("pause")}
              className="px-3 py-1.5 text-xs font-medium bg-surface-elevated text-ink-muted rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
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
              className="px-3 py-1.5 text-xs font-medium bg-surface-elevated text-ink-muted rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
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
        <div className="border-t border-border-subtle p-4 bg-page/40">
          {matches.length === 0 ? (
            <p className="text-xs text-ink-faint">No matches yet. We'll notify you when one hits the book.</p>
          ) : (
            <div className="space-y-1.5">
              {matches.map((m) => (
                <Link
                  key={m.id}
                  href={`/market/${encodeURIComponent(m.sku)}`}
                  className="flex items-center justify-between text-xs hover:bg-surface-elevated/50 rounded p-2 transition"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate">{m.card_name || m.sku}</p>
                    <p className="text-[10px] text-ink-faint">
                      {timeAgo(m.matched_at)}
                      {m.seller_username && (
                        <> · @{m.seller_username}</>
                      )}
                      <> · {m.current_status}</>
                    </p>
                  </div>
                  <span className="font-mono text-accent-strong shrink-0 ml-3">
                    <Money value={parseFloat(m.matched_price)} />
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
    <div className="bg-surface rounded-xl border border-accent/30 p-5 mb-4">
      <h2 className="text-sm font-bold text-accent-strong uppercase tracking-wide mb-3">New saved search</h2>

      <label className="block text-xs text-ink-faint mb-1">Name (visible only to you)</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Cheap Charizards"
        className="w-full px-3 py-2 mb-3 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
      />

      <label className="block text-xs text-ink-faint mb-1">Card name or SKU contains</label>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="charizard"
        className="w-full px-3 py-2 mb-3 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
      />

      <label className="block text-xs text-ink-faint mb-1">Set codes (comma-separated)</label>
      <input
        type="text"
        value={setCodes}
        onChange={(e) => setSetCodes(e.target.value)}
        placeholder="OP01, OP02"
        className="w-full px-3 py-2 mb-3 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono uppercase"
      />

      <label className="block text-xs text-ink-faint mb-2">Conditions</label>
      <div className="flex gap-1 mb-3 flex-wrap">
        {["NM", "M", "LP", "MP", "HP", "DMG"].map((c) => (
          <button
            key={c}
            onClick={() => toggleCondition(c)}
            className={`text-xs px-2.5 py-1 rounded-full transition ${
              conditions.includes(c)
                ? "bg-accent text-black font-bold"
                : "bg-surface-elevated text-ink-muted hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-ink-faint mb-1">Min price (£)</label>
          <input
            type="number"
            step="0.01"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-faint mb-1">Max price (£)</label>
          <input
            type="number"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm"
          />
        </div>
      </div>

      {err && <p className="text-xs text-red-400 mb-3">{err}</p>}

      <div className="flex justify-end gap-2">
        <button
          disabled={submitting || !name.trim()}
          onClick={submit}
          className="px-4 py-2 text-xs font-bold bg-accent text-black rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save search"}
        </button>
      </div>
    </div>
  );
}
