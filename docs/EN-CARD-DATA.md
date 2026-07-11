# EN-CARD-DATA — English card images & text, with the legality sorted

*Research + design, 2026-07-11. Directive: "include all english images too and
their descriptions, what their cards do. Sort out the legality. Be clear.
Fairness, Justice. We are here to promote the culture." Research is internal
policy work, not legal advice.*

## 1. What exists today (audit)

- 17,831 cards / 168 sets live across 6 games (op 4,134 · pkm 6,370 · dbf 2,126
  · dmw 1,215 · vng 99 · bsr 3,887). Gundam (gcg) + Union Arena (una) preparing.
- Images are **Japanese CardRush scans** mirrored to `s3://jp-op-photos/hires/...`
  (HIRES IMAGE PROTECTION rule: never overwrite; new pipelines use new prefixes).
  Some rows still hotlink cardrush directly. Newer proxied-lane rows have
  `image_url: null`. Zero English images; zero card text anywhere —
  `CanonicalCard.oracle_text` exists on the wire but has no DB column.
- `card_texts` + `card_images` (migration **0116**) now give both a home,
  provenance-first: attribution NOT NULL, takedown_status first-class.

## 2. Where English data comes from (verified live 2026-07-11)

| Game | Text | Images | Method | Conditions |
|---|---|---|---|---|
| One Piece (op) | official en.onepiece-cardgame.com cardlist | same, 600×838 PNG (official samples) | polite scrape, per-series | no robots restriction; throttle; Bandai © line |
| DBS Fusion World (dbf) | official dbs-cardgame.com/fw/en | same, 600×838 WEBP | same skeleton | same |
| Digimon (dmw) | digimoncard.io API | official world.digimoncard.com PNGs | API + image mirror | self-host |
| Battle Spirits Saga (bsr) | official EN cardlist (same Bandai skeleton) | official | scrape | verify robots on first run |
| Union Arena (una) | official `?search=true&series=N` | official 600×837 PNG | scrape | same |
| Gundam (gcg) | official /en/cards/ | official 600×838 WEBP | scrape | same |
| Vanguard (vng) | en.cf-vanguard.com/cardlist | official 350×510 PNG | scrape | robots.txt permits; low-res tradeoff; consider asking Bushiroad (they answer) |
| Pokémon (pkm) | pokemontcg.io v2 + pokemon-tcg-data GitHub bulk | 600×825 hires PNG | API/bulk | 20k req/day w/ key; self-host to survive API churn |
| MTG (prep) | Scryfall bulk (data.scryfall.io) | cards.scryfall.io | daily bulk | real User-Agent; self-host encouraged; WotC Fan Content attribution |
| Yu-Gi-Oh (prep) | YGOPRODeck v7, one bulk call | images.ygoprodeck.com | bulk once | **must self-host — hotlinking = blacklist** |

One scraper skeleton covers all five Bandai EN sites (identical
`.../card/{CARD_NO}.png|webp` convention, `_p1` suffixes for parallels).

## 3. The law, briefly (full risk matrix in the research archive)

- **Names / stats / set data**: facts. Low risk everywhere (Feist; BHB v
  William Hill kills the UK/EU database-right angle for our own compilation).
- **Effect text**: low–moderate. Functional, merger doctrine; show per-card,
  attribute, never bulk-dump. **Flavor text: omit entirely** (protectable
  prose, zero marketplace value). Enforced by schema — no column.
- **Images for sale listings**: strongest position (identifying genuine goods
  for resale; UK s.11(2) TMA honest practices; Dior v Evora in the EU).
- **Catalogue thumbnails**: tolerated industry-wide, technically unlicensed.
  Mitigate: thumbnail resolution for browse (JP enforcement guidance uses a
  ~90k-pixel benchmark ≈ 300×300), copyright lines intact, instant takedown.
- **Full-res galleries as content**: moderate–high; we don't build one. Full
  size only on product pages.
- **Leaked/pre-release cards: HIGH risk, absolute ban** (Pokémon litigates).
- The real governing law is **publisher tolerance**: Scryfall, Serebii,
  Cardmarket all survive by being useful to the ecosystem and instantly
  compliant when asked. That is the posture, codified at /legal/card-images.

## 4. Publisher-specific notes

- **Bandai** (5 of our games): no written fan policy; deepest tolerated
  ecosystem (runs tournaments through Limitless's DB). Official galleries are
  the cleanest, publisher-served source — use them, credit them.
- **Pokémon**: highest-risk publisher (ToS bans DB downloads; has sued a card
  DB). The entire industry ships it anyway; we self-host, keep listing-scale
  images, stay takedown-ready.
- **Bushiroad**: uniquely, answers commercial-use enquiries individually.
  **Action for Yu: email their contact form** — a yes converts vng to zero-risk.
- **WotC**: written Fan Content Policy permits; Scryfall bulk data is the
  friendly path when mtg goes live.
- **Konami**: default-prohibits, decade of non-enforcement vs databases;
  YGOPRODeck self-host rule is binding when ygo goes live.

## 5. Storage & serving

- New bucket `s3://ctcg-card-images/{lang}/{game}/{set}/{CARD_NO}[_variant].{ext}`
  (+ `thumb/` prefix, ~300px, generated at ingest). Never touches jp-*-photos.
- Every object row-tracked in `card_images` (kind='official_sample' |
  'community_api' | 'shop_scan' | 'seller_photo'; sha256; attribution).
- `next.config.ts` whitelist += the new bucket host. Market pages prefer
  `lang='en' kind='official_sample'`, fall back to JP scan.
- Takedown: set `takedown_status`, S3 object moved to `removed/` (kept for
  audit), CDN purged. Log stays.

## 6. Rollout

1. **0116 migration** (this branch) → `card_texts`, `card_images`.
2. **bandai-en ingest module** (this branch, `packages/data-ingest/src/bandai-en/`)
   — op first (52 sets), then dbf/dmw/una/gcg/bsr behind the same skeleton.
3. pkm via pokemon-tcg-data bulk; vng scrape (+ Bushiroad email).
4. Storefront: EN image/text on market + price-guide card pages; footer link
   to /legal/card-images from every card-bearing page.
5. **Needs Yu** (spending/accounts): (a) create `ctcg-card-images` bucket;
   (b) US DMCA agent registration ($6, copyright.gov, 3-yearly renewal) —
   protects the seller-photo surface; (c) send the Bushiroad enquiry;
   (d) merge + deploy (codeberg first, per mirror topology).

## 7. Fairness commitments (public, at /legal/card-images)

Official sources first · attribution always (schema-enforced) · thumbnails
where thumbnails do · no edits, no logo use, no flavor text, no leaks ever ·
genuine cards only · takedowns honoured fast and kept in the audit trail ·
non-affiliation stated plainly. Promote the culture; take nothing from it.
