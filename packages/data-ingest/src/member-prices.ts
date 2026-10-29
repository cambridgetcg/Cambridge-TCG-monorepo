import { createHash } from 'node:crypto';
import { parseSku } from '@cambridge-tcg/sku';
import { parseNativePriceAmount, type NativePriceObservation, type MemberPriceUse, type MemberPriceSource } from '@cambridge-tcg/data-spec';
export type { NativePriceObservation, MemberPriceUse, MemberPriceSource } from '@cambridge-tcg/data-spec';

export const MEMBER_PRICE_REVIEW_VERSION = 'member-prices/2026-09-07.1';
/** One evidence version per source. Stored observations and release rows
 * match on it, so Cardmarket and Scryfall keep the 2026-09-07 review: a new
 * value would hide every row already stored. A new grant gets a new version.
 */
export const CARDMARKET_EVIDENCE_VERSION = MEMBER_PRICE_REVIEW_VERSION;
export const SCRYFALL_EVIDENCE_VERSION = MEMBER_PRICE_REVIEW_VERSION;
export const CARDRUSH_EVIDENCE_VERSION = 'cardrush/2026-10-28.1';
export const TCGPLAYER_EVIDENCE_VERSION = 'tcgplayer/2026-10-28.1';
export const CARDMARKET_DERIVATION_EVIDENCE_VERSION = 'cardmarket-derivation/2026-10-28.1';
/** Yu's record of the 2026-10-28 email grants. The emails themselves stay with Yu. */
const PERMISSIONS_RECORD = 'repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md';

export interface MemberPricePolicy {
  evidenceVersion: string;
  evidenceUrl: string;
  basis: string;
  /** Shown beside every value: names the source and says what the number is. */
  attribution: string;
  uses: readonly MemberPriceUse[];
  /** Permission to use this source's values as input to Cambridge-derived
   * data, with its own evidence. Display or API permission is not this. Null
   * means the source never enters a derivation.
   */
  derivation: { evidenceVersion: string; evidenceUrl: string } | null;
  acquisition: string;
  storage: string;
  /** The source's own publication rhythm, not a Cambridge schedule. */
  cadence: string;
}
/** Dataset-specific decisions, not a site-wide license and not legal advice.
 * Evidence supplied by the approved review; some pages rejected direct retrieval.
 * No live collection or complete legal review is asserted by this registry.
 */
