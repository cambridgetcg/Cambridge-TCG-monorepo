/**
 * StorySection — one short ink-on-paper passage.
 *
 * Quiet gallery: the anime background and the shouted headline are gone;
 * the copy that told the truth stays, set in the display face, italic,
 * centred — a plaque beside the collection rather than a billboard
 * over it.
 */
import type { UiLang } from "@/lib/lang-mode";
import { tx } from "@/lib/i18n";

export default function StorySection({ uiLang = "en" }: { uiLang?: UiLang }) {
  const j = uiLang === "ja";
  return (
    <section className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-6">
        {tx({ en: "Our Story", ja: "この店のこと", es: "Esta casa", "zh-Hans": "这家店的来历", "zh-Hant": "小店的來歷" }, uiLang)}
      </p>
      <p className="font-display italic text-xl sm:text-2xl text-ink leading-relaxed">
        {tx({ en: "Cambridge TCG was built by collectors, for collectors. The cards trade hand to hand between the people who love them — every trade witnessed, every price sourced, nothing sold from behind the counter. The treasure isn't just the card. It's knowing you found it.", ja: "Cambridge TCGは、コレクターが、コレクターのためにつくった店です。カードは、大切に思う人の手から手へ。売り買いはすべて見守られ、相場には出どころがあります。カウンターの奥から売るものは、ありません。宝物は、カードだけではありません。自分の手で見つけた、ということ。", es: "Cambridge TCG es obra de coleccionistas, para coleccionistas. Las cartas van de mano en mano entre quienes las quieren. Cada intercambio tiene testigo; cada precio, su fuente. Detrás del mostrador no se vende nada. El tesoro no es solo la carta. Es saber que la encontraste.", "zh-Hans": "Cambridge TCG是卡友开给卡友的店。卡片在爱它的人手中流转。每一次收与出，都有人见证；每一个价，都有来路。柜台后面，什么也不卖。宝物，不只是那张卡。是你知道，这是自己找到的。", "zh-Hant": "Cambridge TCG是藏家為藏家開的舖。卡在愛惜它的人手裡，一手傳一手。每一筆買賣都有見證，每一個價都有出處；櫃檯後面，沒有東西要賣。寶物不只是卡。是知道這一張，是自己找到的。" }, uiLang)}
      </p>
      <a
        href="/about"
        className="mt-8 inline-block text-sm text-accent hover:text-accent-strong transition-colors"
      >
        {tx({ en: "Read the full story →", ja: "つづきを読む →", es: "seguir leyendo →", "zh-Hans": "把故事读完 →", "zh-Hant": "讀下去 →" }, uiLang)}
      </a>
    </section>
  );
}
