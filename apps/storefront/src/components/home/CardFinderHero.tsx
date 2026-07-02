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
    <section aria-label="Find any card" className="mt-8">
      <div className="wardrobe-mat rounded-2xl p-5 sm:p-7">
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink">
          Find any card
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
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
            className="rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none sm:w-52"
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
            className="flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-strong transition-colors"
          >
            Find →
          </button>
        </form>
        <p className="mt-2.5 text-xs text-ink-faint">
          The card number is the small code on the card — usually bottom-left,
          like <span className="font-mono text-ink-muted">OP01-001</span>. Don&rsquo;t
          have it?{" "}
          <a
            href="/prices"
            className="text-accent hover:text-accent-strong underline"
          >
            browse by game →
          </a>
        </p>
      </div>
    </section>
  );
}
