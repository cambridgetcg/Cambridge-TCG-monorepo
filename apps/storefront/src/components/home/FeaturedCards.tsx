import { formatRetailPrice } from "@/lib/pricing";
import Link from "next/link";
import Image from "next/image";
import type { PriceItem } from "@/lib/wholesale/client";

export default function FeaturedCards({ cards }: { cards: PriceItem[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <h2 className="text-2xl font-bold mb-8">Featured Cards</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cards.map(card => (
          <Link key={card.sku} href={`/product/${card.sku}`}
            className="group bg-neutral-900 rounded-xl overflow-hidden hover:ring-2 ring-emerald-500 transition">
            <div className="relative aspect-[3/4] bg-neutral-800">
              {card.image_url && (
                <Image src={card.image_url} alt={card.name_en || card.name || card.card_number}
                  fill className="object-cover group-hover:scale-105 transition duration-300" />
              )}
            </div>
            <div className="p-2">
              <p className="text-xs text-neutral-400 truncate">{card.card_number}</p>
              <p className="text-sm font-bold text-emerald-400">{formatRetailPrice(card.price_gbp, card.channel_price)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
