import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageReference } from '@/lib/cards/image-reference';
import type { MemberPriceItem } from './member-feed-types';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ query: vi.fn(), official: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: mocks.query }));
vi.mock('@/lib/cards/en-card-data', () => ({ getEnCardImages: mocks.official }));
import { cardRushListingImagesOn, MEMBER_PRICE_IMAGE_ROWS, readMemberPriceImages } from './member-images';

const hex = Buffer.from('product/SYNTHETIC_15600.jpg').toString('hex');
const listingImage = `https://www.cardrush-op.jp/data/cardrush-op/_/${hex}.jpg`;
const officialUrl = 'https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-OP01-006-EN.png';
const base: MemberPriceItem = {
  id: '1', source: 'cardmarket', sourceProductId: '123', sku: null, mappingStatus: 'unmapped', game: 'one-piece', setCode: null,
  productName: 'Example product', granularity: 'source-product', finish: null, language: null, condition: null,
  metric: 'trend', amount: '1.23', currency: 'EUR', underlyingMarket: 'cardmarket',
  sourceUpdatedAt: '2026-10-28T00:00:00.000Z', retrievedAt: '2026-10-28T00:00:00.000Z', sourceUrl: 'https://downloads.cardmarket.com/x.json',
  parserVersion: 'test/1', crosswalkVersion: 'test/1', evidenceVersion: 'test/1', artifactSha256: 'a'.repeat(64),
  catalogSourceUrl: null, catalogUpdatedAt: null, catalogArtifactSha256: null, quality: 'accepted',
  permittedUses: ['member-display', 'member-api', 'member-download'], attribution: 'Cardmarket fixture attribution',
};
const cardrush = (id: string, product: number, mapped = false): MemberPriceItem => ({
  ...base, id, source: 'cardrush', sourceProductId: `www.cardrush-op.jp/product/${product}`, sourceUrl: `https://www.cardrush-op.jp/product/${product}`,
  granularity: 'printing', currency: 'JPY', underlyingMarket: 'cardrush', metric: 'sell', amount: '123', language: 'ja', permittedUses: ['member-display'],
  ...(mapped ? { sku: 'op-op01-006-ja', setCode: 'op01', mappingStatus: 'exact' as const } : {}),
});
// A printing-level row with an exact SKU, as TCGplayer and CardRush write them.
const exact: MemberPriceItem = {
  ...base, id: '9', source: 'tcgplayer', sourceProductId: '456', sku: 'op-op01-006-ja', setCode: 'op01', mappingStatus: 'exact', granularity: 'printing',
  language: 'ja', metric: 'market', currency: 'USD', underlyingMarket: 'tcgplayer', permittedUses: ['member-display'],
};
// A Cardmarket product aggregate linked exactly by a reviewed crosswalk: its
// language is unknown and its price may pool printings and languages.
const aggregate: MemberPriceItem = { ...base, id: '9', sku: 'op-op01-006-en', setCode: 'op01', mappingStatus: 'exact' };
const attribution = '©Eiichiro Oda/Shueisha, Toei Animation ©BANDAI CO., LTD.';
// As the reader answers: every requested SKU maps to the English base row,
// with the projector's reference naming what the image depicts.
const reader = async (skus: string[]) => new Map(skus.map(sku => [sku, { url: officialUrl, attribution, reference: createImageReference(sku, 'OP-OP01-006-EN')! }]));
// The Japanese row's official image: English base art, so the language differs.
const shown = { url: officialUrl, attribution, imageLang: 'en', depictedSku: 'op-op01-006-en', scope: 'syntax_only' };
const japanese = { ...shown, relationship: 'other-language', rowLang: 'ja', rowVariant: null };
const linkedImage = (lang: string | null) => ({ url: listingImage, lang, relationship: 'same-listing' });

beforeEach(() => {
  mocks.query.mockReset();
  mocks.official.mockReset();
  mocks.query.mockResolvedValue({ rows: [{ source_product_id: 'www.cardrush-op.jp/product/15600', image_url: listingImage }], rowCount: 1 });
  mocks.official.mockImplementation(reader);
});

