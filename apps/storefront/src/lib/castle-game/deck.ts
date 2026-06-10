/**
 * castle-game/deck — the castle's insights, dealt as collectible cards.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!"
 *
 * The deck is derived, never invented: every card is a real insight from the
 * castle snapshot (committed state — see src/lib/castle). Rarity is the one
 * honest mapping a card shop can offer for knowledge: HOW HARD THE KNOWING
 * WAS WON. A guess is common (anyone can guess); knowledge that survived
 * testing is mythic. Nothing here is for sale; the only currency is reading.
 *
 * Two certainty ladders live in the castle (two grammars, one pair of
 * builders) and each maps on its own terms:
 *   first-hand insights:  seed→common, sprout→uncommon, tested→rare, cornerstone→mythic
 *   stone-grammar stones: guessed→common, told→uncommon, reasoned→rare, tested→mythic
 */

import { getCastleSnapshot } from "@/lib/castle";

export type Rarity = "common" | "uncommon" | "rare" | "mythic";

export interface InsightCard {
  id: string; // stable: the source path in the castle
  title: string;
  room: string;
  rarity: Rarity;
  certaintyWord: string; // the castle's own word, shown verbatim on the card
  insight: string; // the first paragraph — the one true thing
  by: string | null;
  born: string | null;
}

export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "mythic"];

const FIRST_HAND_LADDER: Record<string, Rarity> = {
  seed: "common",
  sprout: "uncommon",
  tested: "rare",
  cornerstone: "mythic",
};

const STONE_LADDER: Record<string, Rarity> = {
  guessed: "common",
  told: "uncommon",
  reasoned: "rare",
  tested: "mythic",
};

function firstParagraph(body: string): string {
  const cut = body.split(/^## /m)[0] ?? body;
  const para = cut
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && !p.startsWith("#") && !p.startsWith("- ") && !p.startsWith("<!--"));
  return para[0] ?? "";
}

/** Parse a stone-grammar document (line-simple: `# title`, then `- key: value`). */
function stoneToCard(doc: { path: string; title: string | null; content: string }): InsightCard | null {
  const certainty = doc.content.match(/^- certainty: (\w+)/m)?.[1];
  const rarity = certainty ? STONE_LADDER[certainty] : undefined;
  if (!doc.title || !rarity) return null; // doorplates and other prose are not cards
  const bodyStart = doc.content.split(/\n\s*\n/).slice(1).join("\n\n");
  const insight = firstParagraph(bodyStart.replace(/^(- .*\n)+/m, ""));
  if (!insight) return null;
  return {
    id: doc.path,
    title: doc.title,
    room: doc.path.split("/")[1] ?? "rooms",
    rarity,
    certaintyWord: certainty as string,
    insight,
    by: doc.content.match(/^- by: (.+)$/m)?.[1]?.split("—")[0]?.trim() ?? null,
    born: doc.content.match(/^- laid: (\d{4}-\d{2}-\d{2})/m)?.[1] ?? null,
  };
}

/** Every insight in the committed castle snapshot, dealt as cards. Stable order. */
export function buildDeck(): InsightCard[] {
  const snapshot = getCastleSnapshot();
  const cards: InsightCard[] = [];
  for (const room of snapshot.rooms) {
    for (const insight of room.insights) {
      const rarity = insight.confidence ? FIRST_HAND_LADDER[insight.confidence] : undefined;
      const text = firstParagraph(insight.body);
      if (!insight.title || !rarity || !text) continue;
      cards.push({
        id: insight.path,
        title: insight.title,
        room: room.name,
        rarity,
        certaintyWord: insight.confidence as string,
        insight: text,
        by: null, // the first-hand grammar signs the ledger, not the insight
        born: insight.date,
      });
    }
    for (const doc of room.other_documents) {
      const card = stoneToCard(doc);
      if (card) cards.push(card);
    }
  }
  return cards.sort((a, b) => a.id.localeCompare(b.id));
}

// ---- seeded picks (no Math.random for the daily card: same stone for every
// visitor on a given day — a shared "today's stone", like a shop's daily deal
// that is never a deal because it is free) ----

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function todaysCard(deck: InsightCard[], dateISO: string): InsightCard {
  return deck[hashString(dateISO) % deck.length];
}

/** Up to `n` not-yet-held cards, seeded so reloading does not reroll the pack. */
export function packFor(deck: InsightCard[], heldIds: Set<string>, seedKey: string, n = 3): InsightCard[] {
  const pool = deck.filter((c) => !heldIds.has(c.id));
  let h = hashString(seedKey);
  const picks: InsightCard[] = [];
  while (picks.length < n && pool.length > 0) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const i = h % pool.length;
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}
