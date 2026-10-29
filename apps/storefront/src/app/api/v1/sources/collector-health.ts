/**
 * Health of a page collector, judged by the batches it writes.
 *
 * CardRush's and TCGplayer's collectors record each run as
 * member_price_batches rows in the storefront database (one per host read, or
 * one per set). The legacy wholesale ingest_run rows for those ids come from
 * locked paths and say nothing about the collectors, so /api/v1/sources/[id]
 * and audit:tributaries check 9 read the batches instead.
 *
 * A run can write a batch that holds no observation: TCGplayer records a set
 * whose read or write failed as an empty batch, and CardRush records a run the
 * host refused, or one whose every page was quarantined, as a batch of
 * quarantine only. So health is judged by the newest batch that recorded
 * observations: within the budget is healthy; batches written within the
 * budget that recorded none read as failing; otherwise stale, or very stale
 * past twice the budget. A run that fails before writing any batch (one that
 * rolls back, as Cardmarket's do) still leaves nothing, and reads as stale.
 * Only counts, times and whether a batch recorded observations are read:
 * quarantine entries hold source text and stay operator-only. How many
 * observations a batch holds is not counted, since health needs only none or
 * some, and counting reads every row of a daily file (about 74,600 for One
 * Piece) on each anonymous request.
 */

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export interface CollectorBatch {
  inserted_at: string;
  source_rows: number;
  missing_prices: number;
  quarantined: number;
  /** Whether the batch recorded any observation; false for a batch of quarantine only. */
  observed: boolean;
}

export type CollectorBatchRead =
  /** latest_observed_at: when the newest batch that recorded observations was written, or null for none. */
  | { available: true; latest: CollectorBatch | null; latest_observed_at: string | null }
  | { available: false; reason: string };

export type CollectorHealth = "healthy" | "stale" | "very_stale" | "failing" | "never_run" | "unknown";

const iso = (value: unknown) => new Date(value as string | Date).toISOString();

/** The newest batch for one source, and when the newest batch that recorded
 * observations was written. Ids follow insertion: the writer holds an advisory
 * lock while it allocates one. Never throws: a database that is not
 * configured, a table that is not provisioned and a failed query are each
 * `available: false` with the reason.
 */
export async function readLatestCollectorBatch(source: string, runQuery?: RunQuery): Promise<CollectorBatchRead> {
  let run: RunQuery;
  try {
    run = runQuery ?? (await import("@/lib/db")).query;
  } catch {
    return { available: false, reason: "the storefront database is not configured here" };
  }
  try {
    const table = await run(`SELECT to_regclass('member_price_batches') IS NOT NULL AS provisioned`);
    if (table.rows[0]?.provisioned !== true) {
      return { available: false, reason: "member_price_batches is not provisioned (migration 0137)" };
    }
    const latest = await run(
      `SELECT b.id::text AS id, b.inserted_at, b.source_rows, b.missing_prices, jsonb_array_length(b.quarantine) AS quarantined,
              EXISTS (SELECT 1 FROM member_price_observations o WHERE o.batch_id = b.id) AS observed
         FROM member_price_batches b WHERE b.source = $1 ORDER BY b.id DESC LIMIT 1`,
      [source],
    );
    const row = latest.rows[0];
    if (!row) return { available: true, latest: null, latest_observed_at: null };
    const batch: CollectorBatch = {
      inserted_at: iso(row.inserted_at),
      source_rows: Number(row.source_rows),
      missing_prices: Number(row.missing_prices),
      quarantined: Number(row.quarantined),
      observed: row.observed === true,
    };
    if (batch.observed) return { available: true, latest: batch, latest_observed_at: batch.inserted_at };
    const observed = await run(
      `SELECT b.inserted_at FROM member_price_batches b
        WHERE b.source = $1 AND b.id < $2::bigint AND EXISTS (SELECT 1 FROM member_price_observations o WHERE o.batch_id = b.id)
        ORDER BY b.id DESC LIMIT 1`,
      [source, row.id],
    );
    return { available: true, latest: batch, latest_observed_at: observed.rows[0] ? iso(observed.rows[0].inserted_at) : null };
  } catch {
    return { available: false, reason: "member_price_batches could not be read" };
  }
}

/** Same thresholds as the legacy ingest_run health, applied to the newest
 * batch that recorded observations: past the budget is stale, past twice the
 * budget very stale. A collector that wrote batches within the budget, none of
 * which recorded an observation, is failing: it runs and collects nothing. */
export function deriveCollectorHealth(read: CollectorBatchRead, freshnessSeconds: number, now: number = Date.now()): { health: CollectorHealth; reason: string } {
  if (!read.available) return { health: "unknown", reason: read.reason };
  if (!read.latest) {
    return { health: "never_run", reason: "no member_price_batches row for this source: its collector has not written a batch" };
  }
  const ageOf = (at: string) => (now - Date.parse(at)) / 1000;
  const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)}h`;
  const budget = `freshness budget ${hours(freshnessSeconds)}`;
  const observedAge = read.latest_observed_at === null ? null : ageOf(read.latest_observed_at);
  if (observedAge !== null && observedAge <= freshnessSeconds) {
    return { health: "healthy", reason: "latest batch with observations within freshness budget" };
  }
  const observed = observedAge === null ? "no batch has recorded an observation" : `latest batch with observations written ${hours(observedAge)} ago`;
  const latestAge = ageOf(read.latest.inserted_at);
  if (latestAge <= freshnessSeconds) {
    return { health: "failing", reason: `batches written within the ${budget} recorded no observations; ${observed}` };
  }
  const ageSec = observedAge ?? latestAge;
  const age = observedAge === null ? `latest batch written ${hours(latestAge)} ago and ${observed}; ${budget}` : `${observed}; ${budget}`;
  if (ageSec > 2 * freshnessSeconds) return { health: "very_stale", reason: `${age} (2x exceeded)` };
  return { health: "stale", reason: age };
}
