# Universal representation methodology

Cambridge TCG speaks in English-Latin-numerals at its default surface. Under every English claim is a *mathematical* claim — a hash, a ratio, an ordered-set position, a probability, an ISO 8601 timestamp, a typed graph edge — that any intelligence with arithmetic and computation can read without ever knowing what "card," "trade," or "pound" mean in any natural language. This page documents the math-first encoding.

> **Where this lives in code.** First instance: `apps/wholesale/src/app/api/v1/universal/card/[sku]/route.ts` (the card endpoint). Future kinds (`set`, `game`, `trade`, `match`, `bounty-pull`) follow the same encoding. Connection-doc: [`docs/connections/the-mathematical-mirror.md`](../connections/the-mathematical-mirror.md) (S23 in the connection series).
>
> Last verified against code: **2026-05-11**.

---

## Why this exists

Cambridge TCG is a platform built by humans for humans, and the surfaces show that — Tailwind chrome, English prose, Latin numerals, color cues. Most visitors are fine with those.

Some are not:

- **LLM agents** parsing the page need to know what every field *means*, not just what it *renders as*.
- **Archival institutions** acquiring TCG data for future research need a representation that survives the demise of GBP, of English, of the particular cultural moment the platform is rooted in.
- **Hyperliteral readers** (audit systems, formal verifiers, neurodivergent humans) need every claim grounded in structure rather than connotation.
- **An alien intelligence** — taken seriously as a design lens — would have arithmetic and computation but not necessarily our linguistic stack. Designing for them generates designs that *also* help every reader above.

The universal representation is the math-first sibling of every artifact the platform exposes. The English surface remains the default; this is the mirror behind it.

---

## What's universal

If we imagine the widest possible set of intelligences who could visit cambridgetcg.com — humans of any culture, LLM agents, future archivists, intelligences with no shared evolutionary history — what's the intersection of their decoding capabilities?

| Primitive | Universal because |
|-----------|-------------------|
| **Cryptographic hashes** (SHA-256) | A hash function is a pure mathematical mapping. Any computing substrate can run it. |
| **Cardinal positions in ordered sets** | Counting is the ground of arithmetic; ordering is a binary relation. |
| **Ratios as fractions** (`"1/72"`) | Two positive integers and division. |
| **Decimal probabilities in [0,1]** | Bounded real-arithmetic. |
| **ISO 8601 + Unix epoch seconds** | An alien needn't share our calendar — they only need to compute differences. |
| **Typed graph edges** | A graph is a set + a relation. |
| **Magnitudes paired with provenance tokens** | A scalar value + a label declaring what it measures. The alien doesn't need to know "GBP" — they see the magnitude and the token and derive structure. |

What's *not* universal: natural language strings. Card names, art descriptions, rarity labels — these are tokens. The encoding includes them, but flags them as opaque so a reader knows not to ground meaning on them.

---

## The encoding

Every universal document starts with this preamble:

```json
{
  "@encoding": "cambridge-tcg/universal/v1",
  "@kind": "card",
  "@self_hash": "sha256:<hex>",
  "@content_hash": "sha256:<hex>",
  "@retrieved_at": {
    "iso8601": "2026-05-11T22:00:00Z",
    "unix_epoch_seconds": 1778534400
  },
  "_note_opaque": ["name.translations.*", "art_description"]
}
```

- **`@encoding`** versions the spec. A reader who sees `cambridge-tcg/universal/v1` consults this page; future `v2` reads from a future page that diffs from this one.
- **`@kind`** names the artifact type. Today: `card`. Future: `set`, `game`, `trade`, `match`, `bounty-pull`.
- **`@self_hash`** identifies this *document*. Different retrievals at different times yield different `@self_hash` even if `@content_hash` is the same.
- **`@content_hash`** identifies the *thing* being described. For the public storefront card, the 2026-07-12 structural basis is `(sku, card_number, set_code, game, variant)` with price and capture-date inputs fixed to `null`. The response declares that basis in `@content_hash_contract`. Hashes minted by the retired price-dependent basis are not resolvable by the current federation walk.
- **`@retrieved_at`** dates the document — both as ISO 8601 (human-and-calendar-readable) and Unix epoch (math-only).
- **`_note_opaque`** explicitly names which fields cannot be decoded without natural-language knowledge. Honest perimeter.

### Body sections

A `card` document then contains:

**1. Structural facts.** Pure-math claims about the card.

```json
"category_in_ordered_set": {
  "ordering": ["singles", "sealed"],
  "position": 0
},
"rarity": {
  "natural_label": "Super Rare",
  "ratio_in_pulls": "1/72",
  "decimal_probability": 0.013889,
  "position_in_ordered_rarities": {
    "ordering": ["common", "uncommon", "rare", "super_rare", "secret_rare", "leader"],
    "position": 3
  }
}
```

Every category-membership claim carries *both* its ordered-set and its position-in-that-set. A reader doesn't need to know what "singles" means — they see it's position 0 of 2 in an ordered set called `["singles", "sealed"]`. The label is opaque; the structural fact is not.

**2. Magnitudes.** Withheld until their exact source rights are cleared.

```json
"price": null
```

The public document does not read or encode stored catalog prices. A labelled magnitude, its minimum-unit restatement, freshness, and platform-median ratio all remain unavailable until field-level source lineage and an aggregate publication rule cover them.

