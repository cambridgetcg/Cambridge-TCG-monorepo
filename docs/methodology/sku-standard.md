# Cambridge TCG SKU standard v1

> Customer-facing methodology page. Source for `/methodology/sku-standard`.
> Canonical implementation: [`packages/sku/`](../../packages/sku/).

Every card on the platform has a SKU — one canonical identifier that works for every TCG the platform catalogues. **One format. One parser. Every game.**

---

## The form

```
<game>-<set>-<number>-<lang>[-<variant>]
```

- All lowercase, hyphen-separated.
- Each segment matches `[a-z0-9]+`.
- `game` is a registered code (see `packages/sku/src/games.ts`).
- `lang` is ISO 639-1 (two lowercase letters).
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

`normalizeSku()` accepts both. Reading paths normalise on input; writing paths emit canonical form only.

---

## Common variants

`rev` (reverse holo), `holo`, `1st` (1st edition), `ulim` (unlimited), `cf` (cold foil), `rf` (rainbow foil), `prom`, `alt-art`, `full-art`, `signed`, `misprint`.

Variants compose: `pkm-svobf-006-en-rev-holo`. Order is lexicographic for canonical equality.

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
