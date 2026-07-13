# EN card data: current boundary

*Reviewed 2026-07-12. This records the implementation and rights state; it is
not legal advice.*

## What exists

- The fixture-backed Bandai One Piece parser and normalizer exist in
  `packages/data-ingest/src/bandai-en/`. They are useful internal parsing work.
- Migration **0116** created `card_texts` and `card_images` and has already been
  applied in production. Its duplicate `0116` filename is therefore preserved.
  Renaming an applied migration would make the migration record less truthful.
- Production contains Bandai-derived rows collected before this review: 2,634
  English text rows and 4,571 English image rows.
- None of the 4,571 image rows has a Cambridge-hosted object. They contain only
  publisher source URLs. The planned `ctcg-card-images` bucket and thumbnail
  pipeline do not exist.

Schema, storage, attribution, and a takedown column are safeguards. They do not
create collection or publication permission.

## Rights state

Bandai card text and images are proprietary. Cambridge has no recorded written
permission covering collection into this service, public display, hotlinking,
mirroring, or redistribution. The absence of a robots restriction is not such
permission. Industry practice or publisher tolerance is not a rights grant
either.

The source declaration therefore remains:

- `license: proprietary`
- `redistribute: false`
- `status: blocked`
- permission: undocumented
- public publication: paused

Attribution may be required by a future permission, but attribution alone does
not authorize use.

## Runtime state

- `GET` and `POST /api/cron/ingest/bandai-en` return HTTP 503 before reading
  authentication, query parameters, the network, or the database.
- `getEnCardData()` performs no database query and returns
  `{ effect_text: null, en_image: null }`.
- Publisher `source_url` values are never used as public image fallbacks. There
  is no Bandai hotlink path.
- Existing rows remain internal and dark while their disposition is reviewed.

The parser can still be exercised against local fixtures. Parser correctness
does not imply permission to fetch or publish live upstream content.

## What must happen before reopening

1. Record written permission and its exact scope: collection, storage,
   per-card display, bulk export, image transformation, attribution, and
   takedown duties are separate questions.
2. Review the resulting field-level publication rule and update the source
   declaration to match it. `redistribute: false` cannot feed a public field.
3. Build a Cambridge-controlled image host and thumbnail path if images are
   allowed. Never fall back to a publisher URL.
4. Add tests proving the route is fail-closed, disputed or removed rows cannot
   publish, and no public response carries a publisher image URL.
5. Run a fresh legal and operational review before enabling any cron.

Until all five are complete, the honest state is simple: the internal parser
exists; the ingest and public reader are paused.
