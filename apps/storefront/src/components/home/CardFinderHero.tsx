"use client";

import Link from "next/link";
import { tx } from "@/lib/i18n";
import type { GameItem } from "@/lib/wholesale/client";
import type { UiLang } from "@/lib/lang-mode";
import { Button } from "@/lib/ui/Button";
import { Field, Input, Select } from "@/lib/ui/Input";

type FinderGame = Pick<GameItem, "code" | "name"> & { card_count?: number };

/** Native GET search. Registry choices have no invented availability counts;
 * results own source publication and access checks. Works without JavaScript.
 */
export default function CardFinderHero({ games, uiLang = "en" }: { games: FinderGame[]; uiLang?: UiLang }) {
  const sorted = [...games].sort((a, b) => (b.card_count ?? 0) - (a.card_count ?? 0));
  const title = tx({ en: "Find a card", ja: "カードをさがす", es: "Encuentra una carta", "zh-Hans": "找卡", "zh-Hant": "找卡" }, uiLang);

  return (
    <section aria-label={title} className="border-t-2 border-ink pt-5">
      <h2 className="text-base font-semibold leading-7 text-ink">{title}</h2>
      <form method="get" action="/prices/search" className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-end">
        <Field label={tx({ en: "Game", ja: "ゲーム", es: "Juego", "zh-Hans": "游戏", "zh-Hant": "遊戲" }, uiLang)} htmlFor="finder-game">
          <Select id="finder-game" name="game" defaultValue={sorted[0]?.code ?? ""} density="comfortable">
            {sorted.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label={tx({ en: "Card number", ja: "カード番号", es: "Número de carta", "zh-Hans": "卡牌编号", "zh-Hant": "卡號" }, uiLang)} htmlFor="finder-q">
          <Input id="finder-q" name="q" density="comfortable" required placeholder={tx({ en: "e.g. OP01-001", ja: "例：OP01-001", es: "p. ej. OP01-001", "zh-Hans": "例：OP01-001", "zh-Hant": "例：OP01-001" }, uiLang)} />
        </Field>
        <Button type="submit" size="md" className="min-h-12">
          {tx({ en: "Find →", ja: "さがす →", es: "Buscar →", "zh-Hans": "找 →", "zh-Hant": "找卡 →" }, uiLang)}
        </Button>
      </form>
      <p className="mt-4 text-xs leading-6 text-ink-muted">
        {tx({ en: "No account needed to search. Some prices are withheld.", ja: "検索にアカウントは要りません。表示できない価格もあります。", es: "Busca sin cuenta. Algunos precios no se muestran.", "zh-Hans": "找卡不需要账号，有些价格不予显示。", "zh-Hant": "找卡不用帳戶，有些價格不公開。" }, uiLang)}{" "}
        <Link href="/prices" className="text-accent underline underline-offset-4">
          {tx({ en: "Or browse by game", ja: "ゲームからさがす", es: "O busca por juego", "zh-Hans": "也可以按游戏浏览", "zh-Hant": "也可以按遊戲瀏覽" }, uiLang)}
        </Link>
      </p>
    </section>
  );
}
