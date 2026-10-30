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
| 2026-10-30 | [decision record](decisions/2026-10-30-japanese-official-images.md) | Yu chose "Self-host like English" for Japanese official sample images (One Piece and Fusion World): self-hosted with the Japanese credit and takedown, as below. |

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
Its presence does not make it a verified official reference. Starter/practice
now uses the same source checks with a separate card-number reference shape,
retaining the selected English reprint/parallel suffix and copyright through
the board. Existing practice text also uses the shared provenance checks.
Gallery, notable-print, artist and retained PvP views still need consolidation;
this change does not establish consistent publication across every surface.

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
- A separate [manual text ingestion](../apps/storefront/scripts/ingest-bandai-en.mjs)
  script exists. It can perform network and database writes; it was not run
  or activated by this review, and no audit pins it.
- The old [image backfill](../apps/storefront/scripts/backfill-card-images-s3.mjs)
  refuses to run since 2026-10-30. Official images, English or Japanese,
  reach the bucket only through
  [`upload-official-images.mjs`](../apps/storefront/scripts/upload-official-images.mjs)
  (see Japanese official images, below), whose `--lang en` handles English
  rows under the same rules.

July commit records describe approximately 8,300 stored image rows, a created
image bucket and backfill activity. Those are historical reports. This review
did not inspect production rows, objects, permissions or running jobs and does
not establish current coverage or backfill health.

## Japanese official images (2026-10-30)

Yu chose to self-host Japanese official sample images as the English ones
are ([decision record](decisions/2026-10-30-japanese-official-images.md)).
Both Japanese footers refuse reproduction without permission; Cambridge
holds Yu's decision, not Bandai's permission.

- **Storage.** `card_images` rows with lang `ja`, source `bandai-jp`, kind
  `official_sample`, `license_note` `cambridge.official-ja-media/2026-10-30`
  and the game's Japanese credit line verbatim. Keys are Bandai's own Japanese
  card ids in the English key's form with `JA` (`OP-OP01-001-JA`,
  `DBF-FB10-001-JA`); objects are `official/<key>.png|.webp`. Base prints only.
- **Reading.** [`getSameLanguageImages()`](../apps/storefront/src/lib/cards/en-card-data.ts)
  gives a Japanese request the base image of the same card in Japanese,
  through `projectSameLanguageImage`, which also checks the exact credit line,
  the decision id, the object key and that the publisher file names the same
  card. `getOfficialCardImages()` picks it before the English reference;
  `getEnCardData()` carries it as `same_language_image`. The reference is the
  additive `SameLanguageImageReference`; `ImageReference` v1 is unchanged, and
  text stays English. `OFFICIAL_IMAGES_JA=off` hides the lane.
- **Acquisition.** Two manual tools, never scheduled, both dry runs by
  default: [`ingest-official-ja.mjs`](../apps/storefront/scripts/ingest-official-ja.mjs)
  reads Bandai's Japanese card lists (every run is the collection act, which
  needs Yu's word) and records rows, and `upload-official-images.mjs` copies
  a reviewed selection to the bucket (`--apply` is the upload and needs Yu's
  word, D6 lifted for it, and the AWS profile he names at run time). Neither
  has run.
- **Removal is per card**: one statement sets every `official_sample` row of
  the card, every language and variant, to `disputed` or `removed`; the
  decision record has it.

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
