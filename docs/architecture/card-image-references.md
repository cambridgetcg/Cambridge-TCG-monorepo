# Card image references

Implementation review: **2026-09-29**. This is the bounded first image step in
the [data-platform roadmap](../plans/tcg-data-platform/README.md), not completion
of the image publication or removal work. [Recorded decisions](../EN-CARD-DATA.md)
separate the July image, text and catalogue-fallback decisions from this review.

## Identity and publication

The shared [English reader](../../apps/storefront/src/lib/cards/en-card-data.ts)
accepts complete supported One Piece or Dragon Ball Fusion World SKUs and keeps
the existing uppercase English base key in storage. It removes language and
variant for that lookup, so every resulting image is a **reference**. Matching
syntax alone never upgrades it to an exact-printing image.

[`ImageReference`](../../apps/storefront/src/lib/cards/image-reference.ts) contains
`requested_sku`, `requested_canonical_sku`, `depicted_sku` and
`depicted_canonical_sku`, with fixed `relationship: "reference"`,
`scope: "syntax_only"` and `reason: "english_base_reference"`. Canonical fields
describe parsed syntax; they are not evidence-backed printing crosswalks.

The shared [publication projector](../../apps/storefront/src/lib/cards/image-publication.ts)
checks source `bandai-en`, the recorded game, English language, official-sample
kind, clear takedown state, nonblank attribution, the expected publisher HTTPS
host, retrieval timestamp and a safe `official/` object key on the reviewed
Cambridge image host. SQL narrowing and runtime checks work together. Single
and batch lookup select eligible records deterministically. The checks do not
fetch objects, verify their bytes or establish a provenance receipt.

Existing `image_url` and `image_attribution` remain compatibility fields;
additive `image_reference` explains the requested-versus-depicted relationship.
The publisher URL is provenance only. The served image URL uses the Cambridge
host. No dimensions, checksum, exact-printing match or permission is invented.
Existing attributed text and attributes remain available under their recorded
decision, with source/provenance checks in the shared reader.

## Current consumer scope

| Reader / consumer | Boundary |
| --- | --- |
| `getEnCardData()` → universal card API | Official English reference metadata accompanies the existing image fields in image-bearing projections. Sparse output remains sparse. |
| `getEnCardData()` → market card identity | Official reference metadata accompanies the image. Existing effect text and attributes remain under the later July decision. |
| `getEnCardImages()` → market catalogue → grid/table | Batch images use the same projector and relationship semantics as single-card reads. |
| Market catalogue-photo fallback | Retained under the 16 July decision and labelled unverified. Its URL is restricted to the reviewed existing catalogue hosts; it does not inherit the official-image source/identity guarantees. |

Market identity also reaches `/mekiki`, retained auction pages and fulfillment
helpers. Carrying metadata does not establish that every downstream renderer
uses it; presentation and attribution need verification at each surface.

The [universal reader](../../apps/storefront/src/lib/universal/card.ts),
[market identity](../../apps/storefront/src/lib/market/catalog-card.ts) and
[market catalogue route](../../apps/storefront/src/app/api/market/catalog/route.ts)
are the implementation seams. Source acquisition, table keys, authentication
and publication of unrelated wholesale fields are unchanged by this contract.

## Remaining independent readers

- [Artists](../../apps/storefront/src/lib/cards/artists.ts) reads image rows
  directly for `/artists`, `/artists/[slug]` and `/api/v1/artists`. Its
  set/number joins do not establish a specific printing's illustrator/image
  pairing. Keep source credit distinct from a verified per-printing credit.
- [Gallery](../../apps/storefront/src/lib/cards/gallery.ts) and
  [notable prints](../../apps/storefront/src/lib/cards/notable.ts) retain direct
  readers. No current runtime caller of those loaders was found in this review.
- [Starter resolution](../../apps/storefront/src/lib/play/starter-resolve.ts)
  directly reads images and text for starter/practice APIs. Its image fallback
  currently loses the copyright metadata while its text fallback carries it.
  Consolidation must preserve the recorded practice-text decision and repair
  image attribution throughout the board payload.
- Catalogue fallback records still require source, printing and removal review.
  Restricting their URL host prevents arbitrary remote URLs but does not supply
  that evidence or retrospectively verify the records.

## Removal and verification

The clear-state gate controls fresh reads. It does not revoke issued object
URLs, purge public objects, or invalidate cached responses. Universal card
responses currently advertise a 60-second public cache. Text storage has no
equivalent per-row takedown field. A complete removal mechanism must cover
objects, cache lifetimes, every reader and text independently.

Tests should cover incomplete/unsupported SKUs, English versus other languages,
variants, rejected provenance/credit/timestamps/object keys, deterministic
selection, single/batch parity, compatibility aliases and every image-bearing
density. Preserve legacy-price/image withholding in the separate universal
snapshot fixture. The redistribution audit must inspect the shared projection
instead of requiring duplicated URL-construction strings in individual readers.

These are local source/fixture checks. Production coverage, upstream permission,
object reachability and cache invalidation require separate evidence. The
automated ingest remains paused and no manual acquisition was run for this work.