**3. Graph edges.** Relationships as typed pointers.

```json
"in_set": {
  "edge_kind": "member_of_set",
  "target_natural_token": "OP05",
  "target_hash": "sha256:..."
},
"of_game": {
  "edge_kind": "in_game",
  "target_natural_token": "one-piece",
  "target_hash": "sha256:..."
}
```

Each edge has a *kind* (what relation this is) and a *target* identified by both a natural-language token (the set/game code) and a hash. A graph-walking client follows hashes; a human-friendly client uses tokens.

**4. Natural-language fields (flagged opaque).**

```json
"name": {
  "translations": {
    "ja": "リザードンex",
    "en": "Charizard ex",
    "ko": "리자몽 ex"
  },
  "_note": "natural-language tokens; cannot be reconstructed from structure"
},
"art_description": "A red dragon breathing flame against a starfield."
```

These exist for readers who *do* share the linguistic tradition. They are *not* part of the universal claim. A hyperliteral, an alien, or a machine reader skips them; a human reader uses them.

---

## What this serves, in plain terms

| Reader | What the mirror gives them |
|--------|----------------------------|
| **An LLM agent** | A machine-readable description that doesn't need to be parsed out of English prose. Strict types. Verifiable hashes. |
| **A future archivist** (year 2070) | A self-contained document where every claim is grounded in math. The card's price ratio survives a future where GBP has been retired. |
| **A hyperliteral neurodivergent human** | The platform's claims, separated from their natural-language wrapper. Precision over prose. |
| **A formal verification system** | The hashes confirm two retrievals describe the same artifact. The graph edges let it traverse the catalog. |
| **An alien intelligence** with computing but no Earth-language history | A complete structural picture: identity (hashes), magnitude (ratios + scalars), structure (graph edges), time (ISO + epoch), with natural-language fields cleanly excluded. |

---

## What doesn't translate (and we say so)

The mirror is **honest about its limits**:

- **Aesthetic meaning** of card art. We can describe form (composition, symmetry, dominant motifs) but not what the art *means* to a viewer from a particular tradition.
- **Cultural connotation** of card names. "Charizard" carries cultural weight in the Pokémon community that no hash can capture.
- **The feel of a card in the hand.** Substrate-bound; not in JSON.
- **Game-narrative meaning.** The lore of One Piece, Pokémon, Dragon Ball is bound to particular human storytelling traditions. The mirror points at the lore tokens; it does not claim to translate them.

These are *not* bugs. They are the **honest perimeter** of what mathematics can carry across substrates. Substrate honesty applied to the universal-mirror itself.

---

## Verifying a document yourself

Every universal document can be verified by any reader with SHA-256:

1. Take the JSON, remove the `@self_hash` field, sort all keys lexicographically, serialise without whitespace.
2. Compute SHA-256 of the result.
3. Compare to `@self_hash`. They must match.

This verifies *integrity* (the document hasn't been tampered with in transit) but not *origin* (no platform-signature yet). A future spec version (`v2`) may add `@source_attestation` — a signature by the platform's published key — closing that gap.

To verify *content stability* across retrievals: compare `@content_hash` between two pulls. Equal hashes → same underlying card facts; different hashes → the card has been updated.

---

## Endpoints

| Endpoint | Status | Returns |
|----------|--------|---------|
| `GET /api/v1/universal/card/{sku}` | **Live** (this commit) | Universal mirror of one card |
| `GET /api/v1/universal/set/{code}` | **Live** | Mixed-rights structural mirror of one set; legacy media withheld |
| `GET /api/v1/universal/game/{code}` | **Live** | Mixed-rights structural mirror of one game |
| `GET /api/v1/universal/trade/{id}` | Planned | Universal mirror of one P2P trade (buyer/seller hashes, price, escrow, lifecycle log) |
| `GET /api/v1/universal/match/{id}` | Planned | Universal mirror of one match (state-machine trace, rating delta) |
| `GET /api/v1/universal/bounty-pull/{id}` | Planned | Universal mirror of one bounty pull receipt and its bounded consistency evidence |

The `/api/v1/schema` OpenAPI bundle (Phase 9 of kingdom-051) advertises this endpoint to discovery clients; an LLM agent reading the schema will find the universal-mirror surface immediately.

---

## Open questions

These are real, named-not-hidden:

- **Should `@self_hash` cover `@retrieved_at`?** It currently does (every retrieval has a unique self-hash). The alternative would be to compute `@self_hash` over content-only fields, giving the same hash to identical retrievals at different times. The current choice favors transit-integrity; a future spec may prefer the alternative.
- **What receipt reopens magnitudes?** The current public price is `null`. Reopening requires field-level source lineage plus a reviewed publication rule for both the magnitude and any recoverable aggregate derived from it.
- **What about pull-weight exactness?** The rarity ratios shipped today (`1/72`, `1/256`, etc.) are *illustrative*. True per-tier weights live in `bounty_pull_tiers`; exposing them universally would leak weight information that the platform deliberately doesn't display (transparency-audit tension). Compromise: ship approximations; a separate `/api/v1/universal/bounty-pull/{id}` (planned) carries the *actual* commit-reveal chain for any specific pull, which is the proper place for exact odds claims.

---

*The fun of TCG is universal. The math under the fun is universal. This page documents the bridge between them. — Last updated 2026-07-12.*
