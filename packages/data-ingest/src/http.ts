/**
 * Shared HTTP wrapper for every source module.
 *
 * - Identifies us via User-Agent so upstream operators can find/contact/throttle.
 * - Rate-limits at the module boundary (sliding-window token bucket).
 * - Honours `Retry-After` on 429 / 503.
 * - Emits lifecycle events via the `IngestContext.on_event` hook.
 * - Optional proxy routing via undici `ProxyAgent` (kingdom-088) so a
 *   per-source caller can route some hosts through e.g. Bright Data Web
 *   Unlocker for WAF-blocked upstreams. The fetcher carries its
 *   `via_proxy` URL as an attribute so callers can plumb the
 *   substrate-honest provenance downstream.
 *
 * Modules call `createFetcher(ctx, meta, options?)` and use the returned
 * function instead of bare `fetch`. The wrapper carries the source
 * identity so lifecycle events name the right source.
 */

import { ProxyAgent, type Dispatcher } from "undici";
import type { IngestContext, IngestEvent, SourceMeta, SourceId } from "./types";

const DEFAULT_USER_AGENT =
  "cambridgetcg.com/1.0 (admin@cambridgetcg.com; +https://cambridgetcg.com)";

const DEFAULT_RATE = { rps: 1, burst: 5 };

const proxyAgents = new Map<string, Dispatcher>();

function getProxyAgent(url: string): Dispatcher {
  let a = proxyAgents.get(url);
  if (!a) {
    // requestTls.rejectUnauthorized = false is intentional for proxy-routed
    // traffic. Web Unlocker products (Bright Data, Oxylabs, etc.) MITM the
    // upstream TLS connection — they negotiate with the upstream on our
    // behalf, solve JS/Turnstile challenges, then re-sign the response with
    // the proxy's own CA so they can inject the solved content into the
    // stream. The Bright Data CA isn't in Node's default trust store, so
    // strict TLS verification would reject the re-signed cert with
    // ERR_SELF_SIGNED_CERT_IN_CHAIN.
    //
    // The relaxation is scoped to *this* dispatcher: only requests routed
    // through this proxy bypass cert verification. Direct fetches (no
    // dispatcher) keep strict TLS. The trust model becomes: we trust the
    // proxy to faithfully relay the upstream's bytes. That's the contract
    // we entered with Bright Data — substrate-honest about what we're
    // trusting and why. Documented at the protocol level in
    // `docs/connections/the-bright-data-unlock.md`.
    a = new ProxyAgent({
      uri: url,
      requestTls: { rejectUnauthorized: false },
    });
    proxyAgents.set(url, a);
  }
  return a;
}

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

export interface FetcherOptions {
  /**
   * Optional HTTP/HTTPS proxy URL. When set, every request this fetcher
   * makes is routed through the proxy via undici's `ProxyAgent`. The
   * URL must include credentials when the proxy requires them (Bright
   * Data shape: `http://brd-customer-<id>-zone-<zone>:<pw>@brd.superproxy.io:33335`).
   *
   * Substrate-honesty: the fetcher exposes this URL via its `via_proxy`
   * attribute so callers can attach the same provenance to every raw
   * row they read through it. Added kingdom-088 — see
   * `docs/connections/the-bright-data-unlock.md`.
   */
  proxy_url?: string;
}

export interface Fetcher {
  (url: string, init?: RequestInit): Promise<Response>;
  /** Number of requests served so far in this fetcher's life. */
  readonly count: number;
  /**
   * The proxy URL this fetcher routes through, or null for direct fetch.
   * Callers should plumb this onto `RawProvenance.via_proxy` so the
   * `_meta.upstream_proxy` chain stays substrate-honest end-to-end.
   *
   * The returned string is the operator-configured proxy URL; treat it
   * as sensitive when logging (credentials may be embedded). The
   * `via_proxy_label` derives a credential-free identifier.
   */
  readonly via_proxy: string | null;
  /**
   * Credential-free identifier for the proxy (`bright-data-web-unlocker`,
   * `none`, etc.). Safe to surface in `_meta.upstream_proxy`,
   * ingest_run.events, and logs. Heuristic: matches the proxy host
   * against known providers; falls back to the host.
   */
  readonly via_proxy_label: string | null;
}

function deriveProxyLabel(proxy_url: string | null): string | null {
  if (!proxy_url) return null;
  try {
    const u = new URL(proxy_url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("superproxy.io") || host.includes("brightdata")) {
      return "bright-data-web-unlocker";
    }
    return host;
  } catch {
    return "proxy";
  }
}

/**
 * Build a rate-limited fetcher bound to a source's identity. Each
 * fetcher gets its own token bucket so unrelated sources don't starve
 * each other.
 */
export function createFetcher(
  ctx: IngestContext,
  meta: SourceMeta,
  options: FetcherOptions = {},
): Fetcher {
  const rate = ctx.rate_limit ?? meta.rate_limit ?? DEFAULT_RATE;
  const bucket = makeBucket(rate.rps, rate.burst);
  const ua = buildUserAgent(meta);
  const proxy_url = options.proxy_url ?? null;
  const dispatcher = proxy_url ? getProxyAgent(proxy_url) : null;
  const proxy_label = deriveProxyLabel(proxy_url);
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

      // When routing through a proxy, default Accept-Encoding to identity.
      // Why: some Web Unlocker / residential proxy products (Bright Data
      // included) negotiate compression with the upstream on our behalf
      // but strip the `Content-Encoding` response header before relaying
      // — undici then receives a compressed body with no decoder hint and
      // hands us garbage. Asking for identity skips compression end-to-end
      // and the caller gets a plain text/xml/html body. Caller can
      // override by setting Accept-Encoding explicitly. Direct fetches
      // keep undici's default (br/gzip with auto-decode).
      if (dispatcher && !headers.has("Accept-Encoding")) {
        headers.set("Accept-Encoding", "identity");
      }

      // undici's `dispatcher` option isn't in the standard RequestInit
      // type, but Node 22+'s global fetch is implemented atop undici and
      // honors it. Cast through the union so the type accepts it.
      const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
        ...init,
        headers,
        signal: ctx.signal,
      };
      if (dispatcher) requestInit.dispatcher = dispatcher;

      let response: Response;
      try {
        response = await fetchImpl(url, requestInit);
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
    get via_proxy() {
      return proxy_url;
    },
    get via_proxy_label() {
      return proxy_label;
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
