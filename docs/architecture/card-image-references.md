# Card image references

Implementation review: **2026-09-29**, including the subsequent starter/practice
connection. These are bounded image steps in
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

## Same-language images (Japanese, 2026-10-30)

Yu chose to self-host Japanese official sample images
([decision record](../decisions/2026-10-30-japanese-official-images.md)). The
lanes are one pure table,
[`official-image-lanes.ts`](../../apps/storefront/src/lib/cards/official-image-lanes.ts):
English (`bandai-en`) and Japanese (`bandai-jp`), each with its host, path,
extension, decision id and, for Japanese, the footer's exact credit line.
Each reader binds its lane by the function it calls, never from a row's own
`lang` or `source`.

- [`SameLanguageImageReference`](../../apps/storefront/src/lib/cards/same-language-image-reference.ts)
  is the third reference shape, additive: the same four identifiers as
  `ImageReference`, plus `language: "ja"` and
  `reason: "same_language_base_reference"`. The depicted key is the requested
  card's Japanese base print (`OP-OP01-001-JP-V11DZ` → `OP-OP01-001-JA`), so a
  requested variant is a reference too. `ImageReference` v1 is unchanged.
- `getSameLanguageImages()` reads only `lang = 'ja' AND source = 'bandai-jp'`
  and projects through `projectSameLanguageImage`, which adds four checks to
  the shared ones: the exact credit line, `license_note` equal to the decision
  id, `s3_key` equal to `official/<sku>.<ext>`, and a publisher file that names
  the same card in a URL with an empty or bare numeric query.
  `OFFICIAL_IMAGES_JA=off` returns nothing before any key or query.
- `getOfficialCardImages()` chooses the Japanese image first, else the English
  reference, each lane caught on its own so a Japanese failure leaves the
  English images. Market and `/prices` use it; `getEnCardData()` carries both.
- The English projector now checks Fusion World's path too (`/fw/en/` or
  `/fw/images/cards/card/en/`), since both languages share its host. One Piece
  English stays host-only.

## Practice asks for a card number

A practice starter specifies `ST01-001`, not a physical printing SKU. The
separate [CardNumberImageReference](../../apps/storefront/src/lib/cards/card-number-image-reference.ts)
keeps the requested game/card number, its lowercase syntax candidate and the
selected raw/canonical English image SKU. It accepts recorded no-suffix, `pN`
parallel and `rN` reprint keys. `rN` is not labelled a base print. It never
fabricates a requested printing SKU or changes the existing base-only schema.

The starter resolver narrows rows to One Piece and uses the same publication
projector checks. Among eligible rows it prefers unsuffixed art, then numeric
reprints, then numeric parallels, with deterministic retrieval/key tie breaks.
That is a display preference, not printing equivalence. A retained catalogue
photo still takes priority where the existing starter path already had one;
the approved-host check grants it no reference or source evidence.

Browser and stateless practice APIs share one resolved-card projection. URLs,
copyright and reference metadata survive deck expansion, setup and JSON saves.
Old saved official URLs without metadata render readable text faces. Approved
catalogue URLs remain visibly unverified; a malformed official claim cannot be
relabeled as catalogue art. Face-down cards contribute no image or media credit
to the board. Nearby visible credit captions serve compact board cards; selecting
a visible card reveals the full image context. Catalogue artist consensus is
labelled separately from a verified illustrator of the selected reference.

The optional browser detail request has a 2.5-second whole-response deadline and
256 KiB byte cap. Timeout, malformed data or source failure leaves the full
encoded deck playable with text faces. Browser timing and abort are best effort;
they do not prove that server/database work was cancelled or that cached image
objects were removed. The stateless referee returns client-carried state and
does not certify metadata supplied by callers on later moves.

## Current consumer scope

