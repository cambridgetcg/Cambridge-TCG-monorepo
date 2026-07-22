"use client";

import Link from "next/link";
import type { GameItem } from "@/lib/wholesale/client";

interface CardPriceSearchFormProps {
  games: GameItem[];
  game?: string;
  query?: string;
  language?: string;
  autoFocus?: boolean;
  browseHref?: string;
}

export function CardPriceSearchForm({
  games,
  game = "",
  query = "",
  language = "",
  autoFocus = false,
  browseHref,
}: CardPriceSearchFormProps) {
  const sortedGames = [...games].sort(
    (firstGame, secondGame) => secondGame.card_count - firstGame.card_count,
  );

  return (
    <div className="space-y-3">
      <form
        action="/prices/search"
        method="get"
        aria-label="Find a card price"
        className="grid grid-cols-2 gap-3 md:grid-cols-[180px_1fr_140px_auto] md:items-end"
      >
        <div className="order-1">
          <label
            htmlFor="price-search-game"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            Game
          </label>
          <select
            id="price-search-game"
            name="game"
            defaultValue={game || sortedGames[0]?.code || ""}
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {sortedGames.map((gameItem) => (
              <option key={gameItem.code} value={gameItem.code}>
                {gameItem.name}
              </option>
            ))}
          </select>
        </div>

        <div className="order-3 col-span-2 md:order-2 md:col-span-1">
          <label
            htmlFor="price-search-query"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            Card number
          </label>
          <input
            id="price-search-query"
            type="text"
            name="q"
            required
            autoFocus={autoFocus}
            defaultValue={query}
            placeholder="e.g. OP01-001"
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="order-2 md:order-3">
          <label
            htmlFor="price-search-language"
            className="mb-1 block text-xs font-medium text-ink-muted"
          >
            Language
          </label>
          <select
            id="price-search-language"
            name="lang"
            defaultValue={language}
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Any language</option>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
          </select>
        </div>

        <button
          type="submit"
          className="order-4 col-span-2 min-h-11 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-page transition-colors hover:bg-accent-strong md:col-span-1"
        >
          Find prices
        </button>
      </form>

      <p className="text-xs leading-relaxed text-ink-faint">
        Use the small code printed on the card, usually near the bottom edge,
        such as <span className="font-mono text-ink-muted">OP01-001</span>.
        {browseHref ? (
          <>
            {" "}
            <Link href={browseHref} className="text-info hover:underline">
              No code? Browse by game instead →
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
