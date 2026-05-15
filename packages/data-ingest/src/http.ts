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
   *
   * Mutually exclusive with `api_token`.
   */
  proxy_url?: string;
  /**
   * Bright Data Web Unlocker **API-mode** Bearer token. When set, every
   * request is rewritten into `POST https://api.brightdata.com/request`
   * with the target URL + method + headers + body nested in a JSON
   * envelope and `Authorization: Bearer <api_token>` on the outer call.
   * Bright Data fetches the upstream and relays the response (status +
   * body) with `format: "raw"` so the caller still gets `Response` they
   * can `.text()` / `.arrayBuffer()`. Requires `api_zone`.
   *
   * Functionally equivalent to `proxy_url` for getting bytes through
   * WAF-protected upstreams; differs in transport (POST + Bearer vs
   * HTTP CONNECT) and credential shape (one token vs customer-id +
   * zone + password). Use when only an API token is available, or
   * when the calling environment can't use undici `ProxyAgent`.
   *
   * Mutually exclusive with `proxy_url`. Added 2026-05-14 for cardmarket
   * Path A — same `via_proxy_label` ("bright-data-web-unlocker") as
   * proxy mode so downstream substrate-honesty plumbing is identical.
   */
  api_token?: string;
  /**
   * Bright Data zone name (e.g. `web_unlocker1`). Required when
   * `api_token` is set; ignored otherwise.
   */
  api_zone?: string;
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
   * In proxy mode this is the operator-configured proxy URL — treat as
   * sensitive when logging (credentials may be embedded). In API mode
   * this is a synthetic credential-free URL of the form
   * `https://api.brightdata.com/request?zone=<zone>` that names the
   * endpoint without leaking the Bearer token. Use `via_proxy_label`
   * when a safe identifier is needed.
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
  if (options.proxy_url && options.api_token) {
    throw new Error(
      "createFetcher: pass either proxy_url or api_token, not both",
    );
  }
  if (options.api_token && !options.api_zone) {
    throw new Error("createFetcher: api_token requires api_zone");
  }

  const rate = ctx.rate_limit ?? meta.rate_limit ?? DEFAULT_RATE;
  const bucket = makeBucket(rate.rps, rate.burst);
  const ua = buildUserAgent(meta);
  const proxy_url = options.proxy_url ?? null;
  const api_token = options.api_token ?? null;
  const api_zone = options.api_zone ?? null;
  const dispatcher = proxy_url ? getProxyAgent(proxy_url) : null;

  // For substrate-honesty plumbing: API mode synthesizes a credential-free
  // URL identifying the Bright Data endpoint + zone. The `via_proxy_label`
  // derives "bright-data-web-unlocker" from either form so downstream
  // `_meta.upstream_proxy` chains stay identical across modes.
  const synthetic_api_url = api_token
    ? `https://api.brightdata.com/request?zone=${encodeURIComponent(api_zone!)}`
    : null;
  const via_proxy_attr: string | null = proxy_url ?? synthetic_api_url;
  const proxy_label = deriveProxyLabel(via_proxy_attr);

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

      // Build the final URL + RequestInit. API mode rewrites the call
      // into `POST https://api.brightdata.com/request` with the target
      // URL + method + headers + body nested in a JSON envelope.
      let final_url: string;
      let final_init: RequestInit & { dispatcher?: Dispatcher };

      if (api_token) {
        const upstream_headers: Record<string, string> = {};
        for (const [k, v] of headers.entries()) upstream_headers[k] = v;
        const body_obj: Record<string, unknown> = {
          zone: api_zone,
          url,
          format: "raw",
        };
        if (init.method && init.method.toUpperCase() !== "GET") {
          body_obj.method = init.method;
        }
        if (Object.keys(upstream_headers).length > 0) {
          body_obj.headers = upstream_headers;
        }
        if (init.body !== undefined && init.body !== null) {
          body_obj.body = init.body;
        }
        final_url = "https://api.brightdata.com/request";
        final_init = {
          method: "POST",
          headers: new Headers({
            "Content-Type": "application/json",
            Authorization: `Bearer ${api_token}`,
          }),
          body: JSON.stringify(body_obj),
          signal: ctx.signal,
        };
      } else {
        // undici's `dispatcher` option isn't in the standard RequestInit
        // type, but Node 22+'s global fetch is implemented atop undici and
        // honors it. Cast through the union so the type accepts it.
        const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
          ...init,
          headers,
          signal: ctx.signal,
        };
        if (dispatcher) requestInit.dispatcher = dispatcher;
        final_url = url;
        final_init = requestInit;
      }

      let response: Response;
      try {
        response = await fetchImpl(final_url, final_init);
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
      return via_proxy_attr;
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
