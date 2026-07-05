"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface ChecklistCard {
  set_code: string;
  card_number: string;
  sku: string;
  card_name: string;
  rarity: string | null;
  image_url: string | null;
  variant: string;
  owned_count: number;
  is_owned: boolean;
}

interface SetDetail {
  set_code: string;
  set_name: string;
  game: string;
  total_cards: number;
  owned_unique: number;
  owned_copies: number;
  completion_pct: number;
  by_rarity: Array<{ rarity: string; owned: number; total: number }>;
  cards: ChecklistCard[];
}

const RARITY_TONE: Record<string, string> = {
  C: "text-ink-muted",
  UC: "text-ok",
  R: "text-info",
  SR: "text-[#6a5a8f]",
  L: "text-warning",
  SP: "text-[#9d5a74]",
};

export default function SetDetailPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<SetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "missing" | "owned">("all");
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/account/sets/${encodeURIComponent(code)}`)
      .then((r) => r.ok ? r.json() : Promise.reject("not found"))
      .then((d) => setData(d))
      .catch(() => setError("Set not found"))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
      <Audience kind="consumer" />
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/account/sets" className="text-xs text-accent hover:text-accent-strong">
          ← All sets
        </Link>
        <div className="mt-4 bg-surface rounded-lg p-6">
          <p className="text-ink-muted text-sm">{error || "Couldn't load this set."}</p>
        </div>
      </div>
    );
  }

  const filtered = data.cards.filter((c) => {
    if (view === "missing" && c.is_owned) return false;
    if (view === "owned" && !c.is_owned) return false;
    if (rarityFilter && (c.rarity ?? "unknown") !== rarityFilter) return false;
    return true;
  });

  const ownedCount = data.cards.filter((c) => c.is_owned).length;
  const missingCount = data.cards.length - ownedCount;

  return (
    <div>
      <Link href="/account/sets" className="text-xs text-accent hover:text-accent-strong">
        ← All sets
      </Link>

      <div className="mt-4 mb-6">
        <h1 className="text-2xl font-display font-semibold text-ink">{data.set_name}</h1>
        <p className="text-sm text-ink-faint font-mono">{data.set_code}</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface rounded-lg p-3 border border-border-subtle">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Completion</div>
          <div className={`text-2xl font-display font-semibold ${
            data.completion_pct >= 100 ? "text-ok"
              : data.completion_pct >= 50 ? "text-accent"
              : "text-ink"
          }`}>
            {data.completion_pct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-surface rounded-lg p-3 border border-border-subtle">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Owned</div>
          <div className="text-2xl font-display font-semibold text-ink">
            {data.owned_unique}<span className="text-ink-faint text-base"> / {data.total_cards}</span>
          </div>
        </div>
        <div className="bg-surface rounded-lg p-3 border border-border-subtle">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Total copies</div>
          <div className="text-2xl font-display font-semibold text-ink">{data.owned_copies}</div>
        </div>
        <div className="bg-surface rounded-lg p-3 border border-border-subtle">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Missing</div>
          <div className="text-2xl font-display font-semibold text-ink">{missingCount}</div>
        </div>
      </div>

      {/* By-rarity breakdown */}
      {data.by_rarity.length > 0 && (
        <div className="bg-surface rounded-lg p-4 mb-6 border border-border-subtle">
          <h2 className="text-xs uppercase tracking-wide text-ink-faint mb-3">By rarity</h2>
          <div className="space-y-2">
            {data.by_rarity.map((r) => {
              const pct = r.total > 0 ? (r.owned / r.total) * 100 : 0;
              const tone = RARITY_TONE[r.rarity] ?? "text-ink-muted";
              return (
                <button
                  key={r.rarity}
                  onClick={() => setRarityFilter(rarityFilter === r.rarity ? null : r.rarity)}
                  className={`w-full flex items-center gap-3 text-xs hover:bg-surface-subtle rounded p-1 transition ${
                    rarityFilter === r.rarity ? "bg-surface-subtle" : ""
                  }`}
                >
                  <span className={`w-12 text-left font-bold ${tone}`}>{r.rarity}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 text-right text-ink-muted font-mono">
                    {r.owned} / {r.total}
                  </span>
                </button>
              );
            })}
          </div>
          {rarityFilter && (
            <button
              onClick={() => setRarityFilter(null)}
              className="text-[10px] text-accent hover:text-accent-strong mt-2"
            >
              Clear rarity filter
            </button>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 mb-4 bg-surface rounded-lg p-1 w-fit">
        {([
          ["all", `All (${data.cards.length})`],
          ["owned", `Owned (${ownedCount})`],
          ["missing", `Missing (${missingCount})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`text-xs px-3 py-1.5 rounded-md transition ${
              view === k
                ? "bg-ink text-page font-semibold"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <p className="text-xs text-ink-faint py-8 text-center">No cards match this view.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {filtered.map((c) => {
            const tone = RARITY_TONE[c.rarity ?? ""] ?? "text-ink-faint";
            return (
              <Link
                key={`${c.card_number}-${c.variant}`}
                href={`/market/${encodeURIComponent(c.sku)}`}
                className={`relative bg-surface rounded-lg overflow-hidden border transition ${
                  c.is_owned
                    ? "border-ok/30 hover:border-ok/60"
                    : "border-border-subtle hover:border-accent/40 opacity-70 hover:opacity-100"
                }`}
              >
                <div className="aspect-[3/4] bg-surface-subtle relative">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt={c.card_name}
                      className={`absolute inset-0 w-full h-full object-cover ${
                        c.is_owned ? "" : "grayscale"
                      }`}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-ink-faint text-xs">
                      {c.card_number}
                    </div>
                  )}
                  {c.is_owned && c.owned_count > 1 && (
                    <div className="absolute top-1 right-1 bg-ink text-page text-[9px] font-semibold px-1.5 py-0.5 rounded">
                      ×{c.owned_count}
                    </div>
                  )}
                  {c.is_owned && c.owned_count === 1 && (
                    <div className="absolute top-1 right-1 bg-ink text-page w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold">
                      ✓
                    </div>
                  )}
                </div>
                <div className="p-1.5">
                  <p className="text-[10px] text-ink font-medium truncate" title={c.card_name}>
                    {c.card_name}
                  </p>
                  <div className="flex items-center justify-between text-[9px] mt-0.5">
                    <span className={tone}>{c.rarity ?? "?"}</span>
                    <span className="text-ink-faint font-mono">{c.card_number}{c.variant ? `·${c.variant}` : ""}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
