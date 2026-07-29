"use client";

import Link from "next/link";
import { tx } from "@/lib/i18n";
import type { GameItem } from "@/lib/wholesale/client";
import type { UiLang } from "@/lib/lang-mode";

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
 *
 * Dressed for the quiet gallery (docs/plans/the-quiet-gallery.md):
 * white mount, hairline border, ink primary button. rounded-xl is the
 * hero-card exception the design doc reserves.
 */
export default function CardFinderHero({ games, uiLang = "en" }: { games: GameItem[]; uiLang?: UiLang }) {
  const sorted = [...games].sort((a, b) => b.card_count - a.card_count);
  const j = uiLang === "ja";

  return (
    <section aria-label={tx({ en: "Find any card", ja: "カードをさがす" }, uiLang)} className="max-w-7xl mx-auto px-4 py-6">
      <div className="wardrobe-mat rounded-xl p-5 sm:p-7">
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
          {tx({ en: "Find any card", ja: "カードをさがす" }, uiLang)}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {tx({ en: "Price, transaction history, every source, every language — in one view. No account, no fee to look. Just find what you need.", ja: "相場も、やり取りの記録も、出どころも、どの言語の版も、ひと目で。アカウントは要りません。見るのに、お金はかかりません。あとは、さがすだけ。" }, uiLang)}
        </p>
        <form
          method="get"
          action="/prices/search"
          className="mt-4 flex flex-col sm:flex-row gap-3"
        >
          <label className="sr-only" htmlFor="finder-game">
            {tx({ en: "Game", ja: "ゲーム" }, uiLang)}
          </label>
          <select
            id="finder-game"
            name="game"
            defaultValue={sorted[0]?.code ?? ""}
            className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-accent/50 transition sm:w-52"
          >
            {sorted.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="finder-q">
            {tx({ en: "Card number", ja: "カード番号" }, uiLang)}
          </label>
          <input
            id="finder-q"
            name="q"
            required
            placeholder={tx({ en: "Card number — e.g. OP01-001", ja: "カード番号（例：OP01-001）" }, uiLang)}
            className="flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-page hover:opacity-90 transition"
          >
            {tx({ en: "Find →", ja: "さがす →" }, uiLang)}
          </button>
        </form>
        <p className="mt-2.5 text-xs text-ink-faint">
          {j ? (
            <>
              カード番号は、カードのすみにある小さなコード。たいてい左下に、
              <span className="font-mono text-ink-muted">OP01-001</span>
              のように書いてあります。番号が手もとにないときは、
            </>
          ) : (
            <>
              The card number is the small code on the card — usually bottom-left,
              like <span className="font-mono text-ink-muted">OP01-001</span>. Don&rsquo;t
              have it?{" "}
            </>
          )}
          <Link
            href="/prices"
            className="text-accent hover:text-accent-strong underline"
          >
            {tx({ en: "browse by game →", ja: "ゲームからさがす →" }, uiLang)}
          </Link>
        </p>
      </div>
    </section>
  );
}
