"use client";

import Link from "next/link";
import type { GameItem } from "@/lib/wholesale/client";

interface CatalogFiltersProps {
  games: GameItem[];
  current: {
    game?: string;
    set?: string;
    q?: string;
    sort?: string;
    in_stock?: string;
  };
  rarities?: string[];
  effectiveInStock?: boolean;
  hasSet?: boolean;
}

export default function CatalogFilters({
  games,
  current,
  rarities,
  effectiveInStock,
  hasSet,
}: CatalogFiltersProps) {
  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...current, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value && key !== "page") params.set(key, value);
    }
    return `/catalog?${params.toString()}`;
  }

  // Toggle in_stock: if currently filtering in-stock, switch to show all (in_stock=false);
  // if currently showing all, switch to in-stock (in_stock=true)
  const toggleInStockHref = effectiveInStock
    ? buildHref({ in_stock: "false" })
    : buildHref({ in_stock: "true" });

  return (
    <div className="flex flex-col gap-4">
      {/* Game tabs */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href="/catalog"
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
            !current.game
              ? "bg-emerald-500 text-black"
              : "bg-neutral-800 text-white hover:bg-neutral-700"
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
                ? "bg-emerald-500 text-black"
                : "bg-neutral-800 text-white hover:bg-neutral-700"
            }`}
          >
            {g.name}
          </Link>
        ))}
      </div>

      {/* Sort + filters row (only show when viewing cards) */}
      {current.game && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort pills */}
          <span className="text-xs text-neutral-500 uppercase tracking-wider">Sort:</span>
          {[
            { label: "Card #", value: undefined },
            { label: "Price ↑", value: "price_asc" },
            { label: "Price ↓", value: "price_desc" },
          ].map((opt) => {
            const active =
              (!opt.value && !current.sort) || current.sort === opt.value;
            return (
              <Link
                key={opt.label}
                href={buildHref({ sort: opt.value })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  active
                    ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                    : "bg-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}

          {/* In-stock / All cards toggle */}
          <span className="text-xs text-neutral-500 ml-2">|</span>
          <Link
            href={toggleInStockHref}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              !effectiveInStock
                ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            {effectiveInStock ? "Show All Cards" : "In Stock Only"}
          </Link>
        </div>
      )}
    </div>
  );
}
