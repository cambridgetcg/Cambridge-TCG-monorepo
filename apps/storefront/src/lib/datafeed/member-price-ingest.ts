import 'server-only';
import { query } from '@/lib/db';
import { acquireCardmarketMemberPrices } from '@cambridge-tcg/data-ingest/cardmarket/member-prices';
import { acquireScryfallMemberPrices } from '@cambridge-tcg/data-ingest/scryfall/member-prices';
import { MEMBER_PRICE_POLICIES, type ExactPriceCrosswalk } from '@cambridge-tcg/data-ingest/member-prices';
import type { IngestContext } from '@cambridge-tcg/data-ingest/types';
import { writeMemberPriceBatch } from './member-price-writer';

/** Finite operator seam, NOT an HTTP endpoint, cron, or enabled production job.
 * Review current official artifact/permission evidence before invoking. The
 * release check precedes network work; the writer checks again in its transaction
 * so revocation during a download cannot release those newly acquired values.
 * Acquisition has a fixed deadline and returns no raw-export/storage artifacts.
 */
export async function ingestMemberPriceSource(
  input: ({ source: 'cardmarket'; gameId: number } | { source: 'scryfall' }) & {
    crosswalk?: readonly ExactPriceCrosswalk[];
    crosswalkVersion?: string;
  },
  context: IngestContext = {},
) {
  const policy = MEMBER_PRICE_POLICIES[input.source];
  if (!policy) throw new Error('unreviewed-member-price-source');
  const release = await query(`SELECT source FROM member_price_source_releases WHERE source=$1 AND evidence_version=$2 AND evidence_url=$3 AND revoked_at IS NULL AND member_display`, [input.source, policy.evidenceVersion, policy.evidenceUrl]);
  if (!release.rows.length) throw new Error('member-price-acquisition-revoked-or-unreviewed');
  const parsed = input.source === 'cardmarket'
    ? await acquireCardmarketMemberPrices(context, input.gameId, input.crosswalk, input.crosswalkVersion)
    : await acquireScryfallMemberPrices(context, input.crosswalk, input.crosswalkVersion);
  const written = await writeMemberPriceBatch(input.source, parsed);
  return {
    source: input.source, status: parsed.quarantine.length ? 'completed-with-quarantine' as const : 'completed' as const,
    sourceRows: parsed.sourceRows, observations: parsed.observations.length,
    mappedObservations: parsed.observations.filter(row => row.mappingStatus === 'exact').length,
    missingPriceFields: parsed.missingPrices, quarantined: parsed.quarantine.length,
    ...written,
  };
}
