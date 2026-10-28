import { parseCardNumber } from '@cambridge-tcg/sku';
import type { SetCrosswalkInput } from './crosswalks';

/** Cardmarket One Piece expansions (idExpansion) to Cambridge set codes.
 *
 * Cardmarket's catalogue rows carry idExpansion but no expansion name, code
 * or language, and no number field: the collector number appears only inside
 * the product name, as Cardmarket prints it ("Roronoa Zoro (OP01-001)"). A
 * Cambridge set code is that printed prefix (packages/sku SET_FORMATS), and
 * one Cardmarket expansion often mixes prefixes (reprints, promos, decks), so
 * an expansion maps to a set only when every single in it carries the one
 * prefix, unnumbered DON!! cards aside. A mixed expansion stays unmapped.
 * Only the number is read, never the card's name.
 *
 * Products are never mapped to a SKU from these files: one name and metacard
 * recurs within and across expansions with no variant or language marker,
 * so the files cannot tell printings apart.
 */
export const CARDMARKET_SET_CROSSWALK_VERSION = 'cardmarket-expansions/2026-10-28.1';
/** The catalogue the seed below was reviewed against. */
export const CARDMARKET_EXPANSION_REVIEW = {
  gameId: 18,
  game: 'one-piece',
  catalogUrl: 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json',
  catalogCreatedAt: '2026-10-28T13:49:48+0100',
  catalogSha256: '0e93ecbe8f001139c680a524888f094874d27313275090ce81c00a4ccb1e9276',
  singles: 12651,
  expansions: 150,
} as const;

export type CardmarketExpansionReview =
  | { setCode: string; numbered: number; unnumberedDon: number }
  | { setCode: null; reason: 'mixed-set-numbers' | 'unrecognised-number' | 'unnumbered-single' | 'no-numbered-single' };

// Cardmarket sometimes pads the number: "Uta ( ST11-001)".
const COLLECTOR_NUMBER = /\(\s*([A-Za-z]+\d*)-(\d{3,4})\s*\)/g;
const DON = /^don!!/i;

/** The rule above, applied to one game's singles catalogue rows. */
export function reviewCardmarketExpansions(products: readonly { idExpansion?: unknown; name?: unknown }[]): Map<number, CardmarketExpansionReview> {
  const seen = new Map<number, { sets: Set<string>; numbered: number; don: number; fault: Exclude<CardmarketExpansionReview, { setCode: string }>['reason'] | null }>();
  for (const product of products) {
    const id = product.idExpansion;
    if (!Number.isSafeInteger(id) || (id as number) <= 0 || typeof product.name !== 'string') throw new Error('cardmarket-invalid-catalog-identity');
    const entry = seen.get(id as number) ?? { sets: new Set(), numbered: 0, don: 0, fault: null };
    seen.set(id as number, entry);
    const numbers = [...product.name.matchAll(COLLECTOR_NUMBER)];
    if (numbers.length === 0) {
      if (DON.test(product.name)) entry.don++;
      else entry.fault ??= 'unnumbered-single';
      continue;
    }
    const parts = numbers.length === 1 ? parseCardNumber('op', `${numbers[0]![1]}-${numbers[0]![2]}`) : null;
    // A catch-all format is unconfirmed, not a known Cambridge set.
    if (!parts?.confirmed) { entry.fault ??= 'unrecognised-number'; continue; }
    entry.sets.add(parts.set);
    entry.numbered++;
  }
  const reviews = new Map<number, CardmarketExpansionReview>();
  for (const [id, entry] of seen) {
    if (entry.fault) reviews.set(id, { setCode: null, reason: entry.fault });
    else if (entry.sets.size > 1) reviews.set(id, { setCode: null, reason: 'mixed-set-numbers' });
    else if (entry.sets.size === 0) reviews.set(id, { setCode: null, reason: 'no-numbered-single' });
    else reviews.set(id, { setCode: [...entry.sets][0]!, numbered: entry.numbered, unnumberedDon: entry.don });
  }
  return reviews;
}

