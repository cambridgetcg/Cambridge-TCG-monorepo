import Link from "next/link";
import Image from "next/image";
import { formatRetailPrice } from "@/lib/pricing";
import { type PriceItem, cardAltText } from "@/lib/wholesale/client";

/**
 * CardFan — three real in-stock cards fanned at -6°/0°/+6°, framed on
 * mats. The card is the art; the fan answers the wardrobe audit's "the
 * cards are missing." A missing image renders an empty mat with the
 * card number — a failed fetch never renders broken chrome.
 */
const TILT = ["-rotate-6", "rotate-0", "rotate-6"] as const;

export default function CardFan({ cards }: { cards: PriceItem[] }) {
  const fan = cards.slice(0, 3);
  if (fan.length === 0) return null;
  return (
    <div className="flex justify-center items-end gap-0 py-6" aria-label="Featured cards from the shop">
      {fan.map((card, i) => (
        <Link
          key={card.sku}
          href={`/product/${card.sku}`}
          className={`group relative w-36 sm:w-44 ${TILT[i] ?? "rotate-0"} ${
            i === 1 ? "z-10 -mx-4 sm:-mx-2" : "z-0"
          } transition-transform duration-300 hover:-translate-y-2 hover:rotate-0`}
        >
          <div className="wardrobe-mat rounded-xl p-2">
            <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-surface-subtle">
              {card.image_url ? (
                <Image
                  src={card.image_url}
                  alt={cardAltText(card)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 144px, 176px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xs text-ink-faint">{card.card_number}</span>
                </div>
              )}
            </div>
            <div className="px-1 pt-2 pb-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-[11px] text-ink-faint truncate">{card.card_number}</span>
              <span className="font-mono tabular-nums text-sm font-semibold text-ink">
                {formatRetailPrice(card.price_gbp, card.channel_price)}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
