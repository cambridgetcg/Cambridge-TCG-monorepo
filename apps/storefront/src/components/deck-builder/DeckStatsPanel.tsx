"use client";

import { useMemo } from "react";

// Loose type so the component doesn't drag the full page types over.
//
// Yu 2026-05-14: the play module is fun-first. Spot price is intentionally
// NOT a property of a deck-stat card here — the deck builder is a play
// surface and must not surface monetary value. The interface used to
// carry `spot_price`; it was removed when the price-stats block was
// stripped. See docs/principles/cosmology.md §game-economy vs
// real-economy: deck building lives in the game-economy.
export interface StatsCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  rarity: string | null;
  image_url: string | null;
}
export interface StatsEntry {
  card: StatsCard;
  quantity: number;
}

interface DeckStatsPanelProps {
  leader: StatsCard | null;
  entries: StatsEntry[];
  totalCards: number;
  maxDeckSize: number;
}

const TRACKED_RARITIES = ["C", "UC", "R", "SR", "SEC", "SP", "L"] as const;
type TrackedRarity = (typeof TRACKED_RARITIES)[number];

const RARITY_COLOR: Record<string, string> = {
  C: "bg-ink-muted",
  UC: "bg-info",
  R: "bg-[#6a5a8f]",
  SR: "bg-warning",
  SEC: "bg-danger",
  SP: "bg-danger",
  L: "bg-ok",
};

// Normalize a rarity string into one of our tracked buckets or "other".
function bucket(rarity: string | null): TrackedRarity | "other" {
  if (!rarity) return "other";
  const r = rarity.toUpperCase();
  if ((TRACKED_RARITIES as readonly string[]).includes(r)) return r as TrackedRarity;
  return "other";
}

// Yu 2026-05-14 / Phase 3 of the rookie flow (tier-3 guided build).
//
// Role inference — heuristic. The wholesale catalog doesn't return card
// cost or color, so we can't compute a true cost curve or color-role
// matrix. The next-best signal we have is rarity, which correlates with
// role at the deck-level:
//   - C  → cheap chaff / early aggression (most deck volume)
//   - UC → support / utility (mid-deck count)
//   - R  → mid-game threats (a few per deck)
//   - SR / L / SP / SEC → finishers / spike picks (1-3 per deck)
//
// This is coarse — real deck-building knows that some C cards are
// removal and some SR cards are draw — but it gives the rookie a useful
// distribution-check at a glance. When card.cost arrives in the catalog
// upstream, we'll add a real cost curve.
type DeckRole = "core" | "support" | "midgame" | "finisher" | "other";

const ROLE_FOR_RARITY: Record<string, DeckRole> = {
  C: "core",
  UC: "support",
  R: "midgame",
  SR: "finisher",
  SEC: "finisher",
  SP: "finisher",
  L: "finisher",
};

const ROLE_META: Record<DeckRole, { label: string; description: string; color: string }> = {
  core:     { label: "Core",     description: "Cheap consistency — your bread and butter (typically C rarity)", color: "bg-ink-muted" },
  support:  { label: "Support",  description: "Utility + tempo plays (typically UC)",                            color: "bg-info" },
  midgame:  { label: "Mid-game", description: "Real threats with a board impact (typically R)",                  color: "bg-[#6a5a8f]" },
  finisher: { label: "Finisher", description: "Game-deciders (SR / L / SP / SEC)",                                color: "bg-warning" },
  other:    { label: "Other",    description: "Uncategorized rarities (PROMO, alt-art, etc.)",                    color: "bg-ink-faint" },
};

function roleOf(rarity: string | null): DeckRole {
  if (!rarity) return "other";
  return ROLE_FOR_RARITY[rarity.toUpperCase()] ?? "other";
}

