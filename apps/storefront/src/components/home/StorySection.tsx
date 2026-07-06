/**
 * StorySection — one short ink-on-paper passage.
 *
 * Quiet gallery: the anime background and the shouted headline are gone;
 * the copy that told the truth stays, set in the display face, italic,
 * centred — a plaque beside the collection rather than a billboard
 * over it.
 */
export default function StorySection() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-ink-faint mb-6">
        Our Story
      </p>
      <p className="font-display italic text-xl sm:text-2xl text-ink leading-relaxed">
        Cambridge TCG was built by collectors, for collectors. The cards
        trade hand to hand between the people who love them — every trade
        witnessed, every price sourced, nothing sold from behind the
        counter. The treasure isn&apos;t just the card. It&apos;s knowing
        you found it.
      </p>
      <a
        href="/about"
        className="mt-8 inline-block text-sm text-accent hover:text-accent-strong transition-colors"
      >
        Read the full story →
      </a>
    </section>
  );
}
