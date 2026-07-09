/**
 * CardGrid — the catalog's browsing tile.
 *
 * Collectors-first (docs/decisions/2026-07-06-collectors-first.md):
 * the platform holds no stock and sells nothing, so the quick-add
 * button and house stock badges died with the shop. Each tile is a
 * doorway to the card's reference page; the price shown is the
 * labelled reference price, not an offer.
 */

import Link from "next/link";
import Image from "next/image";
import { type PriceItem, cardAltText } from "@/lib/wholesale/client";
import { formatRetailPrice } from "@/lib/pricing";

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "";
  if (r === "SR" || r === "SEC" || r === "SP" || r === "SCR" || r === "L" || r === "SEC/SP")
    cls = "bg-warning/15 text-warning border border-warning/30";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-[#6a5a8f]/15 text-[#6a5a8f] border border-[#6a5a8f]/30";
  else if (r === "UC")
    cls = "bg-info/15 text-info border border-info/30";
  else if (r === "C")
    cls = "bg-ink-faint/15 text-ink-muted border border-ink-faint/30";
  else return null;

  return (
    <span className={`absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${cls}`}>
      {rarity}
    </span>
  );
}

export default function CardGrid({ cards }: { cards: PriceItem[] }) {
  if (!cards.length) return <p className="text-ink-muted py-12 text-center">No cards found.</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-8">
      {cards.map((card) => (
        <Link
          key={card.sku}
          href={`/product/${card.sku}`}
          className="group bg-surface rounded-lg overflow-hidden hover:ring-2 ring-accent transition-all duration-200"
        >
          <div className="relative aspect-[3/4]">
            {card.image_url ? (
              <Image
                src={card.image_url}
                alt={cardAltText(card)}
                fill
                className="object-cover group-hover:scale-105 transition-all duration-200"
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
              />
            ) : (
              <div className="w-full h-full bg-surface-subtle" />
            )}

            {/* Rarity badge */}
            {rarityBadge(card.rarity)}
          </div>

          <div className="p-2">
            <p className="text-xs text-ink truncate leading-tight">
              {card.name_en || card.name || card.card_number}
            </p>
            <p className="text-[10px] text-ink-faint truncate">{card.card_number}</p>
            <p className="text-sm font-mono tabular-nums font-bold text-ink mt-0.5">{formatRetailPrice(card.price_gbp, card.channel_price)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