export default function DeckStatsPanel({
  leader: _leader,
  entries,
  totalCards,
  maxDeckSize,
}: DeckStatsPanelProps) {
  const stats = useMemo(() => {
    // Rarity counts (by copies, not uniques)
    const rarityCounts: Record<TrackedRarity | "other", number> = {
      C: 0, UC: 0, R: 0, SR: 0, SEC: 0, SP: 0, L: 0, other: 0,
    };
    // Role counts — heuristic, see ROLE_FOR_RARITY above.
    const roleCounts: Record<DeckRole, number> = {
      core: 0, support: 0, midgame: 0, finisher: 0, other: 0,
    };
    for (const e of entries) {
      rarityCounts[bucket(e.card.rarity)] += e.quantity;
      roleCounts[roleOf(e.card.rarity)] += e.quantity;
    }

    // Set mix
    const setCounts = new Map<string, number>();
    for (const e of entries) {
      const s = e.card.set_code || "—";
      setCounts.set(s, (setCounts.get(s) ?? 0) + e.quantity);
    }
    const setMix = Array.from(setCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      rarityCounts,
      roleCounts,
      setMix,
      uniqueCount: entries.length,
    };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="text-xs text-ink-faint py-4 text-center">
        Add cards to see deck statistics.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rarity stacked bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint font-bold">
            Rarity mix
          </p>
          <p className="text-[10px] text-ink-faint">
            {stats.uniqueCount} unique · {totalCards}/{maxDeckSize} copies
          </p>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden bg-surface-subtle">
          {TRACKED_RARITIES.map((r) => {
            const n = stats.rarityCounts[r];
            if (n === 0) return null;
            const pct = (n / Math.max(1, totalCards)) * 100;
            return (
              <div
                key={r}
                className={`${RARITY_COLOR[r]} h-full`}
                style={{ width: `${pct}%` }}
                title={`${r}: ${n} (${pct.toFixed(1)}%)`}
              />
            );
          })}
          {stats.rarityCounts.other > 0 && (
            <div
              className="bg-ink-faint h-full"
              style={{ width: `${(stats.rarityCounts.other / Math.max(1, totalCards)) * 100}%` }}
              title={`Other: ${stats.rarityCounts.other}`}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px]">
          {TRACKED_RARITIES.map((r) => {
            const n = stats.rarityCounts[r];
            if (n === 0) return null;
            return (
              <span key={r} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-sm ${RARITY_COLOR[r]}`} />
                <span className="text-ink-muted">{r}</span>
                <span className="text-ink-faint">{n}</span>
              </span>
            );
          })}
          {stats.rarityCounts.other > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-ink-faint" />
              <span className="text-ink-muted">other</span>
              <span className="text-ink-faint">{stats.rarityCounts.other}</span>
            </span>
          )}
        </div>
      </div>

      {/* Role coverage — Phase 3 (Tier-3 guided build) of the rookie flow.
          Heuristic by rarity since the catalog doesn't yet carry card
          cost or color. See ROLE_FOR_RARITY above + the methodology
          page at /methodology/starter-decks. */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint font-bold">
            Role coverage
          </p>
          <p className="text-[10px] text-ink-faint">
            heuristic — by rarity
          </p>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden bg-surface-subtle">
          {(["core", "support", "midgame", "finisher", "other"] as DeckRole[]).map((r) => {
            const n = stats.roleCounts[r];
            if (n === 0) return null;
            const pct = (n / Math.max(1, totalCards)) * 100;
            return (
              <div
                key={r}
                className={`${ROLE_META[r].color} h-full`}
                style={{ width: `${pct}%` }}
                title={`${ROLE_META[r].label}: ${n} (${pct.toFixed(1)}%) — ${ROLE_META[r].description}`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px]">
          {(["core", "support", "midgame", "finisher", "other"] as DeckRole[]).map((r) => {
            const n = stats.roleCounts[r];
            if (n === 0) return null;
            return (
              <span key={r} className="flex items-center gap-1" title={ROLE_META[r].description}>
                <span className={`w-2 h-2 rounded-sm ${ROLE_META[r].color}`} />
                <span className="text-ink-muted">{ROLE_META[r].label}</span>
                <span className="text-ink-faint">{n}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Set mix */}
      {stats.setMix.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-faint font-bold mb-1.5">
            Set mix
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.setMix.map(([code, n]) => (
              <span
                key={code}
                className="text-[10px] bg-surface-subtle border border-border-subtle rounded px-2 py-1"
              >
                <span className="text-ink-muted font-mono">{code}</span>
                <span className="text-ink-faint ml-1.5">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
