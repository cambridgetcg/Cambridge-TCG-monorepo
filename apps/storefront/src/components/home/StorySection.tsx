/**
 * StorySection — one short ink-on-paper passage.
 *
 * Quiet gallery: the anime background and the shouted headline are gone;
 * the copy that told the truth stays, set in the display face, italic,
 * centred — a plaque beside the collection rather than a billboard
 * over it.
 */
import type { UiLang } from "@/lib/lang-mode";

export default function StorySection({ uiLang = "en" }: { uiLang?: UiLang }) {
  const j = uiLang === "ja";
  return (
    <section className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-6">
        {j ? "この店のこと" : "Our Story"}
      </p>
      <p className="font-display italic text-xl sm:text-2xl text-ink leading-relaxed">
        {j
          ? "Cambridge TCGは、コレクターが、コレクターのためにつくった店です。カードは、大切に思う人の手から手へ。売り買いはすべて見守られ、相場には出どころがあります。カウンターの奥から売るものは、ありません。宝物は、カードだけではありません。自分の手で見つけた、ということ。"
          : "Cambridge TCG was built by collectors, for collectors. The cards trade hand to hand between the people who love them — every trade witnessed, every price sourced, nothing sold from behind the counter. The treasure isn't just the card. It's knowing you found it."}
      </p>
      <a
        href="/about"
        className="mt-8 inline-block text-sm text-accent hover:text-accent-strong transition-colors"
      >
        {j ? "つづきを読む →" : "Read the full story →"}
      </a>
    </section>
  );
}
