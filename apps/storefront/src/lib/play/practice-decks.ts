// Bridge from the starter-deck catalog to a playable practice deck.
//
// The old path resolved every card against the wholesale catalog and
// silently DROPPED whatever didn't resolve — a starter could arrive at the
// board with 4 of its 51 cards and hit the "fewer than 10 cards" wall on a
// player's very first click. Practice decks are built from encoded data
// instead: every card always present, stats attached from CARD_STATS,
// artwork optional (the card face renders text when there's no image).

import { STARTER_DECKS, type StarterDeck } from "./starter-decks";
import { statsFor } from "./card-stats";
import type { PracticeSetupCard } from "@/lib/game/practice";

/** card_number → catalog artwork URL (null when the catalog has none). */
export type CardImageMap = Record<string, string | null>;

const IMAGE_FETCH_TIMEOUT_MS = 2500;

/**
 * Fetch artwork URLs for a starter's cards from the read-only starters API.
 * Best-effort enhancement: any failure (offline, starved dev catalog, slow
 * resolution) returns an empty map and the board plays on with text faces.
 * The timeout keeps "Start battle" snappy even when catalog resolution
 * is slow — art is never worth making a player wait for.
 */
export async function fetchStarterImages(starterId: string): Promise<CardImageMap> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    const res = await fetch(`/api/v1/play/starters/${starterId}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return {};
    const env = await res.json();
    const detail = env?.data;
    const map: CardImageMap = {};
    if (detail?.leader?.card_number) {
      map[detail.leader.card_number] = detail.leader.image_url ?? null;
    }
    for (const c of detail?.cards ?? []) {
      if (c?.card_number) map[c.card_number] = c.image_url ?? null;
    }
    return map;
  } catch {
    return {};
  }
}

function toSetupCard(
  cardNumber: string,
  isLeader: boolean,
  images: CardImageMap,
): PracticeSetupCard {
  const stats = statsFor(cardNumber);
  return {
    sku: cardNumber, // practice cards live outside the catalog; number is identity
    name: stats?.name ?? cardNumber,
    cardNumber,
    imageUrl: images[cardNumber] ?? null,
    rarity: null,
    category: stats?.category ?? (isLeader ? "leader" : null),
    cost: stats?.cost ?? null,
    power: stats?.power ?? null,
    counter: stats?.counter ?? null,
    color: stats?.color ?? null,
    life: stats?.life ?? null,
    isLeader,
  };
}

/** Expand a starter into the full card list a practice game consumes.
 *  Returns null only when the starter id is unknown. */
export function buildPracticeDeck(
  starterId: string,
  images: CardImageMap = {},
): {
  deck: PracticeSetupCard[];
  starter: StarterDeck;
} | null {
  const starter = STARTER_DECKS.find((s) => s.id === starterId);
  if (!starter) return null;

  const deck: PracticeSetupCard[] = [
    toSetupCard(starter.leader_card_number, true, images),
  ];
  for (const ref of starter.card_list) {
    for (let i = 0; i < ref.quantity; i++) {
      deck.push(toSetupCard(ref.card_number, false, images));
    }
  }
  return { deck, starter };
}

/** Starters offered on practice surfaces: only decks with a full encoded
 *  official list (50 main-deck cards). Partial "minimal playable" stubs
 *  (some tier-2 decks) stay off the practice picker — a 12-card deck
 *  decks out in two turns and teaches nothing. */
export function practiceStarters(): StarterDeck[] {
  return STARTER_DECKS.filter(
    (s) => s.card_list.reduce((n, c) => n + c.quantity, 0) >= 50,
  );
}
