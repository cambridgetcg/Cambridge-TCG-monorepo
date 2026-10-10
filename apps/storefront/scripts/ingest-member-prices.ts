/** Manual LOCAL-FILE ingestion. No network fetch, scheduling, or production DB.
 * From storefront: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/ingest-member-prices.ts
 * --source cardmarket --game-id 18 --price-guide /tmp/price_guide_18.json
 * --catalog /tmp/products_singles_18.json [--catalog /tmp/products_nonsingles_18.json]
 * --retrieved-at <actual-file-retrieval-ISO-time>
 * Dry run by default. --write additionally requires --database-url with literal
 * loopback host. It never inherits DATABASE_URL or loads .env files.
 * Scryfall: --source scryfall --bulk <path> --source-url <official-default-cards-url>
 * --source-updated-at <bulk-index.updated_at> --retrieved-at <actual-retrieval-time>.
 * No SKU mapping is fabricated: this initial operator path uses crosswalk:none.
 */
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseCardmarketMemberPrices } from '@cambridge-tcg/data-ingest/cardmarket/member-prices';
import { parseScryfallMemberPrices } from '@cambridge-tcg/data-ingest/scryfall/member-prices';
import { artifactDigest, sourceTimestamp } from '@cambridge-tcg/data-ingest/member-prices';
import type { CardmarketPublicFileArtifact } from '@cambridge-tcg/data-ingest/cardmarket';

async function main() {
  const args = process.argv.slice(2);
  const values = (key: string) => args.flatMap((value, index) => value === `--${key}` ? [args[index + 1]] : []).filter((x): x is string => Boolean(x));
  const one = (key: string) => { const found = values(key); if (found.length !== 1) throw new Error(`Exactly one --${key} required`); return found[0]!; };
  const source = one('source');
  if (source !== 'cardmarket' && source !== 'scryfall') throw new Error('Source must be cardmarket or scryfall');
  const retrievedAt = sourceTimestamp(one('retrieved-at'));
  const bytes = async (path: string, max: number) => {
    if ((await stat(path)).size > max) throw new Error('Input exceeds bounded file size');
    const file = await readFile(path); if (file.byteLength > max) throw new Error('Input exceeds bounded file size'); return file;
  };
  let parsed;
  if (source === 'cardmarket') {
    const gameId = Number(one('game-id'));
    const artifact = async (path: string, kind: 'price-guide' | 'product-list'): Promise<CardmarketPublicFileArtifact> => {
      const file = await bytes(path, 256 * 1024 * 1024);
      const sourceUrl = `https://downloads.s3.cardmarket.com/productCatalog/${kind === 'price-guide' ? 'priceGuide' : 'productList'}/${basename(path)}`;
      return { kind, source_url: sourceUrl, final_url: sourceUrl, bytes: file, byte_length: file.byteLength, sha256: artifactDigest(file), retrieved_at: retrievedAt,
        headers: { content_type: null, content_length: null, content_encoding: null, etag: null, last_modified: null, cache_control: null },
        provenance: { source, as_of: retrievedAt, retrieved_at: retrievedAt } };
    };
    parsed = parseCardmarketMemberPrices({ gameId, priceGuide: await artifact(one('price-guide'), 'price-guide'), catalogs: await Promise.all(values('catalog').map(path => artifact(path, 'product-list'))) });
  } else {
    parsed = parseScryfallMemberPrices({ bytes: await bytes(one('bulk'), 512 * 1024 * 1024), sourceUrl: one('source-url'), sourceUpdatedAt: one('source-updated-at'), retrievedAt });
  }
  const report = { source, dryRun: !args.includes('--write'), sourceRows: parsed.sourceRows, observations: parsed.observations.length, mapped: parsed.observations.filter(row => row.mappingStatus === 'exact').length, missingPrices: parsed.missingPrices, quarantined: parsed.quarantine.length, quarantineSample: parsed.quarantine.slice(0, 10) };
  if (!args.includes('--write')) { console.log(JSON.stringify(report, null, 2)); return; }
  const databaseUrl = one('database-url');
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname || url.pathname === '/' || [...url.searchParams.keys()].some(key => !['sslmode'].includes(key))) throw new Error('Writes require explicit literal-loopback PostgreSQL database URL with no connection-routing parameters');
  process.env.DATABASE_URL = databaseUrl;
  const { writeMemberPriceBatch } = await import('../src/lib/datafeed/member-price-writer');
  const { close } = await import('../src/lib/db');
  try { console.log(JSON.stringify({ ...report, result: await writeMemberPriceBatch(source, parsed) }, null, 2)); }
  finally { await close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Local ingestion failed'); process.exitCode = 1; });
