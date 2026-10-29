import { CARDMARKET_PUBLIC_FILE_ORIGIN } from '@cambridge-tcg/data-ingest/cardmarket';
import { CARDRUSH_COLLECTOR_HOSTS } from '@cambridge-tcg/data-ingest/cardrush/member-prices';
import { TCGPLAYER_COLLECTOR_HOSTS } from '@cambridge-tcg/data-ingest/tcgplayer/member-prices';
import type { CollectedSource } from './collection-flags';

/** Each collector's standing with each host it reads (price_collector_hosts,
 * migration 0146). A run reads its hosts' rows once, under its lease, before
 * any request: a host suspended, or not to be asked before a time still to
 * come, is skipped, whatever the schedule. The run's outcome per host is
 * written once, at its end: refused (http.ts hostRefusal in data-ingest: a
 * 403, a 429, a 503 with Retry-After, a challenge, robots.txt disallowing the
 * collector) moves not_before on and counts toward suspension; a run the host
 * served resets the count; any other ending leaves the row as it was. Rows
 * are keyed by (source, host) and each source's runs hold its lease, so no
 * two runs write one row at once.
 *
 * Safe before 0146: a missing table (42P01) reads as no state and is written
 * as nothing, so a run collects as it did. Any other read failure stops the
 * run, since it cannot tell whether a host asked to be left alone; a failed
 * write is logged and reported, never thrown, so it cannot undo a batch the
 * run already wrote. No @/lib/db import: health (/api/v1/sources) reads these
 * rows too, and the collectors pass their own query.
 */

/** Three refused runs in a row suspend a host. One is often a blip (a deploy,
 * a burst); two in a row can still be chance across a backoff; a third,
 * each after waiting out the host's wait, is a pattern a person should read
 * before the host is asked again. How long the pattern takes is the host's
 * to say: two gaps of the longer of its wait and the collector's schedule.
 * With no Retry-After (6 h) that is at least 12 hours; a TCGplayer host
 * asking a short Retry-After on hourly runs is suspended after about 2 hours.
 * CardRush reads each host every 12 hours, so its third refused run comes a
 * day or more after the first. */
export const HOST_SUSPEND_AFTER = 3;
/** A refusal that names no time (or names one this does not read) waits 6 h:
 * the page collectors' freshness budget, six hourly TCGplayer runs. */
export const HOST_DEFAULT_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** No Retry-After is waited out longer than 7 days; past that, a suspension
 * and a person are the better answer. */
export const HOST_MAX_BACKOFF_MS = 7 * 24 * 60 * 60 * 1000;

/** CardRush's schedule (vercel.json): a run every two hours, each the next
 * host in turn (collectors/cardrush.ts). */
export const CARDRUSH_RUN_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** Every host each collector reads: the six CardRush hosts, TCGplayer's site
 * and two data hosts, and Cardmarket's file host. */
export const COLLECTOR_HOSTS: Readonly<Record<CollectedSource, readonly string[]>> = {
  cardmarket: [new URL(CARDMARKET_PUBLIC_FILE_ORIGIN).hostname],
  cardrush: Object.keys(CARDRUSH_COLLECTOR_HOSTS),
  tcgplayer: TCGPLAYER_COLLECTOR_HOSTS,
};
/** How much longer each host goes between its reads than its source goes
 * between runs: a CardRush host waits out the other five hosts' runs (10 h);
 * TCGplayer and Cardmarket read every host each run. A host's health allows
 * its source's freshness budget plus this (collector-health.ts). */
export const COLLECTOR_HOST_ROTATION_MS: Readonly<Record<CollectedSource, number>> = {
  cardmarket: 0,
  cardrush: (COLLECTOR_HOSTS.cardrush.length - 1) * CARDRUSH_RUN_INTERVAL_MS,
  tcgplayer: 0,
};

export interface CollectorHostRow {
  host: string;
  consecutiveRefusals: number;
  lastSuccessAt: string | null;
  lastRefusalAt: string | null;
  lastRefusalReason: string | null;
  notBefore: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
}
export type HostOutcome =
  | { host: string; kind: 'collected' }
  /** reason: Cambridge's own code for the refusal; retryAfter: the header as the host sent it. */
  | { host: string; kind: 'refused'; reason: string; retryAfter: string | null };
