---
title: The bright-data unlock — substrate-honest proxy routing for WAF-blocked upstreams
form: story-as-wire
kingdom: kingdom-088
story_arc: S45
date: 2026-05-14
authors: Asha Veridian (Sophia, Opus 4.7 1M context)
sister_of:
  - the-cardrush-discovery.md  # kingdom-087 — first named the pokemon regression
  - the-cardrush-end-to-end.md  # kingdom-079 — last reconciliation kingdom for cardrush
  - the-license-propagation.md  # kingdom-081 — license-on-the-wire (the prior _meta widening)
---

# The bright-data unlock

> *The kingdom that fetches through a proxy must say so.*
> *Substrate-honesty extended one ring further.*

## 1. The regression the kingdom couldn't reach alone

Kingdom-087 (the-cardrush-discovery) named what kingdom-087 couldn't fix:

> *`cardrush-pokemon.jp` returns 403 on every path from Vercel egress.*
> *Probe 2026-05-14 confirmed `cf-mitigated: challenge` — Cloudflare WAF, not a simple IP block.*
> *The discovery cron walks five of six confirmed subdomains; pokemon stays at zero.*

Three non-overlapping environments all received 403 with realistic Chrome headers: local laptop, Claude WebFetch infra, Vercel. Robots.txt was reachable; `Content-Signal: search=yes, ai-train=no` was honoured; the WAF was running *before* robots.txt was consulted, and it scored every non-browser TLS fingerprint as `bot`. There was no challenge to solve — just a 403 with a Turnstile injection script in the body. Nothing the kingdom could do from inside its own egress would change that.

**Pokemon is the largest TCG market globally by revenue.** Kingdom-088 is the wire that closes the regression.

## 2. The validation moment

Yu provided Bright Data zone credentials (Web Unlocker class) on 2026-05-14. Before writing any code, I ran a four-call validation through the proxy:

| Endpoint | Status | Latency | Body |
| --- | --- | --- | --- |
| `https://lumtest.com/myip.json` (proxy reachability) | 200 | <1s | exit IP Comcast PA (US-residential pool) |
| `https://www.cardrush-pokemon.jp/` (US exit) | 200 | 3.7s | 373 KB, real homepage `<title>【カードラッシュ】ポケモンカード...` |
| `https://www.cardrush-pokemon.jp/` (`-country-jp` username param) | 200 | 4.7s | 373 KB, exit IP QTnet Fukuoka — JP-residential available |
| `https://www.cardrush-pokemon.jp/sitemap.xml` | 200 | 23.8s | 5.9 MB, **70,507 `/product/<N>` URLs** |
| `/product/7`, `/product/100`, `/product/1000` (real ids) | 200 | 3.6–6.3s | titles in `{SET-NUMBER}` format; `<span class="figure">7,980円</span>` price markup |
| `/product/100000`, `/product/393662` (real 404s) | 404 | 2.1–4.2s | honest not-found |

Three substantive findings:

1. **Catalog is much larger than estimated** — 70,507 products, not the ~10K I'd projected.
2. **Title format is identical** to op/db/digimon — our existing `parseCardMetadata` regex (`\{([A-Z0-9]+)-(\d+)\}`) works unmodified.
3. **HTML template is the same Magento-like skin** — `<p class="selling_price">…<span class="figure">¥</span>` — our existing `scrape-cardrush.ts` parser will work without changes.

The proxy unlocked the upstream completely. No further upstream-side work needed.

## 3. The architectural decision: per-subdomain routing, not platform-wide

Bright Data Web Unlocker bills per successful request ($1.30/1K at the entry tier). Routing every upstream through it would multiply ingest cost ~30×. Routing *only the subdomains that need it* keeps cost bounded to ~$364/month (weekly pokemon snapshot) while preserving direct egress for the five subdomains that work without it.

The right place to encode "needs proxy" is the **registry**, not the code path:

```
packages/data-ingest/src/cardrush/index.ts:73
  export type SubdomainAccessMode = "direct" | "bright-data-unlocker" | "blocked";
  export type SubdomainRole = "catalog+price" | "price-only" | "blocked";

  interface SubdomainEntry {
    game: GameCode;
    confirmed: boolean;
    access: SubdomainAccessMode;
    role: SubdomainRole;
    note?: string;
  }
```

Every existing entry got `access: "direct"` + `role: "catalog+price"` *except*:

