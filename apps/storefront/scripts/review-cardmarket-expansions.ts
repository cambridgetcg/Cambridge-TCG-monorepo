/** Manual LOCAL-FILE review of Cardmarket One Piece expansions. No network or database.
 * From storefront: pnpm exec tsx scripts/review-cardmarket-expansions.ts /tmp/products_singles_18.json
 * Prints the catalogue's identity and each expansion's review under the rule in
 * src/lib/datafeed/cardmarket-expansions.ts, then the seed tuples it supports.
 * A new seed is a new CARDMARKET_SET_CROSSWALK_VERSION and review identity.
 */
import { readFile, stat } from 'node:fs/promises';
import { artifactDigest, jsonObject } from '@cambridge-tcg/data-ingest/member-prices';
import { reviewCardmarketExpansions } from '../src/lib/datafeed/cardmarket-expansions';

async function main() {
  const path = process.argv[2];
  if (!path || !path.endsWith('products_singles_18.json')) throw new Error('A local products_singles_18.json is required');
  if ((await stat(path)).size > 64 * 1024 * 1024) throw new Error('Input exceeds bounded file size');
  const bytes = await readFile(path);
  const envelope = jsonObject(JSON.parse(bytes.toString('utf8')));
  if (envelope.version !== 1 || !Array.isArray(envelope.products)) throw new Error('unsupported-cardmarket-envelope');
  const products = envelope.products.map(row => jsonObject(row));
  const reviews = [...reviewCardmarketExpansions(products)].sort(([a], [b]) => a - b);
  const reasons: Record<string, number> = {};
  for (const [, review] of reviews) if (review.setCode === null) reasons[review.reason] = (reasons[review.reason] ?? 0) + 1;
  console.log(JSON.stringify({ createdAt: envelope.createdAt, sha256: artifactDigest(bytes), singles: products.length, expansions: reviews.length, unmapped: reasons }, null, 2));
  for (const [id, review] of reviews) {
    if (review.setCode) console.log(`  [${id}, '${review.setCode}', ${review.numbered}, ${review.unnumberedDon}],`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Review failed'); process.exitCode = 1; });
