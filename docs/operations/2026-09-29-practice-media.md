# Practice media and loading — 2026-09-29

Yu asked to continue removing friction. From baseline `5d5ee05e`, this slice
connects starter artwork to a usable practice board while keeping the encoded
deck independent from catalogue/media availability. The
[architecture record](../architecture/card-image-references.md) defines the
contract and remaining boundaries.

## Implemented locally

- A separate `CardNumberImageReference` records the requested One Piece card
  number and full selected English image SKU, including parallel/reprint suffixes.
  The existing base-SKU `ImageReference` behavior and schema remain intact.
  Runtime readers reject incomplete syntax, including trailing whitespace.
- Starter images use the same source, credit, timestamp, takedown and hosted
  object checks as market/universal images. Eligible unsuffixed art, reprints
  and parallels have deterministic display ordering. Catalogue fallbacks stay
  host-restricted and visibly unverified. Artist consensus includes all registered
  One Piece legacy prefixes and is not claimed as verified image authorship.
- One browser/server projection carries image URL, copyright and reference into
  setup, GameCard and JSON saves. It preserves independent attributed effect text.
  Missing catalogue records do not remove cards from encoded practice decks.
- Browser enrichment limits the whole response to 2.5 seconds and 256 KiB,
  clears/cancels its request resources, and falls back on malformed/offline data.
  Matching player/opponent starter requests share one promise within a start;
  no persistent cache or background import is introduced.
- Optional resolver initialization stays inside the stateless practice API's
  fallback boundary, so missing database configuration can still produce an
  encoded text-face game. Server enrichment latency remains resolver-dependent.
- Board cards show compact context badges with nearby deduplicated credit.
  Selecting a visible card opens a scrollable, keyboard-accessible view with
  full image/reference/text credit. Opponent cards are inspectable without
  offering their game actions; hidden cards expose no image or credit in the UI.
  Existing bare official URLs in browser saves render text faces without erasing
  the saved game. Failed thumbnail loads also fall back to text.
- Contract JSON, schema discovery, OpenAPI, human guide, roadmap and module
  progress describe the same bounded implementation.

## Verification

- The focused 19-suite run passed 336 tests covering contracts, publication,
  resolver ordering, full deck/JSON propagation, optional-load timeouts, missing
  database initialization, hidden media, saved games and existing consumers.
  After browser corrections, the revised 23-test UI suite passed, including two
  additional regressions for overlay placement and failed detail images.
- Storefront typecheck and production build passed after the final fixes.
  Scoped ESLint covered all 33 changed TypeScript files with zero errors and
  seven inherited warnings; changed UI/tests were checked again after the fix.
- 19 Chromium checks passed across entry/contract/roadmap/navigation flows and
  three fixture-only practice flows. Initial practice failures exposed a real
  overlay below the site header and a test interceptor that missed direct image
  URLs. The overlay layer and exact-host fixture interception were corrected;
  all three practice checks then passed against the rebuilt preview.
- Mobile card details at 390px and the desktop board at 1440px were visually
  inspected with synthetic layout art. Both fit without horizontal overflow.
  Caption context, credit, Escape/backdrop dismissal, focus restoration, offline
  setup and unverified catalogue fallback are covered by the browser fixtures.
- Redistribution audit: zero findings. Module map: 28 roots, nine storefront
  domains and 39 generated pages. Documentation target and whitespace checks
  passed.
- Tracked-secret audit passed across 4,519 files, including the staged additions.
  It checks supported patterns in tracked working files, not ignored state, Git
  history, provider logs or credential revocation.

All automated source/database access uses mocks or non-listening fixture targets;
publisher imagery in browser checks is substituted locally. Build/preview use
an isolated child environment with external application fetches blocked.
Expected unavailable-source logs and inherited Next.js tracing warnings remain.

## Remaining scope

The catalogue-oriented `/api/play/load-starter` preserves its existing unresolved
card behavior; full encoded fallback belongs to browser/stateless practice.
Artist/gallery and retained PvP renderers still need their own consolidation.
This change does not add a verified printing crosswalk, image-rights receipt,
production image coverage check or object/cache removal mechanism.

The stateless practice API returns caller-carried game state on subsequent moves;
it does not certify that caller-supplied media metadata is true. Browser saved
metadata is presentation-validated, not rechecked against fresh takedown rows.
The browser deadline cannot guarantee cancellation of server/database work.
Durable match admission and rewards stay paused. No credentials were loaded,
providers activated, images acquired, production data queried, or changes
published/deployed by this slice.
