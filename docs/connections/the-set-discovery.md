---
title: The set discovery — protocol flexibility for new publisher prefixes
shape: node-view
date: 2026-05-13
status: shipped
maturity: engineering
doctrines: [substrate-honesty, transparency, meaning]
kingdom: kingdom-078
this_entry_names:
  - packages/sku/src/sets.ts                              # NEW — set-format registry + parseCardNumber
  - packages/sku/src/index.ts                             # + SET_FORMATS / SET_FROM_CONTEXT / parseCardNumber exports
  - apps/wholesale/tools/lib/config.ts                    # migrated to parseCardNumber
  - apps/admin/scripts/set-discovery.ts                   # NEW — 11th audit
  - apps/admin/package.json                               # + sku workspace dep, + set-discovery script
  - package.json                                          # + audit:set-discovery in chain
parents:
  - the-stress-test.md
  - the-drift-reconciliation.md
  - the-name-resolver.md
self_reference: this entry names itself in `this_entry_names`; the audit it ships will eventually surface this entry's own SetFormat declarations as needing tightening when reality outruns the catch-all.
---

# The set discovery — protocol flexibility for new publisher prefixes

> *"Think about how the protocol can handle newly added sets which may have different format from existing sets. E.g. the roll out of EB01 when One Piece has been OP01, 02, 03 all along. Give the protocol flexibility."* — Yu, 2026-05-13.

The canonical SKU `<game>-<set>-<number>-<lang>` was already flexible at the spec level: the `set` segment is `[a-z0-9]+`, accepting any alphanumeric token. **The rigidity lived in the tooling**. The wholesale CardRush mapper's per-game `generateBaseSku()` had hand-coded regexes (`/^(OP|ST|EB|PRB)\d{2}-\d{3}/`) that recognised exactly the prefixes the developer had typed. A new publisher prefix — Yu's example: EB01 arriving when only OP01..OP15 were known — would either match the catch-all (silent) or fall to `set: "unknown"` (visible-but-vague). Neither was substrate-honest about the discovery.

This kingdom names set-format recognition as a **data extension, not a code extension**. New prefix = add a row to a typed registry, not edit a regex. The audit `pnpm audit:set-discovery` surfaces every set_code the registry doesn't yet recognise — and distinguishes `confirmed` (registered + active) from `catch-all` (matched only the loose fallback) from `none` (unparsed entirely).

Three artifacts compose: §1 the registry; §2 the tooling migration; §3 the audit. §4 names the pattern; §5 lists recursion targets.

---

## 1. The registry — `packages/sku/src/sets.ts`

A typed `SetFormat` declares one publisher's card-number layout. The module exports a per-game `SET_FORMATS: Record<GameCode, readonly SetFormat[]>` and a `parseCardNumber(game, raw)` helper that walks the formats in order.

### 1.1 The `SetFormat` shape

```ts
interface SetFormat {
  game: GameCode;
  pattern: RegExp;             // positional captures; ES2017-compatible
  setGroupIndex?: number;      // default 1 (the set token)
  numberGroupIndex?: number;   // default 2 (the number token)
  setOverride?: string;        // when matched format implies a different set
                               // (e.g. P-2ANNY-001 → set: "promo")
  description: string;         // human-readable
  examples: readonly string[]; // for docs + audit
  confirmed: boolean;          // platform has ingested at least one match
}
```

`confirmed: boolean` is the substrate-honest flag. `true` = registered + we've seen real cards through this format; `false` = anticipated / catch-all (audit-needed). Pattern mirrors:
- `GameMeta.confirmed` for game codes (kingdom-069)
- `CARDRUSH_SUBDOMAINS[host].confirmed` for upstream subdomains (kingdom-064)
- The same idea propagating one layer deeper in the SKU stack.

### 1.2 The One Piece example — Yu's concrete case

```ts
op: [
  { pattern: /^(OP\d{2})-(\d{3,4})$/i,
    description: "One Piece main booster (OP01..OPNN)",
    examples: ["OP01-001", "OP15-100"],
    confirmed: true },

  { pattern: /^(ST\d{2})-(\d{3,4})$/i,
    description: "One Piece starter deck (ST01..STNN)",
    examples: ["ST01-001", "ST21-010"],
    confirmed: true },

  { pattern: /^(EB\d{2})-(\d{3,4})$/i,
    description: "One Piece extra booster (EB01..EBNN) — Yu's example case",
    examples: ["EB01-001", "EB04-024"],
    confirmed: true },

  { pattern: /^(PRB\d{2})-(\d{3,4})$/i, /* … */ confirmed: true },
  { pattern: /^(PCC\d{2})-(\d{3,4})$/i, /* … */ confirmed: true },

  // Promo consolidation via setOverride
  { pattern: /^P-(\d{3,4})$/i,
    setGroupIndex: undefined, numberGroupIndex: 1,
    setOverride: "promo",
    description: "One Piece promo (P-NNN)",
    examples: ["P-001"],
    confirmed: true },
  // ... E-NNN, P-2ANNY-NNN ...

  // Catch-all: new prefixes land here as `confirmed: false`
  { pattern: /^([A-Z]{2,5}\d{2})-(\d{3,4})$/i,
    description: "One Piece catch-all",
    examples: [],
    confirmed: false },
]
```

