import { cardmarket, fetchCardmarketPublicFile } from './index';
import { assertCardmarketPublicFileUrl, type CardmarketPublicFileArtifact } from './public-files';
import { artifactDigest, jsonObject, MEMBER_PRICE_REVIEW_VERSION, nativeAmount, resolvePriceCrosswalk, sourceTimestamp, type ExactPriceCrosswalk, type NativePriceObservation, type ParsedMemberPrices } from '../member-prices';
import type { IngestContext, SourceModule } from '../types';

export const CARDMARKET_PRICE_PARSER = 'cardmarket-daily/2';
/** Official game IDs, not guesses from product names. Additional games require a reviewed mapping. */
export const CARDMARKET_PRICE_GAMES: Readonly<Record<number, string>> = { 1: 'magic', 3: 'yu-gi-oh', 6: 'pokemon', 18: 'one-piece' };
const METRICS = ['avg', 'low', 'trend', 'avg1', 'avg7', 'avg30', 'avg-foil', 'low-foil', 'trend-foil', 'avg1-foil', 'avg7-foil', 'avg30-foil'] as const;
export function cardmarketEnvelope(artifact: CardmarketPublicFileArtifact, gameId: number) {
  const source = assertCardmarketPublicFileUrl(artifact.source_url, artifact.kind);
  const final = assertCardmarketPublicFileUrl(artifact.final_url, artifact.kind);
  if (source.pathname !== final.pathname || !source.pathname.endsWith(`_${gameId}.json`) || artifact.byte_length !== artifact.bytes.byteLength || artifactDigest(artifact.bytes) !== artifact.sha256) throw new Error('cardmarket-artifact-identity-mismatch');
  const envelope = jsonObject(JSON.parse(new TextDecoder().decode(artifact.bytes)));
  if (envelope.version !== 1) throw new Error('unsupported-cardmarket-envelope-version');
  const rows = artifact.kind === 'price-guide' ? envelope.priceGuides : envelope.products;
  if (!Array.isArray(rows)) throw new Error('invalid-cardmarket-envelope-rows');
  return { rows, sourceUpdatedAt: sourceTimestamp(envelope.createdAt), retrievedAt: sourceTimestamp(artifact.retrieved_at) };
}
export function parseCardmarketMemberPrices(input: {
  gameId: number; priceGuide: CardmarketPublicFileArtifact; catalogs: CardmarketPublicFileArtifact[];
  crosswalk?: readonly ExactPriceCrosswalk[]; crosswalkVersion?: string;
}): ParsedMemberPrices {
  const game = CARDMARKET_PRICE_GAMES[input.gameId];
  if (!game || input.priceGuide.kind !== 'price-guide' || !input.catalogs.length) throw new Error('cardmarket-reviewed-game-and-catalog-required');
  const guide = cardmarketEnvelope(input.priceGuide, input.gameId);
  const products = new Map<string, { product: Record<string, unknown>; catalogSourceUrl: string; catalogUpdatedAt: string; catalogArtifactSha256: string }>();
  for (const artifact of input.catalogs) {
    if (artifact.kind !== 'product-list') throw new Error('cardmarket-catalog-required');
    const catalog = cardmarketEnvelope(artifact, input.gameId);
    // Catalog refresh follows releases; its clock need not match the daily guide.
    for (const raw of catalog.rows) {
      const product = jsonObject(raw);
      if (!Number.isSafeInteger(product.idProduct) || Number(product.idProduct) <= 0 || (product.idGame !== undefined && product.idGame !== input.gameId)) throw new Error('cardmarket-invalid-catalog-identity');
      const id = String(product.idProduct);
      if (products.has(id)) throw new Error('cardmarket-duplicate-product');
      products.set(id, { product, catalogSourceUrl: artifact.source_url, catalogUpdatedAt: catalog.sourceUpdatedAt, catalogArtifactSha256: artifact.sha256 });
    }
  }
  const result: ParsedMemberPrices = { observations: [], quarantine: [], sourceRows: guide.rows.length, missingPrices: 0 };
  const seen = new Set<string>();
  for (const raw of guide.rows) {
    let row: Record<string, unknown>;
    try { row = jsonObject(raw); } catch { result.quarantine.push({ sourceProductId: null, reason: 'invalid-price-row' }); continue; }
    const id = Number.isSafeInteger(row.idProduct) && Number(row.idProduct) > 0 ? String(row.idProduct) : null;
    if (!id || seen.has(id)) { result.quarantine.push({ sourceProductId: id, reason: 'invalid-or-duplicate-price-identity' }); continue; }
    seen.add(id);
    const catalogEvidence = products.get(id);
    if (!catalogEvidence) { result.quarantine.push({ sourceProductId: id, reason: 'product-missing-from-supplied-catalog' }); continue; }
    const { product, ...catalogProvenance } = catalogEvidence;
    for (const metric of METRICS) {
      let amount: string | null;
      try { amount = nativeAmount(row[metric]); } catch { result.quarantine.push({ sourceProductId: id, field: metric, reason: 'invalid-or-zero-price' }); continue; }
      if (amount === null) { result.missingPrices++; continue; }
      // Unsuffixed metrics do not establish physical finish across games.
      const finish = metric.endsWith('-foil') ? 'foil' : null;
      const mapping = resolvePriceCrosswalk('cardmarket', id, finish, null, game, input.crosswalk ?? []);
      if (mapping.mappingStatus === 'ambiguous') result.quarantine.push({ sourceProductId: id, reason: 'ambiguous-crosswalk-no-sku-assigned' });
      result.observations.push({ source: 'cardmarket', sourceProductId: id, ...mapping, game,
        productName: typeof product.name === 'string' ? product.name : null,
        granularity: 'source-product', finish, language: null, condition: null, metric, amount, currency: 'EUR', underlyingMarket: 'cardmarket',
        sourceUpdatedAt: guide.sourceUpdatedAt, retrievedAt: guide.retrievedAt, sourceUrl: input.priceGuide.source_url,
        parserVersion: CARDMARKET_PRICE_PARSER, crosswalkVersion: input.crosswalkVersion ?? 'none', evidenceVersion: MEMBER_PRICE_REVIEW_VERSION,
        artifactSha256: input.priceGuide.sha256, ...catalogProvenance, quality: 'accepted' });
    }
  }
  return result;
}
/** Finite daily acquisition. No scheduler; all files parse before any writer is invoked. */
export async function acquireCardmarketMemberPrices(ctx: IngestContext, gameId: number, crosswalk: readonly ExactPriceCrosswalk[] = [], crosswalkVersion = 'none') {
  if (!CARDMARKET_PRICE_GAMES[gameId]) throw new Error('unreviewed-cardmarket-game');
  const deadline = AbortSignal.timeout(180_000);
  ctx = { ...ctx, signal: ctx.signal ? AbortSignal.any([ctx.signal, deadline]) : deadline };
  const priceGuide = await fetchCardmarketPublicFile(ctx, { kind: 'price-guide', url: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${gameId}.json` });
  const catalogs = [];
  for (const kind of ['singles', 'nonsingles']) catalogs.push(await fetchCardmarketPublicFile(ctx, { kind: 'product-list', url: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_${kind}_${gameId}.json` }));
  return parseCardmarketMemberPrices({ gameId, priceGuide, catalogs, crosswalk, crosswalkVersion });
}
/** Existing runner seam without reinterpreting source clocks. */
export function cardmarketObservationSource(rows: NativePriceObservation[]): SourceModule<NativePriceObservation, NativePriceObservation> {
  return { meta: cardmarket.meta, async *read() { for (const row of rows) yield { raw: row, provenance: { source: row.source, as_of: row.sourceUpdatedAt, retrieved_at: row.retrievedAt } }; }, normalize: record => ({ ok: true, record }) };
}
