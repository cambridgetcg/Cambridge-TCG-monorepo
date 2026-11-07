/**
 * robots.txt as the page collectors (CardRush, TCGplayer) read it: one
 * parser, RFC 9309's groups and longest-match rule, plus each group's
 * Crawl-delay, which RFC 9309 leaves out but TCGplayer's file sets.
 *
 * A collector reads a host's file once per run, before anything else on that
 * host, through its own identified fetcher and bucket (readRobotsTxt). Which
 * groups apply is the collector's call: CardRush requires both its own group
 * and every crawler's to allow a path; TCGplayer applies its own group if one
 * names it, otherwise every crawler's, as RFC 9309 does.
 */

import { countedRefusal, pageHead, pageRefusal, readBounded, type HostRefusal } from './http';

/** RFC 9309 asks a crawler to read at least 500 KiB; a larger file is not guessed at. */
export const ROBOTS_MAX_BYTES = 512 * 1024;

interface RobotsGroup { agents: string[]; rules: { allow: boolean; pattern: string }[]; crawlDelaySeconds: number | null }
function robotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    // The records that decide access and pace; others (sitemap, host) are skipped.
    const record = /^(user-agent|allow|disallow|crawl-delay)\s*:\s*(.*)$/i.exec(raw.replace(/#.*$/, '').trim());
    if (!record) continue;
    const key = record[1]!.toLowerCase(), value = record[2]!.trim();
    if (key === 'allow' || key === 'disallow') {
      if (current && value) current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      // Seconds, as a non-negative decimal; anything else is no delay. Two in one group: the longer.
      if (current && /^\d+(?:\.\d+)?$/.test(value)) current.crawlDelaySeconds = Math.max(current.crawlDelaySeconds ?? 0, Number(value));
    } else {
      // An agent line: consecutive ones share one group; one after a rule
      // starts the next. A Crawl-delay is not a rule, so an agent line after
      // one joins its group: the stricter reading, the agents sharing its
      // delay and rules.
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [], crawlDelaySeconds: null });
      current.agents.push(value.split('/')[0]!.trim().toLowerCase());
    }
  }
  return groups;
}
interface RobotsRule { allow: boolean; length: number; matches: RegExp }
/** RFC 9309: `*` matches any run of characters and a final `$` ends the
 * path. Each pattern becomes one RegExp, once. */
function compileRobotsRules(rules: RobotsGroup['rules']): RobotsRule[] {
  return rules.map(rule => {
    const anchored = rule.pattern.endsWith('$');
    const body = (anchored ? rule.pattern.slice(0, -1) : rule.pattern).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return { allow: rule.allow, length: rule.pattern.length, matches: new RegExp(`^${body}${anchored ? '$' : ''}`) };
  });
}
/** RFC 9309: the longest matching rule decides, and allow wins a tie. No rule, no limit. */
function robotsAllowsPath(rules: readonly RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!rule.matches.test(path)) continue;
    if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
  }
  return best?.allow ?? true;
}

/** The rules of every group naming one of a set of agents, combined into one
 * as RFC 9309 asks. A path is the URL's path and query. */
export interface RobotsRules {
  allows(path: string): boolean;
  /** The longest Crawl-delay those groups ask, in seconds, or null for none. */
  readonly crawlDelaySeconds: number | null;
}
export interface ParsedRobots {
  /** The groups naming one of `agents` (lower case; '*' is every crawler), or null when none does. */
  group(agents: readonly string[]): RobotsRules | null;
}
/** Parsed once a run, then asked about each path (a CardRush sitemap lists thousands). */
export function parseRobots(text: string): ParsedRobots {
  const groups = robotsGroups(text);
  return {
    group(agents) {
      const named = groups.filter(group => group.agents.some(agent => agents.includes(agent)));
      if (!named.length) return null;
      const rules = compileRobotsRules(named.flatMap(group => group.rules));
      const delays = named.flatMap(group => group.crawlDelaySeconds === null ? [] : [group.crawlDelaySeconds]);
      return { allows: path => robotsAllowsPath(rules, path), crawlDelaySeconds: delays.length ? Math.max(...delays) : null };
    },
  };
}

/** One host's robots.txt, read for a run. `rules` is the file's text; `none`
 * is a host that serves none (404, 410), which sets no rule; `stop` is any
 * other answer, after which the run reads nothing more: a refusal or a
 * challenge (`refused` set when it counts against the host), a redirect (not
 * followed), another status, a file over ROBOTS_MAX_BYTES, or a failed read.
 * An abort (the run's budget) is thrown, not answered.
 */
export type RobotsRead =
  | { kind: 'rules'; text: string }
  | { kind: 'none' }
  | { kind: 'stop'; reason: string; status: number | null; refused: HostRefusal | null };

const aborted = (error: unknown) => error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');

export async function readRobotsTxt(fetcher: (url: string, init?: RequestInit) => Promise<Response>, host: string): Promise<RobotsRead> {
  try {
    const response = await fetcher(`https://${host}/robots.txt`, { redirect: 'manual', headers: { Accept: 'text/plain' } });
    const early = pageRefusal(response);
    if (early) { await response.body?.cancel(); return { kind: 'stop', reason: early, status: response.status, refused: countedRefusal(response, early) }; }
    if (response.status === 404 || response.status === 410) { await response.body?.cancel(); return { kind: 'none' }; }
    if (response.status !== 200) { await response.body?.cancel(); return { kind: 'stop', reason: `http-${response.status}`, status: response.status, refused: null }; }
    const bytes = await readBounded(response, ROBOTS_MAX_BYTES);
    if (!bytes) return { kind: 'stop', reason: 'too-large', status: response.status, refused: null };
    const challenge = pageRefusal(response, pageHead(bytes));
    if (challenge) return { kind: 'stop', reason: challenge, status: response.status, refused: countedRefusal(response, challenge) };
    return { kind: 'rules', text: new TextDecoder().decode(bytes) };
  } catch (error) {
    if (aborted(error)) throw error;
    return { kind: 'stop', reason: 'fetch-error', status: null, refused: null };
  }
}
