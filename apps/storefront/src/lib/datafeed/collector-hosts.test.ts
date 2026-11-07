import { describe, expect, it, vi } from 'vitest';
import {
  backoffMs, closedHost, COLLECTOR_HOSTS, HOST_DEFAULT_BACKOFF_MS, HOST_MAX_BACKOFF_MS, HOST_SUSPEND_AFTER, nextHostRow, readCollectorHosts,
  recordCollectorHostOutcomes, retryAfterMs, type CollectorHostRow, type HostOutcome,
} from './collector-hosts';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const HOUR = 3_600_000;
const host = 'www.cardrush-db.jp';
const refused = (reason = 'http-429', retryAfter: string | null = null): HostOutcome => ({ host, kind: 'refused', reason, retryAfter });
const collected: HostOutcome = { host, kind: 'collected' };
/** The rows a host's outcomes leave, one run an hour. */
function runs(outcomes: HostOutcome[], start: CollectorHostRow | undefined = undefined) {
  const rows: CollectorHostRow[] = [];
  let row = start;
  outcomes.forEach((outcome, index) => { row = nextHostRow(row, outcome, NOW + index * HOUR); rows.push(row); });
  return rows;
}
const missing = () => vi.fn(async () => { throw Object.assign(new Error('relation "price_collector_hosts" does not exist'), { code: '42P01' }); });

