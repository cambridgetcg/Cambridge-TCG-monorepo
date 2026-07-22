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

/** card_number → verbatim EN effect text + its mandatory copyright line. */
export type CardTextMap = Record<string, { text: string; attribution: string }>;

export interface StarterCardDetails {
  images: CardImageMap;
  texts: CardTextMap;
  /** card_number → illustrator credit, where the catalogue names one. */
  artists: Record<string, string | null>;
}

const DETAILS_FETCH_TIMEOUT_MS = 2500;

/**
 * Fetch artwork URLs + EN effect text for a starter's cards from the
 * read-only starters API. Best-effort enhancement: any failure (offline,
 * starved dev catalog, slow resolution) returns empty maps and the board
 * plays on with text faces and no card text. The timeout keeps "Start
 * battle" snappy — detail is never worth making a player wait for.
 */
export async function fetchStarterCardDetails(
  starterId: string,
): Promise<StarterCardDetails> {
  const empty: StarterCardDetails = { images: {}, texts: {}, artists: {} };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DETAILS_FETCH_TIMEOUT_MS);
    const res = await fetch(`/api/v1/play/starters/${starterId}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return empty;
    const env = await res.json();
    const detail = env?.data;
    const images: CardImageMap = {};
    const texts: CardTextMap = {};
    const artists: Record<string, string | null> = {};
    const take = (c: {
      card_number?: string;
      image_url?: string | null;
      effect_text?: string | null;
      text_attribution?: string | null;
      artist?: string | null;
    }) => {
      if (!c?.card_number) return;
      images[c.card_number] = c.image_url ?? null;
      artists[c.card_number] = c.artist ?? null;
      if (c.effect_text && c.text_attribution) {
        texts[c.card_number] = {
          text: c.effect_text,
          attribution: c.text_attribution,
        };
      }
    };
    if (detail?.leader) take(detail.leader);
    for (const c of detail?.cards ?? []) take(c);
    return { images, texts, artists };
  } catch {
    return empty;
  }
}

function toSetupCard(
  cardNumber: string,
  isLeader: boolean,
  details: StarterCardDetails,
): PracticeSetupCard {
  const stats = statsFor(cardNumber);
  const text = details.texts[cardNumber];
  return {
    sku: cardNumber, // practice cards live outside the catalog; number is identity
    name: stats?.name ?? cardNumber,
    cardNumber,
    imageUrl: details.images[cardNumber] ?? null,
    textEn: text?.text ?? null,
    textAttribution: text?.attribution ?? null,
    artist: details.artists[cardNumber] ?? null,
    keywords: stats?.keywords ?? [],
    hasTrigger: stats?.hasTrigger ?? false,
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
  details: StarterCardDetails = { images: {}, texts: {}, artists: {} },
): {
  deck: PracticeSetupCard[];
  starter: StarterDeck;
} | null {
  const starter = STARTER_DECKS.find((s) => s.id === starterId);
  if (!starter) return null;

  const deck: PracticeSetupCard[] = [
    toSetupCard(starter.leader_card_number, true, details),
  ];
  for (const ref of starter.card_list) {
    for (let i = 0; i < ref.quantity; i++) {
      deck.push(toSetupCard(ref.card_number, false, details));
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
