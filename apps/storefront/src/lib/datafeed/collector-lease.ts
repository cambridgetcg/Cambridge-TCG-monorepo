import 'server-only';
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';

/** One collector run at a time per lease key (migration 0143). A duplicate
 * cron delivery or a manual authenticated call during a scheduled run would
 * otherwise double the rate the collector keeps to (0.5 rps per CardRush
 * host, an agent's call; TCGplayer's robots.txt Crawl-Delay 10). No rate is
 * recorded as agreed with either source. Keys: 'cardmarket', 'tcgplayer' (all its
 * hosts share one bucket, so one lease) and 'cardrush:<host>'.
 *
 * A lease is taken before any request or write. A key someone else holds
 * means another run is reading: this one answers ran:false, 'run-in-progress'.
 * A store without the lease table answers 'lease-not-provisioned': a run is
 * never started unleased.
 *
 * Each run builds a fresh fetcher, whose bucket lets its first request go at
 * once, so the spacing between runs is kept here. A run that asks for
 * spacingMs (its source's request interval) leaves its row, on release,
 * expiring that long after the release, which comes after its last request:
 * a run that starts sooner answers ran:false, 'request-spacing', and sends
 * nothing.
 */

/** Past the cron routes' maxDuration (300 s): a run the platform stops before
 * it can release its row leaves a lease that expires only once that run is
 * certainly over. The next delivery after such a stop waits at most this long. */
export const COLLECTOR_LEASE_TTL_MS = 330_000;
/** The holder a released row names while its spacing runs out. */
export const COLLECTOR_SPACING_HOLDER = 'request-spacing';

export type CollectorLeaseRefusal = { ran: false; reason: 'run-in-progress' | 'request-spacing' | 'lease-not-provisioned' };
export interface CollectorLeaseOptions {
  runQuery?: typeof query; ttlMs?: number; holder?: string;
  /** The source's interval between requests (CardRush 2 s per host, TCGplayer
   * 10 s), kept after the run ends; 0 or none deletes the row at the end. */
  spacingMs?: number;
}

const LEASE_KEY = /^[a-z][a-z0-9-]*(:[a-z0-9.-]+)?$/;
const undefinedTable = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01';
const validSpacing = (spacingMs: number) => Number.isSafeInteger(spacingMs) && spacingMs >= 0 && spacingMs <= 60_000;

/** Takes the lease if no one holds it, or if its holder's time (or a finished
 * run's spacing) has run out. One statement: two runs racing for one key
 * cannot both win. It also reads who held the key, so a refusal says whether
 * a run is reading or the last one's spacing is still running out. */
export async function acquireCollectorLease(key: string, options: CollectorLeaseOptions = {}): Promise<{ holder: string } | CollectorLeaseRefusal> {
  const runQuery = options.runQuery ?? query, ttlMs = options.ttlMs ?? COLLECTOR_LEASE_TTL_MS, holder = options.holder ?? randomUUID();
  if (!LEASE_KEY.test(key) || key.length > 200) throw new Error('invalid-collector-lease-key');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 3_600_000) throw new Error('invalid-collector-lease-ttl');
  if (!holder.trim() || holder.length > 200 || holder === COLLECTOR_SPACING_HOLDER) throw new Error('invalid-collector-lease-holder');
  let taken;
  try {
    taken = await runQuery(`WITH taken AS (
        INSERT INTO price_collector_leases AS lease (lease_key, holder, acquired_at, expires_at)
        VALUES ($1, $2, now(), now() + $3::integer * interval '1 millisecond')
        ON CONFLICT (lease_key) DO UPDATE SET holder = EXCLUDED.holder, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at
        WHERE lease.expires_at < now()
        RETURNING holder)
      SELECT (SELECT holder FROM taken) AS holder, (SELECT holder FROM price_collector_leases WHERE lease_key = $1) AS held_by`, [key, holder, ttlMs]);
  } catch (error) {
    if (undefinedTable(error)) return { ran: false, reason: 'lease-not-provisioned' };
    throw error;
  }
  const row = taken.rows[0];
  if (row?.holder === holder) return { holder };
  // held_by is the row as the statement found it, before any change.
  return { ran: false, reason: row?.held_by === COLLECTOR_SPACING_HOLDER ? 'request-spacing' : 'run-in-progress' };
}

/** Gives the lease back, only while this holder still has it: a lease another
 * run took over after this one's expired is that run's. With spacingMs the row
 * stays, expiring spacingMs after now, which is after this run's last request;
 * without it the row is deleted. */
export async function releaseCollectorLease(key: string, holder: string, runQuery: typeof query = query, spacingMs = 0): Promise<boolean> {
  if (!validSpacing(spacingMs)) throw new Error('invalid-collector-lease-spacing');
  const result = spacingMs > 0
    ? await runQuery(`UPDATE price_collector_leases SET holder = $3, expires_at = now() + $4::integer * interval '1 millisecond'
        WHERE lease_key = $1 AND holder = $2`, [key, holder, COLLECTOR_SPACING_HOLDER, spacingMs])
    : await runQuery('DELETE FROM price_collector_leases WHERE lease_key = $1 AND holder = $2', [key, holder]);
  return result.rowCount === 1;
}

/** Runs `work` under the lease, then gives the lease back, keeping the
 * source's spacing. Refused, `work` never starts. A failed release is logged
 * and left to expire, which keeps the spacing too; it never hides the run's
 * own result or error. */
export async function withCollectorLease<T>(key: string, work: () => Promise<T>, options: CollectorLeaseOptions = {}): Promise<{ ran: true; value: T } | CollectorLeaseRefusal> {
  const runQuery = options.runQuery ?? query, spacingMs = options.spacingMs ?? 0;
  if (!validSpacing(spacingMs)) throw new Error('invalid-collector-lease-spacing');
  const lease = await acquireCollectorLease(key, { ...options, runQuery });
  if ('reason' in lease) return lease;
  try {
    return { ran: true, value: await work() };
  } finally {
    try { await releaseCollectorLease(key, lease.holder, runQuery, spacingMs); }
    catch (error) { console.error('[collector-lease] release failed; the lease will expire', key, error instanceof Error ? error.name : 'UnknownError'); }
  }
}