describe('collector host state', () => {
  it('lists every host each collector reads', () => {
    expect(COLLECTOR_HOSTS).toEqual({
      cardmarket: ['downloads.s3.cardmarket.com'],
      cardrush: ['www.cardrush-op.jp', 'www.cardrush-pokemon.jp', 'www.cardrush-db.jp', 'www.cardrush-digimon.jp', 'www.cardrush-vanguard.jp', 'www.cardrush-bs.jp'],
      tcgplayer: ['www.tcgplayer.com', 'mpapi.tcgplayer.com', 'infinite-api.tcgplayer.com'],
    });
  });

  it('reads Retry-After as RFC 9110 defines it: seconds, or an HTTP date in any of its three forms', () => {
    expect(retryAfterMs('120', NOW)).toBe(120_000);
    expect(retryAfterMs('0', NOW)).toBe(0);
    expect(retryAfterMs('Thu, 29 Oct 2026 14:30:00 GMT', NOW)).toBe(2.5 * HOUR);
    // The two obsolete forms a recipient must still accept: RFC 850, and asctime (UTC).
    expect(retryAfterMs('Thursday, 29-Oct-26 14:30:00 GMT', NOW)).toBe(2.5 * HOUR);
    expect(retryAfterMs('Thu Oct 29 14:30:00 2026', NOW)).toBe(2.5 * HOUR);
    expect(retryAfterMs('Sun Nov  1 12:00:00 2026', NOW)).toBe(72 * HOUR);
    // RFC 850's two-digit year: one more than 50 years ahead is the century before.
    expect(retryAfterMs('Sunday, 01-Nov-76 12:00:00 GMT', NOW)).toBe(Date.parse('2076-11-01T12:00:00Z') - NOW);
    expect(retryAfterMs('Monday, 01-Nov-77 12:00:00 GMT', NOW)).toBe(0);
    // A date already past asks for no wait.
    expect(retryAfterMs('Wed, 28 Oct 2026 12:00:00 GMT', NOW)).toBe(0);
    for (const value of [null, '', '1.5', '-5', '0x10', 'soon', '2026-10-29T14:30:00Z', 'Thu, 29 Oct 2026 14:30:00 UTC', 'Thu, 29-Oct-26 14:30:00 GMT', 'Thu Oct 29 14:30:00 2026 GMT']) {
      expect(retryAfterMs(value, NOW)).toBeNull();
    }
  });

  it('waits out the Retry-After, at most 7 days, or 6 hours when the host names none', () => {
    expect(backoffMs('3600', NOW)).toBe(HOUR);
    expect(backoffMs('Fri, 30 Oct 2026 12:00:00 GMT', NOW)).toBe(24 * HOUR);
    expect(backoffMs(String(30 * 24 * 3600), NOW)).toBe(HOST_MAX_BACKOFF_MS);
    // However many digits it has: a longer wait asked is never a shorter one waited.
    expect(backoffMs('999999999999', NOW)).toBe(HOST_MAX_BACKOFF_MS);
    expect(backoffMs('1000000000000', NOW)).toBe(HOST_MAX_BACKOFF_MS);
    expect(backoffMs('9'.repeat(400), NOW)).toBe(HOST_MAX_BACKOFF_MS);
    expect(backoffMs('Sunday, 01-Nov-26 12:00:00 GMT', NOW)).toBe(72 * HOUR);
    expect(backoffMs('Sun, 29 Nov 2026 12:00:00 GMT', NOW)).toBe(HOST_MAX_BACKOFF_MS);
    expect(HOST_MAX_BACKOFF_MS).toBe(7 * 24 * HOUR);
    expect(backoffMs(null, NOW)).toBe(HOST_DEFAULT_BACKOFF_MS);
    expect(backoffMs('later', NOW)).toBe(HOST_DEFAULT_BACKOFF_MS);
    expect(HOST_DEFAULT_BACKOFF_MS).toBe(6 * HOUR);
  });

  it('records a refusal with its time, code and not-before, and skips the host until then whatever the schedule', () => {
    const [row] = runs([refused('http-503', '7200')]);
    expect(row).toEqual({ host, consecutiveRefusals: 1, lastSuccessAt: null, lastRefusalAt: '2026-10-29T12:00:00.000Z', lastRefusalReason: 'http-503', notBefore: '2026-10-29T14:00:00.000Z', suspendedAt: null, suspendedReason: null });
    const rows = new Map([[host, row!]]);
    expect(closedHost(rows, [host], NOW + HOUR)).toEqual({ ran: false, reason: 'host-backing-off', host, notBefore: '2026-10-29T14:00:00.000Z', suspendedAt: null, suspendedReason: null });
    expect(closedHost(rows, [host], Date.parse('2026-10-29T14:00:00.000Z'))).toBeNull();
    expect(closedHost(rows, ['www.cardrush-op.jp'], NOW)).toBeNull();
    expect(closedHost(null, [host], NOW)).toBeNull();
  });

  it(`suspends the host after ${HOST_SUSPEND_AFTER} refused runs in a row, recording why and when, and keeps it closed`, () => {
    expect(HOST_SUSPEND_AFTER).toBe(3);
    const rows = runs([refused('http-429'), refused('http-429'), refused('robots-disallows-collector')]);
    expect(rows.map(row => [row.consecutiveRefusals, row.suspendedAt])).toEqual([[1, null], [2, null], [3, '2026-10-29T14:00:00.000Z']]);
    expect(rows[2]).toMatchObject({ suspendedReason: 'robots-disallows-collector', lastRefusalReason: 'robots-disallows-collector' });
    // No automatic resume: closed after its not-before, for good.
    expect(closedHost(new Map([[host, rows[2]!]]), [host], NOW + 30 * 24 * HOUR)).toMatchObject({ reason: 'host-suspended', suspendedAt: '2026-10-29T14:00:00.000Z', suspendedReason: 'robots-disallows-collector' });
  });

  it('resets the count on a run the host served, so refusals must come in a row', () => {
    const rows = runs([refused(), refused(), collected, refused(), refused()]);
    expect(rows.map(row => row.consecutiveRefusals)).toEqual([1, 2, 0, 1, 2]);
    expect(rows.every(row => row.suspendedAt === null)).toBe(true);
    expect(rows[2]).toMatchObject({ lastSuccessAt: '2026-10-29T14:00:00.000Z', notBefore: null, lastRefusalReason: 'http-429' });
  });

  it('stores only its own codes as the reason', () => {
    expect(nextHostRow(undefined, refused('challenge-Managed Challenge'), NOW).lastRefusalReason).toBe('unrecognised-refusal');
  });

  it('reads one source\'s rows for its hosts, and nothing before 0146; any other failure is thrown', async () => {
    const runQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [
      { source: 'cardrush', host, consecutive_refusals: 2, last_success_at: new Date('2026-10-28T00:15:00Z'), last_refusal_at: new Date('2026-10-29T00:15:00Z'), last_refusal_reason: 'http-403', not_before: new Date('2026-10-29T06:15:00Z'), suspended_at: null, suspended_reason: null },
      { source: 'cardrush', host: 'www.not-asked.jp', consecutive_refusals: 0 },
    ] }));
    const rows = await readCollectorHosts('cardrush', [host], runQuery);
    expect(runQuery.mock.calls[0]![1]).toEqual(['cardrush', [host]]);
    expect([...rows!.values()]).toEqual([{ host, consecutiveRefusals: 2, lastSuccessAt: '2026-10-28T00:15:00.000Z', lastRefusalAt: '2026-10-29T00:15:00.000Z', lastRefusalReason: 'http-403', notBefore: '2026-10-29T06:15:00.000Z', suspendedAt: null, suspendedReason: null }]);
    expect(await readCollectorHosts('cardrush', [host], missing())).toBeNull();
    await expect(readCollectorHosts('cardrush', [host], vi.fn(async () => { throw Object.assign(new Error('permission denied'), { code: '42501' }); }))).rejects.toThrow('permission denied');
  });

  it('writes each outcome in one statement that leaves a suspended row alone, and never throws', async () => {
    const runQuery = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 1 }));
    expect(await recordCollectorHostOutcomes('cardrush', [refused('http-429', '60')], new Map(), runQuery, NOW)).toEqual({ recorded: 1 });
    const [sql, params] = runQuery.mock.calls[0]!;
    expect(sql).toMatch(/ON CONFLICT \(source, host\) DO UPDATE SET[\s\S]*WHERE h\.suspended_at IS NULL$/);
    expect(params![0]).toBe('cardrush');
    expect(JSON.parse(params![1] as string)).toEqual([expect.objectContaining({ host, consecutiveRefusals: 1, notBefore: '2026-10-29T12:01:00.000Z' })]);
    expect(await recordCollectorHostOutcomes('cardrush', [], new Map(), runQuery, NOW)).toEqual({ recorded: 0 });
    expect(await recordCollectorHostOutcomes('cardrush', [collected], null, runQuery, NOW)).toEqual({ recorded: 0, skipped: 'not-provisioned' });
    expect(runQuery).toHaveBeenCalledOnce();
    expect(await recordCollectorHostOutcomes('cardrush', [collected], new Map(), missing(), NOW)).toEqual({ recorded: 0, skipped: 'not-provisioned' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await recordCollectorHostOutcomes('cardrush', [collected], new Map(), vi.fn(async () => { throw new Error('connection reset'); }), NOW)).toEqual({ recorded: 0, skipped: 'failed' });
    expect(error).toHaveBeenCalledWith('[collector-hosts] host state not recorded', 'cardrush', 'Error');
    error.mockRestore();
  });
});