- `cardrush-pokemon.jp` → `access: "bright-data-unlocker"` (this kingdom's pivot)
- `cardrush-mtg.jp` → `role: "price-only"` (catalog comes from Scryfall when wired; cardrush is a price-enricher on already-seeded cards — the sitemap timeout that kingdom-087 named is engineering-fixable but not by a proxy)

The discovery runner filters by both `confirmed: true` AND `role` (skips `price-only` + `blocked`). The price scrape filters only by `role: "blocked"` (so cards with `cardrush_url` pointing at an MTG subdomain still get scraped if they were seeded elsewhere).

## 4. The wire

### 4.1 createFetcher accepts a proxy URL

`packages/data-ingest/src/http.ts:18,29,62,124` — `FetcherOptions.proxy_url` accepted by `createFetcher(ctx, meta, options)`. When set, every request through that fetcher is routed via `undici.ProxyAgent`. ProxyAgents are cached by URL string so a long-running cron reuses one agent instead of building one per request.

```ts
// packages/data-ingest/src/http.ts:122
const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
  ...init,
  headers,
  signal: ctx.signal,
};
if (dispatcher) requestInit.dispatcher = dispatcher;
```

The standard `RequestInit` type doesn't include `dispatcher`, but Node 22+'s global fetch (which Next.js uses) is implemented atop undici and honours it. The cast through the intersection type preserves type safety on the rest of the init shape.

The returned `Fetcher` exposes `via_proxy: string | null` (the raw URL — sensitive) and `via_proxy_label: string | null` (credential-free identifier — safe to log). The label-deriving heuristic recognises Bright Data hosts as `bright-data-web-unlocker`.

### 4.2 Per-access-mode fetcher cache

`packages/data-ingest/src/cardrush/index.ts:194` — `CardRushFetcherCache = Map<SubdomainAccessMode, Fetcher>`. One direct fetcher (one token bucket) + one proxied fetcher (separate token bucket). The unlocker provider does its own per-IP throttling, so the buckets serving direct vs proxied traffic don't need to share each other's rate limits.

`getOrCreateFetcher(host, ctx, cache)` returns `{ fetcher, reason? }`:

- `access === "blocked"` → `{ fetcher: null, reason: "subdomain_blocked_by_operator" }`
- `access === "bright-data-unlocker"` + no proxy URL → `{ fetcher: null, reason: "proxy_not_configured (set CARDRUSH_BRIGHT_DATA_PROXY_URL)" }`
- otherwise → cached or freshly-created fetcher

Substrate-honesty: missing operator config surfaces visibly as a row with `price_jpy: null` + `error_reason: "proxy_not_configured"`, not a silent fallback to direct (which would 403 invisibly).

### 4.3 The discovery runner uses the cache

`apps/wholesale/src/lib/cardrush-discovery.ts:121,151` — the per-run cache + per-subdomain fetcher selection:

```ts
const fetcherCache = createDiscoveryCache();
const ctx: CardRushContext = {
  cardrush: {
    bright_data_proxy_url: process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL,
  },
  on_event: ...,
};

for (const [host, entry] of subdomainsToWalk) {
  const { fetcher, reason } = pickDiscoveryFetcher(host, ctx, fetcherCache);
  if (!fetcher) {
    event("subdomain_skipped", { host, reason, access: entry.access });
    continue;
  }
  event("subdomain_fetcher_assigned", {
    host,
    access: entry.access,
    via_proxy: fetcher.via_proxy_label,
  });
  // sitemap + product fetches use this fetcher for the rest of the host
}
```

The price-snapshot path is even simpler: `runSource(cardrush, ctx, writers)` passes `ctx.cardrush.bright_data_proxy_url` through, and the source module's `read()` builds its own cache per run, picking per-URL inside the watch-list iteration.

### 4.4 Provenance plumbed through

`packages/data-ingest/src/types.ts:146` — `RawProvenance.via_proxy?: string | null` carries the proxy label on every raw row. Already populated by `scrapeWithCache` in the cardrush module.

`packages/data-spec/src/schemas/envelope.ts:140` + `apps/storefront/src/lib/data-pantry/envelope.ts:88,114,164` — `_meta.upstream_proxy?: string[]` added as an optional parallel array to `_meta.sources`. When a public response derives from data fetched through an unlocker, the response can declare it. A partner reading `_meta.upstream_proxy: ["bright-data-web-unlocker"]` on a pokemon price endpoint knows the byte rode through a proxy. The field is opt-in — endpoints that don't surface it implicitly mean "direct fetch for every source."

Storing `via_proxy` per-row on `price_archive` would be the full substrate-honesty story; that requires a migration outside this kingdom's scope. The provenance is observable today via `ingest_run.events` (every `subdomain_fetcher_assigned` event records the host + access mode + label, and the source's `start`/`done` events record `proxy_configured` + `via_proxy_counts`).

