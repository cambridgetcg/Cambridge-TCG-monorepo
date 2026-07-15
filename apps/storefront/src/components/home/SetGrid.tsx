import Link from "next/link";
import Image from "next/image";
import type { SetItem, PriceItem } from "@/lib/wholesale/client";
import { PlateHeader } from "@/lib/ui";
import { weatherClass } from "@/lib/wardrobe/weather";

/**
 * A set's cover thumbnail. The landing loader overlays OFFICIAL publisher
 * art onto `image_url` and carries its copyright line in
 * `image_attribution`; a bare `PriceItem` has neither, so the field is
 * optional here.
 */
type SetThumb = PriceItem & { image_attribution?: string | null };

interface SetWithThumb extends SetItem {
  thumb: SetThumb | null;
}

/**
 * SetGrid — latest sets, each mounted like a print in a gallery.
 *
 * Quiet gallery: the card art is the only colour. The cover sits whole on
 * a subtle mount, hairline-framed, with the set's facts beneath it. When a
 * set has no cover on loan yet we show a calm placeholder — its code quiet
 * on the mount — never a bare empty frame. Where official art shows, its
 * copyright line hangs with it as a small wall label (the honesty rule).
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
    /* The landing's one honestly single-game corner wears its game's
       weather (spec 2026-07-07 §4) — it follows the gameSlug prop, so
       the sky changes with the shelf, and an all-games shelf would go
       bare. The lobby ground around it stays paper: the doors' three
       skies only read against blank ground. */
    <section className={`max-w-7xl mx-auto px-4 py-16 sm:py-20 ${weatherClass(gameSlug)}`}>
      <PlateHeader
        title={heading}
        kicker="new exhibition · 新展"
        plate={3}
        rule
        action={
          <Link
            href={`/market?game=${gameSlug}`}
            className="text-sm text-accent hover:text-accent-strong transition-colors whitespace-nowrap"
          >
            View all sets →
          </Link>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
        {sets.map((set, i) => (
          <Link
            key={set.code}
            href={`/market?game=${gameSlug}&set=${set.code}`}
            className="group wardrobe-mat rounded-lg overflow-hidden hover:bg-surface-subtle transition-colors"
          >
            <div className="relative aspect-[4/3] bg-surface-subtle">
              {set.thumb?.image_url ? (
                <Image
                  src={set.thumb.image_url}
                  alt={set.name}
                  fill
                  className="object-contain p-3"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              ) : (
                /* Calm placeholder — no cover on loan yet. Never a bare
                   empty frame: the set's code sits quiet on the mount. */
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xs tracking-wide text-ink-faint">
                    {set.code}
                  </span>
                </div>
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
              {/* Wall label — the cover art's copyright line, co-located
                  with the print, shown only when official art is. */}
              {set.thumb?.image_url && set.thumb.image_attribution && (
                <p className="mt-2 text-[10px] leading-tight text-ink-faint">
                  {set.thumb.image_attribution}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
