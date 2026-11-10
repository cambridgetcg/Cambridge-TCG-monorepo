"use client";

import Link from "next/link";
import { useState } from "react";
import type { GameItem } from "@/lib/wholesale/client";
import { Button } from "@/lib/ui/Button";
import { Field, Input, Select } from "@/lib/ui/Input";

/** An example card number, only for a game whose numbers it shows: a One
 *  Piece number under Pokémon would teach the wrong shape. "OP01-001" with
 *  One Piece resolves exactly (checked on cambridgetcg.com, 2026-11-10). */
const CARD_NUMBER_EXAMPLE: Record<string, string> = { op: "e.g. OP01-001" };

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
  const [selectedGame, setSelectedGame] = useState(game || sortedGames[0]?.code || "");

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
              onChange={(event) => setSelectedGame(event.target.value)}
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
              placeholder={CARD_NUMBER_EXAMPLE[selectedGame]}
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
        such as <span className="font-mono text-ink-muted">OP01-001</span> on a One Piece card.
        {browseHref ? (
          <>
            {" "}
            <Link href={browseHref} className="text-accent underline underline-offset-4">
              Browse by game
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
