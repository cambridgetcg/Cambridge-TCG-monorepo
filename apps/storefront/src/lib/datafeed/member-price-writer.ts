import 'server-only';
import { createHash } from 'node:crypto';
import { transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, nativeAmount, priceUseAllowed, sourceTimestamp, type MemberPriceSource, type NativePriceObservation, type ParsedMemberPrices } from '@cambridge-tcg/data-ingest/member-prices';
import type { RawProvenance } from '@cambridge-tcg/data-ingest/types';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateMemberPriceWrite(row: NativePriceObservation, provenance: RawProvenance) {
  if (!priceUseAllowed(row.source, 'member-display', row.evidenceVersion) || row.quality !== 'accepted') throw new Error('unreviewed-price-release');
  if (provenance.source !== row.source || sourceTimestamp(provenance.as_of) !== sourceTimestamp(row.sourceUpdatedAt) || sourceTimestamp(provenance.retrieved_at) !== sourceTimestamp(row.retrievedAt)) throw new Error('price-writer-provenance-mismatch');
  if (!nativeAmount(row.amount) || !/^[a-f0-9]{64}$/.test(row.artifactSha256) || !row.parserVersion.trim() || !row.crosswalkVersion.trim()) throw new Error('invalid-price-evidence');
  if (row.mappingStatus === 'exact' ? !row.sku || !row.setCode : row.sku !== null || row.setCode !== null) throw new Error('invalid-price-mapping');
  if (row.source === 'cardmarket' && (row.currency !== 'EUR' || row.underlyingMarket !== 'cardmarket' || row.granularity !== 'source-product' || row.language !== null || row.condition !== null)) throw new Error('cardmarket-aggregate-scope-mismatch');
}
/** Retrieval time is deliberately excluded: repeat fetching the same artifact
 * cannot manufacture another historical observation or refresh its source clock.
 */
export function memberPriceObservationKey(row: NativePriceObservation) {
  const { retrievedAt: _retrievedAt, ...identity } = row;
  return hash(identity);
}
export async function writeMemberPriceBatch(source: MemberPriceSource, parsed: ParsedMemberPrices) {
  for (const row of parsed.observations) {
    if (row.source !== source) throw new Error('mixed-source-batch');
    validateMemberPriceWrite(row, { source, as_of: row.sourceUpdatedAt, retrieved_at: row.retrievedAt });
  }
  const keyed = parsed.observations.map(row => ({ row, key: memberPriceObservationKey(row) }));
  const ingestKey = hash({ source, keys: keyed.map(row => row.key).sort(), quarantine: parsed.quarantine, sourceRows: parsed.sourceRows, missingPrices: parsed.missingPrices });
  return transaction(async tx => {
    await tx('SELECT pg_advisory_xact_lock(137, 1)');
    const policy = MEMBER_PRICE_POLICIES[source];
    const release = await tx(`SELECT source FROM member_price_source_releases WHERE source=$1 AND evidence_version=$2 AND evidence_url=$3 AND revoked_at IS NULL AND member_display FOR SHARE`, [source, policy.evidenceVersion, policy.evidenceUrl]);
    if (!release.rows.length) throw new Error('member-price-source-revoked-or-unreviewed');
    const existing = await tx('SELECT id::text FROM member_price_batches WHERE ingest_key=$1', [ingestKey]);
    if (existing.rows.length) return { batchId: existing.rows[0].id as string, inserted: 0, duplicate: true };
    const batch = await tx(`INSERT INTO member_price_batches (ingest_key,source,source_rows,missing_prices,quarantine) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id::text`, [ingestKey, source, parsed.sourceRows, parsed.missingPrices, JSON.stringify(parsed.quarantine)]);
    const batchId = batch.rows[0].id as string;
    let inserted = 0;
    // Bounded chunks avoid one network round-trip per metric in a daily file.
    for (let offset = 0; offset < keyed.length; offset += 500) {
      const rows = keyed.slice(offset, offset + 500).map(({ row, key }) => ({ ...row, observationKey: key }));
      const result = await tx(`INSERT INTO member_price_observations
        (batch_id,observation_key,source,source_product_id,sku,mapping_status,game,set_code,product_name,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality,catalog_source_url,catalog_updated_at,catalog_artifact_sha256)
        SELECT $1::bigint, r->>'observationKey',r->>'source',r->>'sourceProductId',r->>'sku',r->>'mappingStatus',r->>'game',r->>'setCode',r->>'productName',r->>'granularity',r->>'finish',r->>'language',r->>'condition',r->>'metric',(r->>'amount')::numeric,r->>'currency',r->>'underlyingMarket',(r->>'sourceUpdatedAt')::timestamptz,(r->>'retrievedAt')::timestamptz,r->>'sourceUrl',r->>'parserVersion',r->>'crosswalkVersion',r->>'evidenceVersion',r->>'artifactSha256',r->>'quality',r->>'catalogSourceUrl',(r->>'catalogUpdatedAt')::timestamptz,r->>'catalogArtifactSha256'
        FROM jsonb_array_elements($2::jsonb) r ON CONFLICT (observation_key) DO NOTHING`, [batchId, JSON.stringify(rows)]);
      inserted += result.rowCount;
    }
    return { batchId, inserted, duplicate: false };
  });
}
