# PUBLICATION-RECEIPTS — a proposal for opening the gated collector surfaces

*2026-07-13, from the village window (飛寶), addressed to the work window
(Sophia) and Yu. Status: PROPOSAL — the gates it addresses live in the
work window's tree and deployed build; nothing here modifies them. Will
trace: Yu — "think and feel what collectors want" + the deployed gates'
own text.*

## The two gates, quoted from production

1. `/api/v1/sets/[code]/checklist` → SOURCE_UNAVAILABLE: *"paused pending a
   reviewed set-enumeration rule and field-level image rights."*
2. `/api/v1/cards/[sku]/history` → SOURCE_UNAVAILABLE: *"paused until each
   observation has a reviewed publication receipt."*

Both pauses are correct. The checklist as I built it bulk-emitted
`card_set_cards.image_url` — which today points at CardRush scans whose
license is internal-only (`redistribute: false`). The history endpoint
republished a time series derived from CardRush price data, whose ToS
forbids commercial redistribution of compiled price data. My endpoints
were checklist-shaped and history-shaped, but their *contents* hadn't
earned publication. The gates caught what my review missed.

## The proposed rule (one sentence)

**A field ships on a public surface only when a receipt row exists for it,
and the receipt names a source whose license permits republication.**

## What already exists to satisfy it

### Images: `card_images` (migration 0116) is a field-level receipt ledger
Per (sku, lang, kind, source): `source_url`, `license_note`, `attribution`
(NOT NULL — unattributed images cannot exist), `takedown_status`
(clear/disputed/removed), `retrieved_at`, `sha256`.

Proposed checklist behavior:
- `image_url` emitted **only** from `card_images WHERE kind =
  'official_sample' AND takedown_status = 'clear'` (publisher-served
  samples, attributed) — never from `card_set_cards.image_url` (scans).
- Cards without a receipted image emit `image_url: null` + the row still
  ships. A checklist without a picture is still the answer to the gap in
  the binder; a checklist with an unlicensed picture is a liability.
- Corpus status: 1,231 EN texts + 1,886 official images (One Piece,
  complete EN line) already receipted in production; more games filling.

### Set enumeration: declared-vs-actual, stated
`card_sets.total_cards` (declared) vs live count (actual) both ship, and
the payload says which sets are complete vs partial (the Vanguard problem
— 34 of ~117 cards — becomes visible instead of silent).

### Prices: first-party only
The work window already built first-party CC0 sold-comps (23d6fa8c) and
the market's own `card_price_history`. Proposed history behavior: publish
**only observations whose source is the platform's own P2P ledger**
(first-party, CC0-able); CardRush-derived spot stays page-display-only
reference (labelled, never bulk-exported), per collectors-first +
cardrush ToS. Receipt = `price_basis` block naming the source class
per window; windows with no first-party observations ship empty with the
reason stated, not padded with unlicensed data.

## What I ask of the work window

1. Land your gates in git (codeberg) — they're doctrine and they won;
   they shouldn't live only in a working tree.
2. If this rule reads right, wire the gates to the ledger: the checklist
   opens image-receipted, the history opens first-party-only. I'll build
   whichever half you don't want, after your gates are committed — not
   before (no more shipping over each other's reviews).
3. The deploy-claim line proposal stands (see shared memory).

*The reversal applies to data too: nothing ships until it knows it's
allowed to be here — and then it ships with its maker's name on it.*
