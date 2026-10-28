import type { MemberPriceUse, MemberPriceObservation, MemberPriceSource } from '@cambridge-tcg/data-spec';

export type { MemberPriceUse, MemberPriceSource };
export interface MemberPriceQuery {
  /** Any reviewed source. Scryfall, which has no API or download release,
   * reads there as empty, as before; a display-only derivation input
   * (CardRush, TCGplayer) is refused there, as an unknown source was. */
  source?: MemberPriceSource;
  game?: string;
  /** Canonical set code; only exact mapped rows can match this filter. */
  set?: string;
  sku?: string;
  metric?: string;
  q?: string;
  mode: 'current' | 'history';
  limit: number;
  cursor?: string;
}
export type MemberPriceItem = MemberPriceObservation;
/** Raw CardRush and TCGplayer values are display-only (Yu, 2026-10-28): a
 * member may look at them, not harvest them. A source that feeds Cambridge-
 * derived data but has no member-api release is offered only to the current
 * view of a narrowed search (a SKU, a set within a game, or a name search),
 * at most DISPLAY_ONLY_INPUT_PAGE_LIMIT rows a page, and a cursor chain whose
 * filtered snapshot holds its rows ends after DISPLAY_ONLY_INPUT_PAGES pages.
 * Cardmarket (exported) and Scryfall (never a derivation input) read exactly
 * as before, and so does any view that holds no display-only row.
 */
export const DISPLAY_ONLY_INPUT_PAGE_LIMIT = 50;
export const DISPLAY_ONLY_INPUT_PAGES = 3;
export const DISPLAY_ONLY_INPUT_PAGES_END = `CardRush and TCGplayer prices are for looking at, not collecting, so a view that includes them ends after ${DISPLAY_ONLY_INPUT_PAGES} pages. Narrow the search, or choose another source, to see other rows.`;
/** The API and downloads never carry a display-only source's rows. */
export const DISPLAY_ONLY_INPUT_NOT_EXPORTED = 'This price source is shown only on Cambridge pages, never through the API or downloads.';
export const isDisplayOnlyInput = (policy: { uses: readonly MemberPriceUse[]; derivation: object | null }): boolean =>
  policy.derivation !== null && !policy.uses.includes('member-api');
export const displayOnlyInputsNarrowed = (query: Pick<MemberPriceQuery, 'sku' | 'set' | 'game' | 'q'>): boolean =>
  Boolean(query.sku || (query.set && query.game) || query.q);
export const displayOnlyInputsOffered = (query: Pick<MemberPriceQuery, 'mode' | 'limit' | 'sku' | 'set' | 'game' | 'q'>): boolean =>
  query.mode === 'current' && query.limit <= DISPLAY_ONLY_INPUT_PAGE_LIMIT && displayOnlyInputsNarrowed(query);
export interface MemberPricePage {
  status: 'available' | 'empty' | 'unavailable';
  items: MemberPriceItem[];
  nextCursor: string | null;
  /** Immutable committed-batch ID ceiling, NOT a source freshness claim. */
  watermark: string | null;
  /** Time this pagination snapshot was opened, NOT source freshness. */
  asOf: string | null;
  total: number;
  count: number;
  complete: boolean;
  reason?: string;
}
export class MemberPriceQueryError extends Error {
  constructor(message: string) { super(message); this.name = 'MemberPriceQueryError'; }
}
