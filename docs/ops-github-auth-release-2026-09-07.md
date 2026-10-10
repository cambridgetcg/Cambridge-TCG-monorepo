# GitHub authentication release evidence — 2026-09-07

## Scope and authorization

Auth source commit: `d57a30447a8494b96e59b9fa09e3ed34aa554eb7`.
Asha requested GitHub login, approved the isolated implementation plan, then
explicitly requested publication and deployment. The intended target is the
storefront through `git push github HEAD:main`, not a duplicate CLI deployment.
The original dirty checkout is preserved.

This is a pre-publication evidence record, not a claim that deployment or live
OAuth verification has completed. No dependencies, database schema, production
admission modes, roles, or hosted secrets were changed.

## Checked

- `pnpm verify`: passed. Storefront: 240 files, 1,701 tests passed and 21 skipped;
  the root contract's typechecks, audits and package tests also passed.
- `pnpm --filter cambridgetcg-storefront build`: passed with Next 16.2.11.
  Local Node was 26; Vercel project configuration selects Node 24. Vercel's build
  remains a separate verification step. The local build logged the existing
  connections-route file-tracing warning and wholesale fallback warnings without
  production wholesale credentials; exit status was zero.
- Additional SKU tests: 85 passed. Data-ingest tests: 248 passed.
- GitHub/admission tests: 91 passed. Actual installed Auth.js core callback
  regressions: 15 passed. Intercepted loopback browser tests: 18 passed.
- Callback coverage includes verified primary/fallback email, absent/forged
  evidence, pre-write registration denial, stable identity after an email
  change, state/PKCE, omitted persisted tokens, and first-link conflicts with
  existing or expired browser sessions. Google/email regression tests passed.
- Both login layouts were inspected locally. No real GitHub authorization or
  live email-delivery test was performed. Temporary local server was stopped.
- `git diff --check`: passed.
- Legacy runbook command `pnpm test:admin` is not a registered root script;
  the untouched admin app was not assigned an invented replacement test. The
  current root `pnpm verify` contract and affected-storefront gates were used.

Production preflight observed the Vercel alias on the same base commit,
`f8626570ddd676fa2513e017eaac618e8e498661`, and confirmed the GitHub `main`
integration, storefront root directory and deployment author association.
Environment-name inspection found Google credentials but no GitHub credential
pair. Therefore GitHub remains absent from provider discovery until separately
configured and verified. No drain or linked monitoring resource was reported;
post-deploy verification must use Vercel logs and HTTP probes. A bounded
pre-deploy sample returned 20 error-level records, all for HTTP 200 responses
outside `/api/auth/`; this is not a clean runtime baseline or a diagnosis of
those unrelated records.

## Production dependency audit disposition

`pnpm audit --prod` was **not clean**: workspace metadata reported 2 critical,
58 high, 46 moderate and 8 low findings. Filtering high/critical findings to
paths beginning `apps/storefront >` yielded 13 advisories, all high. This
release changes no dependency bytes, but that is not the rationale for
proceeding. A read-only, source-path review found the vulnerable APIs below
not reachable with the prerequisite inputs in the affected storefront runtime.
Other applications and moderate/low findings were not audited for exploitability.

| Package / advisories | Source-specific disposition and evidence |
|---|---|
| Drizzle 0.36.4 — GHSA-gpj5-g38j-94v9 | Runtime stock operations do accept supplied SKUs, but these enter `inArray`/`eq` as values, not identifiers. Table/column names and selection keys are literals; no dynamic identifier/alias constructors found in the inspected scope. `apps/storefront/src/lib/stock/reservations.ts:40–62,133–172`; `packages/stock/src/reserver.ts:45–66,83–120`. |
| Undici 7.25.0 — GHSA-vmh5-mc38-953g, GHSA-hm92-r4w5-c3mj | Proxy construction and proxy-URL-keyed pooling do exist (`packages/data-ingest/src/http.ts:27–54`), so there is no blanket proxy-helper exception. The discovered proxy-configured caller is CardRush acquisition, hard-disabled before fetcher creation by `CARDRUSH_ACQUISITION_ENABLED = false` (`packages/data-ingest/src/cardrush/index.ts:72,379–415`). Storefront exposes metadata/classification rather than invoking ingestion; CardRush history returns unavailable (`apps/storefront/src/app/api/v1/cards/[sku]/cardrush-history/route.ts:18–40`). **Reassess before enabling acquisition or exposing proxy-backed ingestion.** |
| Undici — GHSA-vxpw-j846-p89q | No Undici WebSocket/WebSocketStream construction found in scoped application sources; the import is ProxyAgent and a dispatcher type (`packages/data-ingest/src/http.ts:19`). HTTP fetching does not exercise WebSocket frame assembly. |
| Undici — GHSA-4cwx-7wf7-3272 | No HTTP response-cache interceptor installation found. The dispatchers map caches agents, not responses (`packages/data-ingest/src/http.ts:27–54`). |
| Sharp 0.34.5 — GHSA-f88m-g3jw-g9cj | Existing unconditional `images.unoptimized: true` remains (`apps/storefront/next.config.ts:77–83`). Installed Next 16.2.11 `dist/server/next-server.js:197–202` returns 404 before optimization under this setting. No direct Sharp caller found. Do not remove the existing image-processing boundary under this receipt. |
| PostCSS 8.4.31 — GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849 | No application request-controlled CSS-processing path found. Identified Next calls process build CSS; the runtime CSS-optimization branch requires `optimizeCss`, default false and not enabled in storefront config. Installed Next `dist/server/post-process.js:12–29` and `dist/server/config-shared.js:213`. This does not authorize processing malicious third-party build CSS. |
| Nanoid 3.3.11 — GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w | Filtered paths run through PostCSS, which calls `nanoid/non-secure` with literal size 6 (`postcss@8.4.31/lib/input.js:6,57–58`). No application custom-generator or user-selected-size call found. |
| Deepmerge-ts 7.1.5 — GHSA-ggr8-5vv4-36mx | Filtered paths run through Prisma configuration. Scoped runtime source imports neither Prisma configuration nor DeepmergeTS; DB creation uses postgres.js and Drizzle's postgres-js driver (`packages/db/src/index.ts:26–32,104–124`). No path supplying cyclic user-controlled graphs to the vulnerable API found. |
| Nodemailer 8.0.11 — GHSA-p6gq-j5cr-w38f | Mail is runtime-reachable, but both transports explicitly construct selected message fields without envelope spreading or message-level `raw` (`packages/email/src/smtp.ts:59–67`; `packages/email/src/ses.ts:13–27,45–50`). SES `RawMessage` contains generated MIME bytes, not Nodemailer's vulnerable `raw: {path/href}` option. Auth overrides the provider's default sender (`apps/storefront/src/lib/auth/index.ts:56–64`). |

These are bounded non-applicability conclusions about this source and the
inspected installed dependencies, not proof that the packages are patched or
that production has no vulnerabilities. Reassess when a named source boundary,
call path or dependency version changes. The audit payload contained only
package metadata; no credentials or participant records are retained here.
