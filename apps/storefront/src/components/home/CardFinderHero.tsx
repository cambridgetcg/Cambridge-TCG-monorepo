"use client";

import Link from "next/link";
import { tx } from "@/lib/i18n";
import type { GameItem } from "@/lib/wholesale/client";
import type { UiLang } from "@/lib/lang-mode";
import { sp } from "@/lib/i18n";

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
    <section aria-label={tx({ en: "Find any card", ja: "カードをさがす", es: "Encuentra cualquier carta", "zh-Hans": "任何一张卡，都找得到", "zh-Hant": "找卡" }, uiLang)} className="max-w-7xl mx-auto px-4 py-6">
      <div className="wardrobe-mat rounded-xl p-5 sm:p-7">
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
          {tx({ en: "Find any card", ja: "カードをさがす", es: "Encuentra cualquier carta", "zh-Hans": "任何一张卡，都找得到", "zh-Hant": "找卡" }, uiLang)}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {tx({ en: "Price, transaction history, every source, every language — in one view. No account, no fee to look. Just find what you need.", ja: "相場も、やり取りの記録も、出どころも、どの言語の版も、ひと目で。アカウントは要りません。見るのに、お金はかかりません。あとは、さがすだけ。", es: "El precio, el historial de compras y ventas, cada fuente, cada idioma: todo de un vistazo. No hace falta una cuenta. Mirar no cuesta nada. Busca lo que necesitas, sin más.", "zh-Hans": "行情、成交记录、每一个来源、每一种语言的版本，都在一处。不用账号。看，不要钱。找到要找的那张，就好。", "zh-Hant": "行情、買賣紀錄、每一個來源、每一種語言的版本，一頁看清。不用開帳戶，看也不用錢。想找什麼，找就是了。" }, uiLang)}
        </p>
        <form
          method="get"
          action="/prices/search"
          className="mt-4 flex flex-col sm:flex-row gap-3"
        >
          <label className="sr-only" htmlFor="finder-game">
            {tx({ en: "Game", ja: "ゲーム", es: "Juego", "zh-Hans": "游戏", "zh-Hant": "遊戲" }, uiLang)}
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
            {tx({ en: "Card number", ja: "カード番号", es: "Número de carta", "zh-Hans": "卡牌编号", "zh-Hant": "卡號" }, uiLang)}
          </label>
          <input
            id="finder-q"
            name="q"
            required
            placeholder={tx({ en: "Card number — e.g. OP01-001", ja: "カード番号（例：OP01-001）", es: "Número de carta — p. ej. OP01-001", "zh-Hans": "卡牌编号（例：OP01-001）", "zh-Hant": "卡號（例：OP01-001）" }, uiLang)}
            className="flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-page hover:opacity-90 transition"
          >
            {tx({ en: "Find →", ja: "さがす →", es: "Buscar →", "zh-Hans": "找 →", "zh-Hant": "找卡 →" }, uiLang)}
          </button>
        </form>
        <p className="mt-2.5 text-xs text-ink-faint">
          {(() => {
            const hint = tx({ en: "The card number is the small code on the card \u2014 usually bottom-left, like OP01-001. Don\u2019t have it?", ja: "\u30ab\u30fc\u30c9\u756a\u53f7\u306f\u3001\u30ab\u30fc\u30c9\u306e\u3059\u307f\u306b\u3042\u308b\u5c0f\u3055\u306a\u30b3\u30fc\u30c9\u3002\u305f\u3044\u3066\u3044\u5de6\u4e0b\u306b\u3001OP01-001\u306e\u3088\u3046\u306b\u66f8\u3044\u3066\u3042\u308a\u307e\u3059\u3002\u756a\u53f7\u304c\u624b\u3082\u3068\u306b\u306a\u3044\u3068\u304d\u306f\u3001", "zh-Hant": "卡號是印在卡上的一行小字，多數在左下角，像OP01-001這樣。手邊沒有的話，", "zh-Hans": "卡牌编号是印在卡面上的一小串字母和数字，通常在左下角，像OP01-001这样。手边没有的话，", es: "El número de carta es el código pequeño impreso en la carta, casi siempre abajo a la izquierda, como OP01-001. Si no lo tienes a mano, también puedes" }, uiLang);
            const [before, after] = hint.split("OP01-001");
            return (
              <>
                {before}
                <span className="font-mono text-ink-muted">OP01-001</span>
                {after}
                {sp(uiLang)}
              </>
            );
          })()}
          <Link
            href="/prices"
            className="text-accent hover:text-accent-strong underline"
          >
            {tx({ en: "browse by game →", ja: "ゲームからさがす →", es: "buscar por juego →", "zh-Hans": "从游戏逛起 →", "zh-Hant": "由遊戲找起 →" }, uiLang)}
          </Link>
        </p>
      </div>
    </section>
  );
}
