# English card images and text

Implementation and recorded-decision review: **2026-09-29**. This is a source
audit, not a new legal review, upstream permission or production health check.
The [image-reference architecture](architecture/card-image-references.md)
describes the shared reader contract and remaining consumers.

## Recorded decisions, in order

Git history records the following owner-directed changes. Their rationale is
reported here as project history, not as an independent legal conclusion.

| Decision | Evidence | Scope |
| --- | --- | --- |
| 2026-07-13, 08:18 −07:00 | `92eccbed` | Publish official One Piece and Dragon Ball Fusion World images from Cambridge-hosted objects, with publisher attribution and a clear takedown state. This replaced the earlier written-permission blocker for that display lane. The recorded rationale was nominative use to identify cards for trade. |
| 2026-07-13, 09:03 −07:00 | `84fb4efe` | Add official structured attributes and attributed effect text to card details and the universal API. This later decision supersedes the earlier document's “text stays withheld” statement. |
| 2026-07-16 | `3934a13e` | Retain self-hosted catalogue photos as the market's fallback when an official image is absent. This is a separate legacy lane, not evidence that those rows meet the official-image rule. |
| 2026-07-17 | `35eba7f4` | Extend attributed English effect text to starter/practice surfaces. |

The September review found no later reversal in these code lanes. Open-source
code and specification licences do not cover the publisher's artwork or text.
This review grants no onward reuse, bulk redistribution or new acquisition.

## Current shared English reader

[`getEnCardData()` and `getEnCardImages()`](../apps/storefront/src/lib/cards/en-card-data.ts)
retain the historical English base storage key. A complete supported SKU can
lead to a related English image even when the requested card has a different
language or variant. The reference metadata identifies this relationship;
these helpers do not verify that the pictured printing is the requested one.

The official-image projection validates the recorded source and game, English
language, official-sample kind, clear takedown state, nonblank copyright line,
publisher provenance URL, retrieval time and self-hosted object key. The served
URL comes from the Cambridge image host, never from the publisher provenance URL.
Malformed or unsupported requests and rows that fail the checks produce no
official image. Single and batch reads select eligible records deterministically.

Existing `image_url` and `image_attribution` fields remain for compatibility;
`image_reference` carries the relationship where those consumers expose it.
Official English effect text and structured attributes retain the later July
publication decision. Attribution must travel with effect text.

The market's separate catalogue fallback is retained and labelled unverified.
Its presence does not make it a verified official reference. The gallery,
notable-print, artist and starter readers still need consolidation; this shared
reader change does not establish consistent publication across every surface.

## Acquisition and historical storage

- [Migration 0116](../apps/storefront/drizzle/0116_en_card_data.sql) creates
  provenance, attribution and takedown storage. Its old comments predate the
  later image/text decisions; an applied migration is not the current policy.
- [Migration 0122](../apps/storefront/drizzle/0122_card_texts_attributes.sql)
  adds structured attributes and records the later text decision.
- The [Bandai source module](../packages/data-ingest/src/bandai-en/index.ts)
  has offline parsers but an inert live reader. The
  [authenticated ingest route](../apps/storefront/src/app/api/cron/ingest/bandai-en/route.ts)
  remains paused. Old registry wording that all publication is paused predates
  the subsequent read-side decisions; it should not be used to infer that the
  current public readers emit nothing.
- Separate [manual text ingestion](../apps/storefront/scripts/ingest-bandai-en.mjs)
  and [image backfill](../apps/storefront/scripts/backfill-card-images-s3.mjs)
  scripts exist. They can perform network and database writes; they were not
  run or activated by this review.

July commit records describe approximately 8,300 stored image rows, a created
image bucket and backfill activity. Those are historical reports. This review
did not inspect production rows, objects, permissions or running jobs and does
not establish current coverage or backfill health.

## Removal and remaining work

A disputed or removed row is excluded from a fresh guarded database read.
Previously issued API responses, browser caches and public object URLs have
separate lifecycles. The universal-card endpoint currently allows a 60-second
public response cache; changing a database flag alone does not delete an object
or invalidate every copy. Text storage has no equivalent per-row takedown field.

The [P0 roadmap](plans/tcg-data-platform/README.md) remains open for the other
readers, catalogue-fallback provenance, text removal controls and cache/object
removal evidence. New games, acquisition, exports and broader image reuse each
need their own reviewed scope. The public explanation is
[`/legal/card-images`](../apps/storefront/src/app/legal/card-images/page.tsx).
