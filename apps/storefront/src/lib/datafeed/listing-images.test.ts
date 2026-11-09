import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCardRushMemberPrices } from '@cambridge-tcg/data-ingest/cardrush/member-prices';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ query: vi.fn() }));
import { writeCardRushListingImages } from './listing-images';

// The 15600 and 169 excerpts carry a synthetic og:image; 778 carries none.
const fixtures = new URL('../../../../../packages/data-ingest/src/cardrush/__tests__/fixtures/', import.meta.url);
const page = (id: number) => ({ url: `https://www.cardrush-op.jp/product/${id}`, bytes: readFileSync(new URL(`cardrush-op-${id}.html`, fixtures)), retrievedAt: '2026-10-28T15:00:00.000Z' });
const parsed = parseCardRushMemberPrices([page(15600), page(169), page(778)]);

describe('CardRush listing image links', () => {
  it('upserts one link per listing whose observation the batch wrote, dated and tied to that read', async () => {
    const runQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 2 });
    expect(parsed.listingImages.map(image => image.sourceProductId)).toEqual(['www.cardrush-op.jp/product/15600', 'www.cardrush-op.jp/product/169']);
    expect(await writeCardRushListingImages(parsed.listingImages, parsed.observations, runQuery)).toEqual({ written: 2 });
    expect(runQuery).toHaveBeenCalledOnce();
    const [sql, params] = runQuery.mock.calls[0]!;
    const rows = JSON.parse(params[0]);
    const observation = parsed.observations.find(row => row.sourceProductId === 'www.cardrush-op.jp/product/15600')!;
    expect(rows[0]).toEqual({ sourceProductId: observation.sourceProductId, imageUrl: parsed.listingImages[0]!.imageUrl, listingUrl: 'https://www.cardrush-op.jp/product/15600', seenAt: observation.retrievedAt, artifactSha256: observation.artifactSha256 });
    expect(params.slice(1)).toEqual(['cardrush/2026-10-28.1', 'repo:docs/decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#cardrush']);
    // Only while the release stands; a withdrawn or later-seen link is left alone.
    expect(sql).toContain('revoked_at IS NULL AND member_display');
    expect(sql).toContain('WHERE link.withdrawn_at IS NULL AND link.last_seen_at <= EXCLUDED.last_seen_at');
    expect(sql).not.toMatch(/withdrawn_at\s*=/);
  });

  it('links nothing for a listing the batch did not write, or a URL not of the listing-image shape', async () => {
    const runQuery = vi.fn();
    const [image] = parsed.listingImages;
    expect(await writeCardRushListingImages(parsed.listingImages, [], runQuery)).toEqual({ written: 0 });
    expect(await writeCardRushListingImages([{ ...image!, imageUrl: 'https://www.cardrush-op.jp/data/cardrush-op/_/logo.png' }], parsed.observations, runQuery)).toEqual({ written: 0 });
    expect(await writeCardRushListingImages([{ ...image!, imageUrl: image!.imageUrl.replace('www.cardrush-op.jp', 'www.cardrush-db.jp') }], parsed.observations, runQuery)).toEqual({ written: 0 });
    expect(runQuery).not.toHaveBeenCalled();
  });

  it('records none and logs one line on a store without 0145, and lets any other failure surface', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const missing = vi.fn().mockRejectedValue(Object.assign(new Error('relation "price_source_listing_images" does not exist'), { code: '42P01' }));
      expect(await writeCardRushListingImages(parsed.listingImages, parsed.observations, missing)).toEqual({ written: 0, skipped: 'not-provisioned' });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]!.join(' ')).toContain('migration 0145');
      const broken = vi.fn().mockRejectedValue(Object.assign(new Error('check violation'), { code: '23514' }));
      await expect(writeCardRushListingImages(parsed.listingImages, parsed.observations, broken)).rejects.toThrow('check violation');
    } finally { warn.mockRestore(); }
  });
});
