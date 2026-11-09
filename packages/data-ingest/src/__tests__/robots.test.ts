import { describe, expect, it } from 'vitest';
import { hostRefusal } from '../http';
import { parseRobots, readRobotsTxt, ROBOTS_MAX_BYTES } from '../robots';

// The one robots.txt parser both page collectors read (CardRush's rules are
// exercised through compileCardRushRobots in cardrush/__tests__).
describe('shared robots.txt parser', () => {
  it('combines every group naming an agent, and answers null for an agent no group names', () => {
    const robots = parseRobots('User-agent: GPTBot\nDisallow: /\n\nUser-agent: cambridgetcg\nDisallow: /a\n\nUser-agent: CAMBRIDGETCG/2.0\nDisallow: /b\nCrawl-delay: 4\n\nUser-agent: *\nAllow: /\n');
    const own = robots.group(['cambridgetcg'])!;
    expect([own.allows('/a/1'), own.allows('/b'), own.allows('/c')]).toEqual([false, false, true]);
    expect(own.crawlDelaySeconds).toBe(4);
    expect(robots.group(['*'])!.allows('/a')).toBe(true);
    expect(robots.group(['ia_archiver'])).toBeNull();
    expect(parseRobots('').group(['*'])).toBeNull();
  });

  it('reads Crawl-delay as decimal seconds in its group, the longer of two, and ignores what is not a number', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 10\n').group(['*'])!.crawlDelaySeconds).toBe(10);
    expect(parseRobots('User-agent: *\ncrawl-DELAY : 2.5 # slow\n').group(['*'])!.crawlDelaySeconds).toBe(2.5);
    expect(parseRobots('User-agent: *\nCrawl-delay: 5\nCrawl-delay: 20\n').group(['*'])!.crawlDelaySeconds).toBe(20);
    for (const value of ['-1', 'ten', '1e3', '']) expect(parseRobots(`User-agent: *\nCrawl-delay: ${value}\n`).group(['*'])!.crawlDelaySeconds).toBeNull();
    // Before any agent line it belongs to no group.
    expect(parseRobots('Crawl-delay: 30\nUser-agent: *\nAllow: /\n').group(['*'])!.crawlDelaySeconds).toBeNull();
    // Not a rule, so an agent line after it joins its group: the stricter reading.
    const merged = parseRobots('User-agent: a\nCrawl-delay: 12\nUser-agent: *\nCrawl-delay: 30\nDisallow: /x\n');
    expect(merged.group(['a'])).toMatchObject({ crawlDelaySeconds: 30 });
    expect(merged.group(['a'])!.allows('/x')).toBe(false);
  });

  it('answers each kind of read: rules, none, and the stops that count as refusals', async () => {
    const answer = (response: () => Response) => readRobotsTxt(async () => response(), 'www.example.test');
    expect(await answer(() => new Response('User-agent: *\nDisallow:\n'))).toEqual({ kind: 'rules', text: 'User-agent: *\nDisallow:\n' });
    expect(await answer(() => new Response('', { status: 404 }))).toEqual({ kind: 'none' });
    expect(await answer(() => new Response('', { status: 410 }))).toEqual({ kind: 'none' });
    expect(await answer(() => new Response('', { status: 429, headers: { 'retry-after': '30' } }))).toEqual({ kind: 'stop', reason: 'http-429', status: 429, refused: { status: 429, retryAfter: '30' } });
    expect(await answer(() => new Response('', { status: 503 }))).toEqual({ kind: 'stop', reason: 'http-503', status: 503, refused: null });
    expect(await answer(() => new Response('x'.repeat(ROBOTS_MAX_BYTES + 1)))).toEqual({ kind: 'stop', reason: 'too-large', status: 200, refused: null });
    expect(await answer(() => { throw new TypeError('fetch failed'); })).toEqual({ kind: 'stop', reason: 'fetch-error', status: null, refused: null });
    // The run's budget cutting the read short is the caller's to answer.
    await expect(answer(() => { throw new DOMException('timed out', 'TimeoutError'); })).rejects.toThrow('timed out');
  });

  it('counts a 403, a 429 and a 503 with Retry-After as refusals; nothing else', () => {
    expect(hostRefusal(403, null)).toEqual({ status: 403, retryAfter: null });
    expect(hostRefusal(429, null)).toEqual({ status: 429, retryAfter: null });
    expect(hostRefusal(503, '120')).toEqual({ status: 503, retryAfter: '120' });
    for (const [status, retryAfter] of [[503, null], [500, '120'], [401, null], [404, null], [200, null]] as const) expect(hostRefusal(status, retryAfter)).toBeNull();
  });
});
