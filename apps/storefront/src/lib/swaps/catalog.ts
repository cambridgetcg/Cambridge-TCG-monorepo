// Server-side catalog resolution for swap item snapshots.
//
// snapshot_name / snapshot_image_url are resolved HERE, from the
// wholesale catalog (cards.sku is the authority), never taken from the
// composer: a proposer-supplied name/image could fabricate card
// provenance on the counterparty's page, and an arbitrary image URL is
// a tracking beacon fired from whoever views the swap. A sku the
// catalog can't resolve stays null — the swap page falls back to the
// raw sku and a blank thumbnail, which is honest about what the
// platform could verify.
//
// One batched query over the whole sku set (same shape as
// guidanceForSkus). Reads via the shared wholesale-DB helper in
// @/lib/admin/db — the same WHOLESALE_DATABASE_URL connection the
// catalog's db-source uses; the pool stays in one place.

import { wsQuery } from "@/lib/admin/db";

export interface CatalogSnapshot {
  name: string | null;
  imageUrl: string | null;
}

export async function catalogSnapshotsForSkus(
  skus: string[],
): Promise<Map<string, CatalogSnapshot>> {
  const unique = [...new Set(skus)].filter(Boolean);
  const map = new Map<string, CatalogSnapshot>();
  if (unique.length === 0) return map;
  try {
    const r = await wsQuery<{
      sku: string;
      name: string | null;
      name_en: string | null;
      image_url: string | null;
    }>(
      `SELECT sku, name, name_en, image_url FROM cards WHERE sku = ANY($1)`,
      [unique],
    );
    for (const row of r.rows) {
      map.set(row.sku, {
        // Same preference the catalog surfaces use (db-source.ts):
        // English name when present, native otherwise.
        name: row.name_en || row.name || null,
        imageUrl: row.image_url || null,
      });
    }
  } catch (err) {
    // A catalog outage must not block swap creation — items degrade to
    // sku-only snapshots (null name/image), never to client strings.
    console.error("[swaps] catalog snapshot resolution failed:", err);
  }
  return map;
}
