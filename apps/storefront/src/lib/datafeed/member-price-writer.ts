import 'server-only';
import { createHash } from 'node:crypto';
import { transaction } from '@/lib/db';
import { MEMBER_PRICE_POLICIES, priceUseAllowed, sourceTimestamp, type MemberPriceSource, type NativePriceObservation, type ParsedMemberPrices } from '@cambridge-tcg/data-ingest/member-prices';
import { assertPriceObservationValues } from '@cambridge-tcg/data-spec';
import type { RawProvenance } from '@cambridge-tcg/data-ingest/types';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateMemberPriceWrite(row: NativePriceObservation, provenance: RawProvenance) {
  // Apply the same normalized-value rules used by member reads before opening
  // a transaction. Permission and provenance remain separate required checks.
  assertPriceObservationValues(row);
  if (!priceUseAllowed(row.source, 'member-display', row.evidenceVersion) || row.quality !== 'accepted') throw new Error('unreviewed-price-release');
  if (provenance.source !== row.source || sourceTimestamp(provenance.as_of) !== sourceTimestamp(row.sourceUpdatedAt) || sourceTimestamp(provenance.retrieved_at) !== sourceTimestamp(row.retrievedAt)) throw new Error('price-writer-provenance-mismatch');
  if (!/^[a-f0-9]{64}$/.test(row.artifactSha256) || !row.parserVersion.trim() || !row.crosswalkVersion.trim()) throw new Error('invalid-price-evidence');
}
/** Retrieval time is deliberately excluded: repeat fetching the same artifact
 * cannot manufacture another historical observation or refresh its source clock.
 * So is the source set key: it is evidence beside the identity, and a row read
 * again with its key, or one stored before keys were kept, is the same row.
 */
export function memberPriceObservationKey(row: NativePriceObservation) {
  const { retrievedAt: _retrievedAt, sourceSetKey: _sourceSetKey, ...identity } = row;
  return hash(identity);
}
/** Operators may supply a target-pinned, verified-TLS transaction. All source,
 * provenance and release checks remain inside this writer, including on replay.
 * A file ingest is keyed by its content. A page collector names its run
 * instead (`<source>:…`, e.g. cardrush:<host>:<run ISO> or
 * tcgplayer:<setId>:<run ISO>), so a later run can tell when each part of
 * the source was last read, and two runs that read nothing but the same
 * quarantined pages are still two runs. Either way a repeated key writes
 * nothing.
 */
export async function writeMemberPriceBatch(source: MemberPriceSource, parsed: ParsedMemberPrices, runTransaction: typeof transaction = transaction, options: { ingestKey?: string } = {}) {
  if (options.ingestKey !== undefined && !(options.ingestKey.startsWith(`${source}:`) && /^[\x21-\x7e]{1,200}$/.test(options.ingestKey.slice(source.length + 1)))) throw new Error('invalid-ingest-key');
  for (const row of parsed.observations) {
    if (row.source !== source) throw new Error('mixed-source-batch');
    validateMemberPriceWrite(row, { source, as_of: row.sourceUpdatedAt, retrieved_at: row.retrievedAt });
  }
  const keyed = parsed.observations.map(row => ({ row, key: memberPriceObservationKey(row) }));
  const ingestKey = options.ingestKey ?? hash({ source, keys: keyed.map(row => row.key).sort(), quarantine: parsed.quarantine, sourceRows: parsed.sourceRows, missingPrices: parsed.missingPrices });
  // source_set_key arrives with 0139. A batch none of whose rows names a set
  // writes the columns it always wrote. One that names a set asks the store
  // once whether the column exists: before 0139 (the manual Cardmarket import
  // path), its rows are stored without the key, as every row stored before
  // 0139 is, rather than the batch failing. The key is evidence, not identity.
  const setKeys = keyed.some(({ row }) => row.sourceSetKey != null);
  return runTransaction(async tx => {
    await tx('SELECT pg_advisory_xact_lock(137, 1)');
    const policy = MEMBER_PRICE_POLICIES[source];
    const release = await tx(`SELECT source FROM member_price_source_releases WHERE source=$1 AND evidence_version=$2 AND evidence_url=$3 AND revoked_at IS NULL AND member_display FOR SHARE`, [source, policy.evidenceVersion, policy.evidenceUrl]);
    if (!release.rows.length) throw new Error('member-price-source-revoked-or-unreviewed');
    const existing = await tx('SELECT id::text FROM member_price_batches WHERE ingest_key=$1', [ingestKey]);
    if (existing.rows.length) return { batchId: existing.rows[0].id as string, inserted: 0, duplicate: true };
    const batch = await tx(`INSERT INTO member_price_batches (ingest_key,source,source_rows,missing_prices,quarantine) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id::text`, [ingestKey, source, parsed.sourceRows, parsed.missingPrices, JSON.stringify(parsed.quarantine)]);
    const batchId = batch.rows[0].id as string;
    // The table the INSERT names, resolved through the same search_path.
    const storeSetKeys = setKeys && (await tx(`SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('member_price_observations') AND attname = 'source_set_key' AND NOT attisdropped) AS present`)).rows[0]?.present === true;
    let inserted = 0;
    // Bounded chunks avoid one network round-trip per metric in a daily file.
    for (let offset = 0; offset < keyed.length; offset += 500) {
      const rows = keyed.slice(offset, offset + 500).map(({ row, key }) => ({ ...row, observationKey: key }));
      const result = await tx(`INSERT INTO member_price_observations
        (batch_id,observation_key,source,source_product_id,sku,mapping_status,game,set_code,product_name,granularity,finish,language,condition,metric,amount,currency,underlying_market,source_updated_at,retrieved_at,source_url,parser_version,crosswalk_version,evidence_version,artifact_sha256,quality,catalog_source_url,catalog_updated_at,catalog_artifact_sha256${storeSetKeys ? ',source_set_key' : ''})
        SELECT $1::bigint, r->>'observationKey',r->>'source',r->>'sourceProductId',r->>'sku',r->>'mappingStatus',r->>'game',r->>'setCode',r->>'productName',r->>'granularity',r->>'finish',r->>'language',r->>'condition',r->>'metric',(r->>'amount')::numeric,r->>'currency',r->>'underlyingMarket',(r->>'sourceUpdatedAt')::timestamptz,(r->>'retrievedAt')::timestamptz,r->>'sourceUrl',r->>'parserVersion',r->>'crosswalkVersion',r->>'evidenceVersion',r->>'artifactSha256',r->>'quality',r->>'catalogSourceUrl',(r->>'catalogUpdatedAt')::timestamptz,r->>'catalogArtifactSha256'${storeSetKeys ? ",r->>'sourceSetKey'" : ''}
        FROM jsonb_array_elements($2::jsonb) r ON CONFLICT (observation_key) DO NOTHING`, [batchId, JSON.stringify(rows)]);
      inserted += result.rowCount;
    }
    return { batchId, inserted, duplicate: false };
  });
}
