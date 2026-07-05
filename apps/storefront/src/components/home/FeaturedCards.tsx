import { formatRetailPrice } from "@/lib/pricing";
import Link from "next/link";
import Image from "next/image";
import { type PriceItem, cardAltText } from "@/lib/wholesale/client";

/**
 * FeaturedCards — the gallery's actual art. Hairline mounts around real
 * card images; number + price in mono beneath. No rings, no zoom — the
 * card is enough (quiet gallery, prefers-reduced-motion friendly).
 */
export default function FeaturedCards({ cards }: { cards: PriceItem[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-14">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink mb-8">
        Featured Cards
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cards.map(card => (
          <Link key={card.sku} href={`/product/${card.sku}`}
            className="group wardrobe-mat rounded-lg overflow-hidden hover:bg-surface-subtle transition-colors">
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
                {formatRetailPrice(card.price_gbp, card.channel_price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
