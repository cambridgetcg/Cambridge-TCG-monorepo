import type { DeckCardSnapshot, DeckEntry } from "./db";

export type PublicDeckCardSnapshot = Omit<
  DeckCardSnapshot,
  "image_url" | "spot_price"
> & {
  image_url: null;
  spot_price: null;
};

export type PublicDeckEntry = Omit<DeckEntry, "card"> & {
  card: PublicDeckCardSnapshot;
};

/** A public deck publishes the player's arrangement, not legacy catalog media or prices. */
export function toPublicDeckCardSnapshot(
  card: DeckCardSnapshot,
): PublicDeckCardSnapshot {
  return {
    sku: card.sku,
    card_number: card.card_number,
    name: card.name,
    set_code: card.set_code,
    set_name: card.set_name,
    rarity: card.rarity,
    image_url: null,
    spot_price: null,
  };
}

export function toPublicDeckEntry(entry: DeckEntry): PublicDeckEntry {
  return {
    sku: entry.sku,
    quantity: entry.quantity,
    card: toPublicDeckCardSnapshot(entry.card),
  };
}
