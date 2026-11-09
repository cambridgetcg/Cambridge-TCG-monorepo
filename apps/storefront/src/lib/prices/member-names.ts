import 'server-only';
import {
  CARD_NAME_MARKERS, cardNameKey, cardRushName, cardmarketName, tcgplayerName,
  type CardNameExtraction, type CardNameRefusal, type CardNameRefusalReason,
} from '@cambridge-tcg/sku';
import type { MemberPriceItem, MemberPriceSource } from './member-feed-types';

/** Each source's CTCG-NAMES-v1 vendor rule, and the language its titles are
 * written in (docs/methodology/card-names.md): the CardRush One Piece titles
 * captured on 2026-10-28 are Japanese, and the TCGplayer price guides and
 * Cardmarket product lists English, the Pokemon Japan line included. That is
 * the name's language, never the row's printing language: an English name
 * read from a Japanese printing's row is an English name. Scryfall has no
 * rule. */
const VENDOR_RULES = {
  cardrush: { read: cardRushName, lang: 'ja' },
  tcgplayer: { read: tcgplayerName, lang: 'en' },
  cardmarket: { read: cardmarketName, lang: 'en' },
} as const satisfies Partial<Record<MemberPriceSource, { read: (title: string) => CardNameExtraction | CardNameRefusal; lang: string }>>;

export type MemberNameSource = keyof typeof VENDOR_RULES;

/** A row's vendor name: the source's own title after its rule removed the
 * markers. Never official, and never a SKU mapping. */
export interface MemberCardName {
  text: string;
  /** Match key, for matching only; never displayed. */
  key: string;
  /** The language the text is written in. */
  lang: (typeof VENDOR_RULES)[MemberNameSource]['lang'];
  status: 'vendor';
  source: MemberNameSource;
  rule: string;
  /** A credit taken from the title's markers; never part of the name. */
  illustrator?: string;
  /** What the rule removed, in its order. */
  markers: string[];
}

/** No name for the row, and why: the rule's own refusal; `no_rule` for a
 * source without one; `language_unseen` for a CardRush title with a language
 * marker anywhere in it, since how CardRush writes the name on such a listing
 * has not been seen, so the name's language would be a guess;
 * `grammar_unreviewed` for a CardRush game other than One Piece, the only
 * one whose titles names-1 was checked against (the 2026-10-28 captures);
 * `not_a_single` for a Cardmarket row not read from a singles product list,
 * such as a booster box from products_nonsingles_<game>.json, or with no
 * product list recorded. */
export interface MemberCardNameRefusal {
  reason: CardNameRefusalReason | 'no_rule' | 'language_unseen' | 'grammar_unreviewed' | 'not_a_single';
}

const hasRule = (source: MemberPriceSource): source is MemberNameSource => Object.hasOwn(VENDOR_RULES, source);
const LANGUAGE_MARKERS: readonly string[] = CARD_NAME_MARKERS.cardrush_language;
/** The Cardmarket collector's singles product list (cardmarket/member-prices.ts);
 * its nonsingles list holds sealed products, which are not cards. */
const CARDMARKET_SINGLES = /\/productCatalog\/productList\/products_singles_[1-9][0-9]*\.json$/;

/** The name /prices shows beside a row's raw title (display only; no record
 * is emitted). It runs the source's rule on the title as stored, and refuses
 * where the rule does or where the row is outside what the rule was checked
 * against: it never guesses. */
export function memberCardName(item: Pick<MemberPriceItem, 'source' | 'productName' | 'game' | 'catalogSourceUrl'>): MemberCardName | MemberCardNameRefusal {
  if (!hasRule(item.source)) return { reason: 'no_rule' };
  const source = item.source;
  if (source === 'cardrush' && item.game !== 'one-piece') return { reason: 'grammar_unreviewed' };
  if (source === 'cardmarket' && !CARDMARKET_SINGLES.test(item.catalogSourceUrl ?? '')) return { reason: 'not_a_single' };
  const { read, lang } = VENDOR_RULES[source];
  const title = item.productName ?? '';
  const name = read(title);
  if ('reason' in name) return { reason: name.reason };
  // The collector sets a row's language from a marker anywhere in the title
  // (cardrush/member-prices.ts), not only where names-1 removes one.
  if (source === 'cardrush' && LANGUAGE_MARKERS.some((marker) => title.includes(marker))) return { reason: 'language_unseen' };
  return {
    text: name.text, key: cardNameKey(name.text), lang, status: 'vendor', source, rule: name.rule,
    ...(name.illustrator !== undefined ? { illustrator: name.illustrator } : {}),
    markers: name.markers,
  };
}
