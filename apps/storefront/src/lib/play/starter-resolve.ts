// Server-side starter-deck resolution — card_number refs → wholesale
// catalog cards (SKU, name, image, rarity). Single source for
// /api/v1/play/starters/[id] (the read view) and /api/play/load-starter
// (the PvE/PvP-ready deck payload).

import { getStarterDeck, type StarterDeck } from "@/lib/play/starter-decks";
import { fetchPrices } from "@/lib/wholesale/client";
import { query } from "@/lib/db";
import { SQL_ILLUST_PATTERN } from "@/lib/cards/illust-annotation";
import { GAMES, skuIdentity } from "@cambridge-tcg/sku";
import { englishCardNumberKey, type CardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import {
  catalogImageUrl, DEFAULT_CARD_IMAGE_CDN, officialMediaProvenance,
  projectOfficialCardNumberImage, type OfficialCardNumberImage, type StoredOfficialImage,
} from "@/lib/cards/image-publication";

/**
 * A practice deck asks for card numbers, not a printing. Keep the selected
 * English image's full key, including reprint/parallel markers. Shared source
 * checks apply before selection; unavailable art never blocks a full deck.
 */
async function cardImageFallbacks(
  cardNumbers: string[],
): Promise<Map<string, OfficialCardNumberImage>> {
  const valid = cardNumbers.filter((number) => englishCardNumberKey("op", number));
  if (valid.length === 0) return new Map();
  try {
    const { rows } = await query(
      `SELECT sku, lang, source, kind, takedown_status, s3_key, attribution, source_url, retrieved_at
         FROM card_images
        WHERE lang = 'en' AND source = 'bandai-en'
          AND upper(split_part(sku, '-', 1)) = 'OP'
          AND kind = 'official_sample'
          AND takedown_status = 'clear'
          AND s3_key IS NOT NULL
          AND upper(split_part(sku, '-', 2) || '-' || split_part(sku, '-', 3)) = ANY($1)`,
      [[...new Set(valid.map((number) => number.toUpperCase()))]],
    );
    const cdn = process.env.CTCG_CARD_IMAGE_CDN || DEFAULT_CARD_IMAGE_CDN;
    const rank = (image: OfficialCardNumberImage): [number, number] => {
      const variant = skuIdentity(image.reference.depicted_sku)!.variant;
      // A reprint is not a base print. Ordering is a display preference only.
      return !variant ? [0, 0] : [variant.startsWith("r") ? 1 : 2, Number(variant.slice(1))];
    };
    const out = new Map<string, OfficialCardNumberImage>();
    for (const number of valid) {
      const candidates = (rows as StoredOfficialImage[])
        .map((row) => projectOfficialCardNumberImage("op", number, row, cdn))
        .filter((image): image is OfficialCardNumberImage => image !== null)
        .sort((a, b) => {
          const ar = rank(a), br = rank(b);
          return ar[0] - br[0] || ar[1] - br[1]
            || Date.parse(b.retrieved_at) - Date.parse(a.retrieved_at)
            || a.reference.depicted_sku.localeCompare(b.reference.depicted_sku)
            || a.url.localeCompare(b.url);
        });
      if (candidates[0]) out.set(number, candidates[0]);
    }
    return out;
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
  image_attribution: string | null;
  image_reference: CardNumberImageReference | null;
  rarity: string | null;
  set_code: string | null;
  /** Verbatim EN effect text from the legal collection (card_texts) — the
   *  recorded publication rule requires text_attribution rendered with it. */
  effect_text: string | null;
  /** Copyright line for effect_text; NOT NULL in schema wherever text is. */
  text_attribution: string | null;
  /** Illustrator credit where the catalogue names one — the printed hand.
   *  Provenance: `illust:` annotations on special-art listings; see
   *  src/lib/cards/artists.ts for the full provenance note. */
  artist: string | null;
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

/**
 * Illustrator credits by card number, from the catalogue's `illust:`
 * annotations (the printed card-face credit, mirrored — see
 * src/lib/cards/artists.ts for provenance).
 *
 * CONSERVATIVE by design (adversarial-review fix, 2026-07-22): the credit
 * usually rides a special-art listing. Return only catalogue consensus
 * within One Piece; this is still not a verified illustrator for the selected
 * English reference. The UI labels that scope. Missing evidence yields no credit.
 */
async function cardArtistFallbacks(
  cardNumbers: string[],
): Promise<Map<string, string>> {
  if (cardNumbers.length === 0) return new Map();
  try {
    const { rows } = (await query(
      `
      WITH t AS (
        SELECT upper(split_part(sku, '-', 2) || '-' || split_part(sku, '-', 3)) AS card_number,
               trim((regexp_match(card_name, $2, 'i'))[1]) AS artist
          FROM card_set_cards
         WHERE upper(split_part(sku, '-', 1)) = ANY($3)
           AND upper(split_part(sku, '-', 2) || '-' || split_part(sku, '-', 3)) = ANY($1)
      )
      SELECT card_number, min(artist) AS artist
        FROM t
       GROUP BY card_number
      HAVING count(*) = count(artist)
         AND count(DISTINCT artist) = 1
      `,
      [[...new Set(cardNumbers.map((number) => number.toUpperCase()))], SQL_ILLUST_PATTERN,
        [...new Set([GAMES.op.code, ...(GAMES.op.legacyPrefixes ?? [])].map((prefix) => prefix.toUpperCase()))]],
    )) as { rows: { card_number: string; artist: string | null }[] };
    const out = new Map<string, string>();
    for (const r of rows) if (r.artist) out.set(r.card_number, r.artist);
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Existing English effect text remains a best-effort enhancement. Use the same
 * source/credit/time checks as the English reader; a database NOT NULL alone
 * does not prevent a blank attribution. No catalogue printing is invented.
 */
async function cardTextFallbacks(
  cardNumbers: string[],
): Promise<Map<string, { text: string; attribution: string }>> {
  if (cardNumbers.length === 0) return new Map();
  const keyed = cardNumbers
    .map((num) => ({ num, key: englishCardNumberKey("op", num) }))
    .filter((e): e is { num: string; key: string } => e.key !== null);
  if (keyed.length === 0) return new Map();
  try {
    const { rows } = (await query(
      `SELECT sku, lang, source, effect_text, attribution, source_url, retrieved_at
         FROM card_texts
        WHERE lang = 'en' AND source = 'bandai-en' AND effect_text IS NOT NULL AND sku = ANY($1)`,
      [[...new Set(keyed.map((e) => e.key))]],
    )) as { rows: (Pick<StoredOfficialImage, "sku" | "lang" | "source" | "attribution" | "source_url" | "retrieved_at"> & { effect_text: string })[] };
    const bySku = new Map(rows.map((r) => [r.sku, r]));
    const out = new Map<string, { text: string; attribution: string }>();
    for (const e of keyed) {
      const r = bySku.get(e.key);
      const provenance = r ? officialMediaProvenance(e.key, r) : null;
      if (r && provenance && typeof r.effect_text === "string" && r.effect_text.trim()) {
        out.set(e.num, { text: r.effect_text, attribution: provenance.attribution });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

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
      const identity = typeof item.sku === "string" ? skuIdentity(item.sku) : null;
      if (item.card_number && wanted.has(item.card_number) && identity?.game === "op"
        && `${identity.set}-${identity.number}` === item.card_number.toLowerCase()) {
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
        image_attribution: null,
        image_reference: null,
        rarity: null,
        set_code: null,
        effect_text: null,
        text_attribution: null,
        artist: null,
      };
    }
    return {
      card_number: ref.card_number,
      quantity: ref.quantity,
      role: ref.role ?? null,
      resolved: true,
      sku: cat.sku,
      name: cat.name_en || cat.name || ref.card_number,
      image_url: catalogImageUrl(cat.image_url),
      image_attribution: null,
      image_reference: null,
      rarity: cat.rarity ?? null,
      set_code: cat.set_code ?? null,
      effect_text: null,
      text_attribution: null,
      artist: null,
    };
  };

  const leader = resolveCard({
    card_number: deck.leader_card_number,
    quantity: 1,
    role: "leader",
  });
  const cards = deck.card_list.map((c) => resolveCard(c));

  // Retain the separate reviewed catalogue-host fallback, then eligible
  // official references. Keep copyright and the relationship beside the URL.
  const all = [leader, ...cards];
  const needingArt = all.filter((c) => !c.image_url).map((c) => c.card_number);
  const [artFallbacks, texts, artists] = await Promise.all([
    cardImageFallbacks(needingArt),
    cardTextFallbacks(all.map((c) => c.card_number)),
    cardArtistFallbacks(all.map((c) => c.card_number)),
  ]);
  for (const c of all) {
    const image = artFallbacks.get(c.card_number);
    if (!c.image_url && image) {
      c.image_url = image.url;
      c.image_attribution = image.attribution;
      c.image_reference = image.reference;
    }
    const t = texts.get(c.card_number);
    if (t) {
      c.effect_text = t.text;
      c.text_attribution = t.attribution;
    }
    c.artist = artists.get(c.card_number) ?? null;
  }

  return { deck, leader, cards };
}
