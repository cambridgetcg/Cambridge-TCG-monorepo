# Pricing, services and art — local verification

Yu asked for less text, more art, and a human entrance focused on pricing
discovery and services. This is a presentation and navigation pass on the
[rebuild foundation](2026-09-29-rebuild-foundation.md).

## Implemented

- Home puts native card search first, beside an uncropped local Hiroshige print.
  The short caption links to its museum source; full attribution opens in a
  native disclosure. Lineage and home share the same artwork metadata.
- Four home shortcuts and the new `/services` page share one task catalog:
  prices, collection, condition worksheet, permitted downloads and retained
  price history. Account requirements are visible beside the destinations.
- Navigation leads with Prices and Services. Guides, art and broader rooms
  remain accessible. Agent/API discovery retains its own entrance. Shared
  navigation/footer account links explicitly disable route prefetch.
- `/prices` puts search first and uses compact game links. Longer source,
  currency and download explanations are disclosures. Missing records remain
  distinct from unavailable records; authentication and price-reading logic
  are unchanged.
- The map keeps its eight rooms and places reading trails in a disclosure.

## Verification

- 101 targeted storefront tests passed across 12 suites, including updated
  map disclosure coverage, native search, source states and access labels.
- 14 Chromium checks passed: 320–1440px, keyboard menus, Japanese navigation,
  no-JavaScript search, loaded artwork/expanded credit, service-to-condition
  journey, room/contract journey and entry redirects.
- Storefront typecheck and production build passed. Typecheck was rerun after
  the build regenerated the route types for `/services`; running them together
  had briefly observed mismatched generated route files.
- Scoped ESLint: 26 changed TypeScript files, zero errors; 15 existing warnings
  in lineage prose and the map's native JSON anchor.
- Desktop/mobile home, services and mobile price-page screenshots inspected.
  Dark and high-contrast phone layouts also inspected without horizontal
  overflow. The first phone screen contains search; the artwork is uncropped
  and local.
- Module map passed: 28 roots, nine domains and 39 generated pages. All 115
  relative links in seven changed documentation files resolved.
- Tracked-secret audit passed across 4,488 files; staged whitespace check passed.
  The secret check covers supported patterns in tracked working files, not
  ignored files, historical Git objects or provider state.

Build/preview used an isolated environment, an ephemeral local auth secret and
unreachable loopback catalog/database targets. External application fetches were
blocked. These checks exercise local rendering and fixtures, not live price or
account availability. No credentials were loaded, no provider was activated and
nothing was published.

The official Art Institute API confirmed artwork 11054's metadata and public-domain
flag on 2026-09-29. The local image closely matches its tiny API thumbnail.
Full-resolution museum retrieval returned HTTP 403; this is not a byte-identical
source-image verification. Evidence lives in `src/content/art/featured.ts`.

## Remaining work

This pass does not complete the deeper card-detail/account rebuild. Legacy
card-detail, portfolio and account-tools pages still contain old commerce links;
the new service catalog avoids promoting those actions. Source import coverage,
registration admission and production readiness remain separate from navigation.
The [implementation ledger](../plans/storefront-rebuild/implementation.md) tracks
the wider replacement.
