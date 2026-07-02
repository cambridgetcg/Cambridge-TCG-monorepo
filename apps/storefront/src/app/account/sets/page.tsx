"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface SetSummary {
  set_code: string;
  set_name: string;
  game: string;
  total_cards: number;
  owned_unique: number;
  owned_copies: number;
  completion_pct: number;
  cover_image_url: string | null;
  released_at: string | null;
}

export default function SetsPage() {
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "collecting" | "completed">("all");

  useEffect(() => {
    fetch("/api/account/sets")
      .then((r) => r.json())
      .then((d) => setSets(d.sets || []))
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = sets.filter((s) => {
    if (filter === "collecting") return s.owned_unique > 0 && s.completion_pct < 100;
    if (filter === "completed") return s.completion_pct >= 100;
    return true;
  });

  const collectingCount = sets.filter((s) => s.owned_unique > 0 && s.completion_pct < 100).length;
  const completedCount = sets.filter((s) => s.completion_pct >= 100).length;

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-black text-ink mb-2">Set Progress</h1>
      <p className="text-sm text-ink-muted mb-6">
        Track completion across every set you collect. Click a set to see the full checklist
        with missing cards and links to find them on the market.
      </p>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          ["all", `All sets (${sets.length})`],
          ["collecting", `Collecting (${collectingCount})`],
          ["completed", `Completed (${completedCount})`],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k as "all" | "collecting" | "completed")}
            className={`text-xs px-3 py-1.5 rounded-full transition ${
              filter === k
                ? "bg-accent text-black font-bold"
                : "bg-surface text-ink-muted hover:text-ink border border-border-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface rounded-xl p-8 text-center">
          <p className="text-ink-muted text-sm">
            {filter === "all"
              ? "No sets have been imported yet. An admin needs to seed the catalogue."
              : filter === "collecting"
                ? "Not collecting any sets yet. Buy some cards from the market or import a CSV."
                : "No completed sets yet — keep collecting!"}
          </p>
          {filter !== "all" && (
            <Link href="/account/sets" className="inline-block mt-3 text-accent-strong text-xs font-semibold hover:text-accent-strong">
              View all sets →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <Link
              key={s.set_code}
              href={`/account/sets/${encodeURIComponent(s.set_code)}`}
              className="bg-surface rounded-xl border border-border-subtle hover:border-accent/40 transition overflow-hidden group"
            >
              <div className="aspect-[16/9] bg-surface-elevated relative">
                {s.cover_image_url ? (
                  <img
                    src={s.cover_image_url}
                    alt={s.set_name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-600 text-xs font-mono">
                    {s.set_code}
                  </div>
                )}
                {s.completion_pct >= 100 && (
                  <div className="absolute top-2 right-2 bg-emerald-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                    COMPLETE
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="text-ink font-semibold text-sm truncate group-hover:text-accent-strong transition">
                    {s.set_name}
                  </p>
                  <span className="text-[10px] text-ink-faint font-mono shrink-0">{s.set_code}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
                  <span>
                    <span className="text-ink font-bold">{s.owned_unique}</span>
                    {" / "}
                    {s.total_cards}
                    {s.owned_copies > s.owned_unique && (
                      <span className="text-neutral-600 ml-1">({s.owned_copies} copies)</span>
                    )}
                  </span>
                  <span className={`font-bold ${
                    s.completion_pct >= 100 ? "text-secondary"
                      : s.completion_pct >= 50 ? "text-accent-strong"
                      : "text-ink-muted"
                  }`}>
                    {s.completion_pct.toFixed(1)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      s.completion_pct >= 100 ? "bg-emerald-500"
                        : "bg-accent"
                    }`}
                    style={{ width: `${Math.min(s.completion_pct, 100)}%` }}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