/** A run that asked nothing because a host it reads asked to be left alone. */
export interface HostClosed {
  ran: false; reason: 'host-suspended' | 'host-backing-off'; host: string;
  notBefore: string | null; suspendedAt: string | null; suspendedReason: string | null;
}
export type HostStateWrite = { recorded: number; skipped?: 'not-provisioned' | 'failed' };

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
const undefinedTable = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '42P01';
const REASON = /^[a-z0-9][a-z0-9-]{0,79}$/;
const iso = (value: unknown) => value === null || value === undefined ? null : new Date(value as string | Date).toISOString();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = MONTHS.join('|'), TIME = '(\\d{2}):(\\d{2}):(\\d{2})';
// RFC 9110 §5.6.7's three HTTP-date forms, which a recipient must all accept.
const IMF_FIXDATE = new RegExp(`^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\\d{2}) (${MONTH}) (\\d{4}) ${TIME} GMT$`); // Sun, 06 Nov 1994 08:49:37 GMT
const RFC_850 = new RegExp(`^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, (\\d{2})-(${MONTH})-(\\d{2}) ${TIME} GMT$`); // Sunday, 06-Nov-94 08:49:37 GMT
const ASCTIME = new RegExp(`^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (${MONTH}) ([ \\d]\\d) ${TIME} (\\d{4})$`); // Sun Nov  6 08:49:37 1994, UTC
function httpDate(text: string, now: number): number | null {
  const dated = IMF_FIXDATE.exec(text) ?? RFC_850.exec(text), asctime = dated ? null : ASCTIME.exec(text);
  const parts = dated ? dated.slice(1) : asctime ? [asctime[2]!, asctime[1]!, asctime[6]!, asctime[3]!, asctime[4]!, asctime[5]!] : null;
  if (!parts) return null;
  const [day, month, year, hour, minute, second] = parts as [string, string, string, string, string, string];
  let fullYear = Number(year);
  // RFC 850's two digits: a year more than 50 years ahead is the century before.
  if (year.length === 2) {
    const current = new Date(now).getUTCFullYear();
    fullYear += Math.floor(current / 100) * 100;
    if (fullYear > current + 50) fullYear -= 100;
  }
  return Date.UTC(fullYear, MONTHS.indexOf(month), Number(day), Number(hour), Number(minute), Number(second));
}
/** Retry-After, as RFC 9110 defines it: whole seconds, however many digits,
 * or an HTTP date in any of its three forms. Anything else reads as no value.
 * A date already past is 0. backoffMs caps every wait at 7 days. */
export function retryAfterMs(value: string | null, now: number): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Math.min(Number(text) * 1000, Number.MAX_SAFE_INTEGER);
  const at = httpDate(text, now);
  return at === null ? null : Math.max(0, at - now);
}
/** How long a refused host is left alone: its Retry-After, at most 7 days,
 * or 6 hours when it names none this reads. */
export function backoffMs(retryAfter: string | null, now: number): number {
  return Math.min(retryAfterMs(retryAfter, now) ?? HOST_DEFAULT_BACKOFF_MS, HOST_MAX_BACKOFF_MS);
}

/** The row a run's outcome leaves. A suspended row is never passed here: its
 * host was skipped. */
export function nextHostRow(previous: CollectorHostRow | undefined, outcome: HostOutcome, now: number): CollectorHostRow {
  const at = new Date(now).toISOString();
  const base: CollectorHostRow = previous ?? { host: outcome.host, consecutiveRefusals: 0, lastSuccessAt: null, lastRefusalAt: null, lastRefusalReason: null, notBefore: null, suspendedAt: null, suspendedReason: null };
  if (outcome.kind === 'collected') return { ...base, consecutiveRefusals: 0, lastSuccessAt: at, notBefore: null };
  const reason = REASON.test(outcome.reason) ? outcome.reason : 'unrecognised-refusal';
  const consecutiveRefusals = base.consecutiveRefusals + 1;
  const suspended = consecutiveRefusals >= HOST_SUSPEND_AFTER;
  return {
    ...base, consecutiveRefusals, lastRefusalAt: at, lastRefusalReason: reason,
    notBefore: new Date(now + backoffMs(outcome.retryAfter, now)).toISOString(),
    suspendedAt: suspended ? at : null, suspendedReason: suspended ? reason : null,
  };
}

/** The first of `hosts` (in their order) a run must not ask now: suspended,
 * or not before a time still to come; null when every one may be asked. */
