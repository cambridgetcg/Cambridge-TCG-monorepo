# EN card data: current boundary

*Reviewed 2026-07-13. This records the implementation and rights state; it is
not legal advice.*

## The recorded decision (2026-07-13)

The owner has decided that Cambridge publishes OFFICIAL publisher card images for
the games whose official source we have added — today One Piece and Dragon Ball
Fusion — taken from each publisher's own card database. The rule, in plain terms:

- **Official art only.** The image is the publisher's own card art
  (`kind = 'official_sample'`). No shop scans, seller photos, or community
  re-uploads.
- **Self-hosted.** Each image is copied to a Cambridge-controlled host and served
  from our own object, built from `CARD_IMAGE_CDN + s3_key`. The stored publisher
  `source_url` is provenance metadata and is **never** served as an image src, so
  the site does not hotlink the publisher.
- **Always attributed.** The publisher's copyright line is stored NOT NULL and is
  rendered next to the image wherever it appears. An image without its credit is
  not published.
- **Takedown-honouring.** Publication is gated on `takedown_status = 'clear'`. A
  disputed or removed row stops publishing immediately.
- **Nominative fair use for a marketplace.** You must be able to see a card to
  trade it; the art identifies the publisher's specific card and is credited to
  the publisher, not presented as ours or offered for reuse.

This **supersedes** the prior blocker that required a recorded written Bandai
permission before any English image could publish. The basis for publication is
now the nominative-fair-use / self-hosted / attributed rule above, not a
paused-pending-permission state. Text (effect/rules text) is **not** covered by
this decision and stays withheld — see "Text stays withheld" below.

## What exists

- The fixture-backed Bandai parser and normalizer live in
  `packages/data-ingest/src/bandai-en/`.
- Migration **0116** created `card_texts` and `card_images` and has already been
  applied in production. Its duplicate `0116` filename is preserved on purpose:
  renaming an applied migration would make the migration record less truthful.
- Production holds Bandai-derived English rows across One Piece and Dragon Ball
  Fusion (on the order of 8,300 image rows).
- The `ctcg-card-images` host now exists. A background backfill populates
  `card_images.s3_key` for the official images. A row publishes only once its
  `s3_key` is set; rows still awaiting a self-hosted object do not appear.

Schema, storage, attribution, and the takedown column are the mechanism the rule
runs on. They are enforced structurally by the reader's query, not by hope.

## Rights state

Cambridge publishes the official publisher card images under nominative fair use
for a marketplace: the images are shown to identify the physical cards being
traded, are self-hosted rather than hotlinked, and always carry the publisher's
copyright line. We do not claim ownership of the art and do not license it onward.

The source declaration remains conservative for **bulk redistribution** — this
decision authorizes per-card display of self-hosted, attributed official images
on our own surfaces, not a redistributable data export:

- `license: proprietary` (the underlying art is the publisher's)
- `redistribute: false` (no bulk re-publication or onward licensing)
- image display: **enabled** for added official sources, self-hosted + attributed
- takedown: honoured via `takedown_status`

CardRush and other shop/seller image paths stay blocked; they are not part of this
lane.

## Runtime state

- `getEnCardData()` and `getEnCardImages()`
  (`apps/storefront/src/lib/cards/en-card-data.ts`) publish an image **only** via
  its self-hosted object. The query requires
  `kind = 'official_sample' AND takedown_status = 'clear' AND s3_key IS NOT NULL`,
  and the served `url` is built from `CARD_IMAGE_CDN + s3_key`. The stored
  publisher `source_url` is returned as metadata but is never the served `url`.
- When a card has no published official image, the readers return `en_image: null`
  and the page keeps its withheld / no-image state. They do not fall back to a
  CardRush scan or a legacy `card_set_cards.image_url`.
- The redistribution audit (`apps/storefront/scripts/redistribution.ts`, check 8)
  pins this: the legacy image lane stays `image_url: null`, and the official
  reader may serve an image only via `s3_key` with the takedown/official guards,
  never the publisher `source_url`.

## Text stays withheld

`getEnCardData()` returns `effect_text: null`. Publisher rules/effect text is
proprietary and is **not** covered by the image decision; it needs its own review
before any publication. The parser can still be exercised against local fixtures —
parser correctness does not imply permission to publish text.

## Other games and reopening

- Games without an added official image source stay imageless. They join this rule
  only when their official source is added and reviewed; until then their cards
  keep the withheld / no-image state.
- Storage, a provenance URL, or the absence of a robots restriction is still never
  treated as a rights grant. When a new official source is added, record which
  publisher database it is, confirm the self-hosted + attributed + takedown
  mechanism covers it, and keep the reader's structural guards intact.
