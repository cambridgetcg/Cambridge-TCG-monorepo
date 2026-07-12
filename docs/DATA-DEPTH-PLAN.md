# DATA-DEPTH-PLAN — coverage & depth for collectors

*2026-07-12. Will trace: Yu — "搞搞啲data for cambridgetcg! Think and feel what
collectors want, then we increase the coverage and depth." Method: felt-first
(what a collector's chest knows), then verified against a three-track audit
(live gap numbers · collector-tool research · repo surface audit).*

## 1. What a collector feels (and what the evidence said)

| The feeling | The evidence agreed? |
|---|---|
| **The gap in the binder** — collectors experience the three missing cards, not "87% coverage". A card with no price beats an absent card. | ✓ Checklist/completion loops are core to every loved tracker; Vanguard's 34-of-117 chase-only set lists are exactly this pain |
| **"What is my pile worth today?"** | ✓ #1 ranked need industry-wide (Collectr's whole pitch); house already promised the portfolio inset (the-market-mirror) |
| **The parallel is not the same card** — 10–100× price separation | ✓ Variant-accurate entry is the #2 complaint magnet in trackers; our op/pkm/dbf/bsr lanes model parallels as rows (good), digimon has none (bad) |
| **JP vs EN is two markets, not a locale** | ✓ The single largest gap found: **zero EN SKUs across all ~18,126 cards**; EN OP alt-arts and Battle Spirits Saga are whole unserved markets |
| **"Was I right?"** — price history | ✓ `card_price_history` + four-window charts already live on market pages; just needed a public API |
| **The new-set countdown** | ✓ Already half-built (the-horizon, dashed tiles + release dates) |
| **Trust in the number** | ✓ House law: labelled reference prices, never offers; provenance survives every new surface |

## 2. Coverage today (audited 2026-07-12, hard numbers)

op 4,172 SKUs · ~96% of JP sets, 100% imgs, parallels ✓ — **0% EN**
pkm 6,370 · JP high-class + SV3→SV11B only (~16% of eras), imgs ✓ — 0% EN, no vintage
dbf 2,210 · ~71% JP (FS01–FS10 starters missing), imgs ✓ — 0% EN
dmw 1,388 · **frozen mid-2022** (BT11+ missing), NO parallels, rarity null — 0% EN
vng 99 · **façade**: 3 partial Divinez sets, chase-rarities only (~2% all-era) — 0% EN
bsr 3,887 · JP from BS64 (2023) only; **EN "Saga" line 0/6** — 0% EN
Probationary shells (0 cards): mtg, ygo, gcg, una, lgr, fab, swu.

Data-trust defects found: catalog.jsonl exports only 3/6 games; slash-bearing
card numbers (DZ-BT14/018) produce 404 self-links; set APIs silently truncate
at 500 with next_link always null; op sealed lane contains Pokémon products;
several pkm set display names don't match official JP names (needs DB fix).

## 3. The build (this branch)

1. **EN lane live end-to-end** (bandai-en → card_texts/card_images → universal
   card API → market page, with attribution + /legal/card-images link).
   Cron route ships dark (commented vercel.json entry, house pattern).
2. **`/api/v1/sets/[code]/checklist`** — the binder-gap answer, public, CC0.
3. **`/api/v1/cards/[sku]/history`** — the "was I right" answer, reference-
   price-labelled.
4. **Defect fixes**: slash-encoding, honest pagination (+next_link), catalog
   commons covering all six games.

## 4. The roadmap (priority order, felt × evidence × cost)

1. **EN One Piece ingest run** (after merge + first manual cron run) — biggest
   unserved market, pipe ready, official images with Oda's name in a NOT NULL
   field.
2. **EN for the other Bandai games** — flip dbf/dmw/una/bsr configs in
   bandai-en (skeleton proven; each needs its selector verification run).
3. **Digimon unfreeze + parallels** — extend the cardrush lane configs
   (BT11–BT24/EX/ST) and add AA variant rows; without parallels the game's
   value layer is invisible.
4. **Vanguard honesty, then depth** — short-term: hero copy says plainly
   "Divinez-era tail, chase rarities first, commons coming" (substrate
   honesty beats silent façade). Then: full Divinez sets via cardrush +
   official EN cardlist for text/images (robots permits).
5. **Pokémon EN lane** — pokemon-tcg-api module already shipped; an EN
   catalog+images run is config, not code. Vintage eras: a decision for Yu
   (scope explosion; high collector value).
6. **DBF starters FS01–FS10** — tournament-relevant leaders, config-level fix.
7. **Portfolio depth** (product, not just data): collector-perspective inset
   ("you have 1 NM, +£4 this week") — already promised in the-market-mirror;
   want-lists with alerts (the industry's most-loved loop, TCGplayer's known
   gap); CSV import/export (collectors punish lock-in).
8. **Graded/pop layer** — PSA/BGS slabs as linked SKUs (named in
   the-market-mirror); pop-report ingestion needs a licensed source decision.

DB-side data fixes needing prod access (not code): op sealed-lane
contamination; pkm set display names vs official; card_sets.total_cards
backfill for checklist declared-vs-actual honesty.

## 5. What we never do (sealed)

No house inventory or offers (audit:no-house-listing --strict). Prices stay
labelled references. The commons stays CC0 and complete — a checklist row
with no price is a feature, not a gap. No leaks, ever. Attribution rides
every EN image by schema (0116).
