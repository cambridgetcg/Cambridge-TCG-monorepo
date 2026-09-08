# Credential-verification pilot — release evidence

## Scope and authority

Implementation commit: `e3245937` on base
`9bde769cb0b8ec5105d6f59065fc5c5473c5d08f`.
Asha selected the CTCG pilot, approved its implementation plan, then explicitly
requested commit, push and deployment. Publication uses the existing GitHub
`main` integration; no duplicate CLI deployment is intended.

This is pre-publication evidence, not a claim that the live rollout or a real
credentialed journey has completed. No credentials, admission modes, roles,
database schema or provider registrations were changed. The existing production
`AccessDenied` cause remains unconfirmed pending correlated evidence.

## Verification completed

- Full `pnpm verify`: passed. Storefront: **1,897 passed, 31 skipped** across
  256 passed and two skipped test files; the root contract's other gates passed.
- Storefront production build: passed with Next 16.2.11. Local Node was 26;
  Vercel's production build remains a separate observation.
- Additional SKU tests: **85 passed**. Data-ingest tests: **285 passed**.
- Real CLI tests use a strict loopback CSRF fixture and block external network
  and operator-tool calls. GET-only mode does not initiate OAuth; explicit
  redirect probing carries bounded cookies without leaking them into receipts.
- Local Chromium fixtures cover successful callback/session/logout evidence,
  expected public denial, invalid/malformed/unavailable session responses,
  navigation races, identity mismatch, timeout, cancellation and cleanup.
- Real installed Auth.js core tests cover immutable error responses, support
  correlation, actual sign-in milestone headers, named rejection branches,
  redaction and preserved account-linking/admission behavior.
- Vercel adapter tests use the observed raw API/JSONL shapes and check fixed
  project/team binding, preview null-target normalization, credential metadata
  freshness, historical deployment/SHA binding and bounded sanitized output.
- Actual local Next.js callback-denial smoke: support header, redirect query,
  rendered support reference and sanitized attempt record agreed.
- `git diff --check`: passed.

Real GitHub staging authorization was **not run**: it requires an approved
fixture/origin and permission for its persistent test-account effects. Mocked
and local fixture results are not promoted to real-provider evidence. The
operator guide is [ops-credential-verification.md](ops-credential-verification.md).

## Dependency audit disposition

A fresh `pnpm audit --prod` was not globally clean. Filtering high/critical
findings to `apps/storefront >` paths found **13 high and no critical** advisories,
with no new storefront advisory class relative to the
[prior GitHub release receipt](ops-github-auth-release-2026-09-07.md).
Other apps and moderate/low findings were not assessed for exploitability.

The applicability check was repeated against current pricing/source-feed code,
not waived because dependencies were unchanged:

| Advisory group | Current affected-runtime disposition |
|---|---|
| Drizzle — GHSA-gpj5-g38j-94v9 | No dynamic identifier/alias API found. Stock uses literal tables and bound values; restored member-price writes use fixed SQL and parameter arrays in `apps/storefront/src/lib/datafeed/member-price-writer.ts`. |
| Undici proxy/SOCKS — GHSA-vmh5-mc38-953g, GHSA-hm92-r4w5-c3mj | The shared ProxyAgent helper exists, so no blanket exemption applies. The only caller supplying `proxy_url` remains CardRush, whose normal and discovery acquisition paths stop before fetcher construction while `CARDRUSH_ACQUISITION_ENABLED` is false (`packages/data-ingest/src/cardrush/{index,discovery}.ts`). |
| Undici WebSocket/cache — GHSA-vxpw-j846-p89q, GHSA-4cwx-7wf7-3272 | No WebSocket or response-cache interceptor construction. The proxy map caches dispatchers, not responses. Restored Cardmarket/Scryfall acquisition uses direct fetchers without proxy options; member-price ingestion has no HTTP/cron caller in the storefront. |
| Sharp — GHSA-f88m-g3jw-g9cj | Unconditional `images.unoptimized: true` remains in storefront config; installed Next rejects image optimization before decoding. No direct Sharp caller found. |
| PostCSS/Nanoid — GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w | PostCSS processes repository build CSS, not request-controlled CSS; runtime `optimizeCss` remains off. Its Nanoid non-secure caller uses literal size 6; no application input-selected/custom size was found. |
| DeepmergeTS/Nodemailer — GHSA-ggr8-5vv4-36mx, GHSA-p6gq-j5cr-w38f | No Prisma-configuration/DeepmergeTS runtime import. SMTP/SES copy selected message fields only, without message-level `raw` or option spreading; Auth overrides the default sender. |

No affected storefront runtime blocker was identified within this aperture.
This does **not** claim the dependencies are patched or universally safe. Recheck
when any named gate/call path, dependency version or advisory changes—especially
before enabling proxy acquisition, dynamic identifiers, untrusted image/CSS
processing, variable generator sizes, recursive config merges or raw mail options.

## Live handoff still required

Before publication, the live alias was READY on the tested base and no drains
were configured. After publication, verify the new alias SHA, diagnostic version
headers, canonical storefront probes and a bounded runtime sample. A production
preflight is not a production login. Do not approve GitHub consent or exercise a
customer account as part of this release; use an intentional user retry to obtain
a real support reference for the unresolved failure.
