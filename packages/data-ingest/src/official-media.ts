/**
 * The one identified reader for the official sample-image lanes (English
 * and Japanese): every request the manual tools make to a publisher host
 * goes through it. It is reached only from the two manual tools
 * (apps/storefront/scripts/ingest-official-ja.mjs, upload-official-images.mjs)
 * and their tests; nothing in a route, a cron or the package index names it.
 *
 * - One User-Agent per lane, naming the decision the request runs under.
 * - Per host, each request starts at least the interval after the previous
 *   response to that host ended (body read); robots.txt reads count too. The
 *   interval is 2 s, or the host's Crawl-delay when longer.
 * - robots.txt is read through this reader (robots.ts), and both the lane's
 *   own group and every crawler's group must allow a path.
 * - Plain fetch: no retries, redirects not followed, a 30 s timeout, bodies
 *   read up to a cap. A refusal or challenge is an answer: the caller stops.
 */

import { pageHead, pageRefusal, readBounded } from "./http";
import { parseRobots, readRobotsTxt as readRobotsFile, ROBOTS_MAX_BYTES } from "./robots";
import { BANDAI_JP_USER_AGENT, OFFICIAL_MEDIA_ROBOTS_PRODUCT } from "./bandai-jp/config";

export type OfficialMediaLane = "en" | "ja";

/** The decision each lane runs under. */
export const OFFICIAL_MEDIA_PERMISSIONS: Readonly<Record<OfficialMediaLane, string>> = Object.freeze({
  en: "cambridge.official-en-media/2026-07-13",
  ja: "cambridge.official-ja-media/2026-10-30",
});

/** Identical but for the permission: an English request never claims the Japanese decision. */
export const OFFICIAL_MEDIA_USER_AGENTS: Readonly<Record<OfficialMediaLane, string>> = Object.freeze({
  en: "CambridgeTCG-official-media/1.0 (+https://cambridgetcg.com/legal/card-images; contact@cambridgetcg.com; permission cambridge.official-en-media/2026-07-13)",
  ja: BANDAI_JP_USER_AGENT,
});

/** The robots.txt groups that speak to this reader: its product token, and
 * the house name before it (a stricter reading: a group for either binds). */
export const OFFICIAL_MEDIA_ROBOTS_AGENTS: readonly string[] = [OFFICIAL_MEDIA_ROBOTS_PRODUCT, "cambridgetcg"];

export const OFFICIAL_MEDIA_MIN_INTERVAL_MS = 2000;
export const OFFICIAL_MEDIA_TIMEOUT_MS = 30_000;

/** One host's robots.txt, as this reader read it. */
export type OfficialMediaRobots =
  | { kind: "rules"; allows(pathAndQuery: string): boolean; intervalMs: number; readAt: number }
  | { kind: "none"; intervalMs: number; readAt: number }
  | { kind: "stop"; reason: string; status: number | null };

/** One GET's answer. `gone` is 404/410; `stop` is everything else that is not
 * a 200: a refusal, a challenge, a redirect, a 5xx, another status, a body
 * over the cap, a timeout or a failed read. */
export type OfficialMediaAnswer =
  | { kind: "ok"; status: 200; contentType: string; bytes: Uint8Array }
  | { kind: "gone"; status: 404 | 410 }
  | { kind: "stop"; reason: string; status: number | null };