When Bandai ships hypothetical `AC01-001` (Anniversary Collection) tomorrow:
1. The tooling calls `parseCardNumber("op", "AC01-001")`.
2. None of the confirmed formats match.
3. The catch-all matches: `set: "ac01", confirmed: false`.
4. The card flows into the catalog with `cards.set_code = "AC01"`.
5. `pnpm audit:set-discovery` surfaces it: *"set_code AC01 (sample AC01-001, 47 cards) matched only the catch-all pattern; consider adding a confirmed format."*
6. Operator adds the AC format above the catch-all; flips `confirmed: true`.
7. Next ingest classifies AC as confirmed.

**No code edit for the discovery itself — the catch-all caught the new shape. The promotion is the operator-decided refinement.**

### 1.3 Per-game format counts (this kingdom)

| Game | Confirmed | Catch-all | Total |
|------|-----------|-----------|-------|
| `op` (One Piece) | 8 | 1 | 9 |
| `pkm` (Pokémon) | 5 | 1 | 6 |
| `mtg` (Magic) | 1 | 1 | 2 |
| `ygo` (Yu-Gi-Oh!) | 2 | 1 | 3 |
| `dbs` (DBS) | 2 | 1 | 3 |
| `dbf` (DBF) | 4 | 1 | 5 |
| `wei` (Weiß) | 1 | 1 | 2 |
| `vng` (Vanguard) | 2 | 1 | 3 |
| `dmw` (Digimon) | 2 | 1 | 3 |
| `bsr` (BSS) | 1 | 1 | 2 |
| `fab` (FaB) | 1 | 1 | 2 |
| `lgr` (Lorcana) | 1 | 1 | 2 |
| `lcg` | 0 | 1 | 1 |
| Anticipated games (`swu`, `sor`, `alt`, `rft`, `rsh`, `pkp`, `gen`) | 0 | 7 (1 each) | 7 |
| `tst` | 1 | 0 | 1 |
| **Total** | **31** | **20** | **51** |

The 31 confirmed formats teach the protocol *what we know*; the 20 catch-alls catch *what we don't know*; the audit surfaces *what's new*.

### 1.4 The `SET_FROM_CONTEXT` sentinel

Some publishers use card-number formats that don't embed the set token at all — Pokémon's `025/202` (collector/total), Lorcana's `1/204`. These can't return a set from the regex alone; the set comes from row context (the `card_sets` table on the wholesale side).

```ts
{ pattern: /^(\d{1,4})\/\d{1,4}$/,
  setGroupIndex: undefined,
  numberGroupIndex: 1,
  setOverride: "_set_from_context",  // sentinel exported as SET_FROM_CONTEXT
  description: "Pokémon collector/total form — set from row context",
  ... }
```

The caller checks `parts.set === SET_FROM_CONTEXT` and supplies the publisher's set code separately. Substrate-honest: the parser declares what it can't know.

---

## 2. The tooling migration — `apps/wholesale/tools/lib/config.ts`

The cardrush mapper's per-game generators now delegate to `parseCardNumber`. Before:

```ts
const ONEPIECE_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber) => {
    if (cardNumber === "DON" || cardNumber === "P") { /* ... */ }
    const m = cardNumber.match(/^([A-Z]{1,4}\d{2})-(\d{3,4})$/);
    if (!m) return buildSku({ game: "op", set: "unknown", ... });
    return buildSku({ game: "op", set: m[1], number: m[2], lang: "ja" });
  },
};
```

After:

```ts
const ONEPIECE_MAP: GameMapConfig = {
  generateBaseSku: (cardNumber) => {
    if (cardNumber === "DON" || cardNumber === "P") { /* ... */ }
    const parts = parseCardNumber("op", cardNumber);
    if (!parts) return buildSku({ game: "op", set: "unknown", ... });
    return buildSku({ game: "op", set: parts.set, number: parts.number, lang: "ja" });
  },
};
```

The local regex is gone. New prefixes are recognised whenever the operator extends `SET_FORMATS` in the package — no code change to `config.ts`.

DRAGONBALL_MAP migrated the same way. POKEMON_MAP kept its existing `cardNumber.split("/")[0]` shorthand since the slash-form is captured by the registry's first format; future cleanup could route through `parseCardNumber("pkm", ...)` with row-context set-substitution.

---

## 3. The audit — `apps/admin/scripts/set-discovery.ts`

11th audit in the family. Queries `cards.set_code DISTINCT` per game from wholesale RDS, classifies each:

- **`confirmed`** — a registered `confirmed: true` format matched. ✓ no action.
- **`catch-all`** — only the loose catch-all matched. ⚠ operator should add a tighter `confirmed: true` format.
- **`none`** — no format matched at all. ✗ extend SET_FORMATS or quarantine.

Reports counts plus the offending set_codes with sample card-numbers. **Skips gracefully** when `WHOLESALE_DATABASE_URL` is unset OR when the DB URL can't parse OR when the DB query fails — substrate-honest about scope, never crashes the audit chain.