| Reader / consumer | Boundary |
| --- | --- |
| `getEnCardData()` → universal card API | Official English reference metadata accompanies the existing image fields in image-bearing projections; a Japanese request's own-language image travels separately as `image_same_language`. Sparse output omits all four. |
| `getEnCardData()` → market card identity | The Japanese image first, else the English reference, with `image_language` and the matching reference field. Existing effect text and attributes remain under the later July decision. The card page's `og:image` is the share card for a Japanese image. |
| `getOfficialCardImages()` → market catalogue → grid/table | Batch images use the same projectors and relationship semantics as single-card reads, with `image_language` and `image_same_language_reference`. The Japanese lane runs only for `images=same-language`, which only `/market`'s grid and table send, since they print the label and credit; the other catalogue callers (the deck builder and the listing, auction and swap pickers) show a bare thumbnail and keep the English reference. |
| Market catalogue-photo fallback | Retained under the 16 July decision and labelled unverified. Its URL is restricted to the reviewed existing catalogue hosts; it does not inherit the official-image source/identity guarantees. |
| Starter detail/load → browser and stateless practice | Card-number references preserve selected suffixes and credit, using the shared projector. Encoded practice decks remain complete when enrichment is missing. |

Market identity also reaches `/mekiki`, retained auction pages and fulfillment
helpers. Carrying metadata does not establish that every downstream renderer
uses it; presentation and attribution need verification at each surface.
`/mekiki` uses the shared market label. Auction fulfilment copies the image
URL into `portfolio_cards`, where it outlives a takedown; since 2026-10-30 it
copies no Japanese image, and the English one is a recorded gap.

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
- [Retained PvP room](../../apps/storefront/src/app/play/[code]/page.tsx) has its
  own image renderers and deck-input path. It does not use the practice card
  component; this pass does not claim attribution migration for those independent
  legacy views. Durable match admission remains paused.
- Catalogue fallback records still require source, printing and removal review.
  Restricting their URL host prevents arbitrary remote URLs but does not supply
  that evidence or retrospectively verify the records.

## CardRush listing images (linked)

