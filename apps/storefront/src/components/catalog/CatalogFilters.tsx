"use client";

import Link from "next/link";
import type { GameItem } from "@/lib/wholesale/client";

// Collectors-first: the in-stock toggle died with the shop — the
// platform holds no stock, so there is nothing of ours to be "in".
// Game tabs + structural sort remain: pure browsing value.
interface CatalogFiltersProps {
  games: GameItem[];
  current: {
    game?: string;
    set?: string;
    q?: string;
    sort?: string;
  };
  rarities?: string[];
}

export default function CatalogFilters({
  games,
  current,
}: CatalogFiltersProps) {
  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...current, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value && key !== "page") params.set(key, value);
    }
    return `/catalog?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Game tabs */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href="/catalog"
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            !current.game
              ? "bg-accent-wash text-accent"
              : "bg-surface-subtle text-ink hover:bg-surface-elevated"
          }`}
        >
          All Games
        </Link>
        {games.map((g) => (
          <Link
            key={g.code}
            href={`/catalog?game=${g.slug}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              current.game === g.slug
                ? "bg-accent-wash text-accent"
                : "bg-surface-subtle text-ink hover:bg-surface-elevated"
            }`}
          >
            {g.name}
          </Link>
        ))}
      </div>

      {/* Sort row (only show when viewing cards) */}
      {current.game && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort pills */}
          <span className="text-xs text-ink-faint uppercase tracking-wider">Sort:</span>
          {[
            { label: "Card #", value: undefined },
            { label: "Name A-Z", value: "name_asc" },
          ].map((opt) => {
            const active =
              (!opt.value && !current.sort) || current.sort === opt.value;
            return (
              <Link
                key={opt.label}
                href={buildHref({ sort: opt.value })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  active
                    ? "bg-accent-wash text-accent ring-1 ring-accent/40"
                    : "bg-surface-subtle text-ink-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
