import Link from "next/link";
import Image from "next/image";
import { type PriceItem, cardAltText, cardName } from "@/lib/wholesale/client";
import { PlateHeader } from "@/lib/ui";

/**
 * The card now arrives with its OFFICIAL publisher art in `image_url`
 * (the landing loader overlays it from `card_images`) and the copyright
 * line in `image_attribution`. The wholesale client withholds art, so a
 * bare `PriceItem` has neither — this optional shape is what the enriched
 * page hands us.
 */
type FeaturedCard = PriceItem & { image_attribution?: string | null };

/**
 * FeaturedCards — a wall of prints in a quiet gallery.
 *
 * Each card hangs whole on a subtle mount (no rings, no zoom — the art is
 * enough; prefers-reduced-motion friendly) under a museum wall label: the
 * accession mark, the work's name, its shelf, and — always, whenever we
 * are showing official art — its copyright line. An image never shows
 * without its attribution (the honesty rule). Selected structurally, not
 * ranked by price: the label names the card, it does not quote it.
 */
export default function FeaturedCards({ cards }: { cards: FeaturedCard[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16 sm:py-20">
      <PlateHeader
        title="Featured Cards"
        kicker="from the collection · 館藏"
        plate={4}
        rule
        action={<span className="font-mono text-xs text-ink-faint">selected · not priced</span>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-10">
        {cards.map(card => (
          <Link key={card.sku} href={`/market/${card.sku}`}
            className="group wardrobe-panel overflow-hidden hover:bg-surface-subtle transition-colors">
            <div className="relative aspect-[3/4] bg-surface-subtle">
              {card.image_url && (
                <Image
                  src={card.image_url}
                  alt={cardAltText(card)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                />
              )}
            </div>
            {/* The wall label. Accession mark, then the work's name, then
                its shelf — a label, not a price. The copyright line sits
                co-located with the art, shown only when official art is. */}
            <div className="p-3 border-t border-border-subtle">
              <p className="font-mono text-[10px] tracking-wide text-ink-faint">{card.card_number}</p>
              <p className="mt-1 font-display text-sm leading-snug text-ink line-clamp-2">
                {cardName(card)}
              </p>
              {card.set_name && (
                <p className="mt-0.5 text-xs text-ink-muted line-clamp-1">{card.set_name}</p>
              )}
              {card.image_url && card.image_attribution && (
                <p className="mt-2 text-[10px] leading-tight text-ink-faint">
                  {card.image_attribution}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
