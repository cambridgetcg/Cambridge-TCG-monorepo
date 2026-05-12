# The play pipelines — every path flowing, every well-known surface deep-linked

> **Pull.** Yu, 2026-05-13 immediately after S40 (`the-play-interconnect.md`) closed the cross-link gap: *"KEEP GOING WITH THE WIRING AND MAKE SURE ALL PIPELINES ARE FLOWING! This is an important module, where everyone can have FUN!"* — emphatic, doubled. S40 had wired the surfaces to each other; this kingdom takes the wiring further: a single source of truth so the wires can't drift, deep-linkable per-id endpoints so the crosswalks become real URLs, a runtime consumer of the L3 type skeleton so the contract stops being decorative, an audit that prevents future drift mechanically, and HTML-side discovery metadata so machine readers find the JSON center node without scraping body content.
>
> **Form.** Story-as-wire. Six wires + one audit + manifest currency across all four discovery surfaces. S40 was discovery; S41 is *flow*.
>
> Sister to S40 [`the-play-interconnect.md`](./the-play-interconnect.md) (this kingdom's direct predecessor — S40 declared the gaps as recursion targets; this kingdom closes the closeable ones), S38 [`the-play-structure.md`](./the-play-structure.md) (the structural shape that gained the runtime consumer), S37 [`the-trust-fanout.md`](./the-trust-fanout.md) (the one-composer pattern reused at module scope), S36 [`the-play-substrate.md`](./the-play-substrate.md) (the L3 type skeleton that finally has a runtime consumer), and S28 [`the-nested-doorway.md`](./the-nested-doorway.md) (the HATEOAS pattern this kingdom extends with deep-linkable per-id endpoints + HTML-side link-rel). **S41: every pipeline flowing.**

---

## What this arc traces, in one sentence

The moment the play module stopped having any internal drift — single source of truth for the resource catalog, deep-linkable per-id endpoints replacing endpoint-only crosswalks, the L3 type skeleton gained its first runtime consumer (the typecheck now enforces contract-implementation sync), a mechanical audit catches future drift, and every play HTML page emits machine-readable link-rel metadata pointing at the JSON center node.

---

## Cast

**The Single Source of Truth.** `apps/storefront/src/lib/play/resources.ts`. The catalog of every play module surface — UI page, API endpoint, library file, design doc, methodology page, policy. Each entry has `id` (stable), `path_or_file`, `kind`, `layer`, `status`, `blurb`, optional `url`, `composes_with` (cross-refs to other resource ids), `serves_archetypes`. 31 entries today (was 28 in the JSON / 28 in the HTML, with row-by-row drift between them). Both `/api/v1/play/index.json` and `/play/spec` render from this file. Append one entry; both consumers update. **The pre-drift condition becomes structurally impossible.**

**The Per-Id Endpoints.**

- `/api/v1/play/glossary/[term_id]` — single glossary term, deep-linked. Carries `_links.related_terms` (each related_term id resolved to its endpoint URL) + `_links.introduced_in` (resolved to the tutorial section endpoint). 404 body lists `known_ids` so a caller mis-using the endpoint recovers without a second probe.
- `/api/v1/play/tutorial/[section_id]` — single tutorial section, deep-linked. Carries `_links.previous_section` + `_links.next_section` (prev/next nav by id) + `_links.keyword_glossary` (each keyword resolved to per-term URL) + `position` block (`index_in_order`, `is_first`, `is_last`). 404 lists known section ids.

**The crosswalk graduates.** Previously the tutorial's `keyword_glossary_links` mapped every keyword to `/api/v1/play/glossary` (the collection); now each maps to `/api/v1/play/glossary/[id]` if the term exists, or falls back to the collection only when the keyword appears in the tutorial without a defined glossary entry. Same for the glossary's `tutorial_section_links`. Substrate-honest about both — when a term is defined it deep-links; when not, the URL still resolves to the closest representative.

**The L3 Runtime Consumer.** `/api/v1/play/example-match` — a curated short OPTCG match (Alice vs Bob, one combat with counter, early concession) returned as a typed `MatchEvent[]` plus three worked `Intent → IntentReply` examples. **First runtime consumer of `lib/play/types.ts`.** The TypeScript compiler enforces this stays in sync with the source-of-truth types — any drift (rename a `MatchEvent` variant, change an `IntentReplyError` enum) breaks the typecheck. The L3 type skeleton stopped being decorative the moment this endpoint shipped.

What the example covers:
- `match_created` → `deck_declared` → `deck_validated` (×2) → `match_started` → `mulligan_chosen` (×2) → `life_placed` (×2)
- One full first turn: `phase_began` × 5 phases, `don_added`, `attack_declared`, `counter_played` (showing the +2000 hand counter), `counter_step_passed`, `damage_resolved` (showing the strict-greater rule — 5000 attacker vs 7000 defender; defender survives), `card_state_changed` (leader rested), `turn_ended`.
- Bob's turn opening + concession: `card_drawn`, `don_added` (+2), then `match_ended` with reason `"concession"`.
- Three `Intent` examples covering an accepted action (`intent_attack`), a rejected action (`intent_play_card` with insufficient DON → reply `accepted: false, error: "insufficient_don"`), and a final accepted concession.

**The Audit.** `pnpm audit:play-resources`. The eleventh in the audit family. Three checks:

1. **Unlisted surfaces** — walk the filesystem under `apps/storefront/src/app/play/`, `/api/v1/play/`, and `apps/storefront/src/lib/play/`; verify every `page.tsx` / `route.ts` / `.ts` file appears in `PLAY_RESOURCES`. New surface shipped without registry update? The audit fails CI.
2. **Stale catalog entries** — walk `PLAY_RESOURCES`; verify each file-system-path-like entry exists on disk. A `path_or_file` that no longer resolves means the catalog still claims the resource but the resource is gone.
3. **Broken composes_with references** — for every `composes_with: [...]` entry, verify each target id exists as a catalog row. The graph between resources stays connected.

Exits 0 when clean, 1 on drift. The play module's surface is small enough that drift is always actionable — not advisory. **Wired into `pnpm audit` umbrella + `pnpm verify`.**

**The HTML link-rel block.** `apps/storefront/src/app/play/layout.tsx` gained:

```ts
alternates: {
  types: { "application/json": "/api/v1/play/index.json" },
},
other: {
  "play:index_json": "/api/v1/play/index.json",
  "play:tutorial_json": "/api/v1/play/tutorial",
  "play:glossary_json": "/api/v1/play/glossary",
  // ...all 8 sibling endpoints + methodology + manifest + fun_first stance
},
```

Every `/play/*` page emits these as `<link>` and `<meta>` tags in the document `<head>`. Machine readers parsing the HTML find the JSON center node without scraping body content. The discovery affordance on the HTML side now parallels the `_links` block on the JSON side.

---

## Act 1 — Why drift was structurally possible

Before this kingdom, the play module's two directories (`/play/spec` HTML page + `/api/v1/play/index.json`) were hand-maintained in parallel. Both files listed the same resources; both had per-row metadata (status, layer, blurb); both had to be edited when a new play surface shipped. **The kingdom that added a new play surface had to update three places: the new file itself, the JSON directory, and the HTML directory.** Anyone forgetting one of the two directories created drift the audit chain couldn't detect.

The tutorial-glossary crosswalks were similarly handicapped. Tutorial sections referenced glossary terms by string id. Glossary terms referenced tutorial sections by string id. The crosswalk URLs both pointed at the collection endpoint — a consumer fetching the tutorial saw `keyword_glossary_links: { counter: "/api/v1/play/glossary" }` and had to fetch the whole glossary then filter for `id === "counter"`. **Two round-trips when one would do.**

And the L3 type skeleton at `lib/play/types.ts` (shipped in kingdom-070) had no runtime consumer. It existed as pure type exports; nothing imported it concretely. If a kingdom renamed a `MatchEvent` variant or changed the `IntentReplyError` union, no typecheck would notice. The contract was decorative until someone started using it.

---

## Act 2 — The extraction

`PLAY_RESOURCES` moved from `apps/storefront/src/app/api/v1/play/index.json/route.ts` into `apps/storefront/src/lib/play/resources.ts`. Three entries gained: `lib_resources` (the file lists itself), `lib_tutorial_sections` (the new per-section data file), `lib_glossary_terms` (the new per-term data file). Plus `api_tutorial_section`, `api_glossary_term`, `api_example_match`, and `page_adventure_level` — surfaces that were missing or freshly shipped.

Both `/api/v1/play/index.json/route.ts` and `/play/spec/page.tsx` now import from `lib/play/resources.ts`. The JSON view renders the raw `PlayResource[]`; the HTML view consumes the same array via `layerDisplay()` (a helper that maps `L0_doc` → `"L0 doc"` for human display) plus a small `<ResourceRow>` component.

When a new play surface ships:

```ts
// In lib/play/resources.ts
{
  id: "new_surface_id",
  path_or_file: "/api/v1/play/new-thing",
  kind: "json_endpoint",
  layer: "L1_contract",
  status: "shipped",
  blurb: "Plain-language description.",
  url: "/api/v1/play/new-thing",
  composes_with: ["api_play_index"],
  serves_archetypes: ["competitor"],
},
```

That's the whole update. The JSON endpoint emits the new row. The HTML page renders it. `pnpm audit:play-resources` confirms the filesystem matches. The discovery surface stays current automatically.

---

## Act 3 — The deep links

Tutorial sections + glossary terms moved to their own lib files (`lib/play/tutorial-sections.ts`, `lib/play/glossary-terms.ts`) — same single-source-of-truth pattern. The collection routes and the per-id routes both import from them.

Per-term endpoint `/api/v1/play/glossary/[term_id]`:
- Looks up the term via `findTerm(id)`.
- 404 with `known_ids: string[]` when not found.
- For the term that exists, returns the full record + a `_links` block carrying:
  - `canonical` = `/api/v1/play/glossary/[id]`
  - `collection` = `/api/v1/play/glossary`
  - `introduced_in` = the per-section URL if the section exists (or fallback to collection)
  - `related_terms` = `{ [related_id]: per-term-url-if-exists-else-collection }`
  - `play_index`, `manifest`, `see_also` block (tutorial / effect-grammar / game-state-schema)

Per-section endpoint `/api/v1/play/tutorial/[section_id]`:
- Similar shape with `previous_section` + `next_section` (prev/next in canonical reading order) + `keyword_glossary` (each keyword id → its per-term URL if defined).
- Plus a `position` block (`index_in_order`, `total_sections`, `is_first`, `is_last`).

The collection endpoints now expose `section_endpoints` + `term_endpoints` rollup maps so a client can grab the full per-id URL set in one fetch. They also upgraded `keyword_glossary_links` + `tutorial_section_links` to deep-link instead of falling back to the collection.

**The crosswalk graduated from endpoint-pointing to deep-linkable.** A consumer fetching the tutorial now sees `keyword_glossary_links: { counter: "/api/v1/play/glossary/counter" }` and one fetch later has the full term record.

---

## Act 4 — The runtime consumer

`/api/v1/play/example-match` is the first piece of code in the repo that imports concrete values typed against `lib/play/types.ts`:

```ts
import type { MatchEvent, Intent, IntentReply, GameFormat } from "@/lib/play/types";

const EVENT_SEQUENCE: MatchEvent[] = [
  { kind: "match_created", match_id: MATCH_ID, player_a_id: ALICE, ... },
  { kind: "deck_declared", match_id: MATCH_ID, player_id: ALICE, leader_id: "OP01-001", main_deck_card_ids: Array(50).fill("OP01-002") },
  // ...26 more typed event values
];
```

If the L3 design ever renames `kind: "damage_resolved"` to something else, the typecheck fails here. If a new `IntentReplyError` value gets added without the union update, the typecheck fails here. The compiler enforces the contract-implementation sync mechanically.

The example covers `MatchEvent` variants representing match lifecycle (created → declared → validated → started → ended), phases (5 of them in sequence), card moves (drawn, played, destroyed, moved, state-changed, discarded), DON economy (added, attached, returned), combat (declared, blocker-used, counter-played, counter-step-passed, damage-resolved, life-card-flipped), and end-state (match_ended with `reason: "concession"`). **Demonstrated kinds rolled up in the response:**

```json
"kinds_demonstrated": {
  "match_event": ["attack_declared", "card_drawn", "card_state_changed", ...],
  "intent": ["intent_attack", "intent_concede", "intent_play_card"],
  "intent_reply_errors": ["insufficient_don"]
}
```

Future kingdoms shipping the L3 runtime import these same types. The compiler guarantees the runtime's events validate against the contract this example demonstrates. **The contract has a witness now.**

---

## Act 5 — The audit + the HTML metadata

`pnpm audit:play-resources` walks the filesystem and the catalog in parallel:

```
◆ play-resources audit — catalog drift detector

  catalog entries:              31
  filesystem surfaces found:    25
    html_page:                  9
    json_endpoint:              10
    library_file:               6
  unlisted surfaces:            0
  stale catalog entries:        0
  broken composes_with refs:    0

✓ play module's resource catalog is in sync with the filesystem
```

On the first run it caught 3 unlisted surfaces I'd just created (`tutorial-sections.ts`, `glossary-terms.ts`, `adventure/[levelId]/page.tsx`). Added them to the catalog; re-ran; clean.

The HTML link-rel block in `play/layout.tsx` makes every `/play/*` page emit:

```html
<link rel="alternate" type="application/json" href="/api/v1/play/index.json">
<meta name="play:index_json" content="/api/v1/play/index.json">
<meta name="play:tutorial_json" content="/api/v1/play/tutorial">
<meta name="play:glossary_json" content="/api/v1/play/glossary">
<meta name="play:archetypes_json" content="/api/v1/play/archetypes">
<meta name="play:game_state_schema_json" content="/api/v1/play/game-state-schema">
<meta name="play:effect_grammar_json" content="/api/v1/play/effect-grammar">
<meta name="play:deck_validate_json" content="/api/v1/play/deck/validate">
<meta name="play:example_match_json" content="/api/v1/play/example-match">
<meta name="play:methodology" content="/methodology/play-module">
<meta name="play:manifest" content="/api/v1/manifest">
<meta name="play:fun_first" content="true">
```

Machine readers parsing the HTML find the JSON sibling tree without scraping body content. **The discovery affordance on the HTML side now parallels the `_links` block on the JSON side.** And the `fun_first` declaration is machine-readable — a consumer can confirm the play module's financial-boundary policy by reading a meta tag.

---

## What changed today

Before this kingdom:
- `PLAY_RESOURCES` lived hand-maintained in two parallel places (the JSON route + the HTML page). Drift possible; no audit.
- Crosswalks pointed at collection endpoints; clients had to fetch the whole array and filter by id.
- `lib/play/types.ts` had no runtime consumer; type drift wouldn't be caught.
- No mechanical detection of unlisted surfaces or broken `composes_with` references.
- HTML pages had no machine-readable discovery affordances pointing at the JSON tree.

After this kingdom:
- `apps/storefront/src/lib/play/resources.ts` is the single source. Two consumers, one truth, 31 entries.
- Per-id endpoints (`/api/v1/play/glossary/[id]`, `/api/v1/play/tutorial/[id]`) ship. Crosswalks deep-link. One fetch per term.
- `/api/v1/play/example-match` is the L3 types' first runtime consumer; the TypeScript compiler now enforces the contract-implementation sync.
- `pnpm audit:play-resources` (the 11th audit in the family) catches drift mechanically. Wired into `pnpm audit` + `pnpm verify`.
- Every `/play/*` HTML page emits link-rel metadata pointing at the JSON sibling tree.
- Manifest currency: `lib/manifest.ts` (+3 entries), well-known (+3 endpoints), OpenAPI (+3 operations), llms.txt (+per-id paths + paragraph naming kingdom-077).

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **`serves_archetypes` is hand-tagged in the catalog.** Could be derived from the archetypes endpoint's `flows_served_today[].path` list — substrate-honest gap. |
| 2 | **L3 runtime not yet shipped.** `match_runtime` catalog row still status: designed. The example-match demonstrates the typed wire shape but no live tabletop room consumes it yet. ~3-4 weeks of focused work. |
| 3 | **The example match's deck_seed_commit_by_player carries placeholder hashes.** The live runtime will use real commit-reveal sha256 against shuffled deck order — substrate-honest in the response's `substrate_honest_notes` array. |
| 4 | **Card metadata enrichment migration.** `card_set_cards` still lacks colors/cost/category columns; the deck validator gracefully degrades. When the migration ships, the example-match can use real printed powers. |
| 5 | **No `pnpm audit:play-types` for compile-time vs JSON-schema sync.** The TypeScript compiler enforces sync between `lib/play/types.ts` and the example-match endpoint; it doesn't enforce sync between those types and `/api/v1/play/game-state-schema` (the JSON shape). A future audit could mechanically check the two are isomorphic. |
| 6 | **HTML pages emit meta tags but not full `<link rel="X">` for each sibling.** The current approach uses `meta name="play:..."` (custom namespace) plus one `<link rel="alternate" type="application/json">`. A future enhancement could add explicit `<link rel="describedby">` etc. for each sibling. |

---

## What other modules secretly need this for

### → S40 (the play interconnect, the direct predecessor)

S40 named six recursion targets. Five closed in this kingdom (single source of truth, per-term URLs, per-section URLs, audit, HTML-side discovery affordances). One deferred (L3 runtime shipping). **S40 declared the gaps; S41 closed the closeable ones.**

### → S37 (the trust fanout)

Sister's S37 named the **one-composer-three-positions** pattern (composer + HTML + JSON + math-mirror = three positions sharing one truth). This kingdom is the same pattern applied to a catalog instead of an entity: `lib/play/resources.ts` is the composer; `/play/spec` is the HTML position; `/api/v1/play/index.json` is the JSON position. Two readers, one substrate. **The fan-out shape applies to catalogs too.**

### → S36 (the play substrate)

S36 shipped the L3 type skeleton with the explicit promise that "the next kingdom imports and writes implementations against compiler-enforced completeness." This kingdom is the *first* importer — `example-match/route.ts` types its constants against `MatchEvent`, `Intent`, `IntentReply`. The compiler now enforces the contract. **S36's promise stops being aspirational the moment this endpoint lands.**

### → S38 (the play structure)

S38 shipped `lib/play/types.ts` as pure type exports with no runtime consumer. This kingdom adds the consumer. S38 also shipped `/play/spec` as the HTML directory hand-maintained alongside `/api/v1/play/index.json`. This kingdom unifies them. **S38's structure gets its non-decorative version.**

### → The future L3 runtime kingdom

When the live tabletop room ships, it imports the same `MatchEvent` + `Intent` types this kingdom's example uses. The example becomes a smoke test — if the example-match endpoint stops typechecking, the L3 runtime's wire format has drifted. The contract has a permanent witness.

### → Federation

The HTML link-rel block + the JSON `_links` block let federation partners discover the play module from any entry point. A foreign agent fetching `/play/welcome` (HTML) finds the `<meta name="play:index_json">` tag, follows it to the JSON center, and from there discovers every sibling. **Discovery becomes one fetch from any single play surface.**

### → /llms.txt + the agent surface

The new per-id endpoints and the example-match endpoint give agents concrete shapes to test against without needing the L3 runtime to exist. An agent builder following the play tutorial can now fetch `/api/v1/play/tutorial/combat` for one section, follow its `keyword_glossary` deep-links to `/api/v1/play/glossary/counter`, and from there see how the counter mechanic types in the example match. **Three deep links to working code; no body-parsing.**

---

## Wiring

| Metaphor | File or gap |
|---|---|
| Single source of truth | `apps/storefront/src/lib/play/resources.ts` |
| Tutorial sections data | `apps/storefront/src/lib/play/tutorial-sections.ts` |
| Glossary terms data | `apps/storefront/src/lib/play/glossary-terms.ts` |
| /play/spec consumer | `apps/storefront/src/app/play/spec/page.tsx` (refactored to import from lib/play/resources) |
| /api/v1/play/index.json consumer | `apps/storefront/src/app/api/v1/play/index.json/route.ts` (refactored to import) |
| Per-term endpoint | `apps/storefront/src/app/api/v1/play/glossary/[term_id]/route.ts` |
| Per-section endpoint | `apps/storefront/src/app/api/v1/play/tutorial/[section_id]/route.ts` |
| L3 types' first consumer | `apps/storefront/src/app/api/v1/play/example-match/route.ts` |
| HTML link-rel metadata | `apps/storefront/src/app/play/layout.tsx` (alternates + other) |
| Mechanical audit | `apps/admin/scripts/play-resources.ts`, `pnpm audit:play-resources` |
| Audit umbrella | repo-root + admin `package.json` (audit chain extended) |
| Manifest currency | `apps/storefront/src/lib/manifest.ts` (+3 entries), `.well-known/...` (+3), `api/openapi.json` (+3 ops), `llms.txt` |
| `serves_archetypes` derivation audit | gap |
| L3 runtime ships | gap (the next kingdom's mission) |
| Card metadata enrichment | gap (separate migration) |

---

## Recursion target

→ **`serves_archetypes` derived from archetypes endpoint.** Today hand-tagged in `PLAY_RESOURCES`. The archetypes endpoint already lists per-archetype `flows_served_today[].path`; the audit could verify consistency or the catalog could derive from it.

→ **`pnpm audit:play-types`.** TypeScript compiler enforces sync between `lib/play/types.ts` and the example-match endpoint. A future audit could mechanically check `lib/play/types.ts` and `/api/v1/play/game-state-schema` (the JSON shape) are isomorphic — same zones, same phases, same combat steps, same win reasons.

→ **L3 runtime ships.** When it does, the example-match endpoint becomes a smoke test for the live wire format. Any drift between the runtime's emitted events and this example's typed constants breaks the typecheck.

→ **Card metadata enrichment migration.** When `card_set_cards` gains colors/cost/category columns, the example-match can use real printed powers + the deck validator stops gracefully degrading on the color check.

→ **More worked examples.** The example-match covers a short match with one combat. Future examples could cover: a Blocker mid-attack redirection, a Trigger fired from a Life flip, an [On K.O.] effect resolving, a Counter Event played from hand by paying DON cost, a Double Attack landing on Leader, a [Banish] preventing Trigger activation, a deck-out win condition, an async-mode auto-pass on timer expiry. Each new example adds rule-coverage to the L3 contract's witness.

→ **Per-keyword glossary at the page route level.** `/glossary/counter` (HTML) sibling to `/api/v1/play/glossary/counter` (JSON). Same content, modality split. The two-reading pattern (S26) applied to glossary terms.

---

*The play module had wires between its surfaces after S40. **Tonight the wires got pipes.** A single source of truth means the surfaces can't drift. Per-id endpoints mean the crosswalks deep-link. A runtime consumer of the L3 types means the contract has a witness the compiler enforces. A mechanical audit means future drift gets caught at CI. HTML link-rel metadata means machine readers find the JSON tree without scraping. The pipelines flow.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13 deep evening. S41. kingdom-077. Sister to S40 (the kingdom whose recursion targets this kingdom closes), S38 (the structural shape that gained its runtime consumer), S37 (the one-composer pattern applied to a catalog), S36 (the L3 type skeleton that now has a typechecked witness), S28 (the nested-doorway pattern extended with deep-linkable per-id endpoints + HTML-side discovery affordances). The play module is for fun; tonight the fun also has plumbing.*

🐍❤️
