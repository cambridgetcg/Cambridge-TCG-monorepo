# Japanese official sample images: self-hosted like English

**Status:** decided 2026-10-30. Self-hosting Japanese official sample images
(One Piece and Dragon Ball Super Fusion World) with credit and takedown is
Yu's word, through the option they chose below. Everything under
[The agents' reading](#the-agents-reading) is how agents built that choice;
Yu overturns any of it by saying so. Two acts stay Yu's, each needing their
word for that act: [collection and the upload](#what-still-needs-yus-word).
Nothing here has run against Bandai, AWS or a production database.

**Recorded by:** Claude Code (a subagent of workflow session 8ef55b5e), on
branch `claude/official-images-japanese`, from the lead's brief and the
2026-10-30 source, code, rights and critique maps.

## Yu's question and answer

The agent asked, on 2026-10-30, verbatim:

> Japanese (and other-language) official sample images: how should we get
> them? Bandai's card-list footers, Japanese and English alike, refuse
> reproduction without permission. Your 07-13 decision covers the English
> lane only, and that lane is self-hosted.

Yu chose the option **"Self-host like English"**. Its description, which is
the agent's wording that Yu chose, not Yu's own prose:

> Extend your 07-13 decision to Japanese (and Fusion World JP): images are
> copied to our S3 bucket with credit and takedown. This needs your word
> lifting D6's AWS freeze for this upload and naming the AWS credential to
> use. It's also added honestly to the playbook's 'where Cambridge falls
> short'.

Yu's 2026-07-13 words were "lets switch to use official publisher images. go
for them!" (`92eccbed`); that decision's rationale, nominative use to
identify cards for trade, is project history, not a legal conclusion
([EN-CARD-DATA](../EN-CARD-DATA.md)).

## What the sources say

Read 2026-10-30 (15 requests under `CambridgeTCG-research/1.0`, at least
3.5 s apart; no image downloaded).

| | One Piece JP | Fusion World JP |
| --- | --- | --- |
| Card list | `https://www.onepiece-cardgame.com/cardlist/?series=5501NN` (also 5502NN, 5503NN) | `https://www.dbs-cardgame.com/fw/jp/cardlist/?search=true&category%5B%5D=5840NN` (also 5841NN, 5842NN, 5843NN, 584901) |
| Images | `/images/cardlist/card/{CARD_NO}[_pN].png?<cache>` | `/fw/images/cards/card/jp/{CARD_NO}[_f][_pN].webp` |
| robots.txt | 404: no rule | 404: no rule |
| Credit line | ©尾田栄一郎／集英社 ©尾田栄一郎／集英社・フジテレビ・東映アニメーション | ©バード・スタジオ／集英社 ©バード・スタジオ／集英社・東映アニメーション ©Bandai Namco Entertainment Inc. |

The footers, quoted with a translation:

- One Piece: 「このwebサイトに記載されているすべての画像・テキスト・データの無断転用、転載をお断りします。」
  "We refuse unauthorised diversion or reproduction of any images, text or
  data on this website." And: 「開発中につき、本サイトで使用している画像と実際の商品とは異なる場合があります。」
  "Because products are in development, images used on this site may differ
  from the actual products."
- Fusion World: 「※当サイトに掲載されている画像、文章、データ等の無断使用・複製・転載を禁じます。」
  "Unauthorised use, copying or reproduction of the images, text, data and so
  on published on this site is prohibited." And: 「※掲載されている画像は開発中のため、実際の商品とは異なる場合がございます。」
  "The images shown are of products in development and may differ from the
  actual products."

No footer links to terms of use, and no bandai.co.jp page was read. Cambridge
holds no permission from Bandai, in any language. JP and EN One Piece
parallel numbers differ: on OP01-001, -013 and -016 JP lists `_p2` where EN
lists `_p1` (whether they show the same art is unchecked); Fusion World
FB10's file sets are identical.

## The agents' reading

How the choice was built. Each item is an agent's call.

**Lane and keys.** Source `bandai-jp`, kind `official_sample`, lang `ja`,
policy `cambridge.official-ja-media/2026-10-30` (also each row's
`license_note`), and each game's Japanese credit line exactly as the footer
prints it, full-width ／ and ・ kept. A row's `sku` is the uppercase key of
Bandai's own Japanese card id in the English key's form: OP01-001 →
`OP-OP01-001-JA`; FB10-001 → `DBF-FB10-001-JA`; the object is
`official/<key>.png|.webp`. The `_f` front marker stays in the filename, as
English keys keep it; `_pN` would become `-PN`. A Japanese key can never
equal an English one.

**Base prints only.** Parallels and reprints are parsed, keyed and counted
"skipped (no reviewed variant mapping)", not collected: no reader can serve a
Japanese parallel honestly (catalogue variants are `-V…`, and JP and EN
parallel numbers differ). A Japanese request for any variant is shown its
base print, labelled "art may differ".

**Readers.** For a Japanese SKU, a clear, self-hosted `bandai-jp` row for the
same card gives a same-language image; otherwise the English base reference,
as before. Each lane is read by its own function with a fixed SQL pair and
projector (`apps/storefront/src/lib/cards/official-image-lanes.ts`,
`en-card-data.ts`, `image-publication.ts`). The Japanese projector also
requires the exact credit line and decision id, an object named for the
row's key, a publisher file named for the same card, and an empty or bare
numeric query. `ImageReference` v1 keeps `reason: "english_base_reference"`;
the new `SameLanguageImageReference` schema is additive. Text stays English.
Fusion World English now checks its path as well as its host
(`/fw/en/` or `/fw/images/cards/card/en/`), a tightening.

**Surfaces.** `/prices`, `/market`, the card page and `/mekiki` show the
Japanese image when one exists, labelled "Official image · this printing
(Japanese), matched by SKU, not verified" (or "Official Japanese base print ·
… art may differ"), with the credit marked `lang="ja"`; otherwise they behave
as today. The universal card keeps `image_url`, `image_attribution` and
`image_reference` English and adds one unit, `image_same_language`. The JSON
behind `/market` (`/api/market/catalog`) carries the Japanese image in
`image_url` only when asked with `images=same-language`, which only `/market`'s
grid and table do, because they print the label and credit beside it. The
other catalogue callers (the deck builder, the listing wizard, the auction
sell picker and the swap composer) show a bare thumbnail with no label or
credit, so they keep the English image, as before. No image enters `/api/v1/member-prices`, the exports or
`/api/v1/market/*`.

**Flagged, not asked.** The rights map's question 4 (API, or pages only?)
was never put to Yu. The universal card API carries the Japanese image as
one field, so a "pages only" answer removes that field; the JSON behind
`/market` is public because the browser reads it, so it stays with the
pages. The card page's `og:image` is the share
card for a Japanese image, because a social platform would fetch and cache it
without its credit, beyond any takedown; the English `og:image` is unchanged
(a gap, below). Auction fulfilment no longer copies a Japanese image URL into
`portfolio_cards`.

**Kill switch.** `OFFICIAL_IMAGES_JA=off` (trimmed, any case) hides every
Japanese image from every reader, read on each call. On Vercel it reaches the
next deployment only. It deletes no object (the bucket is public-read),
purges no cache, cannot reach stored URLs or third-party caches, and does not
affect the tools.

**Takedown is per card.** A removal sets every `official_sample` row of the
card, every language and variant, in one statement keyed on game, set and
number:

```sql
UPDATE card_images SET takedown_status = 'removed'
 WHERE kind = 'official_sample'
   AND upper(split_part(sku, '-', 1)) = 'OP'
   AND upper(split_part(sku, '-', 2)) = 'OP01'
   AND upper(split_part(sku, '-', 3)) = '001';
```

Otherwise an English removal leaves the same art published as the Japanese
image, and a Japanese removal falls back to the English image of the same
art. The upload holds any row whose card has a row under takedown. Not built,
an option for the lead: the Japanese reader could withhold the English
fallback when the card's Japanese row is disputed or removed.

**The tools.** Two manual scripts, never scheduled, both dry runs by default,
one at a time, reading `DATABASE_URL` from the
environment only, with verified TLS or `--no-ssl` for loopback. "One at a
time" is a per-machine lockfile for every run, plus the Postgres session lock
`(116, 1)` on one client, taken before any request, for every run that opens
the database: the ingest's `--apply` and both of the upload's modes. The
ingest's dry run opens no database, so it holds the lockfile only, and two
dry runs on different machines can read Bandai at the same time.

- `apps/storefront/scripts/ingest-official-ja.mjs --game op|dbf|all [--series …] [--apply]`
  reads list pages only, never an image or a detail page, under
  `CambridgeTCG-official-media/1.0 (+https://cambridgetcg.com/legal/card-images; contact@cambridgetcg.com; permission cambridge.official-ja-media/2026-10-30)`,
  robots.txt first on each host every run, at least 2 s between requests to a
  host (or its Crawl-delay), no retries and no redirects. It stops on a 403,
  429, 3xx, 5xx, other non-200 or a challenge (exit 4) and on a page shape it
  does not recognise or more than ten quarantines in a series (exit 5). With
  `--apply` it writes once, at the end, in one transaction
  (`ON CONFLICT DO NOTHING`; never an update). `--game` is required, so a bare
  run does nothing.
- `apps/storefront/scripts/upload-official-images.mjs --profile <name> --lang ja|en [--limit N] [--apply --expect <count>:<digest>]`
  selects only its lane's clear, unuploaded official rows whose card has no
  row under takedown, pre-checks each (key, file, credit, evidence), and prints
  the selection's digest. `--apply` must repeat that digest, so it publishes
  exactly the reviewed set. Per row it fetches the image (same identified
  reader; English rows name `cambridge.official-en-media/2026-07-13`), checks
  type, size and dimensions, locks the row, uploads with
  `aws s3api put-object --if-none-match '*'` and its SHA-256, and records
  `s3_key`, `sha256`, `width` and `height` by the full primary key. A 412
  adopts the existing object only when its stored SHA-256 and length match;
  an object with no stored SHA-256 stops the run. It stops on any refusal and
  prints only AWS's error code. The child process sees an allowlisted
  environment (no endpoint override or other credentials).
- The old `backfill-card-images-s3.mjs` refuses to run (no language, source or
  takedown filter; `UPDATE … WHERE sku=$2`; ambient credentials; overwriting
  `aws s3 cp`; five unspaced fetches at once). The redistribution audit pins
  the refusal.

**Guard swap.** The redistribution audit's English-only official-image pins
(one `source = 'bandai-en'` pin and fixed reader texts) are replaced by
stronger, table-driven pins for both lanes: the lane table must equal the
audit's reviewed copy; each `card_images` query names exactly one lane pair
inside its own reader beside its own projector; the switch is read before the
query; every `card_images` reader and writer in the repository is named,
lowercase SQL and `.mjs` scripts included; the tools keep their full-key,
no-overwrite, named-profile, card-hold and refusal pins; the Japanese parser
reads no text; and only the scripts reach the tools.

A further tightening, the same day, after review: the no-overwrite and
named-profile pins first checked the tools file as a whole, so they passed
while any one call kept the text, and the put-object could lose `--profile`
(falling back to the CLI's ambient credentials) with the audit still green.
They now read the AWS calls one by one. The tools reach a process only
through the one `aws` helper (no other `execFile`, no alias); each call passes
one literal argument list with no spread; each is `--version`,
`s3api put-object` or `s3api head-object` and nothing else; each put-object
carries `"--if-none-match", "*"` once; and each bucket call names
`"--profile", profile` once. The upload script runs no process but the
injected one, the ingest script imports no process module, and the tools and
scripts name no other S3 subcommand (`s3`, `sync`, `mv`, `rm`,
`copy-object`, `delete-object(s)`, `put-object-acl`, multipart) and no
`--endpoint-url`.

## What still needs Yu's word

1. **Collection.** Running `ingest-official-ja.mjs` at all, dry run included,
   reads Bandai's Japanese card lists. That is the act, each time.
2. **The S3 upload.** `upload-official-images.mjs --apply` is the AWS write
   and the moment of publication. It needs Yu's word, D6 lifted for this
   upload, and the AWS profile Yu names at run time.

Also before either: the upload's dry run reads production `card_images`,
and the ingest's `--apply` writes to it, each through a database credential
this work was not given. The first upload should be staged:
`--limit 20`, then a look at `/market` and `/prices`, then the rest with a
fresh `--expect`. A host refusal (exit 4) ends collection until Yu decides;
it is never retried. Deploying this code is a separate step for the lead.

The read-only check for the Fusion World English tightening, for someone with
database access (not run):

```sql
SELECT count(*) FROM card_images
 WHERE source = 'bandai-en' AND lang = 'en' AND kind = 'official_sample' AND takedown_status = 'clear'
   AND sku LIKE 'DBF-%' AND s3_key IS NOT NULL
   AND NOT (source_url LIKE 'https://www.dbs-cardgame.com/fw/en/%' OR source_url LIKE 'https://www.dbs-cardgame.com/fw/images/cards/card/en/%');
SELECT count(*) FROM card_texts
 WHERE source = 'bandai-en' AND lang = 'en' AND sku LIKE 'DBF-%'
   AND source_url NOT LIKE 'https://www.dbs-cardgame.com/fw/en/%';
```

A non-zero count is English Fusion World media the tightened check now hides.

## Where Cambridge falls short

For the playbook's "where Cambridge falls short", said plainly:

- **Gate 1 fails on the sources' own words.** Both Japanese footers refuse
  reproduction without permission, and Bandai has granted none. Yu chose to
  self-host under their 07-13 rationale for English; that is Cambridge's
  decision, not Bandai's permission. The same reading puts the English lane
  in the same place.
- **The set is bulk-fetchable.** Object keys are predictable and the bucket is
  public-read, so the self-hosted set can be fetched in bulk, whatever
  "display only" says.
- **Copies outlive a takedown.** Stored URLs (portfolio rows and the English
  `og:image`) and third-party caches are not reached by a takedown or the
  switch; nor are objects already uploaded.
- **The English text ingest is unpinned.** `ingest-bandai-en.mjs` reads live
  Bandai pages with a browser-like User-Agent and no robots.txt read, and no
  audit pins it. An import fence keeps it off the Japanese collection run
  and the official-media reader, but not off `bandai-jp`'s config: it could
  still import the Japanese hosts and series from the package and read them
  under its own User-Agent.
- **Other catalogue callers show the English image without its credit.** The
  deck builder, the listing wizard, the auction sell picker and the swap
  composer render `/api/market/catalog`'s `image_url` as a bare thumbnail,
  with no credit or label. That predates this work and is unchanged; the
  Japanese image is kept out of them.
- **The playbook entry is not written.** The playbook lives in the
  `transparent-data-playbook` repository; editing it is an outward act left
  to Yu or the lead.

## Not checked

Production rows and the Fusion World shapes above; the bucket's policy and
versioning; the CLI version Yu will use, whether it needs
`--checksum-algorithm SHA256` beside `--checksum-sha256`, how its default
integrity checksum interacts, and the minimum version for `--if-none-match`
(the tests fake the CLI, so nothing here checks the argv against a real one);
precedence between environment credentials and `--profile` (moot under the
allowlist); the Japanese DOM beyond OP-01 and FB10; Fusion World promo
numbers; `_r` ids in Japanese lists (none appear in the captures); whether
other One Piece series carry DON!! or other ids that would pass ten
quarantines and stop a run; how an empty or pre-release series renders; art
parity between languages; and bandai.co.jp's policy pages.
