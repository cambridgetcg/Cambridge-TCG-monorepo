import { createHash } from 'node:crypto';
import { parseSku } from '@cambridge-tcg/sku';

export type MemberPriceUse = 'member-display' | 'member-api' | 'member-download';
export type MemberPriceSource = 'cardmarket' | 'scryfall';
export const MEMBER_PRICE_REVIEW_VERSION = 'member-prices/2026-09-07.1';
/** Dataset-specific decisions, not a site-wide license and not legal advice.
 * Evidence supplied by the approved review; some pages rejected direct retrieval.
 * No live collection or complete legal review is asserted by this registry.
 */
export const MEMBER_PRICE_POLICIES = {
  cardmarket: {
    evidenceVersion: MEMBER_PRICE_REVIEW_VERSION,
    evidenceUrl: 'https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024',
    basis: 'Official downloadable Product Catalog / Price Guide statement: “use them however you see fit”. Normalized member display/API/download only; not a CC0 claim or permission for restricted API/site scraping.',
    attribution: 'Cardmarket official daily Price Guide; EUR product-level market aggregates, not individual sales.',
    uses: ['member-display', 'member-api', 'member-download'] as readonly MemberPriceUse[],
    acquisition: 'official-daily-files', storage: 'normalized-history', cadence: 'daily',
  },
  scryfall: {
    evidenceVersion: MEMBER_PRICE_REVIEW_VERSION,
    evidenceUrl: 'https://scryfall.com/docs/api#use-of-scryfall-data-and-images',
    basis: 'Free accounts and value-added Magic views allowed. No simple republishing, raw mirror, proxy, or price API/download export. Underlying vendor fields retain their market identity.',
    attribution: 'Scryfall daily bulk prices (USD: TCGplayer; EUR: Cardmarket). Magic material belongs to Wizards of the Coast.',
    uses: ['member-display'] as readonly MemberPriceUse[],
    acquisition: 'official-daily-bulk', storage: 'normalized-history', cadence: 'daily',
  },
} as const;
export function priceUseAllowed(source: string, use: MemberPriceUse, evidenceVersion: string): boolean {
  if (!Object.hasOwn(MEMBER_PRICE_POLICIES, source)) return false;
  const policy = MEMBER_PRICE_POLICIES[source as MemberPriceSource];
  return policy.evidenceVersion === evidenceVersion && policy.uses.includes(use);
}
export const WITHHELD_PRICE_SOURCES = {
  cardrush: 'Recorded collection/publication block; partnership approval required. Login is not an exemption.',
  tcgplayer: 'Direct API access approval required; credentials or third-party catalog access do not establish redistribution rights.',
  'pokemon-tcg-api': 'Catalog terms do not establish downstream permission for third-party vendor price exports; unknown, not an express ban.',
  ygoprodeck: 'Vendor price permissions unresolved; cross-printing minima are not exact-printing prices.',
  ebay: 'Browse current asks are not sold history; sold-history entitlement and downstream permission unresolved.',
  tcgcollector: 'Repository-recorded restriction; not externally reverified in this bounded review.',
  vinted: 'Repository-recorded block; not externally reverified in this bounded review.',
} as const;

export interface NativePriceObservation {
  source: MemberPriceSource;
  sourceProductId: string;
  sku: string | null;
  mappingStatus: 'exact' | 'unmapped' | 'ambiguous';
  game: string;
  setCode: string | null;
  productName: string | null;
  granularity: 'source-product' | 'printing';
  finish: string | null;
  language: string | null;
  condition: string | null;
  metric: string;
  amount: string;
  currency: 'EUR' | 'USD';
  /** Vendor market identity is retained even for an aggregator. */
  underlyingMarket: 'cardmarket' | 'tcgplayer';
  sourceUpdatedAt: string;
  retrievedAt: string;
  sourceUrl: string;
  parserVersion: string;
  crosswalkVersion: string;
  evidenceVersion: string;
  artifactSha256: string;
  /** Independent catalog evidence; null for a self-contained Scryfall bulk row. */
  catalogSourceUrl: string | null;
  catalogUpdatedAt: string | null;
  catalogArtifactSha256: string | null;
  quality: 'accepted';
}
export interface PriceQuarantine { sourceProductId: string | null; reason: string; field?: string }
export interface ParsedMemberPrices {
  observations: NativePriceObservation[];
  quarantine: PriceQuarantine[];
  sourceRows: number;
  missingPrices: number;
}
/** An established source ID link, never a name/number similarity guess.
 * finish/language must match the source observation's scope, including null.
 * A product-level aggregate must NOT inherit a printing's language/condition.
 */
export interface ExactPriceCrosswalk {
  source: MemberPriceSource;
  sourceProductId: string;
  finish: string | null;
  language: string | null;
  sku: string;
  game: string;
  setCode: string;
  evidence: string;
}
export function resolvePriceCrosswalk(source: MemberPriceSource, id: string, finish: string | null, language: string | null, game: string, links: readonly ExactPriceCrosswalk[]) {
  const candidates = links.filter(link => link.source === source && link.sourceProductId === id && link.finish === finish && link.language === language && link.game === game);
  if (!candidates.length) return { sku: null, setCode: null, mappingStatus: 'unmapped' as const };
  const valid = candidates.filter(link => {
    try {
      const parts = parseSku(link.sku);
      const codes: Record<string, string> = { magic: 'mtg', 'one-piece': 'op', pokemon: 'pkm', 'yu-gi-oh': 'ygo' };
      return Boolean(link.evidence.trim() && parts && parts.set === link.setCode && parts.game === codes[game] && (language === null || parts.lang === language));
    } catch { return false; }
  });
  const unique = new Set(valid.map(link => `${link.sku}\0${link.setCode}`));
  if (unique.size !== 1 || valid.length !== candidates.length) return { sku: null, setCode: null, mappingStatus: 'ambiguous' as const };
  return { sku: valid[0]!.sku, setCode: valid[0]!.setCode, mappingStatus: 'exact' as const };
}
export function nativeAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/.test(text) || Number(text) <= 0) throw new Error('invalid-or-zero-price');
  return text;
}
export function sourceTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('source-timestamp-required');
  return new Date(value).toISOString();
}
export function artifactDigest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected-object');
  return value as Record<string, unknown>;
}
