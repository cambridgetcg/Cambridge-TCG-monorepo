"use client";

import Link from "next/link";
import { sp, tx } from "@/lib/i18n";
import type { GameItem } from "@/lib/wholesale/client";
import type { UiLang } from "@/lib/lang-mode";
import { Button } from "@/lib/ui/Button";
import { Input, Select } from "@/lib/ui/Input";

/**
 * CardFinderHero — the front door for "find what you need".
 *
 * Pick a listed game and enter a card number to look up card details,
 * known variants and source publication status without an account.
 * Prices follow publication and access rules; a search does not promise
 * history, complete coverage or access to withheld data. Submits to the
 * existing /prices/search results page — this is only the front door,
 * not a second results page or an access gate.
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
  const title = tx({ en: "Find a card", ja: "カードをさがす", es: "Encuentra una carta", "zh-Hans": "找卡", "zh-Hant": "找卡" }, uiLang);

  return (
    <section aria-label={title} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="wardrobe-mat rounded-xl p-4 sm:p-6">
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {tx({ en: "Card details, known variants and source publication status. No account needed to search. Prices follow publication and access rules; some are withheld. No fee to look.", ja: "カードの情報、登録済みの別版、出どころごとの公開状況を調べられます。さがすのに、アカウントは要りません。価格は公開や閲覧の条件に従い、表示できないものもあります。見るのに、お金はかかりません。", es: "Datos de la carta, variantes conocidas y estado de publicación de las fuentes. Busca sin cuenta. Los precios siguen reglas de publicación y acceso; algunos no se muestran. Mirar no cuesta nada.", "zh-Hans": "查卡牌信息、已收录的版本和来源公开状态。找卡不需要账号。价格能否显示，要看公开和查看条件；有些不予显示。看，不花钱。", "zh-Hant": "卡片資料、已知版本、各來源的公開狀況。不用帳戶也能找卡。價格按公開及閱覽條件顯示，有些不公開。看，不用錢。" }, uiLang)}
        </p>
        <form
          method="get"
          action="/prices/search"
          className="mt-4 flex flex-col sm:flex-row gap-3"
        >
          <label className="sr-only" htmlFor="finder-game">
            {tx({ en: "Game", ja: "ゲーム", es: "Juego", "zh-Hans": "游戏", "zh-Hant": "遊戲" }, uiLang)}
          </label>
          <Select
            id="finder-game"
            name="game"
            defaultValue={sorted[0]?.code ?? ""}
            density="comfortable"
            className="sm:w-52"
          >
            {sorted.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name}
              </option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="finder-q">
            {tx({ en: "Card number", ja: "カード番号", es: "Número de carta", "zh-Hans": "卡牌编号", "zh-Hant": "卡號" }, uiLang)}
          </label>
          <Input
            id="finder-q"
            name="q"
            density="comfortable"
            required
            placeholder={tx({ en: "Card number — e.g. OP01-001", ja: "カード番号（例：OP01-001）", es: "Número de carta — p. ej. OP01-001", "zh-Hans": "卡牌编号（例：OP01-001）", "zh-Hant": "卡號（例：OP01-001）" }, uiLang)}
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="md" className="min-h-11">
            {tx({ en: "Find →", ja: "さがす →", es: "Buscar →", "zh-Hans": "找 →", "zh-Hant": "找卡 →" }, uiLang)}
          </Button>
        </form>
        <p className="mt-3 text-xs text-ink-faint">
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