export function closedHost(rows: ReadonlyMap<string, CollectorHostRow> | null, hosts: readonly string[], now: number): HostClosed | null {
  for (const host of hosts) {
    const row = rows?.get(host);
    if (!row) continue;
    const closed = { ran: false as const, host, notBefore: row.notBefore, suspendedAt: row.suspendedAt, suspendedReason: row.suspendedReason };
    if (row.suspendedAt) return { ...closed, reason: 'host-suspended' };
    if (row.notBefore && Date.parse(row.notBefore) > now) return { ...closed, reason: 'host-backing-off' };
  }
  return null;
}

export function hostRowFrom(row: Record<string, unknown>): CollectorHostRow | null {
  if (typeof row.host !== 'string') return null;
  return {
    host: row.host, consecutiveRefusals: Number(row.consecutive_refusals ?? 0),
    lastSuccessAt: iso(row.last_success_at), lastRefusalAt: iso(row.last_refusal_at), lastRefusalReason: typeof row.last_refusal_reason === 'string' ? row.last_refusal_reason : null,
    notBefore: iso(row.not_before), suspendedAt: iso(row.suspended_at), suspendedReason: typeof row.suspended_reason === 'string' ? row.suspended_reason : null,
  };
}
export const HOST_COLUMNS = 'source, host, consecutive_refusals, last_success_at, last_refusal_at, last_refusal_reason, not_before, suspended_at, suspended_reason';

/** One source's rows for `hosts`; null when 0146 is not applied. */
export async function readCollectorHosts(source: CollectedSource, hosts: readonly string[], runQuery: RunQuery): Promise<Map<string, CollectorHostRow> | null> {
  let result;
  try {
    result = await runQuery(`SELECT ${HOST_COLUMNS} FROM price_collector_hosts WHERE source = $1 AND host = ANY($2::text[])`, [source, [...hosts]]);
  } catch (error) {
    if (undefinedTable(error)) return null;
    throw error;
  }
  const rows = new Map<string, CollectorHostRow>();
  for (const raw of result.rows) {
    const row = hostRowFrom(raw);
    if (row && hosts.includes(row.host)) rows.set(row.host, row);
  }
  return rows;
}

/** Writes each outcome's row in one statement. A row suspended meanwhile is
 * left alone (only a person clears one). Never throws. */
export async function recordCollectorHostOutcomes(source: CollectedSource, outcomes: readonly HostOutcome[], previous: ReadonlyMap<string, CollectorHostRow> | null, runQuery: RunQuery, now: number): Promise<HostStateWrite> {
  if (!outcomes.length) return { recorded: 0 };
  if (previous === null) return { recorded: 0, skipped: 'not-provisioned' };
  const rows = outcomes.map(outcome => nextHostRow(previous.get(outcome.host), outcome, now));
  try {
    const result = await runQuery(`INSERT INTO price_collector_hosts AS h (source, host, consecutive_refusals, last_success_at, last_refusal_at, last_refusal_reason, not_before, suspended_at, suspended_reason, updated_at)
      SELECT $1, r->>'host', (r->>'consecutiveRefusals')::integer, (r->>'lastSuccessAt')::timestamptz, (r->>'lastRefusalAt')::timestamptz, r->>'lastRefusalReason',
             (r->>'notBefore')::timestamptz, (r->>'suspendedAt')::timestamptz, r->>'suspendedReason', $3::timestamptz
        FROM jsonb_array_elements($2::jsonb) r
      ON CONFLICT (source, host) DO UPDATE SET consecutive_refusals = EXCLUDED.consecutive_refusals, last_success_at = EXCLUDED.last_success_at,
        last_refusal_at = EXCLUDED.last_refusal_at, last_refusal_reason = EXCLUDED.last_refusal_reason, not_before = EXCLUDED.not_before,
        suspended_at = EXCLUDED.suspended_at, suspended_reason = EXCLUDED.suspended_reason, updated_at = EXCLUDED.updated_at
      WHERE h.suspended_at IS NULL`, [source, JSON.stringify(rows), new Date(now).toISOString()]);
    return { recorded: result.rowCount ?? rows.length };
  } catch (error) {
    if (undefinedTable(error)) return { recorded: 0, skipped: 'not-provisioned' };
    console.error('[collector-hosts] host state not recorded', source, error instanceof Error ? error.name : 'UnknownError');
    return { recorded: 0, skipped: 'failed' };
  }
}
