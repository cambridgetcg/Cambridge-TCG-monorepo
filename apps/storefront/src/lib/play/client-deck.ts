// Client-side deck helpers shared by the play surfaces (hub, adventure,
// multiplayer room). One definition of:
//   - the localStorage SavedDeck shape (deck-builder's output)
//   - SavedDeck → flat PvE/PvP card-list conversion
// Starter auto-mounting is paused until the source decklist and resolved card
// metadata have affirmative public lineage.

export const DECKS_STORAGE_KEY = "ctcg-deck-builder-decks";

export interface SavedDeckCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
}

export interface SavedDeck {
  name: string;
  leader: SavedDeckCard | null;
  entries: { sku: string; quantity: number; card: SavedDeckCard }[];
  savedAt: string;
}

export interface GameDeckCard {
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  isLeader?: boolean;
}

/** Read the deck-builder's saved decks from localStorage. */
export function loadSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(DECKS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

/** Flatten a SavedDeck into the card list the game APIs accept. */
export function deckToCards(deck: SavedDeck): GameDeckCard[] {
  const cards: GameDeckCard[] = [];
  if (deck.leader) {
    cards.push({
      sku: deck.leader.sku,
      name: deck.leader.name,
      cardNumber: deck.leader.card_number,
      imageUrl: deck.leader.image_url,
      rarity: deck.leader.rarity,
      isLeader: true,
    });
  }
  for (const entry of deck.entries) {
    for (let i = 0; i < entry.quantity; i++) {
      cards.push({
        sku: entry.card.sku,
        name: entry.card.name,
        cardNumber: entry.card.card_number,
        imageUrl: entry.card.image_url,
        rarity: entry.card.rarity,
      });
    }
  }
  return cards;
}

/** Compatibility seam for callers while starter resolution is paused.
 *  Performs no fetch and exposes no starter identity or catalog membership. */
export async function fetchStarterAsSavedDeck(
  _starterId?: string,
): Promise<SavedDeck | null> {
  return null;
}
