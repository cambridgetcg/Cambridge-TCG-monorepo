/**
 * TCGCollector discovery is retired until written partner approval exists.
 *
 * This module deliberately contains no database or network imports. Keeping
 * the old exported function as a fail-closed seam protects direct callers
 * while avoiding an ingest-run row that could make a blocked crawl look as if
 * it had legitimately started.
 */

export const TCGCOLLECTOR_DISCOVERY_BLOCK_REASON =
  "TCGCollector discovery is blocked/no-fetch: no written partner approval records the allowed access, storage, display, image, deletion and redistribution terms.";

export interface TcgcollectorDiscoveryOptions {
  triggeredBy?: "cron" | "admin" | "webhook";
  maxUrls?: number;
  urls?: string[];
  dryRun?: boolean;
}

export interface TcgcollectorDiscoverySummary {
  ingest_run_id: number;
  triggered_by: "cron" | "admin" | "webhook";
  started_at: string;
  finished_at: string;
  dry_run: boolean;
  urls_discovered: number;
  rows_fetched: number;
  rows_parsed_ok: number;
  rows_matched_high_confidence: number;
  rows_matched_medium_confidence: number;
  rows_written_price_archive: number;
  rows_quarantined: number;
  errors: number;
  quarantine_reasons: Record<string, number>;
  fx_rates: Record<string, number | null>;
  sample: Array<{
    source_url: string;
    name: string | null;
    price: number | null;
    currency: string | null;
    sku_match: string | null;
    written: boolean;
  }>;
}

/** Always rejects before network access or database storage. */
export async function runTcgcollectorDiscovery(
  _opts: TcgcollectorDiscoveryOptions = {},
): Promise<TcgcollectorDiscoverySummary> {
  throw new Error(TCGCOLLECTOR_DISCOVERY_BLOCK_REASON);
}
