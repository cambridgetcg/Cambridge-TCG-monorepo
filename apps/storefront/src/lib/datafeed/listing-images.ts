import 'server-only';
import { query } from '@/lib/db';
import { cardRushListingImageUrl, type CardRushListingImage } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { MEMBER_PRICE_POLICIES, type NativePriceObservation } from '@cambridge-tcg/data-ingest/member-prices';

export type ListingImageWrite = { written: number; skipped?: 'not-provisioned' };

const undefinedTable = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01';

/** Records where each CardRush listing's own image lives on CardRush
 * (price_source_listing_images, migration 0145): a link record, not evidence
 * and not a copy. Nothing here fetches the image; /prices points the viewer's
 * browser at CardRush's own URL, credited and linked to the listing (the
 * agents' reading of Yu's words of 2026-10-29, in the decision record).
 *
 * Only listings whose observations the run's batch wrote get a row, each
 * dated by that observation's read and tied to its page digest, and only
 * while CardRush's release row stands. One statement upserts them: a changed
 * URL replaces the stored one and moves last_seen_at on; a withdrawn row, or
 * one already seen later, is left as it is. A store without 0145 (42P01)
 * records none and logs one line, so the batch already written stands.
 */
export async function writeCardRushListingImages(images: readonly CardRushListingImage[], observations: readonly NativePriceObservation[], runQuery: typeof query = query): Promise<ListingImageWrite> {
  const written = new Map(observations.filter(row => row.source === 'cardrush').map(row => [row.sourceProductId, row]));
  const rows = new Map<string, { sourceProductId: string; imageUrl: string; listingUrl: string; seenAt: string; artifactSha256: string }>();
  for (const image of images) {
    const observation = written.get(image.sourceProductId);
    const imageUrl = cardRushListingImageUrl(image.imageUrl, image.sourceProductId.split('/')[0]!);
    if (!observation || !imageUrl || rows.has(image.sourceProductId)) continue;
    rows.set(image.sourceProductId, { sourceProductId: image.sourceProductId, imageUrl, listingUrl: observation.sourceUrl, seenAt: observation.retrievedAt, artifactSha256: observation.artifactSha256 });
  }
  if (!rows.size) return { written: 0 };
  const policy = MEMBER_PRICE_POLICIES.cardrush;
  try {
    const result = await runQuery(`INSERT INTO price_source_listing_images AS link
        (source, source_product_id, image_url, listing_url, first_seen_at, last_seen_at, artifact_sha256)
      SELECT 'cardrush', r->>'sourceProductId', r->>'imageUrl', r->>'listingUrl', (r->>'seenAt')::timestamptz, (r->>'seenAt')::timestamptz, r->>'artifactSha256'
        FROM jsonb_array_elements($1::jsonb) r
       WHERE EXISTS (SELECT 1 FROM member_price_source_releases WHERE source = 'cardrush' AND evidence_version = $2 AND evidence_url = $3 AND revoked_at IS NULL AND member_display)
      ON CONFLICT (source, source_product_id) DO UPDATE
        SET image_url = EXCLUDED.image_url, listing_url = EXCLUDED.listing_url, last_seen_at = EXCLUDED.last_seen_at, artifact_sha256 = EXCLUDED.artifact_sha256
        WHERE link.withdrawn_at IS NULL AND link.last_seen_at <= EXCLUDED.last_seen_at`,
    [JSON.stringify([...rows.values()]), policy.evidenceVersion, policy.evidenceUrl]);
    return { written: result.rowCount };
  } catch (error) {
    if (!undefinedTable(error)) throw error;
    console.warn('[cardrush] listing images not recorded: price_source_listing_images (migration 0145) does not exist');
    return { written: 0, skipped: 'not-provisioned' };
  }
}
