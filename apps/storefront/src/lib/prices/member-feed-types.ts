import type { MemberPriceUse, NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';

export type { MemberPriceUse };
export interface MemberPriceQuery {
  source?: 'cardmarket' | 'scryfall';
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
export interface MemberPriceItem extends NativePriceObservation {
  id: string;
  permittedUses: MemberPriceUse[];
  attribution: string;
}
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
