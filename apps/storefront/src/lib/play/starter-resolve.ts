// Server-side starter-deck resolution — card_number refs → wholesale
// catalog cards (SKU, name, image, rarity). Single source for
// /api/v1/play/starters/[id] (the read view) and /api/play/load-starter
// (the PvE/PvP-ready deck payload).

import { getStarterDeck, type StarterDeck } from "@/lib/play/starter-decks";
import { fetchPrices } from "@/lib/wholesale/client";
import { query } from "@/lib/db";

// Same CDN base the museum gallery uses (src/lib/cards/gallery.ts) — the
// card_images table stores s3 keys, not full URLs.
const CARD_IMAGE_CDN = (
  process.env.CTCG_CARD_IMAGE_CDN ||
  "https://ctcg-card-images.s3.us-east-1.amazonaws.com"
).replace(/\/$/, "");

/**
 * Artwork fallback: the wholesale catalog's image_url is sparse, but the
 * legal EN image collection (card_images, takedown-clear official samples —
 * see /legal/card-images) keys its skus on the same SET-NUMBER pair as a
 * card_number. Batch-resolve any cards the catalog couldn't illustrate.
 * Base prints beat parallels here — a play board wants the recognizable
 * face, not the rarest one. Failure degrades to no artwork, never an error.
 */
async function cardImageFallbacks(
  cardNumbers: string[],
): Promise<Map<string, string>> {
  if (cardNumbers.length === 0) return new Map();
  try {
    const { rows } = (await query(
      `SELECT split_part(sku, '-', 2) || '-' || split_part(sku, '-', 3) AS base,
              s3_key,
              regexp_replace(sku, '^.*-EN-', '') AS tail
         FROM card_images
        WHERE lang = 'en'
          AND kind = 'official_sample'
          AND takedown_status = 'clear'
          AND s3_key IS NOT NULL
          AND sku ~ '-EN-[A-Z0-9]+$'
          AND split_part(sku, '-', 2) || '-' || split_part(sku, '-', 3) = ANY($1)`,
      [cardNumbers],
    )) as { rows: { base: string; s3_key: string; tail: string }[] };

    const score = (tail: string): number => {
      if (/^R/.test(tail)) return 50; // base print
      const p = /^P(\d+)$/.exec(tail);
      if (p) return 20 - Number(p[1]); // among parallels, prefer P1
      return 0;
    };
    const best = new Map<string, { s3_key: string; tail: string }>();
    for (const r of rows) {
      const cur = best.get(r.base);
      if (!cur || score(r.tail) > score(cur.tail)) best.set(r.base, r);
    }
    return new Map(
      [...best].map(([base, r]) => [base, `${CARD_IMAGE_CDN}/${r.s3_key}`]),
    );
  } catch {
    return new Map();
  }
}

export interface ResolvedStarterCard {
  card_number: string;
  quantity: number;
  role: string | null;
  resolved: boolean;
  sku: string | null;
  name: string | null;
  image_url: string | null;
  rarity: string | null;
  set_code: string | null;
}

export interface ResolvedStarter {
  deck: StarterDeck;
  leader: ResolvedStarterCard;
  cards: ResolvedStarterCard[];
}

// Map card-number prefixes to wholesale catalog set codes. Most are
// 1:1 ("OP02" → "OP02"), but Bandai bundled the 2024 and 2025 starter
// cohorts into single catalog rows (ST15-20, ST23-28) — so ST15-001
// resolves via the bundled set, not a per-product ST15 row. Keeping
// this map explicit so a future starter addition doesn't silently 404.
const BUNDLED_SET_FOR: Record<string, string> = {
  ST15: "ST15-20", ST16: "ST15-20", ST17: "ST15-20",
  ST18: "ST15-20", ST19: "ST15-20", ST20: "ST15-20",
  ST23: "ST23-28", ST24: "ST23-28", ST25: "ST23-28",
  ST26: "ST23-28", ST27: "ST23-28", ST28: "ST23-28",
};

/** Resolve a starter's full card list against the wholesale catalog.
 *  Returns null when the starter id is unknown. Unresolvable cards come
 *  back with resolved:false rather than being dropped. */
export async function resolveStarter(id: string): Promise<ResolvedStarter | null> {
  const deck = getStarterDeck(id);
  if (!deck) return null;

  // Collect referenced card_numbers, derive their set prefixes, and
  // batch-fetch by set in parallel (fetchPrices supports a `set` filter
  // but not a card_number list). Three sets per starter typically.
  const allRefs = [
    { card_number: deck.leader_card_number, quantity: 1, role: "leader" as const },
    ...deck.card_list,
  ];
  const wanted = new Set(allRefs.map((r) => r.card_number));
  const setPrefixes = new Set<string>();
  for (const r of allRefs) {
    const m = r.card_number.match(/^([A-Z]+\d+)/);
    if (m) {
      const prefix = m[1];
      setPrefixes.add(BUNDLED_SET_FOR[prefix] ?? prefix);
    }
  }

  const setPages = await Promise.all(
    Array.from(setPrefixes).map((s) =>
      // game=one-piece is CORRECT here, not a residual hardcode: every
      // starter in @/lib/play/starter-decks is a One Piece product (the
      // play module implements OP's rules), so its card_numbers only
      // resolve within the one-piece catalog.
      fetchPrices({ game: "one-piece", set: s, limit: 300 }).catch(() => ({
        items: [],
        total: 0,
      })),
    ),
  );

  const byNumber = new Map<string, (typeof setPages)[number]["items"][number]>();
  for (const page of setPages) {
    for (const item of page.items) {
      if (item.card_number && wanted.has(item.card_number)) {
        // Prefer the first SKU we encounter — typically the cheapest /
        // most-stocked. If multiple language variants exist, the wholesale
        // sort returns a stable order.
        if (!byNumber.has(item.card_number)) {
          byNumber.set(item.card_number, item);
        }
      }
    }
  }

  const resolveCard = (ref: { card_number: string; quantity: number; role?: string }): ResolvedStarterCard => {
    const cat = byNumber.get(ref.card_number);
    if (!cat) {
      return {
        card_number: ref.card_number,
        quantity: ref.quantity,
        role: ref.role ?? null,
        resolved: false,
        sku: null,
        name: null,
        image_url: null,
        rarity: null,
        set_code: null,
      };
    }
    return {
      card_number: ref.card_number,
      quantity: ref.quantity,
      role: ref.role ?? null,
      resolved: true,
      sku: cat.sku,
      name: cat.name_en || cat.name || ref.card_number,
      image_url: cat.image_url ?? null,
      rarity: cat.rarity ?? null,
      set_code: cat.set_code ?? null,
    };
  };

  const leader = resolveCard({
    card_number: deck.leader_card_number,
    quantity: 1,
    role: "leader",
  });
  const cards = deck.card_list.map((c) => resolveCard(c));

  // Fill missing artwork from the legal EN image collection.
  const needingArt = [leader, ...cards]
    .filter((c) => !c.image_url)
    .map((c) => c.card_number);
  const artFallbacks = await cardImageFallbacks(needingArt);
  for (const c of [leader, ...cards]) {
    if (!c.image_url) c.image_url = artFallbacks.get(c.card_number) ?? null;
  }

  return { deck, leader, cards };
}
