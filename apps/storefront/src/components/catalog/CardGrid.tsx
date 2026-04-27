import Link from "next/link";
import Image from "next/image";
import type { PriceItem } from "@/lib/wholesale/client";
import { formatRetailPrice, retailPrice } from "@/lib/pricing";
import QuickAddButton from "./QuickAddButton";

function rarityBadge(rarity: string | null) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "";
  if (r === "SR" || r === "SEC" || r === "SP" || r === "SCR" || r === "L" || r === "SEC/SP")
    cls = "bg-yellow-500/20 text-yellow-400";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-purple-500/20 text-purple-400";
  else if (r === "UC")
    cls = "bg-blue-500/20 text-blue-400";
  else if (r === "C")
    cls = "bg-neutral-700 text-neutral-400";
  else return null;

  return (
    <span className={`absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${cls}`}>
      {rarity}
    </span>
  );
}

export default function CardGrid({ cards }: { cards: PriceItem[] }) {
  if (!cards.length) return <p className="text-neutral-400 py-12 text-center">No cards found.</p>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-8">
      {cards.map((card) => (
        <Link
          key={card.sku}
          href={`/product/${card.sku}`}
          className="group bg-neutral-900 rounded-xl overflow-hidden hover:ring-2 ring-emerald-500 transition-all duration-200"
        >
          <div className="relative aspect-[3/4]">
            {card.image_url ? (
              <Image
                src={card.image_url}
                alt={card.name_en || card.name || ""}
                fill
                className={`object-cover group-hover:scale-105 transition-all duration-200 ${card.stock === 0 ? "opacity-50 grayscale" : ""}`}
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
              />
            ) : (
              <div className={`w-full h-full bg-neutral-800 ${card.stock === 0 ? "opacity-50" : ""}`} />
            )}

            {/* Rarity badge */}
            {rarityBadge(card.rarity)}

            {/* Out of stock overlay */}
            {card.stock === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/40">
                <span className="px-3 py-1 bg-neutral-900/90 text-neutral-400 text-xs font-bold rounded-full">
                  Out of Stock
                </span>
              </div>
            )}

            {/* Low stock badge */}
            {card.stock > 0 && card.stock <= 5 && (
              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full">
                Only {card.stock} left
              </span>
            )}

            {/* Quick-add button (hover) */}
            {card.stock > 0 && (
              <QuickAddButton
                card={{
                  sku: card.sku,
                  name: card.name_en || card.name || card.card_number,
                  price: retailPrice(card.price_gbp, card.channel_price),
                  image_url: card.image_url,
                  set_code: card.set_code,
                  card_number: card.card_number,
                }}
                stock={card.stock}
              />
            )}
          </div>

          <div className="p-2">
            <p className="text-xs text-white truncate leading-tight">
              {card.name_en || card.name || card.card_number}
            </p>
            <p className="text-[10px] text-neutral-500 truncate">{card.card_number}</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">{formatRetailPrice(card.price_gbp, card.channel_price)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
