import Link from "next/link";
import Image from "next/image";
import type { SetItem, PriceItem } from "@/lib/wholesale/client";

interface SetWithThumb extends SetItem {
  thumb: PriceItem | null;
}

/**
 * SetGrid — latest sets, each mounted like a print in a gallery.
 *
 * Quiet gallery: the card art is the only color. The thumbnail used to
 * be a washed-out background under a gradient; now the card sits whole
 * on a subtle mount, hairline-framed, with the set's facts beneath it.
 */
export default function SetGrid({
  sets,
  gameSlug,
  heading = "Latest Sets",
}: {
  sets: SetWithThumb[];
  gameSlug: string;
  /** Shelf label. Callers passing a single game's sets should name the
   *  game ("Latest One Piece Sets") — a bare "Latest Sets" over one
   *  game's shelf implies catalog-wide coverage it doesn't have. */
  heading?: string;
}) {
  if (!sets.length) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-14">
      <div className="flex items-baseline justify-between mb-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {heading}
        </h2>
        <Link
          href={`/catalog?game=${gameSlug}`}
          className="text-sm text-accent hover:text-accent-strong transition-colors"
        >
          View all sets →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {sets.map((set, i) => (
          <Link
            key={set.code}
            href={`/catalog?game=${gameSlug}&set=${set.code}`}
            className="group wardrobe-mat rounded-lg overflow-hidden hover:bg-surface-subtle transition-colors"
          >
            <div className="relative aspect-[4/3] bg-surface-subtle">
              {set.thumb?.image_url && (
                <Image
                  src={set.thumb.image_url}
                  alt={set.name}
                  fill
                  className="object-contain p-3"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              )}

              {/* NEW chip for first set */}
              {i === 0 && (
                <span className="absolute top-3 right-3 rounded px-1.5 py-0.5 bg-accent-wash text-accent border border-accent/30 text-[10px] font-semibold uppercase tracking-wide">
                  New
                </span>
              )}
            </div>

            <div className="p-4 border-t border-border-subtle">
              <span className="text-xs font-mono text-ink-faint">{set.code}</span>
              <h3 className="mt-1 text-sm font-semibold text-ink leading-tight line-clamp-2">
                {set.name}
              </h3>
              <p className="text-xs text-ink-muted font-mono tabular-nums mt-1">
                {set.card_count} cards
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