export const MEMBER_PRICE_POLICIES = {
  cardmarket: {
    evidenceVersion: CARDMARKET_EVIDENCE_VERSION,
    evidenceUrl: 'https://www.cardmarket.com/en/Insight/Articles/the-state-of-cardmarket-2024',
    basis: 'Official downloadable Product Catalog / Price Guide statement: “use them however you see fit”. Normalized member display/API/download only; not a CC0 claim or permission for restricted API/site scraping.',
    attribution: 'Cardmarket official daily Price Guide; EUR product-level market aggregates, not individual sales.',
    uses: ['member-display', 'member-api', 'member-download'] as readonly MemberPriceUse[],
    derivation: { evidenceVersion: CARDMARKET_DERIVATION_EVIDENCE_VERSION, evidenceUrl: `${PERMISSIONS_RECORD}#cardmarket` },
    acquisition: 'official-daily-files', storage: 'normalized-history', cadence: 'daily',
  },
  scryfall: {
    evidenceVersion: SCRYFALL_EVIDENCE_VERSION,
    evidenceUrl: 'https://scryfall.com/docs/api#use-of-scryfall-data-and-images',
    basis: 'Free accounts and value-added Magic views allowed. No simple republishing, raw mirror, proxy, or price API/download export. Underlying vendor fields retain their market identity.',
    attribution: 'Scryfall daily bulk prices (USD: TCGplayer; EUR: Cardmarket). Magic material belongs to Wizards of the Coast.',
    uses: ['member-display'] as readonly MemberPriceUse[],
    // Its basis covers free accounts and value-added views, not resale.
    derivation: null,
    acquisition: 'official-daily-bulk', storage: 'normalized-history', cadence: 'daily',
  },
  cardrush: {
    evidenceVersion: CARDRUSH_EVIDENCE_VERSION,
    evidenceUrl: `${PERMISSIONS_RECORD}#cardrush`,
    basis: 'Written permission by email, held by Yu and recorded 2026-10-28 without a copy: collection from CardRush product pages, attributed member display, input to Cambridge-derived data. Raw values are display-only: no member API, download or bulk copy. Prices gathered before 2026-10-28 are not covered.',
    attribution: 'CardRush product page: the shop’s listed JPY sell price for this printing when Cambridge read the page. An asking price, not a sale.',
    uses: ['member-display'] as readonly MemberPriceUse[],
    derivation: { evidenceVersion: CARDRUSH_EVIDENCE_VERSION, evidenceUrl: `${PERMISSIONS_RECORD}#cardrush` },
    acquisition: 'identified-page-collector', storage: 'normalized-history', cadence: 'live-page',
  },
  tcgplayer: {
    evidenceVersion: TCGPLAYER_EVIDENCE_VERSION,
    evidenceUrl: `${PERMISSIONS_RECORD}#tcgplayer`,
    basis: 'Written permission by email, held by Yu and recorded 2026-10-28 without a copy: collection from TCGplayer product pages, attributed member display, input to Cambridge-derived data. Raw values are display-only: no member API, download or bulk copy. Not TCGplayer\'s partner API. The permission covers the data TCGplayer\'s public price-guide pages load (Yu confirmed 2026-10-29), which the collector reads only while it is scheduled (see /api/v1/sources).',
    attribution: 'TCGplayer price guide: TCGplayer’s USD Market Price (its figure from recent sales) for this printing and condition when Cambridge read the guide. Not an individual sale.',
    uses: ['member-display'] as readonly MemberPriceUse[],
    derivation: { evidenceVersion: TCGPLAYER_EVIDENCE_VERSION, evidenceUrl: `${PERMISSIONS_RECORD}#tcgplayer` },
    acquisition: 'identified-page-collector', storage: 'normalized-history', cadence: 'live-page',
  },
} as const satisfies Record<MemberPriceSource, MemberPricePolicy>;
export function priceUseAllowed(source: string, use: MemberPriceUse, evidenceVersion: string): boolean {
  if (!Object.hasOwn(MEMBER_PRICE_POLICIES, source)) return false;
  const policy = MEMBER_PRICE_POLICIES[source as MemberPriceSource];
  return policy.evidenceVersion === evidenceVersion && policy.uses.includes(use);
}
/** Whether a source may feed Cambridge-derived data under this derivation
 * evidence version (a release row's derivation_evidence_version). The release
 * row's derivation flag and revocation remain separate runtime checks.
 */
export function derivationAllowed(source: string, evidenceVersion: string): boolean {
  if (!Object.hasOwn(MEMBER_PRICE_POLICIES, source)) return false;
  const derivation: MemberPricePolicy['derivation'] = MEMBER_PRICE_POLICIES[source as MemberPriceSource].derivation;
  return derivation !== null && derivation.evidenceVersion === evidenceVersion;
}
export const WITHHELD_PRICE_SOURCES = {
  'pokemon-tcg-api': 'Catalog terms do not establish downstream permission for third-party vendor price exports; unknown, not an express ban.',
  ygoprodeck: 'Vendor price permissions unresolved; cross-printing minima are not exact-printing prices.',
  ebay: 'Browse current asks are not sold history; sold-history entitlement and downstream permission unresolved.',
  tcgcollector: 'Repository-recorded restriction; not externally reverified in this bounded review.',
  vinted: 'Repository-recorded block; not externally reverified in this bounded review.',
} as const;

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
  return parseNativePriceAmount(value);
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