export interface OfficialMediaReaderOptions {
  lane: OfficialMediaLane;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface OfficialMediaReader {
  readonly lane: OfficialMediaLane;
  readonly userAgent: string;
  /** Requests sent so far, robots.txt included. */
  readonly requests: number;
  /** Reads `https://<host>/robots.txt` through this reader and sets the host's interval. */
  readRobotsTxt(host: string): Promise<OfficialMediaRobots>;
  /** One GET of an https URL on a host whose robots.txt this reader has read. */
  get(url: string, init: { accept: string; maxBytes: number }): Promise<OfficialMediaAnswer>;
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

export function createOfficialMediaReader(options: OfficialMediaReaderOptions): OfficialMediaReader {
  const userAgent = OFFICIAL_MEDIA_USER_AGENTS[options.lane];
  if (!userAgent) throw new Error("unknown-official-media-lane");
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;
  const timeoutMs = options.timeoutMs ?? OFFICIAL_MEDIA_TIMEOUT_MS;
  const lastEnded = new Map<string, number>();
  const intervals = new Map<string, number>();
  let requests = 0;

  /** Wait out the host's interval, send one request, read its body up to
   * the cap, and mark when that response ended. */
  async function send(url: URL, accept: string, maxBytes: number): Promise<{ response: Response; bytes: Uint8Array | null } | { error: string }> {
    const host = url.hostname;
    const previous = lastEnded.get(host);
    if (previous !== undefined) {
      const wait = previous + (intervals.get(host) ?? OFFICIAL_MEDIA_MIN_INTERVAL_MS) - now();
      if (wait > 0) await sleep(wait);
    }
    requests += 1;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const response = await options.fetch(url.href, { method: "GET", redirect: "manual", headers: { "User-Agent": userAgent, Accept: accept }, signal });
      let bytes: Uint8Array | null;
      if (response.status === 200) bytes = await readBounded(response, maxBytes);
      else { await response.body?.cancel(); bytes = new Uint8Array(0); }
      return { response, bytes };
    } catch (error) {
      return { error: error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "fetch-error" };
    } finally {
      lastEnded.set(host, now());
    }
  }

  return {
    lane: options.lane,
    userAgent,
    get requests() { return requests; },

    async readRobotsTxt(host) {
      // robots.ts reads the file; this reader sends it, under the lane's
      // User-Agent and within the host's spacing.
      const viaReader = async (target: string): Promise<Response> => {
        const answer = await send(new URL(target), "text/plain", ROBOTS_MAX_BYTES);
        if ("error" in answer) throw new Error(answer.error);
        const { response, bytes } = answer;
        if (response.status === 200 && bytes === null) {
          return new Response(new Uint8Array(ROBOTS_MAX_BYTES + 1), { status: 200, headers: response.headers });
        }
        return new Response(NULL_BODY.has(response.status) || !bytes ? null : bytes.slice(), { status: response.status, headers: response.headers });
      };
      const read = await readRobotsFile(viaReader, host);
      if (read.kind === "stop") return { kind: "stop", reason: read.reason, status: read.status };
      const readAt = now();
      if (read.kind === "none") {
        intervals.set(host, OFFICIAL_MEDIA_MIN_INTERVAL_MS);
        return { kind: "none", intervalMs: OFFICIAL_MEDIA_MIN_INTERVAL_MS, readAt };
      }
      const parsed = parseRobots(read.text);
      const own = parsed.group(OFFICIAL_MEDIA_ROBOTS_AGENTS), everyone = parsed.group(["*"]);
      const delays = [own?.crawlDelaySeconds, everyone?.crawlDelaySeconds].filter((d): d is number => typeof d === "number");
      const intervalMs = Math.max(OFFICIAL_MEDIA_MIN_INTERVAL_MS, ...delays.map((d) => Math.ceil(d * 1000)));
      intervals.set(host, intervalMs);
      return {
        kind: "rules", intervalMs, readAt,
        allows: (pathAndQuery) => (own?.allows(pathAndQuery) ?? true) && (everyone?.allows(pathAndQuery) ?? true),
      };
    },

    async get(target, init) {
      let url: URL;
      try { url = new URL(target); } catch { return { kind: "stop", reason: "invalid-url", status: null }; }
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return { kind: "stop", reason: "invalid-url", status: null };
      if (!intervals.has(url.hostname)) return { kind: "stop", reason: "robots-not-read", status: null };
      const answer = await send(url, init.accept, init.maxBytes);
      if ("error" in answer) return { kind: "stop", reason: answer.error, status: null };
      const { response, bytes } = answer;
      const early = pageRefusal(response);
      if (early) return { kind: "stop", reason: early, status: response.status };
      if (response.status === 404 || response.status === 410) return { kind: "gone", status: response.status };
      if (response.status >= 300 && response.status < 400) return { kind: "stop", reason: `redirect-${response.status}`, status: response.status };
      if (response.status !== 200) return { kind: "stop", reason: `http-${response.status}`, status: response.status };
      if (bytes === null) return { kind: "stop", reason: "too-large", status: 200 };
      const challenge = pageRefusal(response, pageHead(bytes));
      if (challenge) return { kind: "stop", reason: challenge, status: 200 };
      return { kind: "ok", status: 200, contentType: response.headers.get("content-type") ?? "", bytes };
    },
  };
}
