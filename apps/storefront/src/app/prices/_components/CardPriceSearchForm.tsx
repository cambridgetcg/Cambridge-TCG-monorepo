"use client";

import Link from "next/link";
import type { GameItem } from "@/lib/wholesale/client";
import { Button } from "@/lib/ui/Button";
import { Field, Input, Select } from "@/lib/ui/Input";

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
  const hasGames = sortedGames.length > 0;

  return (
    <div className="space-y-3">
      <form
        action="/prices/search"
        method="get"
        aria-label="Find a card"
        className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end"
      >
        <div className="min-w-0">
          <Field label="Game" htmlFor="price-search-game">
            <Select
              id="price-search-game"
              name="game"
              density="comfortable"
              defaultValue={game || sortedGames[0]?.code || ""}
              disabled={!hasGames}
              aria-describedby={!hasGames ? "price-search-unavailable" : undefined}
            >
              {!hasGames && <option value="">Games unavailable</option>}
              {sortedGames.map((gameItem) => (
                <option key={gameItem.code} value={gameItem.code}>
                  {gameItem.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="min-w-0">
          <Field label="Language" htmlFor="price-search-language">
            <Select
              id="price-search-language"
              name="lang"
              density="comfortable"
              defaultValue={language}
            >
              <option value="">Any language</option>
              <option value="en">English</option>
              <option value="ja">Japanese</option>
            </Select>
          </Field>
        </div>

        <div className="col-span-2 min-w-0 md:col-span-1">
          <Field label="Card number" htmlFor="price-search-query">
            <Input
              id="price-search-query"
              type="text"
              name="q"
              density="comfortable"
              required
              autoFocus={autoFocus}
              defaultValue={query}
              placeholder="e.g. OP01-001"
            />
          </Field>
        </div>

        <Button
          type="submit"
          className="col-span-2 min-h-11 md:col-span-1"
          disabled={!hasGames}
        >
          Find card
        </Button>
      </form>

      {!hasGames && (
        <p id="price-search-unavailable" role="status" className="text-sm text-ink-muted">
          The game catalog is unavailable, so search cannot start yet. Try again later or check <Link href="/prices/coverage" className="text-accent underline">source coverage</Link>.
        </p>
      )}

      <p className="text-sm leading-relaxed text-ink-muted">
        Use the small code printed on the card, usually near the bottom edge,
        such as <span className="font-mono text-ink-muted">OP01-001</span>.
        {browseHref ? (
          <>
            {" "}
            <Link href={browseHref} className="text-info hover:underline">
              Browse by game
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