Added 2026-10-29, from Yu's words that day ("images linked to each item
(official or use cardrush) so that humans and agents can double confirm the
item"). The rule is the agents' reading of them, recorded in the
[decision record](../decisions/2026-10-28-tcg-data-permissions-and-paid-data-api.md#yus-words-2026-10-29-images):
a CardRush listing's own image is linked at CardRush's own URL, never copied.

- **Collected as a URL, from the price read.** The CardRush page collector
  ([`cardrush/member-prices.ts`](../../packages/data-ingest/src/cardrush/member-prices.ts))
  keeps the `og:image` a listing's page declares, beside its observations,
  never inside one. `cardRushListingImageUrl` accepts only https on the
  listing's own host, under that host's directory, `/_/` and the hex of a
  `product/` path, with no query and at most 512 characters. No request is
  made for the image.
- **Stored as a link record.** `price_source_listing_images` (migration 0145)
  holds one row per listing: the URL, the listing URL, first and last
  sighting (forward-only from 2026-10-28) and the digest of the page that
  declared it. [`listing-images.ts`](../../apps/storefront/src/lib/datafeed/listing-images.ts)
  upserts rows only for listings whose observations a batch wrote, and a
  store without 0145 records none.
- **Shown on `/prices` only.** [`member-images.ts`](../../apps/storefront/src/lib/prices/member-images.ts)
  looks up the page's first 50 rows. A row with an exact SKU shows the
  official English base print through `getEnCardImages`, from Cambridge's
  own image host, inline with its credit. A CardRush row offers its listing
  image behind a "Show CardRush's listing image (this listing)" control, as
  a plain lazy `<img>` at CardRush's URL (no `next/image`, no proxy), with no
  Referer, credited "Image: CardRush" and linked to the listing, inside a
  closed `<details>`: the member's browser asks CardRush for it only when the
  member opens it, so viewing `/prices` tells CardRush nothing (checked in
  Chromium; other engines not checked). The image URL is in the page's HTML
  either way, so an agent reading the page has it. A mapped CardRush row can
  show both. A row with neither shows no image and no placeholder.
- **Each image says how its language and printing relate to the row.**
  Added 2026-10-30, from Yu's words that day ("Lets also sort out the
  languages and corresponding images (from official samples or
  cardrush)"). A printing-level row's language is its exact SKU's language
  segment, else the observation's `language`. The official image is always
  English and shows the base print its `ImageReference` names
  (`depicted_canonical_sku`), so its label is one of four:
  - `same-printing`, an English printing-level row with no variant:
    "Official image · this printing (English), matched by SKU, not
    verified". The depicted SKU is the row's own; that is a match of SKU
    syntax, not a check of the card, so the image is still the syntax-only
    reference described above, not an exact-printing image.
  - `same-language-base-print`, an English printing-level row with a
    variant: "Official English base print · this row is a parallel, art may
    differ" (or a reprint, or the variant as stored).
  - `other-language`, a printing-level row in any other language: "Official
    English image · this row is Japanese (ja): language differs". A
    parallel in another language says both.
  - `pooled-row`, a source-product aggregate (a Cardmarket row linked by a
    reviewed crosswalk): "Official English base print · this row is a
    source-product aggregate: language and art may differ". Its price may
    pool printings and languages, so it takes neither from its SKU and keeps
    its own language (unknown), as its Specificity column says. Only an
    operator-supplied crosswalk leads here: the scheduled Cardmarket
    collector supplies none, so its rows carry no SKU.

  The listing image is the listing's own (`same-listing`), so its language
  and printing are the listing's. Every `<img>` also carries
  `data-image-source` (`official` or `cardrush-listing`), `data-image-lang`,
  `data-row-lang` (`unknown` when the row has none), `data-relationship`
  and, on the official image, `data-depicted-sku` and `data-scope`
  (`syntax_only`, the reference's own scope), so an agent reading the HTML
  need not parse the label. Language names cover the codes the SKU
  registry lists; any other code shows as itself, and `zh` is only
  "Chinese" because the SKU does not say which script.

  Only the display changed: the reader, the projector and the v1
  `ImageReference` (still `relationship: "reference"`,
  `reason: "english_base_reference"`) are as they were. When this was
  written no official image in another language existed to show, so a
  Japanese row showed English art labelled as such.
- **Japanese images, since 2026-10-30.** A Japanese exact row gets its own
  language's official base print when one is published (above), and the
  relationship is measured against the image's language. A Japanese base row
  reads "Official image · this printing (Japanese), matched by SKU, not
  verified"; a Japanese parallel "Official Japanese base print · this row is a
  parallel, art may differ". `data-image-lang` is `ja`, and the credit is
  marked `lang="ja"`. Every English label is unchanged; without a published
  Japanese image the row shows the English reference as before.
- **Never in the API or downloads.** The member item, its CSV and NDJSON,
  and `/api/v1/market/*` carry no image field; a test pins that.
- **One switch, for the display.** `CARDRUSH_LISTING_IMAGES=off` stops
  `/prices` showing CardRush listing images; the official lane is
  unaffected. On Vercel a changed value reaches only a new deployment, so the
  lane goes off with the next deployment. The collector still records URLs
  while it is off.
- **Removal.** Setting `withdrawn_at` stops the link on the next read; a
  trigger keeps a withdrawal from being cleared. The link holds no copy to
  purge, but a browser or CardRush's own caches may still hold the image.
  Withdrawal does not reach the catalogue fallback photos above: some are
  CardRush images copied into `jp-*-photos` before this lane (by the old
  `self-host-cardrush.mjs` and the wholesale `hires/` scrape described in
  `apps/wholesale/tools/lib/s3-images.ts`), and removing those is a separate
  step.

The URL says where CardRush keeps the listing's image. It does not verify the
printing, the condition, or that the image shows the card the title names.

## Removal and verification

The clear-state gate controls fresh reads. It does not revoke issued object
URLs, purge public objects, or invalidate cached responses. A takedown is per
card: one statement sets every `official_sample` row of the card, every
language and variant, so neither lane keeps showing the same art (the
[decision record](../decisions/2026-10-30-japanese-official-images.md) has
the statement), and the upload tool holds a row whose card has one under
takedown. Universal card
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
