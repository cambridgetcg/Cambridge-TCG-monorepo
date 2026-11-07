import 'server-only';
import { query } from '@/lib/db';
import { acquireCardmarketMemberPrices } from '@cambridge-tcg/data-ingest/cardmarket/member-prices';
import { acquireScryfallMemberPrices } from '@cambridge-tcg/data-ingest/scryfall/member-prices';
import { MEMBER_PRICE_POLICIES, type ExactPriceCrosswalk } from '@cambridge-tcg/data-ingest/member-prices';
import type { IngestContext } from '@cambridge-tcg/data-ingest/types';
import { writeMemberPriceBatch } from './member-price-writer';

/** Finite seam for an operator and for the flag-gated Cardmarket collector
 * (cardmarket-collector.ts); not an HTTP endpoint itself. Review current
 * official artifact/permission evidence before invoking by hand. The release
 * check precedes network work; the writer checks again in its transaction
 * so revocation during a download cannot release those newly acquired values.
 * Acquisition has a fixed deadline and returns no raw-export/storage artifacts.
 * A caller may pass the transaction, as the writer allows.
 * Official files only. Page sources (CardRush, TCGplayer) are not acquired
 * here; a collector for them writes through the same member-price-writer.
 */
export async function ingestMemberPriceSource(
  input: ({ source: 'cardmarket'; gameId: number } | { source: 'scryfall' }) & {
    crosswalk?: readonly ExactPriceCrosswalk[];
    crosswalkVersion?: string;
  },
  context: IngestContext = {},
  runTransaction?: Parameters<typeof writeMemberPriceBatch>[2],
) {
  const policy = MEMBER_PRICE_POLICIES[input.source];
  if (!policy) throw new Error('unreviewed-member-price-source');
  const release = await query(`SELECT source FROM member_price_source_releases WHERE source=$1 AND evidence_version=$2 AND evidence_url=$3 AND revoked_at IS NULL AND member_display`, [input.source, policy.evidenceVersion, policy.evidenceUrl]);
  if (!release.rows.length) throw new Error('member-price-acquisition-revoked-or-unreviewed');
  const parsed = input.source === 'cardmarket'
    ? await acquireCardmarketMemberPrices(context, input.gameId, input.crosswalk, input.crosswalkVersion)
    : await acquireScryfallMemberPrices(context, input.crosswalk, input.crosswalkVersion);
  const written = await writeMemberPriceBatch(input.source, parsed, runTransaction);
  return {
    source: input.source, status: parsed.quarantine.length ? 'completed-with-quarantine' as const : 'completed' as const,
    sourceRows: parsed.sourceRows, observations: parsed.observations.length,
    mappedObservations: parsed.observations.filter(row => row.mappingStatus === 'exact').length,
    missingPriceFields: parsed.missingPrices, quarantined: parsed.quarantine.length,
    ...written,
  };
}
