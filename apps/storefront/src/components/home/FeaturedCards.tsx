import { formatRetailPrice } from "@/lib/pricing";
import Link from "next/link";
import Image from "next/image";
import { type PriceItem, cardAltText } from "@/lib/wholesale/client";

/**
 * FeaturedCards — gallery mats: the card framed on a white mount, mono
 * price beneath. A missing image renders an empty mat with the card
 * number, never broken chrome.
 */
export default function FeaturedCards({ cards }: { cards: PriceItem[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint mb-4">
        From the shop floor
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cards.map(card => (
          <Link key={card.sku} href={`/product/${card.sku}`}
            className="group wardrobe-mat rounded-xl overflow-hidden transition hover:-translate-y-1">
            <div className="relative aspect-[3/4] bg-surface-subtle">
              {card.image_url ? (
                <Image src={card.image_url} alt={cardAltText(card)}
                  fill className="object-cover group-hover:scale-105 transition duration-300" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xs text-ink-faint">{card.card_number}</span>
                </div>
              )}
            </div>
            <div className="p-2">
              <p className="font-mono text-xs text-ink-faint truncate">{card.card_number}</p>
              <p className="font-mono tabular-nums text-sm font-bold text-ink">{formatRetailPrice(card.price_gbp, card.channel_price)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
