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
import { isCardNumberImageReference, type CardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import { catalogImageUrl, officialImageUrl } from "@/lib/cards/image-publication";

/** card_number → catalog artwork URL (null when the catalog has none). */
export type CardImageMap = Record<string, string | null>;

/** card_number → verbatim EN effect text + its mandatory copyright line. */
export type CardTextMap = Record<string, { text: string; attribution: string }>;

export interface StarterCardDetails {
  images: CardImageMap;
  imageAttributions?: Record<string, string | null>;
  imageReferences?: Record<string, CardNumberImageReference | null>;
  texts: CardTextMap;
  /** card_number → illustrator credit, where the catalogue names one. */
  artists: Record<string, string | null>;
}

export const DETAILS_FETCH_TIMEOUT_MS = 2500;
export const DETAILS_MAX_RESPONSE_BYTES = 256 * 1024;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Official artwork requires its complete credit/reference unit. The existing
 * catalogue fallback remains separate and gains no official metadata. */
export function projectStarterImage(cardNumber: string, url: unknown, attribution: unknown, reference: unknown) {
  if (attribution == null && reference == null) {
    const fallback = catalogImageUrl(url);
    return fallback ? { url: fallback, attribution: null, reference: null } : null;
  }
  if (typeof url !== "string" || typeof attribution !== "string" || !attribution.trim()
    || !isCardNumberImageReference(reference) || reference.requested_card_number !== cardNumber) return null;
  try {
    const parsed = new URL(url);
    if (officialImageUrl(parsed.pathname.slice(1), parsed.origin) !== url) return null;
    return { url, attribution, reference };
  } catch { return null; }
}

/** Shared browser/server projection of resolved starter cards. Unknown or old
 * payloads may supply text, but cannot supply unattributed practice artwork. */
export function projectStarterCardDetails(value: unknown): StarterCardDetails {
  const details: StarterCardDetails = { images: {}, imageAttributions: {}, imageReferences: {}, texts: {}, artists: {} };
  const input = record(value);
  if (!input || !Array.isArray(input.cards) || input.cards.length > 128) return details;
  for (const value of [input.leader, ...input.cards]) {
    const card = record(value);
    if (!card || typeof card.card_number !== "string" || !/^[a-z0-9]{1,16}-[a-z0-9]{1,16}$/i.test(card.card_number)) continue;
    const number = card.card_number;
    const image = projectStarterImage(number, card.image_url, card.image_attribution, card.image_reference);
    details.images[number] = image?.url ?? null;
    details.imageAttributions![number] = image?.attribution ?? null;
    details.imageReferences![number] = image?.reference ?? null;
    details.artists[number] = typeof card.artist === "string" && card.artist.trim() ? card.artist : null;
    if (typeof card.effect_text === "string" && card.effect_text.trim()
      && typeof card.text_attribution === "string" && card.text_attribution.trim()) {
      details.texts[number] = { text: card.effect_text, attribution: card.text_attribution };
    }
  }
  return details;
}

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
  const empty = projectStarterCardDetails(null);
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<StarterCardDetails>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        void reader?.cancel().catch(() => {});
        resolve(empty);
      }, DETAILS_FETCH_TIMEOUT_MS);
    });
    const load = async (): Promise<StarterCardDetails> => {
      const res = await fetch(`/api/v1/play/starters/${encodeURIComponent(starterId)}`, {
        signal: controller.signal, cache: "no-store",
      });
      if (controller.signal.aborted || !res.ok || !res.body
        || Number(res.headers.get("content-length")) > DETAILS_MAX_RESPONSE_BYTES) {
        void res.body?.cancel().catch(() => {});
        return empty;
      }
      reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let size = 0;
      let text = "";
      try {
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > DETAILS_MAX_RESPONSE_BYTES) return empty;
          text += decoder.decode(chunk.value, { stream: true });
        }
        if (controller.signal.aborted) return empty;
        text += decoder.decode();
        return projectStarterCardDetails(record(JSON.parse(text))?.data);
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
        reader = undefined;
      }
    };
    return await Promise.race([load(), deadline]);
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => {});
  }
}

function toSetupCard(
  cardNumber: string,
  isLeader: boolean,
  details: StarterCardDetails,
): PracticeSetupCard {
  const stats = statsFor(cardNumber);
  const text = details.texts[cardNumber];
  const image = projectStarterImage(cardNumber, details.images[cardNumber], details.imageAttributions?.[cardNumber], details.imageReferences?.[cardNumber]);
  return {
    sku: cardNumber, // practice cards live outside the catalog; number is identity
    name: stats?.name ?? cardNumber,
    cardNumber,
    imageUrl: image?.url ?? null,
    imageAttribution: image?.attribution ?? null,
    imageReference: image?.reference ?? null,
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
