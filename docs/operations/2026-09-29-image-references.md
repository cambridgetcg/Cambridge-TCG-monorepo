# English image references — 2026-09-29

This continues the data-platform roadmap from local source baseline `547673f5`.
The change gives existing English base images an explicit SKU relationship and
one shared publication projection. It is a bounded part of P0, which remains
in progress. See the [architecture](../architecture/card-image-references.md)
and [module connection](../connections/the-image-reference.md).

## Implemented locally

- Complete SKU parsing before an English base lookup; only the recorded One
  Piece and Fusion World lane is supported. Raw requested and selected storage
  identifiers remain alongside normalized syntax. Every match is a reference.
- Single and batch reads share source, language, game/key, sample kind,
  takedown-state, attribution, source URL, retrieval-time and object-host checks.
  Invalid calendar dates cannot roll forward into valid-looking timestamps.
- Market and universal responses carry `image_reference` with the existing
  URL and copyright fields. Sparse universal output omits all three. Human
  grid/table/detail and Mekiki views label reference or unverified catalogue art.
- Existing catalogue photos remain a separate fallback, limited to the three
  recorded Cambridge photo hosts. Existing attributed text and structured
  details remain under the later July decision, with coherent source checks.
- Public JSON Schema, descriptor, OpenAPI and human standards agree. Roadmap
  status records partial progress. Old images-only prose is corrected using the
  [recorded decision chronology](../EN-CARD-DATA.md), not a new rights decision.

## Checks actually run

- 172 focused tests in 10 storefront suites passed: reference syntax, image
  projection, single/batch reads, consumer propagation/presentation, universal
  density and public discovery. Database/provider access was mocked.
- Eight existing wholesale retirement fixtures passed. The redistribution
  audit passed with zero findings after replacing an inherited false positive:
  the retired orders route immediately returns HTTP 410, so an old requirement
  to run its former catalogue guard before authentication no longer applied.
  Dedicated retirement pins now cover it; the route itself is unchanged.
- Storefront typecheck and production build passed. Scoped ESLint covered all
  28 changed TypeScript files: zero errors and seven existing warnings.
- 16 Chromium checks passed at 320–1440px, including the contract/schema
  journey, roadmap HTML/JSON parity, navigation and native search. Mobile
  contract and desktop policy screenshots were inspected with no horizontal
  overflow. Market image captions were checked using rendered mocked fixtures,
  not production catalogue rows.
- Module inventory passed: 28 roots, nine storefront domains and 39 generated
  pages. Relative Markdown targets and staged whitespace checks passed. The
  tracked-secret audit passed across 4,510 files, including the staged additions.
  It checks supported patterns in tracked working files; ignored files, Git
  history, provider logs and credential revocation remain outside that scan.

Build and preview used an isolated child environment, fixture database/source
targets and blocked external application fetches. Expected unavailable-source
logs and inherited broad Next.js output-tracing warnings remain. Local artifacts
are private; no publisher acquisition, live-object check, production database
query, credential loading, publication or deployment was performed.

## Remaining scope

Independent artist/gallery/play readers, source/printing evidence for legacy
photos and removal across public objects/caches remain open. Text storage has
no equivalent per-row takedown field. The narrow reference schema is not the
planned complete cross-source ImageRecord, a rights receipt or an exact-printing
crosswalk. Automated Bandai ingestion remains paused. Production eligibility
counts and provider permissions were not verified by these fixture checks.