Exit 0 by default; `--strict` exits non-zero on findings.

Sample output (one-piece-only setup, hypothetical):

```
◆ set-discovery audit — newly-shipped set-codes vs registered formats

  set_codes scanned:    52
    confirmed-format:   48
    catch-all-format:   3   (promote when stable)
    no-format-match:    1   (extend SET_FORMATS)

◇ Catch-all matches (need tighter `confirmed: true` format)
    [op] set_code=AC01           sample=AC01-001       cards=47
    [op] set_code=VR01           sample=VR01-001       cards=12

◇ Unparseable set_codes (no registered format matches)
    [op] set_code=SPECIAL        sample=SPECIAL-X      cards=3
```

Operator reads the report, extends `SET_FORMATS`, re-runs. The drift surface shrinks.

---

## 4. The pattern named — anticipate then confirm

This is the third instance of the same substrate-honesty pattern:

| Layer | Anticipated marker | Confirmed flip |
|-------|---------------------|----------------|
| Upstream subdomains (kingdom-064) | `CARDRUSH_SUBDOMAINS[host].confirmed: false` | First successful scrape |
| Game codes (kingdom-069) | `GameMeta.confirmed: false` | First ingested SKU |
| Set formats (kingdom-078) | `SetFormat.confirmed: false` | First parsed real card |

Same idea: the protocol declares what it *anticipates*; reality confirms when it arrives; the audit surfaces the moment of confirmation so the operator can promote. **Substrate-honesty about not-yet-known.**

The pattern propagates down the SKU stack from coarsest to finest: which game exists → which subdomain serves it → which set-format shape we've seen. Each layer's confirmed/anticipated discipline composes cleanly with the others.

---

## 5. Recursion targets

Ordered by leverage:

1. **Migrate POKEMON_MAP fully to `parseCardNumber`** — currently keeps its existing slash-form shorthand. Use the registry's slash-form pattern + supply set from row context.
2. **Audit-promotion flow** — when an operator extends `SET_FORMATS` with a new confirmed format, the audit's next run should show the promoted classification. Add a `--diff` flag that compares current registry to the catalog state.
3. **Cross-game prefix collision detection** — `BT01` exists in both DBS and Digimon; the per-game scope handles this today, but a cross-game audit could flag when an upstream gives ambiguous SKUs.
4. **Format coverage metric** — `pnpm audit:set-discovery --report` outputs a per-game confirmed/total ratio. Names the platform's recognition depth.
5. **Auto-promote suggestion** — when a catch-all matches the same set_code repeatedly across N ingest runs with no operator intervention, the audit suggests a specific `SetFormat` row to add.
6. **Storefront-side audit parallel** — the storefront `card_set_cards.set_code` distinct list should align with the wholesale's. Cross-DB version of the audit.
7. **Promo namespace canonicalisation** — `P-NNN`, `E-NNN`, `P-2ANNY-NNN` all consolidate under `set: "promo"`; the `number` token preserves the discriminator. A future iteration could split into `set: "promo-2anny"` etc. for finer addressing.
8. **Format-version history** — when a format flips `confirmed: false → true`, record the timestamp + operator. Substrate-honest history of what the protocol learned and when.
9. **Live `pkm` slash-form set lookup** — currently the slash-form returns `_set_from_context`; the wholesale tooling supplies the set code from `card_sets`. A future iteration could thread this through the protocol so partner callers also get the set substitution.
10. **External SetFormat registration** — partners adopting the standard could submit format additions via a PR or a `/standards/set-formats` endpoint. The registry becomes a community contribution surface.

---

## 6. What this entry names — substrate-honestly

One new module (`sets.ts`, ~290 LOC, 51 formats across 21 games — 31 confirmed + 20 catch-all). One tooling migration (config.ts onepiece + dragonball generators now route through `parseCardNumber`). One new audit (`set-discovery.ts`, 11th in the family, ~190 LOC, gracefully skipped without DB). Three lines added to `package.json` audit chain. Three new exports from `@cambridge-tcg/sku` (`SET_FORMATS`, `SET_FROM_CONTEXT`, `parseCardNumber`).

**The pattern named explicitly**: anticipate-then-confirm propagates through three layers of the SKU stack (game / subdomain / set-format). When Bandai ships AC01 next quarter, the protocol catches it via catch-all *today*; the audit surfaces it *immediately*; the operator promotes it *when reality confirms* — and the moment is recorded in commit history.

The wire is ready; reality fills in over time. **Substrate-honesty advances one format at a time.**

This entry names itself in `this_entry_names`. It is named by [`the-stress-test.md`](./the-stress-test.md) (which surfaced the SKU-layer rigidity), [`the-drift-reconciliation.md`](./the-drift-reconciliation.md) (the wholesale-side SKU compat that this composes with), and [`the-name-resolver.md`](./the-name-resolver.md) (the parallel substrate-honesty work on the natural-language axis). It will be named by every operator commit that flips a `confirmed: false` to `true` in `SET_FORMATS`.

— Sophia, 2026-05-13. kingdom-078.
