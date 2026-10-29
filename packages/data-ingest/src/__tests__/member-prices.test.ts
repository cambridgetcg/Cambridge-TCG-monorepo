import { describe, expect, it, vi } from 'vitest';
import { artifactDigest, CARDMARKET_DERIVATION_EVIDENCE_VERSION, CARDRUSH_EVIDENCE_VERSION, derivationAllowed, MEMBER_PRICE_POLICIES, MEMBER_PRICE_REVIEW_VERSION, nativeAmount, priceUseAllowed, resolvePriceCrosswalk, sourceTimestamp, TCGPLAYER_EVIDENCE_VERSION, WITHHELD_PRICE_SOURCES, type ExactPriceCrosswalk } from '../member-prices';
import { cardrush, CARDRUSH_ACQUISITION_ENABLED } from '../cardrush';
import { tcgplayer } from '../tcgplayer';
import { acquireCardmarketMemberPrices, cardmarketObservationSource, parseCardmarketMemberPrices } from '../cardmarket/member-prices';
import type { CardmarketPublicFileArtifact } from '../cardmarket/public-files';
import { parseScryfallMemberPrices } from '../scryfall/member-prices';
import { runSource } from '../runner';
import { assertPriceObservationValues } from '@cambridge-tcg/data-spec';

const retrievedAt = '2026-09-07T12:00:00Z';
function artifact(kind: 'price-guide' | 'product-list', rows: unknown[], createdAt = '2026-09-07T02:48:24+0200'): CardmarketPublicFileArtifact {
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, createdAt, [kind === 'price-guide' ? 'priceGuides' : 'products']: rows }));
  const url = kind === 'price-guide' ? 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json' : 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json';
  return { kind, source_url: url, final_url: url, bytes, byte_length: bytes.length, sha256: artifactDigest(bytes), retrieved_at: retrievedAt,
    headers: { content_type: 'application/json', content_length: bytes.length, content_encoding: null, etag: null, last_modified: null, cache_control: null }, provenance: { source: 'cardmarket', as_of: retrievedAt, retrieved_at: retrievedAt } };
}
const product = { idProduct: 690368, name: 'Roronoa Zoro (OP01-001)', idCategory: 1621, categoryName: 'One Piece Single', idExpansion: 5229, idMetacard: 415369, dateAdded: '2022-12-28 22:11:43' };
function parse(row: Record<string, unknown> = { idProduct: 690368, trend: 2.95 }, crosswalk: ExactPriceCrosswalk[] = []) {
  return parseCardmarketMemberPrices({ gameId: 18, priceGuide: artifact('price-guide', [row]), catalogs: [artifact('product-list', [product], '2026-08-01T12:11:44+0200')], crosswalk });
}
describe('operation-specific member price permissions', () => {
  it('allows only official Cardmarket normalized use and Scryfall display', () => {
    for (const use of ['member-display', 'member-api', 'member-download'] as const) expect(priceUseAllowed('cardmarket', use, MEMBER_PRICE_REVIEW_VERSION)).toBe(true);
    expect(priceUseAllowed('scryfall', 'member-display', MEMBER_PRICE_REVIEW_VERSION)).toBe(true);
    expect(priceUseAllowed('scryfall', 'member-api', MEMBER_PRICE_REVIEW_VERSION)).toBe(false);
    expect(priceUseAllowed('scryfall', 'member-download', MEMBER_PRICE_REVIEW_VERSION)).toBe(false);
    expect(priceUseAllowed('cardmarket', 'member-api', 'old')).toBe(false);
    for (const source of ['pokemon-tcg-api','ygoprodeck','ebay','vinted','__proto__']) expect(priceUseAllowed(source, 'member-display', MEMBER_PRICE_REVIEW_VERSION)).toBe(false);
  });
  // Yu, 2026-10-28: written permission for CardRush and TCGplayer pages, raw
  // values display-only. The earlier withheld pin is replaced by this one.
  it.each([['cardrush', CARDRUSH_EVIDENCE_VERSION], ['tcgplayer', TCGPLAYER_EVIDENCE_VERSION]] as const)('releases %s raw page values for member display only, under its own evidence', (source, version) => {
    expect(priceUseAllowed(source, 'member-display', version)).toBe(true);
    expect(priceUseAllowed(source, 'member-api', version)).toBe(false);
    expect(priceUseAllowed(source, 'member-download', version)).toBe(false);
    expect(priceUseAllowed(source, 'member-display', MEMBER_PRICE_REVIEW_VERSION)).toBe(false);
    expect(MEMBER_PRICE_POLICIES[source].uses).toEqual(['member-display']);
    expect(MEMBER_PRICE_POLICIES[source].attribution).toMatch(/not (a|an individual) sale/i);
    expect(MEMBER_PRICE_POLICIES[source].evidenceUrl).toBe(`repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#${source}`);
    expect(Object.keys(WITHHELD_PRICE_SOURCES)).not.toContain(source);
  });
  it('keeps the legacy CardRush and TCGplayer readers locked; a release policy is not an acquisition path', () => {
    expect(CARDRUSH_ACQUISITION_ENABLED).toBe(false);
    // Both are partial since their identified page collectors landed; their
    // legacy readers stay locked (source-rights.test.ts).
    expect(cardrush.meta.status).toBe('partial');
    expect(tcgplayer.meta).toMatchObject({ access: 'scrape', license: 'internal-only', redistribute: false, status: 'partial' });
    expect(Object.keys(WITHHELD_PRICE_SOURCES)).toEqual(['pokemon-tcg-api', 'ygoprodeck', 'ebay', 'tcgcollector', 'vinted']);
  });
  it('separates derivation permission from display permission, and never derives from Scryfall', () => {
    expect(derivationAllowed('cardmarket', CARDMARKET_DERIVATION_EVIDENCE_VERSION)).toBe(true);
    expect(derivationAllowed('cardmarket', MEMBER_PRICE_REVIEW_VERSION)).toBe(false);
    expect(derivationAllowed('cardrush', CARDRUSH_EVIDENCE_VERSION)).toBe(true);
    expect(derivationAllowed('tcgplayer', TCGPLAYER_EVIDENCE_VERSION)).toBe(true);
    expect(derivationAllowed('tcgplayer', CARDRUSH_EVIDENCE_VERSION)).toBe(false);
    expect(MEMBER_PRICE_POLICIES.scryfall.derivation).toBeNull();
    for (const version of [MEMBER_PRICE_REVIEW_VERSION, CARDMARKET_DERIVATION_EVIDENCE_VERSION, '']) expect(derivationAllowed('scryfall', version)).toBe(false);
    for (const source of ['ebay', '__proto__', 'constructor']) expect(derivationAllowed(source, CARDMARKET_DERIVATION_EVIDENCE_VERSION)).toBe(false);
    // Stored Cardmarket and Scryfall rows match on the unchanged review version.
    expect(MEMBER_PRICE_POLICIES.cardmarket.evidenceVersion).toBe('member-prices/2026-09-07.1');
    expect(MEMBER_PRICE_POLICIES.scryfall.evidenceVersion).toBe('member-prices/2026-09-07.1');
  });
  it.each([0, -1, '', 'NaN', Infinity, true, '1e2', '1.1234567'])('does not invent a price for %s', value => expect(() => nativeAmount(value)).toThrow());
  it('separates missing amounts from zero and parses source offset without refreshing it', () => {
    expect(nativeAmount(null)).toBeNull(); expect(nativeAmount(undefined)).toBeNull(); expect(nativeAmount('1.20')).toBe('1.20');
    expect(sourceTimestamp('2026-09-07T02:48:24+0200')).toBe('2026-09-07T00:48:24.000Z');
    expect(() => sourceTimestamp('2026-09-07')).toThrow();
  });
});
describe('official Cardmarket native files', () => {
  it('accepts published shape and independent catalog age without guessing SKU from card name', () => {
    const result = parse();
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ sourceProductId: '690368', sku: null, mappingStatus: 'unmapped', game: 'one-piece', currency: 'EUR', amount: '2.95', metric: 'trend', granularity: 'source-product', finish: null, language: null, condition: null, sourceUpdatedAt: '2026-09-07T00:48:24.000Z', catalogUpdatedAt: '2026-08-01T10:11:44.000Z' });
    expect(result.observations[0]!.artifactSha256).not.toBe(result.observations[0]!.catalogArtifactSha256);
    // Numeric official fields are normalized before the stricter write/read boundary.
    expect(result.observations[0]!.amount).toBe('2.95');
    for (const observation of result.observations) expect(() => assertPriceObservationValues(observation)).not.toThrow();
  });
  it('keeps native foil metrics and quarantines zero/invalid while null stays missing', () => {
    const result = parse({ idProduct: 690368, trend: 0, avg: null, low: -1, 'trend-foil': 3.99 });
    expect(result.observations).toHaveLength(1); expect(result.quarantine).toHaveLength(2);
    expect(result.observations[0]).toMatchObject({ metric: 'trend-foil', finish: 'foil', amount: '3.99' });
    for (const observation of result.observations) expect(() => assertPriceObservationValues(observation)).not.toThrow();
  });
  it('quarantines missing product links rather than assigning another product', () => {
    expect(parse({ idProduct: 999, trend: 1 }).quarantine[0]?.reason).toBe('product-missing-from-supplied-catalog');
  });
  it("keeps the catalogue's idExpansion as the source set key, mapping nothing by it", () => {
    const result = parse({ idProduct: 690368, trend: 2.95, 'trend-foil': 3.99 });
    expect(result.observations.map(row => [row.metric, row.sourceSetKey, row.setCode, row.mappingStatus])).toEqual([['trend', '5229', null, 'unmapped'], ['trend-foil', '5229', null, 'unmapped']]);
    // A catalogue row with no usable expansion names no set.
    for (const idExpansion of [undefined, null, 0, -3, 1.5, '5229']) {
      const rows = parseCardmarketMemberPrices({ gameId: 18, priceGuide: artifact('price-guide', [{ idProduct: 690368, trend: 2.95 }]), catalogs: [artifact('product-list', [{ ...product, idExpansion }])] }).observations;
      expect(rows.map(row => row.sourceSetKey)).toEqual([null]);
    }
  });
  it('only maps established source ID and identical scope; ambiguous links remain source-product rows', () => {
    const link: ExactPriceCrosswalk = { source: 'cardmarket', sourceProductId: '690368', finish: null, language: null, sku: 'op-op01-001-en', game: 'one-piece', setCode: 'op01', evidence: 'operator reviewed exact ID scope' };
    expect(parse(undefined, [link]).observations[0]?.mappingStatus).toBe('exact');
    expect(parse(undefined, [{ ...link, language: 'en' }]).observations[0]?.sku).toBeNull();
    const ambiguous = parse(undefined, [link, { ...link, sku: 'op-op01-002-en' }]);
    expect(ambiguous.observations[0]?.mappingStatus).toBe('ambiguous'); expect(ambiguous.quarantine).toHaveLength(1);
    expect(resolvePriceCrosswalk('cardmarket','690368','nonfoil',null,'one-piece',[{...link,sku:'bad'}]).sku).toBeNull();
  });
  it('rejects substitution, tampering, or unreviewed game before release', () => {
    const guide = artifact('price-guide', [{ idProduct: 690368, trend: 1 }]);
    expect(() => parseCardmarketMemberPrices({ gameId: 18, priceGuide: { ...guide, sha256: '0'.repeat(64) }, catalogs: [artifact('product-list', [product])] })).toThrow(/identity/);
    expect(() => parseCardmarketMemberPrices({ gameId: 999, priceGuide: guide, catalogs: [] })).toThrow(/reviewed/);
  });
  it('does zero network work for an unreviewed game', async () => {
    const fetch = vi.fn(); await expect(acquireCardmarketMemberPrices({ fetch }, 999)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it('passes exact successful provenance through the existing runner', async () => {
    const rows = parse().observations, write = vi.fn(async () => {});
    const result = await runSource(cardmarketObservationSource(rows), {}, { write, quarantine: async () => {} });
    expect(result.rows_normalized).toBe(1); expect(write).toHaveBeenCalledWith(rows[0], { source: 'cardmarket', as_of: rows[0]!.sourceUpdatedAt, retrieved_at: rows[0]!.retrievedAt });
  });
});
describe('Scryfall daily value-added prices', () => {
  it('retains exact printing, finish, native currencies and underlying vendor', () => {
    const bytes = new TextEncoder().encode(JSON.stringify([{ object: 'card', id: '12345678-1234-1234-1234-123456789abc', name: 'Test', lang: 'en', finishes: ['nonfoil', 'foil'], prices: { usd: '4.50', usd_foil: '9.10', eur: '3.00', eur_foil: null, tix: '0.1' } }]));
    const result = parseScryfallMemberPrices({ bytes, sourceUrl: 'https://data.scryfall.io/default-cards/default-cards-20260907090000.json', sourceUpdatedAt: '2026-09-07T09:00:00Z', retrievedAt });
    expect(result.observations).toHaveLength(3);
    expect(result.observations[0]).toMatchObject({ sku: null, granularity: 'printing', language: 'en', metric: 'usd', currency: 'USD', underlyingMarket: 'tcgplayer', catalogSourceUrl: null });
    expect(result.observations[2]).toMatchObject({ underlyingMarket: 'cardmarket', currency: 'EUR' });
    expect(result.observations.every(row => !priceUseAllowed(row.source, 'member-api', row.evidenceVersion))).toBe(true);
    for (const observation of result.observations) expect(() => assertPriceObservationValues(observation)).not.toThrow();
  });
});
