import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const exact: MemberPriceItem = { ...base, id: '9', sku: 'op-op01-006-ja', setCode: 'op01', mappingStatus: 'exact' };
const official = new Map([['op-op01-006-ja', { url: officialUrl, attribution: '©Eiichiro Oda/Shueisha, Toei Animation ©BANDAI CO., LTD.' }]]);

beforeEach(() => {
  mocks.query.mockReset();
  mocks.official.mockReset();
  mocks.query.mockResolvedValue({ rows: [{ source_product_id: 'www.cardrush-op.jp/product/15600', image_url: listingImage }], rowCount: 1 });
  mocks.official.mockResolvedValue(official);
});

describe('/prices identity images', () => {
  it('shows a CardRush row its listing image, an exact row the official reference, and a row with neither none', async () => {
    const images = await readMemberPriceImages([cardrush('1', 15600, true), cardrush('2', 169), exact, { ...base, id: '4' }]);
    expect(images.byItem.get('1')).toEqual({ lane: 'cardrush-listing', url: listingImage });
    // A CardRush row with no listing image and no exact SKU shows none.
    expect(images.byItem.has('2')).toBe(false);
    expect(images.byItem.get('9')).toEqual({ lane: 'official-reference', url: officialUrl, attribution: official.get('op-op01-006-ja')!.attribution });
    expect(images.byItem.has('4')).toBe(false);
    expect(images.rowsLookedUp).toBe(4);
    // One bounded lookup per lane: listings by (source, source product), references by SKU.
    expect(mocks.query).toHaveBeenCalledOnce();
    const [sql, params] = mocks.query.mock.calls[0]!;
    expect(sql).toContain("source = 'cardrush' AND source_product_id = ANY($1::text[]) AND withdrawn_at IS NULL");
    expect(params).toEqual([['www.cardrush-op.jp/product/15600', 'www.cardrush-op.jp/product/169']]);
    expect(mocks.official).toHaveBeenCalledWith(['op-op01-006-ja']);
  });

  it('falls back to the official reference for a mapped CardRush row without a listing image', async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect((await readMemberPriceImages([cardrush('1', 15600, true)])).byItem.get('1')).toMatchObject({ lane: 'official-reference', url: officialUrl });
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
    expect(images.byItem.get('1')).toMatchObject({ lane: 'official-reference' });
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
  it.each(['lib/prices/member-feed.ts', 'lib/prices/member-export.ts', 'lib/prices/member-http.ts'])('%s', file => {
    const body = readFileSync(join(root, file), 'utf8');
    expect(body).not.toContain('member-images');
    expect(body).not.toContain('price_source_listing_images');
  });
});
