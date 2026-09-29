# TCG data platform entry — 2026-09-29

Yu asked to position Cambridge TCG as open-source TCG data infrastructure and
lay out integration work for SKU identity, images, pricing and market data.
The [canonical roadmap](../plans/tcg-data-platform/README.md) records that plan;
this document records the local implementation and verification.

## Implemented locally

- Home, About, metadata and shared navigation now introduce the data-platform
  purpose. Prices and Services remain practical entrances; Standards and
  Roadmap join them. Collection and Play remain in More.
- A shared authored registry supplies four foundation summaries, five ordered
  delivery stages, `/roadmap` and `/api/v1/roadmap`. Manifest, OpenAPI, room map,
  sitemap and machine discovery link to the same plan.
- `/standards` and `/standards.json` share one registry. Existing IDs, versions,
  statuses and JSON keys remain; registry counts no longer claim live coverage.
- The agent entrance has Discover, Read and Contribute & build sections.
  Public, member-key and agent-key access remain distinct. Optional culture
  stays in a separate disclosure.
- Documentation distinguishes code licensing, CC0 specification prose,
  source/image permissions and release availability. Packages remain workspace
  source; anonymous public repository/package access is a separate release gate.

## Checks actually run

- 97 focused tests across 12 suites passed, covering roadmap/standards parity,
  discovery, contracts, room links, navigation, account labels, footer and home.
  A test initially omitted an await for the OpenAPI handler; it was corrected
  and that four-test suite passed. Nine shared envelope tests also passed.
- 16 Chromium checks passed at 320–1440px: home, source/contract journeys,
  roadmap HTML/JSON parity, menus, keyboard focus, Japanese navigation,
  account-prefetch exclusion and native search without JavaScript.
- Storefront typecheck and production build passed. Scoped ESLint covered all
  30 changed TypeScript files. The roadmap JSON link was changed to the shared
  link component to resolve its single warning; its lint and final build passed,
  and a browser check confirmed that clicking it opens the JSON response.
- Desktop/mobile home and roadmap screenshots were visually inspected. Search
  remained within the tested phone viewport; checked pages had no horizontal
  overflow. The ivory/plum/mandarin palette and credited local art are retained.
- An independent source review found no concrete inconsistency in the roadmap,
  discovery wiring, source claims or access boundaries.
- Module audit passed: 28 roots, nine storefront domains and 39 generated pages.
  All 434 relative links across the 20 changed Markdown documents resolved.
  The tracked-secret audit passed across 4,500 files; staged whitespace checks
  passed. The credential scan covers supported patterns in tracked working
  files, not ignored files, Git history, provider state or revocation.

Checks used an isolated child environment, fixture database/source targets and
blocked external application requests. No provider activation, live price
verification, account operation, credential loading, publication or deployment
occurred. Existing broad Next.js output-tracing warnings remain. Public-source
research and its retrieval limitations are recorded in the
[provider plan](../plans/tcg-data-platform/integrations.md).

## Next implementation boundary

Start with consistent image/text publication decisions and evidence-backed
printing crosswalks. Current related English images must not be represented as
the requested exact printing. Broader image/price/provider/market integrations,
conformance releases and deeper personal/operator page rebuilds remain planned.
This pass makes their sequence and acceptance gates reviewable; it does not
implement the full integration pipeline.