/** The reviewed result for CARDMARKET_EXPANSION_REVIEW's catalogue
 * (scripts/review-cardmarket-expansions.ts): [idExpansion, setCode, numbered
 * singles, unnumbered DON!!]. 55 of 150 expansions qualify; 91 mix set
 * numbers and 4 hold a single with no number, so they stay unmapped. Several
 * expansions share a set: Cardmarket lists one set's cards across a few
 * expansions, and the file does not say which edition each is. */
export const CARDMARKET_ONE_PIECE_EXPANSIONS: readonly (readonly [number, string, number, number])[] = [
  [5229, 'op01', 157, 2],
  [5237, 'st01', 41, 0],
  [5238, 'st02', 35, 0],
  [5239, 'st03', 35, 0],
  [5240, 'st04', 34, 0],
  [5255, 'st05', 17, 0],
  [5263, 'op02', 155, 1],
  [5265, 'st06', 17, 0],
  [5300, 'op02', 76, 0],
  [5366, 'st08', 15, 0],
  [5367, 'st09', 15, 0],
  [5377, 'st07', 17, 0],
  [5413, 'op03', 77, 0],
  [5427, 'st11', 5, 0],
  [5483, 'op02', 154, 1],
  [5484, 'op01', 154, 1],
  [5486, 'op04', 75, 0],
  [5565, 'op05', 75, 0],
  [5580, 'eb01', 80, 0],
  [5585, 'eb01', 80, 0],
  [5591, 'st11', 5, 0],
  [5592, 'st12', 17, 0],
  [5593, 'st12', 17, 0],
  [5594, 'st13', 35, 0],
  [5595, 'st13', 35, 0],
  [5611, 'st14', 17, 0],
  [5622, 'op06', 75, 0],
  [5624, 'op01', 78, 0],
  [5803, 'op07', 75, 0],
  [5850, 'st14', 17, 0],
  [5896, 'op08', 75, 0],
  [5979, 'op09', 75, 0],
  [5998, 'st21', 32, 0],
  [5999, 'st21', 32, 0],
  [6029, 'st01', 18, 0],
  [6030, 'st02', 17, 0],
  [6031, 'st03', 17, 0],
  [6032, 'st04', 17, 0],
  [6090, 'op10', 75, 0],
  [6138, 'st22', 31, 0],
  [6160, 'op11', 75, 0],
  [6215, 'st09', 15, 0],
  [6264, 'op12', 75, 0],
  [6270, 'st22', 31, 0],
  [6372, 'op13', 75, 0],
  [6379, 'eb03', 90, 10],
  [6444, 'st29', 31, 0],
  [6445, 'st29', 31, 0],
  [6449, 'eb03', 90, 10],
  [6560, 'st30', 34, 0],
  [6562, 'eb05', 38, 0],
  [6608, 'st30', 34, 0],
  [6609, 'op16', 75, 0],
  [6685, 'op16', 1, 0],
  [6707, 'op17', 75, 2],
];

/** The seed as set crosswalk rows, each carrying its own evidence. */
export function cardmarketSetCrosswalkSeed(): SetCrosswalkInput[] {
  const review = CARDMARKET_EXPANSION_REVIEW;
  return CARDMARKET_ONE_PIECE_EXPANSIONS.map(([id, setCode, numbered, don]) => ({
    source: 'cardmarket', sourceSetKey: String(id), game: review.game, setCode,
    evidence: `idExpansion:${id}; numbered singles ${numbered}, every one ${setCode.toUpperCase()}-nnn in Cardmarket's own product names; unnumbered DON!! ${don}; ` +
      `the file names no expansion or language; products_singles_${review.gameId}.json createdAt ${review.catalogCreatedAt} sha256 ${review.catalogSha256}`,
    crosswalkVersion: CARDMARKET_SET_CROSSWALK_VERSION,
  }));
}
