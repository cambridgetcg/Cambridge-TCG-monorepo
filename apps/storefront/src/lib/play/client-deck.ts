// Client-side deck helpers shared by the play surfaces (hub, adventure,
// multiplayer room). One definition of:
//   - the localStorage SavedDeck shape (deck-builder's output)
//   - SavedDeck → flat PvE/PvP card-list conversion
//   - the auto-mounted default starter (Yu 2026-05-14: "MINIMUM BARRIERS,
//     MAXIMUM FUNNNNNN!!!" — a deckless visitor should never hit a
//     "build your first deck" wall; they get ST-15 Red Whitebeard).

export const DECKS_STORAGE_KEY = "ctcg-deck-builder-decks";
export const DEFAULT_STARTER_ID = "st-15-red-newgate";

export interface SavedDeckCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
  tradein_credit: number | null;
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

/** Fetch the default rookie starter resolved against the catalog and shape
 *  it as a SavedDeck. Returns null when the starter can't be resolved
 *  (offline, leader unresolved) — callers fall back to their empty state. */
export async function fetchStarterAsSavedDeck(
  starterId: string = DEFAULT_STARTER_ID,
): Promise<SavedDeck | null> {
  try {
    const res = await fetch(`/api/v1/play/starters/${starterId}`);
    if (!res.ok) return null;
    const env = await res.json();
    const detail = env?.data;
    if (!detail || !detail.leader?.resolved) return null;

    const leaderCard: SavedDeckCard = {
      sku: detail.leader.sku,
      card_number: detail.leader.card_number,
      name: detail.leader.name,
      set_code: detail.leader.set_code ?? "",
      set_name: "",
      rarity: detail.leader.rarity,
      image_url: detail.leader.image_url,
      spot_price: 0,
      tradein_credit: null,
    };

    type CardRef = {
      sku: string | null;
      card_number: string;
      name: string | null;
      set_code: string | null;
      rarity: string | null;
      image_url: string | null;
      quantity: number;
      resolved: boolean;
    };
    const entries = (detail.cards as CardRef[])
      .filter((c) => c.resolved && c.sku)
      .map((c) => ({
        sku: c.sku as string,
        quantity: c.quantity,
        card: {
          sku: c.sku as string,
          card_number: c.card_number,
          name: c.name ?? c.card_number,
          set_code: c.set_code ?? "",
          set_name: "",
          rarity: c.rarity,
          image_url: c.image_url,
          spot_price: 0,
          tradein_credit: null,
        } satisfies SavedDeckCard,
      }));

    return {
      name: `${detail.display_name} (starter)`,
      leader: leaderCard,
      entries,
      savedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