describe('/prices identity images', () => {
  it('offers a CardRush row its listing image, an exact row the official reference, a mapped CardRush row both, and a row with neither none', async () => {
    const images = await readMemberPriceImages([cardrush('1', 15600, true), cardrush('2', 169), exact, { ...base, id: '4' }]);
    expect(images.byItem.get('1')).toEqual({ official: japanese, listing: linkedImage('ja') });
    // A CardRush row with no listing image and no exact SKU shows none.
    expect(images.byItem.has('2')).toBe(false);
    expect(images.byItem.get('9')).toEqual({ official: japanese });
    expect(images.byItem.has('4')).toBe(false);
    expect(images.rowsLookedUp).toBe(4);
    // One bounded lookup per lane: listings by (source, source product), references by SKU.
    expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain("source = 'cardrush' AND source_product_id = ANY($1::text[]) AND withdrawn_at IS NULL");
    expect(params).toEqual([['www.cardrush-op.jp/product/15600', 'www.cardrush-op.jp/product/169']]);
    expect(mocks.official).toHaveBeenCalledWith(['op-op01-006-ja']);
  });

  it('keeps the official reference alone for a mapped CardRush row without a listing image, and the listing alone for an unmapped one', async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect((await readMemberPriceImages([cardrush('1', 15600, true)])).byItem.get('1')).toEqual({ official: japanese });
    mocks.query.mockResolvedValue({ rows: [{ source_product_id: 'www.cardrush-op.jp/product/15600', image_url: listingImage }], rowCount: 1 });
    expect((await readMemberPriceImages([cardrush('1', 15600)])).byItem.get('1')).toEqual({ listing: linkedImage('ja') });
  });

  it.each([
    ['an English base row', 'op-op01-006-en', { relationship: 'same-printing', rowLang: 'en', rowVariant: null }],
    ['an English parallel', 'op-op01-006-en-p1', { relationship: 'same-language-base-print', rowLang: 'en', rowVariant: 'p1' }],
    ['an English reprint', 'op-op01-006-en-r1', { relationship: 'same-language-base-print', rowLang: 'en', rowVariant: 'r1' }],
    ['a Japanese base row', 'op-op01-006-ja', { relationship: 'other-language', rowLang: 'ja', rowVariant: null }],
    ['a Japanese parallel', 'op-op01-006-ja-p1', { relationship: 'other-language', rowLang: 'ja', rowVariant: 'p1' }],
    ['a Korean base row', 'op-op01-006-ko', { relationship: 'other-language', rowLang: 'ko', rowVariant: null }],
  ] as const)('says how the English base image relates to %s (%s)', async (_name, sku, relation) => {
    // A printing-level row's language is its exact SKU's: here the observation gives none.
    const images = await readMemberPriceImages([{ ...exact, sku, language: null }]);
    expect(images.byItem.get('9')).toEqual({ official: { ...shown, ...relation } });
  });

  it('takes a printing-level row\'s language from its exact SKU, not from a conflicting observation', async () => {
    mocks.query.mockResolvedValue({ rows: [{ source_product_id: 'www.cardrush-op.jp/product/15600', image_url: listingImage }], rowCount: 1 });
    const listed = { ...cardrush('1', 15600), sku: 'op-op01-006-en', setCode: 'op01', mappingStatus: 'exact' as const, language: 'ja' };
    const images = await readMemberPriceImages([{ ...exact, sku: 'op-op01-006-en', language: 'ja' }, listed]);
    expect(images.byItem.get('9')).toEqual({ official: { ...shown, relationship: 'same-printing', rowLang: 'en', rowVariant: null } });
    expect(images.byItem.get('1')).toEqual({ official: { ...shown, relationship: 'same-printing', rowLang: 'en', rowVariant: null }, listing: linkedImage('en') });
  });

  it.each(['op-op01-006-en', 'op-op01-006-ja', 'op-op01-006-en-p1'])('never gives a source-product aggregate its SKU\'s language or printing (%s)', async sku => {
    const images = await readMemberPriceImages([{ ...aggregate, sku }]);
    expect(images.byItem.get('9')).toEqual({ official: { ...shown, relationship: 'pooled-row', rowLang: null, rowVariant: null } });
  });

  it('gives a listing image the row\'s language: the exact SKU\'s, else the observation\'s, else unknown', async () => {
    mocks.query.mockResolvedValue({ rows: ['15600', '169', '778'].map(id => ({ source_product_id: `www.cardrush-op.jp/product/${id}`, image_url: listingImage })), rowCount: 3 });
    const english = { ...cardrush('1', 15600), sku: 'op-op01-006-en', setCode: 'op01', mappingStatus: 'exact' as const, language: 'en' };
    const images = await readMemberPriceImages([english, { ...cardrush('2', 169), language: 'ko' }, { ...cardrush('3', 778), language: null }]);
    expect(images.byItem.get('1')).toEqual({ official: { ...shown, relationship: 'same-printing', rowLang: 'en', rowVariant: null }, listing: linkedImage('en') });
    expect(images.byItem.get('2')).toEqual({ listing: linkedImage('ko') });
    expect(images.byItem.get('3')).toEqual({ listing: linkedImage(null) });
  });

  it('rejects a stored URL that is not the listing\'s own host and shape', async () => {
    mocks.query.mockResolvedValue({ rows: [
      { source_product_id: 'www.cardrush-op.jp/product/15600', image_url: listingImage.replace('www.cardrush-op.jp', 'evil.example') },
      { source_product_id: 'www.cardrush-op.jp/product/169', image_url: listingImage.replace('www.cardrush-op.jp', 'www.cardrush-db.jp') },
    ], rowCount: 2 });
    const images = await readMemberPriceImages([cardrush('1', 15600), cardrush('2', 169)]);
    expect(images.byItem.size).toBe(0);
  });

  it('turns the CardRush lane off with CARDRUSH_LISTING_IMAGES=off, leaving the official lane', async () => {
    for (const value of ['off', ' OFF ']) expect(cardRushListingImagesOn({ CARDRUSH_LISTING_IMAGES: value })).toBe(false);
    for (const value of [undefined, '', 'on', 'of']) expect(cardRushListingImagesOn({ CARDRUSH_LISTING_IMAGES: value })).toBe(true);
    const images = await readMemberPriceImages([cardrush('1', 15600, true), cardrush('2', 169)], { CARDRUSH_LISTING_IMAGES: 'off' });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(images.byItem.get('1')).toEqual({ official: japanese });
    expect(images.byItem.has('2')).toBe(false);
  });

  it('shows no images, without throwing, on a store without 0145 or one that cannot answer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.query.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
      expect((await readMemberPriceImages([cardrush('1', 15600)])).byItem.size).toBe(0);
      expect(error).not.toHaveBeenCalled();
      mocks.query.mockRejectedValue(new Error('connection to internal-db.example failed'));
      mocks.official.mockRejectedValue(new Error('connection to internal-db.example failed'));
      expect((await readMemberPriceImages([cardrush('1', 15600, true)])).byItem.size).toBe(0);
      expect(error.mock.calls.flat().join(' ')).not.toContain('internal-db.example');
    } finally { error.mockRestore(); }
  });

  it('looks up at most the first 50 rows of a page, and nothing for a page with no candidate', async () => {
    const many = Array.from({ length: 80 }, (_, index) => cardrush(String(index), 1000 + index));
    const images = await readMemberPriceImages(many);
    expect(images.rowsLookedUp).toBe(MEMBER_PRICE_IMAGE_ROWS);
    expect(mocks.query.mock.calls[0]![1][0]).toHaveLength(50);
    mocks.query.mockClear(); mocks.official.mockClear();
    expect((await readMemberPriceImages([{ ...base, id: '1' }])).byItem.size).toBe(0);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.official).not.toHaveBeenCalled();
  });
});

describe('the API and downloads never read identity images', () => {
  // The member API, the member export and the derived market API: none may
  // reach the image loader or the listing-image table.
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
  it.each(['app/api', 'lib/data-api', 'lib/market-derived'])('%s', dir => {
    for (const path of files(join(root, dir))) {
      const body = readFileSync(path, 'utf8');
      expect(body, path).not.toContain('member-images');
      expect(body, path).not.toContain('price_source_listing_images');
    }
  });
  // The derived market API carries no image of any kind, official or CardRush:
  // nothing on its path names one, so an image field cannot arrive unnoticed.
  it.each(['app/api/v1/market', 'lib/data-api', 'lib/market-derived'])('%s names no image', dir => {
    for (const path of files(join(root, dir))) expect(readFileSync(path, 'utf8'), path).not.toMatch(/image/i);
  });
  it.each(['lib/prices/member-feed.ts', 'lib/prices/member-export.ts', 'lib/prices/member-http.ts'])('%s', file => {
    const body = readFileSync(join(root, file), 'utf8');
    expect(body).not.toContain('member-images');
    expect(body).not.toContain('price_source_listing_images');
  });
});
