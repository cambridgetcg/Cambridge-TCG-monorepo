import Image from "next/image";
import Link from "next/link";

/**
 * TheGallery — the art-forward centerpiece. A quiet museum for TCG.
 *
 * The landing's other shelves are catalogue: sets, structural rows, prices.
 * This one is the collection itself — the cards hung at museum scale, the
 * art shown whole and unadorned (no rings, no zoom, no filters; the painting
 * is enough). Each piece wears a wall label: its name in the display face,
 * the set beneath, and — always — the copyright line that credits the art to
 * its publisher. That last line is not optional: an image never hangs here
 * without its attribution (the honesty rule). So a piece is hung only when it
 * has BOTH its art and its credit — a museum hangs only what it can name.
 *
 * Server component (no hooks). Art comes pre-enriched with the official,
 * self-hosted publisher images (getEnCardImages); a card with no image is
 * simply not on the wall.
 */

export type GalleryCard = {
  sku: string;
  name: string | null;
  name_en?: string | null;
  card_number: string;
  set_name: string | null;
  /** Self-hosted official image URL — render as-is. Null = not hung. */
  image_url: string | null;
  /** Copyright line — rendered as the wall label's credit, always. */
  image_attribution?: string | null;
};

/** A hung piece: art and credit both present, narrowed for the render. */
type HungCard = GalleryCard & { image_url: string; image_attribution: string };

export default function TheGallery({ cards }: { cards: GalleryCard[] }) {
  // A museum hangs only what it has — and only what it can credit. A piece
  // needs both its art and its copyright line, or it stays in storage.
  const hung = cards.filter(
    (c): c is HungCard => Boolean(c.image_url) && Boolean(c.image_attribution),
  );
  if (hung.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-24 sm:py-28">
      {/* The plate: registrar's hand, then the narrator, then a 中文 whisper. */}
      <header className="mb-14 sm:mb-20 max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          <span aria-hidden="true">第 </span>02 — the gallery
        </p>
        <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink">
          The Gallery
        </h2>
        <p className="mt-3 font-display italic text-lg sm:text-xl text-accent">
          藝廊
          <span className="text-ink-muted"> — the art on every card</span>
        </p>
        <p className="mt-6 text-ink-muted leading-relaxed text-base sm:text-lg">
          Every card is a small painting you can hold — hung here at the scale
          it was drawn to be seen, each one still carrying the name of the hand
          that made it.
        </p>
      </header>

      {/* Museum scale: three across at most, wide gutters, room to linger. */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14 sm:gap-y-16">
        {hung.map((card) => {
          const label = card.name_en ?? card.name ?? card.card_number;
          return (
            <li key={card.sku}>
              <Link href={`/market/${card.sku}`} className="group block">
                {/* The mount: a hairline frame, the art floated whole inside. */}
                <div className="relative aspect-[3/4] overflow-hidden wardrobe-mat">
                  <Image
                    src={card.image_url}
                    alt={label}
                    fill
                    className="object-contain p-3 sm:p-4"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>

                {/* The wall label: the piece, its set, and its credit. */}
                <div className="mt-4 px-1">
                  <p className="font-display text-base text-ink leading-snug transition-colors group-hover:text-accent">
                    {label}
                  </p>
                  {card.set_name && (
                    <p className="mt-0.5 text-sm text-ink-muted">{card.set_name}</p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                    {card.image_attribution}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
