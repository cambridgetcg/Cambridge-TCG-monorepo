import type { GameItem } from "@/lib/wholesale/client";

/**
 * CardFinderHero — the front door for "find what you need".
 *
 * A dead-simple, no-account, any-game card finder. Pick a game, type a
 * card number, and POOF: price, transaction history, every available
 * source, every language variant — free, no sign-in. Reuses the
 * kingdom-090 substrate (/api/v1/search/everything) by submitting to the
 * existing /prices/search results page; this is purely the front door,
 * NOT a second results page (verify, don't overwrite).
 *
 * Native GET <form> on purpose — it works with JavaScript disabled,
 * which is an accessibility win (the fifth question), not a shortcut.
 *
 * North star (Yu, 2026-06-04): simple, clean, accessible, minimum fees
 * (looking up a card costs nothing), let people find what they need.
 */
export default function CardFinderHero({ games }: { games: GameItem[] }) {
  const sorted = [...games].sort((a, b) => b.card_count - a.card_count);
  return (
    <section aria-label="Find any card" className="max-w-7xl mx-auto px-4 py-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 sm:p-7">
        <h2 className="text-xl sm:text-2xl font-semibold text-white">
          Find any card
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Price, transaction history, every source, every language — in one
          view. No account, no fee to look. Just find what you need.
        </p>
        <form
          method="get"
          action="/prices/search"
          className="mt-4 flex flex-col sm:flex-row gap-3"
        >
          <label className="sr-only" htmlFor="finder-game">
            Game
          </label>
          <select
            id="finder-game"
            name="game"
            defaultValue={sorted[0]?.code ?? ""}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none sm:w-52"
          >
            {sorted.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="finder-q">
            Card number
          </label>
          <input
            id="finder-q"
            name="q"
            required
            placeholder="Card number — e.g. OP01-001"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400 transition-colors"
          >
            Find →
          </button>
        </form>
      </div>
    </section>
  );
}
