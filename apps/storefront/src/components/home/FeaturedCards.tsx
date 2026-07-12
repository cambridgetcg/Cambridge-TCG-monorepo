import Link from "next/link";
import Image from "next/image";
import { type PriceItem, cardAltText } from "@/lib/wholesale/client";
import { PlateHeader } from "@/lib/ui";

/**
 * FeaturedCards — structural catalog rows selected without price ordering.
 * Hairline mounts around rights-approved card images when available. No rings, no
 * zoom — the card is enough (quiet gallery, prefers-reduced-motion
 * friendly). Each row links to its market page; legacy values stay withheld.
 */
export default function FeaturedCards({ cards }: { cards: PriceItem[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-14">
      <PlateHeader
        title="Featured Cards"
        plate={4}
        rule
        action={<span className="font-mono text-xs text-ink-faint">structural catalog</span>}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                />
              )}
            </div>
            <div className="p-2 border-t border-border-subtle">
              <p className="text-xs text-ink-faint font-mono truncate">{card.card_number}</p>
              <p className="text-sm font-semibold text-ink font-mono tabular-nums">
                Legacy value withheld
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
