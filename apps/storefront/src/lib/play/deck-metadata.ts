// Deck metadata for legality checks — the three-source merge behind the
// public validate endpoint AND the refereed-room setup gate (CR 5-2-1-1:
// the deck presented at setup must meet the construction rules).
// Extracted from the validate route so both share one truth.

import { query } from "@/lib/db";
import { CARD_STATS } from "@/lib/play/card-stats";
import { enCardKeyFromParts } from "@/lib/cards/en-card-data";
import type { CardMetadata } from "@/lib/play/deck-legality";

/** Canonical card identity is the CARD NUMBER (CR 5-1-2-3 keys the copy
 *  limit on it). Accepts either a card number ("OP01-025") or a catalog
 *  sku ("OP-OP01-025-JP") and returns the number, or the input unchanged
 *  when it doesn't parse (the checker then reports it unknown). */
export function toCardNumber(id: string): string {
  const trimmed = id.trim();
  if (/^[A-Z]+\d*-\w+$/i.test(trimmed) && trimmed.split("-").length === 2) {
    return trimmed.toUpperCase();
  }
  const segs = trimmed.split("-");
  if (segs.length >= 3) {
    return `${segs[1]}-${segs[2]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

const COLOR_WORDS = new Set([
  "red", "green", "blue", "purple", "black", "yellow",
]);

function parseColors(raw: string | null | undefined): CardMetadata["colors"] {
  if (!raw) return [];
  return raw
    .split(/[/,&]/)
    .map((c) => c.trim().toLowerCase())
    .filter((c): c is CardMetadata["colors"][number] => COLOR_WORDS.has(c));
}

/**
 * Load card metadata for every card NUMBER mentioned in the declaration.
 *
 * Three sources, richest first — substrate-honest about what came from where:
 *   1. CARD_STATS (encoded starter corpus: category/colors/cost/counter/life,
 *      researched from the official cardlist).
 *   2. card_texts.attributes (bandai-en ingest: official structured facts).
 *   3. Catalog rarity heuristic (category only; colors stay unknown and the
 *      color check skips for that card).
 */
export async function loadCardMetadata(
  cardNumbers: Set<string>,
): Promise<{
  lookup: Map<string, CardMetadata>;
  colors_unknown_for: string[];
}> {
  if (cardNumbers.size === 0) {
    return { lookup: new Map(), colors_unknown_for: [] };
  }
  const ids = Array.from(cardNumbers);
  const lookup = new Map<string, CardMetadata>();

  // Source 3 groundwork: catalog rows for set_code + rarity heuristic.
  const r = await query(
    `SELECT DISTINCT ON (csc.card_number)
       csc.card_number,
       csc.rarity,
       cs.set_code
     FROM card_set_cards csc
     JOIN card_sets cs ON cs.set_code = csc.set_code
     WHERE csc.card_number = ANY($1::text[])`,
    [ids],
  );
  for (const row of r.rows) {
    const rarity = ((row.rarity as string | null) ?? "").toUpperCase();
    lookup.set(row.card_number as string, {
      card_id: row.card_number as string,
      category: rarity.split("/")[0] === "L" ? "leader" : "character",
      colors: [],
      set_code: row.set_code as string,
    });
  }

  // Source 2: official structured attributes from the bandai-en ingest.
  const keyToNumber = new Map<string, string>();
  for (const num of ids) {
    const m = num.match(/^([A-Z]+\d*)-(\w+)$/);
    if (m) keyToNumber.set(enCardKeyFromParts("op", m[1], m[2]), num);
  }
  if (keyToNumber.size > 0) {
    try {
      const t = await query(
        `SELECT sku, attributes FROM card_texts
          WHERE lang = 'en' AND attributes IS NOT NULL AND sku = ANY($1::text[])`,
        [Array.from(keyToNumber.keys())],
      );
      for (const row of t.rows) {
        const num = keyToNumber.get(row.sku as string);
        if (!num) continue;
        const attrs = row.attributes as {
          category?: string | null;
          cost?: string | null;
          counter?: string | null;
          color?: string | null;
        };
        const existing = lookup.get(num);
        const category =
          (attrs.category ?? "").toLowerCase() === "leader"
            ? "leader"
            : (attrs.category ?? "").toLowerCase() === "event"
              ? "event"
              : (attrs.category ?? "").toLowerCase() === "stage"
                ? "stage"
                : (existing?.category ?? "character");
        lookup.set(num, {
          card_id: num,
          category,
          colors: parseColors(attrs.color),
          set_code: existing?.set_code ?? num.split("-")[0],
          cost: attrs.cost != null ? Number(attrs.cost) || null : existing?.cost ?? null,
          counter:
            attrs.counter != null ? Number(attrs.counter) || null : existing?.counter ?? null,
        });
      }
    } catch {
      /* card_texts unavailable — sources 1 and 3 still apply */
    }
  }

  // Source 1: the encoded starter corpus wins where present.
  for (const num of ids) {
    const s = CARD_STATS[num];
    if (!s) continue;
    const existing = lookup.get(num);
    lookup.set(num, {
      card_id: num,
      category: s.category,
      colors: [s.color],
      set_code: existing?.set_code ?? num.split("-")[0],
      cost: s.cost,
      counter: s.counter,
      life: s.life ?? null,
    });
  }

  const colors_unknown_for = ids.filter(
    (num) => lookup.has(num) && lookup.get(num)!.colors.length === 0,
  );
  return { lookup, colors_unknown_for };
}



/** Enrich a submitted game deck with printed stats so the referee rules
 *  over REAL data — costs paid, powers compared, keywords live. Sources:
 *  the encoded starter corpus first (richest, includes keywords), then
 *  the official bandai-en attributes via the metadata merge. Cards
 *  outside both keep nulls and the engine degrades honestly. */
export function enrichDeckWithStats<
  T extends { cardNumber: string; isLeader?: boolean },
>(deck: T[], lookup: Map<string, CardMetadata>): (T & {
  category?: "leader" | "character" | "event" | "stage" | null;
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  color?: string | null;
  life?: number | null;
  keywords?: ("rush" | "blocker" | "double_attack" | "banish")[];
  hasTrigger?: boolean;
})[] {
  return deck.map((card) => {
    const num = toCardNumber(card.cardNumber);
    const s = CARD_STATS[num];
    if (s) {
      return {
        ...card,
        category: card.isLeader ? "leader" : s.category,
        cost: s.cost,
        power: s.power,
        counter: s.counter,
        color: s.color,
        life: s.life ?? null,
        keywords: s.keywords ?? [],
        hasTrigger: s.hasTrigger ?? false,
      };
    }
    const m = lookup.get(num);
    if (m) {
      return {
        ...card,
        category: card.isLeader ? "leader" : m.category,
        cost: m.cost ?? null,
        power: null,
        counter: m.counter ?? null,
        color: m.colors[0] ?? null,
        life: m.life ?? null,
      };
    }
    return card;
  });
}
