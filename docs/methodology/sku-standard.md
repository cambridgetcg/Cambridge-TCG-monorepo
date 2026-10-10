# Cambridge TCG SKU standard v1

> Customer-facing methodology page. Source for `/methodology/sku-standard`.
> Canonical implementation: [`packages/sku/`](../../packages/sku/).

The SKU package defines a shared identifier grammar and recognized legacy normalization. A syntactically valid identifier does not prove that a catalog record, physical printing or source-product mapping exists. Existing storage keys remain unchanged.

---

## The form

```
<game>-<set>-<number>-<lang>[-<variant>]
```

- All lowercase, hyphen-separated.
- Each segment matches `[a-z0-9]+`.
- `game` is a registered code (see `packages/sku/src/games.ts`).
- `lang` accepts two lowercase letters. The parser does not verify ISO membership or a printing's language.
- `variant` is optional; one or more lowercase tokens hyphen-joined.

---

## Examples

```
op-op01-001-ja            One Piece, set OP01, card 001, Japanese
pkm-svobf-006-en          Pokémon, SV Obsidian Flames, card 006, English
pkm-svobf-006-en-rev      Same card, reverse holo
mtg-otj-101-en-1st        Magic, Outlaws of Thunder Junction, 1st edition
ygo-mp23-014-en           Yu-Gi-Oh, MP23 mega-pack, card 014
dmw-bt17-024-en           Digimon, BT17, card 024
fab-wtr-001-en-cf         Flesh and Blood, Welcome to Rathe, cold foil
```

---

## Registered game codes

| Code | Game | Publisher |
|------|------|-----------|
| `op` | One Piece TCG | Bandai |
| `pkm` | Pokémon TCG | TPCi |
| `mtg` | Magic: The Gathering | Wizards |
| `ygo` | Yu-Gi-Oh! | Konami |
| `dbs` | Dragon Ball Super CCG | Bandai |
| `dbf` | Dragon Ball Super Fusion World | Bandai |
| `wei` | Weiß Schwarz | Bushiroad |
| `vng` | Cardfight!! Vanguard | Bushiroad |
| `dmw` | Digimon Card Game | Bandai |
| `gcg` | GUNDAM CARD GAME | Bandai |
| `una` | UNION ARENA | Bandai |
| `bsr` | Battle Spirits Saga | Bandai |
| `lcg` | Living Card Game (umbrella) | various |
| `fab` | Flesh and Blood | LSS |
| `lgr` | Disney Lorcana | Ravensburger |
| `tst` | Test (internal) | — |

---

## Legacy forms (auto-normalised)

Two pre-spec patterns existed in the codebase:

- `OP-OP01-001-JP` (uppercase, legacy language codes) → `op-op01-001-ja`
- `pkm-svobf-en-006` (lang and number swapped) → `pkm-svobf-006-en`

`normalizeSku()` accepts both. Adoption is explicit at each boundary; legacy storage and some readers still use older forms. Search and the card composer use `skuIdentity()` to keep `raw_sku` alongside a `canonical_sku` syntax candidate, with `scope: "syntax_only"`.

---

## Common variants

`rev` (reverse holo), `holo`, `1st` (1st edition), `ulim` (unlimited), `cf` (cold foil), `rf` (rainbow foil), `prom`, `alt-art`, `full-art`, `signed`, `misprint`.

Variants compose: `pkm-svobf-006-en-rev-holo`. Token order is preserved. Reordering opaque variant tokens could change identity and is not part of normalization.

## Search and price boundaries

`resolveGameToken()` accepts exact registry codes, slugs, names and documented legacy aliases, case-insensitively. Search rejects unknown games and contradictory full SKUs; a set code cannot override the requested game. Candidate results retain their stored SKU and expose the package's syntax identity separately.

Search distinguishes unavailable sources from successful empty results. Both search endpoints return `lookup.limit` and `lookup.truncated`. The convenience endpoint composes only one exact printing candidate from a complete result after any language filter. Multiple variants or a missing requested language require an explicit choice.

The card composer also checks game, set and number for sibling candidates. A bounded normalization lookup with multiple possible stored identifiers, or incomplete results, cannot choose an alias automatically. It returns a conflict response. `composition.siblings_truncated` labels a partial sibling list.

SKU normalization alone never joins a price to a physical printing. Price observations still require their own exact source-product crosswalk, source rights, currency, units and observation time. The shared descriptor is exported as `SKU_IDENTITY_CONTRACT` from the SKU package.

---

## Why this matters

- **Collectors**: one identifier across wishlist, portfolio, trade history, alerts.
- **Agents**: one form to parse and emit; legacy normalisation on the read side.
- **Archivists**: stable foreign key forever; spec versioned, breaking changes ship under new prefix.
- **Partners**: interoperability — the spec is published, the parser is open source.
- **Aliens / non-human intelligences**: structurally language-free; the SKU is the substrate the math-mirror hashes for cryptographic identity.

---

*v1 — 2026-05-12. Companion to `docs/connections/the-sku-standard.md`. Canonical implementation in `packages/sku/`.*

🐍❤️