### 4.5 The audit knows

`apps/admin/scripts/cardrush-discovery-health.ts:127,201,250` — Check 1 skips direct probes for bright-data-unlocker subdomains (the audit doesn't carry credentials; the cron path is the authoritative liveness check for these). Check 2 reports cards-count alone for proxy-required hosts. New Check 6 surfaces per-access-mode counts + warns if any bright-data subdomains exist without the env set locally.

```
◇ Check 6 — access-mode coherence (kingdom-088)
    by access: direct=11  unlocker=1  blocked=0
    by role:   catalog+price=11  price-only=1  blocked=0
    bright-data-unlocker hosts: cardrush-pokemon.jp (proxy configured locally: no)
    ⚠ CARDRUSH_BRIGHT_DATA_PROXY_URL not set locally — admin audit can't probe these directly; verify the cron env (Vercel project: wholesale) carries the proxy URL
```

### 4.6 Three fixes the e2e exposed

A live end-to-end run through the real Bright Data zone (Yu's `seer` zone, US + JP residential pools) surfaced three issues the design alone hadn't predicted. Each fix is small; together they make the wire actually work.

**(a) `requestTls.rejectUnauthorized = false` for proxy-routed traffic.**
Web Unlocker products MITM the upstream TLS — they negotiate with the upstream on our behalf, solve challenges, then re-sign the response with the proxy's own CA so they can inject solved content. The Bright Data CA isn't in Node's default trust store, so strict TLS verification rejected with `ERR_SELF_SIGNED_CERT_IN_CHAIN`. Scoped to *the proxy dispatcher only* — direct fetches keep strict TLS. `packages/data-ingest/src/http.ts:21–42`. The trust model becomes: we trust the proxy to faithfully relay the upstream's bytes. That's the contract entered with Bright Data when the zone was provisioned — substrate-honest about what's trusted and why.

**(b) `Accept-Encoding: identity` for proxied requests when caller doesn't set it.**
Bright Data's proxy strips the `Content-Encoding` response header but passes through the compressed body anyway — undici then has no decoder hint and hands the caller binary garbage that looks like a 15KB blob (brotli-compressed body without the `br` header). Setting `Accept-Encoding: identity` on the request makes the upstream skip compression entirely, so the body arrives plain. Caller can override. `packages/data-ingest/src/http.ts:117–127`. Cost: ~30× the transferred bytes on a 5.9MB sitemap, but Bright Data charges per request, not per byte.

**(c) Full Chrome browser-shape headers.**
A bare `User-Agent: Chrome/122` no longer satisfies Cloudflare-class WAFs running through residential proxies — they also inspect the `Sec-Fetch-*` + `sec-ch-ua-*` Client Hints headers that real Chromium browsers send. Without them, sitemap fetches returned `HTTP 502` and product pages returned `HTTP 403` *through the proxy*. With them, both returned `200`. New `CARDRUSH_BROWSER_HEADERS` constant in the cardrush module is exported and used by `scrapeWithFetcher`, `fetchSitemap`, and `fetchAndParseProduct`. `packages/data-ingest/src/cardrush/index.ts:149–185`.

**Bonus: a latent regex bug fixed.**
The pre-existing `extractFirstPrice` / `extractConditionPrice` used `/¥\s*([\d,]+)/` — but every modern cardrush page uses `nnn円` (Japanese convention), not `¥nnn` (Western convention). The bug was latent because the production cron still uses the legacy `apps/wholesale/tools/lib/cardrush-parser.ts` (which uses the correct `/([\d,]+)円/` regex). Cron cutover to v2 would have silently returned `no_price_in_html` on every product. Fixed: `PRICE_RE` now matches either format. `packages/data-ingest/src/cardrush/index.ts:178–195`.

### 4.7 The e2e harness

A scratch harness at `apps/admin/scripts/_e2e-bright-data.ts` (now removed; not committed) exercised the wire against the real Bright Data zone. Seventeen assertions across six tests:

1. **Registry sanity** — access mode of pokemon = `bright-data-unlocker`; op = `direct`.
2. **Direct control (op)** — `scrapeCardRush('cardrush-op.jp/product/7')` → `price_jpy=120 source=base`; `provenance.via_proxy = null`.
3. **Proxy path (pokemon)** — `scrapeCardRush('cardrush-pokemon.jp/product/7')` → `price_jpy=7980 source=base`; `provenance.via_proxy = "bright-data-web-unlocker"`.
4. **Sitemap through proxy** — `fetchSitemap('cardrush-pokemon.jp', fetcher)` → `ok=true, total_urls=70507, product_urls=70012`; fetcher's `via_proxy_label = "bright-data-web-unlocker"`.
5. **Per-product fetch + parse through proxy** — `fetchAndParseProduct(productUrl, fetcher)` → `ok=true`; title parsed (`ジムバッジ(カツラ キラ仕様)【P】`).
6. **Cache reuse** — repeated `pickDiscoveryFetcher(host, ctx, cache)` calls return the same `Fetcher` instance per access mode (token bucket stays shared across the run).

The harness was deleted after the green run. The next e2e — once the operator pushes the env var to Vercel — happens via the production cron at `/api/cron/discover/cardrush` and `/api/cron/ingest/cardrush`; the audit (`pnpm audit:cardrush-discovery-health`) reports the result.

## 5. The cost story

| Cron | Per-month requests | Cost @ $1.30/1K | Fit |
| --- | --- | --- | --- |
| Discovery cron (~50 new/day steady) | ~1,500 | **~$2** | $1K credit lasts ~40 years |
| Initial discovery backfill (one-time) | 70,507 | **~$92 once** | trivial |
| **Weekly price snapshot of full pokemon catalog** | 280,000 | **~$364** | fits $499 entry tier; $1K = ~3 months |
| Daily price snapshot of full catalog | 2,100,000 | ~$2,730 | overshoots tier |
| Tiered (top 10K daily + tail weekly) | 580,000 | ~$754 | $1K = ~1.3 months |

**Recommendation:** start with discovery + weekly snapshot. Validate that 7-day-old pokemon prices are acceptable for retail/trade-in decisions before considering daily cadence.

## 6. Operator gates

Three Vercel actions complete the wire:

1. **Set env on wholesale project**: `CARDRUSH_BRIGHT_DATA_PROXY_URL` = `http://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:33335`. The audit + the cron both read this name.

2. **Push the registry change** (this kingdom's commit). Until the env is set, the cron emits `subdomain_skipped` with `reason: "proxy_not_configured"` — substrate-honest gap, not a crash.

3. **Verify after first cron run**: `pnpm audit:cardrush-discovery-health` should report `bright-data-unlocker hosts: cardrush-pokemon.jp` AND the run trend (Check 4) should show rows_written > 0 for the next cardrush-discover run.

## 7. What was preserved

- **Verify-don't-overwrite for the five working subdomains.** Op / db / digimon / vanguard / bs all stayed `access: "direct"`. No change to their cron path.
- **The on-demand `scrapeCardRush(url, ctx)` adapter** at `apps/wholesale/src/lib/cardrush-scraper.ts` still works. Its empty context falls back to `process.env.CARDRUSH_BRIGHT_DATA_PROXY_URL` so a one-off scrape against a pokemon URL routes through the proxy when the env is set.
- **The fetch dispatcher is undici-internal.** Node 22+ ships undici inside `globalThis.fetch`; we added `undici@^7.0.0` as an explicit dep on `@cambridge-tcg/data-ingest` so the `ProxyAgent` import resolves cleanly across pnpm strict mode.

## 8. Recursion targets

Eight named for future kingdoms:

1. **`price_archive.via_proxy` column** — migration adds the column; price-snapshot-v2 writes it from `provenance.via_proxy`. Then storefront API routes reading archive rows can populate `_meta.upstream_proxy` automatically. Out of scope for this kingdom (needs operator migration).

2. **Per-subdomain rate-limit tuning** — Bright Data's per-IP residential pool can handle higher rps than 0.5; the proxied fetcher could safely use `rps: 2.0, burst: 5` while direct fetchers stay at 0.5. The current code shares the source's default; a `rate_limit_overrides_by_access` field on `SourceMeta` would let registries tune this.

3. **Fallback on transient proxy failure** — if Bright Data returns 5xx, the current code retries (per existing 429/503 logic) but doesn't fall back to direct. For non-WAF-blocked subdomains this would be acceptable; for pokemon it would just 403 and burn the retry budget. Decision deferred.

4. **MTG sitemap workaround** — kingdom-087 named the timeout; this kingdom set `role: "price-only"` for MTG. The actual price-only path requires Scryfall integration to seed `cards.cardrush_url` for MTG cards. Becomes a kingdom of its own.

5. **`/api/v1/sources` reports access modes** — the existing sources endpoint could surface per-subdomain access mode in its body so partners see the proxy declaration without inspecting `_meta.upstream_proxy` on individual responses.

6. **`pnpm audit:upstream-proxy-claims`** — mechanical audit that walks every `/api/v1/*` route, looks at its `sources`, and verifies that any source whose subdomains include a bright-data entry has its responses declare `_meta.upstream_proxy` correctly. Closes the loop between registry and emission.

7. **Bright Data zone separation** — Yu provided one "seer" zone. If we grow to multiple WAF-blocked upstreams, separating by zone (so usage attribution is per-source) would help cost-control. The registry could carry `bright_data_zone?: string` per subdomain.

8. **The shipped audit Check 6 is a stub for a real cost-tracking check** — extracting Bright Data's per-day usage report and joining against `ingest_run.events` would let an audit confirm "we expected ~10K requests yesterday, we used 10,234 — within margin." Out of scope.

## 9. Substrate-honesty roll-up

Three rings extended:

| Ring | Before kingdom-088 | After |
| --- | --- | --- |
| `RawProvenance` | `as_of`, `retrieved_at`, `source` | `+ via_proxy?: string \| null` |
| `_meta` (data-pantry envelope) | `sources`, `source_license` | `+ upstream_proxy?: string[]` |
| `ingest_run.events` | http events + per-source counters | `+ subdomain_fetcher_assigned`, `+ via_proxy_counts`, `+ proxy_configured` |

A response that says "pokemon prices" now has three places it can declare the unlock: per-row provenance, response meta, and run-level events. None are required; each is opt-in. *The kingdom that fetches through a proxy can now say so at every level the partner reads.*

## 10. Cited files

| File | Lines | What |
| --- | --- | --- |
| `packages/data-ingest/package.json` | 27 | `undici: ^7.0.0` added as dep |
| `packages/data-ingest/src/http.ts` | 17–42, 62–112, 117–127, 162–172 | ProxyAgent with `requestTls.rejectUnauthorized=false` + cache; Accept-Encoding default to identity when proxied; Fetcher gains `via_proxy` + `via_proxy_label` |
| `packages/data-ingest/src/types.ts` | 146–161 | `RawProvenance.via_proxy?: string \| null` |
| `packages/data-ingest/src/cardrush/index.ts` | 51–185, 149–185, 178–195, 190–245, 270–305 | `SubdomainEntry.access`+`role`; pokemon flipped to unlocker; `getOrCreateFetcher`; `CARDRUSH_BROWSER_HEADERS`; `PRICE_RE` matches both `nnn円` and `¥nnn` |
| `packages/data-ingest/src/cardrush/discovery.ts` | 38–46, 363–406 | `createDiscoveryCache` + `pickDiscoveryFetcher`; `CARDRUSH_BROWSER_HEADERS` reused in `fetchSitemap` + `fetchAndParseProduct` |
| `packages/data-ingest/src/index.ts` | 133–157 | Re-exports for the new types + helpers |
| `apps/wholesale/src/lib/cardrush-discovery.ts` | 41–52, 130–161, 200–225 | Per-host fetcher selection; `role: "price-only"` filter |
| `apps/wholesale/src/lib/price-snapshot-v2.ts` | 41, 176–190 | `bright_data_proxy_url` threaded via `CardRushContext` |
| `packages/data-spec/src/schemas/envelope.ts` | 140–155 | `upstream_proxy` field in META_SCHEMA |
| `apps/storefront/src/lib/data-pantry/envelope.ts` | 88–98, 113–117, 162–169 | `upstream_proxy` in `ResponseMeta` + envelope builder |
| `apps/admin/scripts/cardrush-discovery-health.ts` | 1–46, 70–76, 127–160, 201–251 | Check 1 skip-with-note; new Check 6 |

---

*The kingdom learned the proxy. The proxy learned the kingdom.*
*The byte that arrives through a different door now carries the door's name.*
