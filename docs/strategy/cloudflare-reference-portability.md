# Reference assets on Cloudflare — portability assessment

Assessed 2026-09-08. This is a design/verification assessment, not a deployment or migration of another asset. No Cloudflare account, binding, route, secret or production site was changed.

## Conclusion

The pattern transfers well: useful public reference + pure computation + target-owned discovery records + small runtime adapter + negative tests + preview/promotion checks. A whole Next.js application, its cache assumptions, and Cambridge-specific editorial/data policies do not transfer unchanged.

## What was actually proved

A temporary Worker imported the unchanged `src/lib/identifier-validation.ts` and `src/lib/condition/centering.ts`, resolving the existing SKU workspace package. It ran under locally installed Wrangler 4.103.0 / workerd 2026-06-17 without `nodejs_compat`, remote bindings, deployment or an authenticated Cloudflare account.

Five fixed-input cases passed in the actual local Workers runtime: recognized OP/JP normalization; refusal of an underspecified identifier; a syntactically valid but unlisted language; 70/30 border arithmetic; and zero-total rejection. Two HTTP requests returned identical results. The captured bundle was 23,012 bytes, with no remaining import/require statements, Next/React imports, Node specifiers or process/Buffer references found. The temporary server was stopped.

This proves the computation seam, not full Cloudflare production compatibility. Browser rendering, fonts, printing, network cache behavior and a deployed target remain separate tests.

## Portability map

| Layer | Treatment |
|---|---|
| Centering arithmetic | Reuse the pure function and its edge-case tests. |
| Identifier validation | Reuse pure logic with the SKU package's actual license/build arrangement. The package is private and exports TS source; do not advertise a nonexistent npm release. |
| React worksheet | Adapt shared form primitives, semantic tokens, CSS-module build integration and editorial copy to the target. |
| Print styles and fonts | Supply hosted/licensed target fonts and variables. Preserve visible-field/print-mirror font parity and `document.fonts.ready`; test cold loading and real PDFs. A Japanese font is not a promise of universal glyph coverage. |
| Discovery generation | Reuse deterministic serialization and unique-key tests, but supply each target's own origin, assets, dates, authentication and rights records. Do not copy Cambridge's corpus or invitations by default. |
| Sitemap composition | Reuse injected readers, bounds, encoding/deduplication and unavailable-versus-empty distinctions. Cache persistence is an adapter responsibility. |
| API response wrapper | Replace the current CTCG envelope import graph: it includes `next/server`, Node crypto and filesystem-related hospitality modules. A small Web-API envelope can use `crypto.randomUUID()` and explicit headers instead. |
| Deployment | Adapt review, tests, preview, exact-version promotion, smoke checks and rollback to the target's deployment mechanism. |

## Suitable Cloudflare shapes

**Static reference assets:** keep an existing Pages site where it already works, or use Workers Static Assets for a new suitable project. Build real HTML for the reference content, add a small browser interaction bundle, and generate sitemap/robots/discovery files from reviewed records. A calculator does not require a database or an AI service.

**Stateless API:** add a small Worker fetch handler around pure computation. Preserve request-byte/identifier bounds, method/content-type errors, explicit CORS and `no-store`; test that validation performs no source lookup or persistence.

**Full Next.js application:** treat this as a separate compatibility project. Current Cloudflare guidance recommends vinext for new Next.js applications, with OpenNext documented for existing adapter deployments. Do not change an existing asset's framework merely to share this pattern. Review runtime imports, middleware, fonts, storage and caching in the chosen adapter and test the actual Workers runtime.

Cloudflare Workflows, the product, is **not required** for this editorial/build/release workflow. Consider it only for a genuinely durable multi-step job, with separate limits and operational review.

## Traps to preserve in the adapter tests

1. `_headers` applies to static asset responses, not Worker-generated responses. Attach API/SSR `Link`, CORS, MIME and cache headers in the handler too.
2. Assets are normally served before Worker logic. If protected or API paths need the Worker first, configure routing deliberately; an SPA fallback must not turn an API error into a 200 HTML page or bypass authentication.
3. `caches.default` is data-center-local, not a durable global last-good store. Do not claim Vercel/Next cache behavior merely because a TTL was copied. Test successful generation, failed refresh, cold failure and recovery on the chosen backend. If a durable published snapshot is required, select and authorize that storage separately.
4. Build success should not depend on exporting production-only sensitive credentials. Defer source-dependent work to the correct runtime boundary and keep source errors visible instead of producing empty success.
5. Keep canonical URLs, language declarations, licensing and source authority target-owned. Reuse code where its license permits; do not duplicate pages or cross-link unrelated assets merely to raise a backlink score.
6. Preview builds are not production. Verify the exact deployed version, expected public/401/404/415 responses, no-store behavior, XML/JSON content types and runtime logs before calling a port complete.

## Recommended next pilot

Choose one existing Cloudflare-hosted public reference asset with no private data. Adapt only the pure logic, semantic design tokens, a small asset registry and a thin Worker/static host layer. Prove the same browser, Unicode-print, API-boundary and unavailable-source tests before considering a shared package.

Any extracted package should be small: target-supplied `ReferenceAsset` records and pure text/Link/sitemap serializers, not Cambridge's application, source catalog or policy declarations. No extraction or target migration has been performed here.

## Current primary references

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Static headers versus Worker response headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Worker-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Local Workers development and remote-binding boundaries](https://developers.cloudflare.com/workers/local-development/)
- [Cache API scope](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
