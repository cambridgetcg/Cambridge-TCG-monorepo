/**
 * Shared HTTP wrapper for every source module.
 *
 * - Identifies us via User-Agent so upstream operators can find/contact/throttle.
 * - Rate-limits at the module boundary (sliding-window token bucket).
 * - Honours `Retry-After` on 429 / 503.
 * - Emits lifecycle events via the `IngestContext.on_event` hook.
 *
 * Modules call `createFetcher(ctx, meta)` and use the returned function
 * instead of bare `fetch`. The wrapper carries the source identity so
 * lifecycle events name the right source.
 */

import type { IngestContext, IngestEvent, SourceMeta, SourceId } from "./types.js";

const DEFAULT_USER_AGENT =
  "cambridgetcg.com/1.0 (admin@cambridgetcg.com; +https://cambridgetcg.com)";

const DEFAULT_RATE = { rps: 1, burst: 5 };

interface TokenBucket {
  tokens: number;
  last_refill_ms: number;
  rps: number;
  burst: number;
}

function makeBucket(rps: number, burst: number): TokenBucket {
  return { tokens: burst, last_refill_ms: Date.now(), rps, burst };
}

async function take(bucket: TokenBucket): Promise<void> {
  while (true) {
    const now = Date.now();
    const elapsed_s = (now - bucket.last_refill_ms) / 1000;
    bucket.tokens = Math.min(bucket.burst, bucket.tokens + elapsed_s * bucket.rps);
    bucket.last_refill_ms = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    const need_s = (1 - bucket.tokens) / bucket.rps;
    await sleep(Math.ceil(need_s * 1000));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emit(ctx: IngestContext, ev: IngestEvent): void {
  ctx.on_event?.(ev);
}

function buildUserAgent(meta: SourceMeta): string {
  return meta.user_agent_suffix
    ? `${DEFAULT_USER_AGENT} ${meta.user_agent_suffix}`
    : DEFAULT_USER_AGENT;
}

export interface Fetcher {
  (url: string, init?: RequestInit): Promise<Response>;
  /** Number of requests served so far in this fetcher's life. */
  readonly count: number;
}

/**
 * Build a rate-limited fetcher bound to a source's identity. Each
 * fetcher gets its own token bucket so unrelated sources don't starve
 * each other.
 */
export function createFetcher(ctx: IngestContext, meta: SourceMeta): Fetcher {
  const rate = ctx.rate_limit ?? meta.rate_limit ?? DEFAULT_RATE;
  const bucket = makeBucket(rate.rps, rate.burst);
  const ua = buildUserAgent(meta);
  let count = 0;
  let max_retries = 3;

  const fetchImpl: typeof fetch = ctx.fetch ?? fetch;

  const f = async (url: string, init: RequestInit = {}): Promise<Response> => {
    let attempt = 0;
    while (true) {
      await take(bucket);
      count += 1;

      const headers = new Headers(init.headers);
      if (!headers.has("User-Agent")) headers.set("User-Agent", ua);
      if (!headers.has("Accept") && !init.body) headers.set("Accept", "application/json");

      let response: Response;
      try {
        response = await fetchImpl(url, { ...init, headers, signal: ctx.signal });
      } catch (err) {
        emit(ctx, {
          ts: new Date().toISOString(),
          source: meta.id as SourceId,
          kind: "error",
          detail: { url, attempt, error: String(err) },
        });
        if (attempt >= max_retries) throw err;
        attempt += 1;
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }

      // Retry on 429 / 503 with Retry-After honouring.
      if ((response.status === 429 || response.status === 503) && attempt < max_retries) {
        const ra = response.headers.get("Retry-After");
        const wait_ms = ra ? parseRetryAfter(ra) : 1000 * Math.pow(2, attempt + 1);
        emit(ctx, {
          ts: new Date().toISOString(),
          source: meta.id as SourceId,
          kind: "rate-limit",
          detail: { url, status: response.status, wait_ms, attempt },
        });
        await sleep(wait_ms);
        attempt += 1;
        continue;
      }

      return response;
    }
  };

  return Object.assign(f, {
    get count() {
      return count;
    },
  }) as Fetcher;
}

function parseRetryAfter(value: string): number {
  // Either seconds, or HTTP-date.
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const date = new Date(value).getTime();
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return 5000;
}
