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

function toSetupCard(
  cardNumber: string,
  isLeader: boolean,
): PracticeSetupCard {
  const stats = statsFor(cardNumber);
  return {
    sku: cardNumber, // practice cards live outside the catalog; number is identity
    name: stats?.name ?? cardNumber,
    cardNumber,
    imageUrl: null,
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
export function buildPracticeDeck(starterId: string): {
  deck: PracticeSetupCard[];
  starter: StarterDeck;
} | null {
  const starter = STARTER_DECKS.find((s) => s.id === starterId);
  if (!starter) return null;

  const deck: PracticeSetupCard[] = [
    toSetupCard(starter.leader_card_number, true),
  ];
  for (const ref of starter.card_list) {
    for (let i = 0; i < ref.quantity; i++) {
      deck.push(toSetupCard(ref.card_number, false));
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
