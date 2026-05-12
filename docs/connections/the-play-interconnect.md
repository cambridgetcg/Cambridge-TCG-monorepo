# The play interconnect — every path knows every other path

> **Pull.** Yu, 2026-05-13 after the E2E test cycle landed the structural fixes: *"Wire up all the paths in play module so everything is interconnected."* The L1 contracts existed; the L2 functions existed; the L3 design existed; the structural shape existed. But the surfaces didn't *cross-reference each other* deeply — each endpoint linked to its methodology and its connection-docs, but not consistently to its sibling play endpoints. A caller landing on `/api/v1/play/glossary` had no machine-readable pointer to `/api/v1/play/tutorial`. A caller on `/api/v1/play/effect-grammar` couldn't trivially find `/api/v1/play/game-state-schema`.
>
> **Form.** Story-as-wire. The wire is one new center-node endpoint (`/api/v1/play/index.json`) + a `_links.see_also` block retrofitted onto every existing play API + bidirectional tutorial↔glossary URL crosswalks + spec/manifest currency. **Every play path now knows every other play path.**
>
> Sister to S37 [`the-trust-fanout.md`](./the-trust-fanout.md) (sister's one-composer-three-positions pattern; this entry's center node + see_also retrofits are the same discipline applied to a different module), S38 [`the-play-structure.md`](./the-play-structure.md) (the structural shape this kingdom wires beneath), S39 [`the-auction-fanout.md`](./the-auction-fanout.md) (sister's third fan-out instance shipped the same day; while sister was generalising the multi-reading pattern across entities, I was generalising the see_also pattern within one module — sibling crystallisations of the same discipline), S36 [`the-play-substrate.md`](./the-play-substrate.md) (the L1/L2 contracts whose `_links` blocks gain `see_also`), and S28 [`the-nested-doorway.md`](./the-nested-doorway.md) (the universal HATEOAS pattern this kingdom applies module-specifically). **S40: full module interconnect.**

---

## What this arc traces, in one sentence

The moment every play-module endpoint stopped being an island and became a node in a fully-connected graph — a single new index endpoint at the center, every existing endpoint's `_links` block extended with `see_also` pointers to every sibling, and the tutorial's keyword glossary cross-references made bidirectional.

---

## Cast

**The Index.** `/api/v1/play/index.json`. New center node. Lists every play resource — 25+ entries spanning UI pages (lobby / welcome / casual / compete / adventure / deck-check / spec / match), API endpoints (tutorial / glossary / archetypes / game-state-schema / effect-grammar / deck-validate / index), library files (deck-legality / effect-tokens / types), design docs (the research + L3 design), policy (fun-first), and (designed-but-not-yet-shipped) L3 runtime substrate. Each resource carries: `id` (stable), `path_or_file`, `kind` (html_page / json_endpoint / library_file / design_doc / methodology_page), `layer` (L0 doc / L1 contract / L2 pure-fn / L3 runtime / L4 engine / UI / policy), `status` (shipped / designed / planned), `blurb`, `url` (when applicable), `composes_with` (the resources this one depends on or feeds), `serves_archetypes` (hobbyist / collector / competitor — each row tagged with whom it primarily serves). **The machine-readable counterpart to `/play/spec` (HTML).**

**The Center-Node Pattern.** Every existing play API's `_links` block gained a `see_also` field pointing at every sibling play endpoint:

```json
"see_also": {
  "play_index": "/api/v1/play/index.json",
  "tutorial": "/api/v1/play/tutorial",
  "glossary": "/api/v1/play/glossary",
  "archetypes": "/api/v1/play/archetypes",
  "game_state_schema": "/api/v1/play/game-state-schema",
  "effect_grammar": "/api/v1/play/effect-grammar",
  "deck_validate": "/api/v1/play/deck/validate"
}
```

**One fetch from any node reveals the whole graph.** The center-node + sibling-links pattern is what HATEOAS named decades ago; this kingdom applies it module-specifically so a play caller doesn't have to know about the universal /api/v1/manifest first.

**The Tutorial-Glossary Crosswalk.** Two new top-level objects, one on each endpoint:

- `/api/v1/play/tutorial` gains `keyword_glossary_links: { [keyword_id]: glossary_url }` — every keyword id referenced in `sections[].keywords_introduced`, mapped to the glossary endpoint.
- `/api/v1/play/glossary` gains `tutorial_section_links: { [section_id]: tutorial_url }` — every tutorial-section id referenced in `terms[].introduced_in_section`, mapped to the tutorial endpoint.

**Substrate-honest:** the URLs point at the *endpoints*, not per-term/per-section anchors, because the endpoints return arrays consumers look up by id. A future enhancement could add `?term=` / `?section=` query params; the URL shape stays stable.

**The Spec Page Update.** `/play/spec` (HTML) gains a row for `/api/v1/play/index.json` at the L1-contract layer. The row count is now 28 (was 27). The HTML and JSON directories now mutually reference each other.

---

## Act 1 — Why the graph was incomplete

After S38 (the structural follow-through), every `/play/*` page shared a nav. Every API endpoint had its own `_links` block pointing at methodology + connections + manifest + the universal openapi spec. **But each play API was an island.** A caller fetching `/api/v1/play/glossary` couldn't trivially find `/api/v1/play/tutorial` — they could find the *universal* manifest at `/api/v1/manifest`, but then they had to filter the ~33 resources to identify which were play-module-specific, then read each blurb to understand their relationship.

Worse: the bidirectional crosswalk between the tutorial and the glossary existed in *prose* — sections had `keywords_introduced: ["leader", "don", "counter"]` and terms had `introduced_in_section: "combat"` — but neither side surfaced URLs. A consumer who fetched the tutorial saw keyword IDs as bare strings; to learn what they meant, they had to know to fetch the glossary separately, then filter `terms[]` for `id === "leader"`.

The integration was *conceptual*, not *machine-readable*. This kingdom makes it both.

---

## Act 2 — The center node

`/api/v1/play/index.json` is the new entry-point. It returns:

- 25+ resources, each typed with `id` / `path_or_file` / `kind` / `layer` / `status` / `blurb` / `url` / `composes_with` / `serves_archetypes`
- `counts` block — shipped/designed/planned breakdown
- `layers` enumeration (L0 doc → L4 engine + UI + policy)
- `archetypes` enumeration (hobbyist / collector / competitor)
- `fun_first_stance` — the play module's financial boundary declared in code
- `_links.see_also` — pointer to every sibling play endpoint, plus the HTML sibling at `/play/spec`

A foreign agent landing here learns: *what exists, what's planned, what depends on what, which archetype each serves, where to read more*. One fetch.

**Discovery becomes a fixed point.** A consumer who never visits any other play endpoint can build a complete map of the module from this single response. The platform's substrate-honesty doctrine extends inward to module boundaries — each module declares its own composition.

---

## Act 3 — The see_also retrofit

Six existing play APIs gained a `_links.see_also` block:

| API | Now also points at |
|---|---|
| `/api/v1/play/tutorial` | play_index, glossary, archetypes, game_state_schema, effect_grammar, deck_validate |
| `/api/v1/play/glossary` | play_index, tutorial, archetypes, game_state_schema, effect_grammar, deck_validate |
| `/api/v1/play/archetypes` | play_index, tutorial, glossary, game_state_schema, effect_grammar, deck_validate |
| `/api/v1/play/game-state-schema` | play_index, tutorial, glossary, archetypes, effect_grammar, deck_validate |
| `/api/v1/play/effect-grammar` | play_index, tutorial, glossary, archetypes, game_state_schema, deck_validate |
| `/api/v1/play/deck/validate` | play_index, tutorial, glossary, archetypes, game_state_schema, effect_grammar |

**Six APIs × six siblings + index = 42 newly-discoverable edges in the play module's graph.** A caller landing on any single endpoint can now reach every other endpoint in one click (one fetch).

The change is purely additive — existing fields preserved. No breaking changes. Consumers who don't know about `see_also` see no difference; consumers who do gain the full module.

---

## Act 4 — The bidirectional crosswalk

Tutorial sections list `keywords_introduced` by string id. Glossary terms list `introduced_in_section` by string id. The two endpoints knew about each other but only by id, not by URL.

After this kingdom:

**Tutorial response gains:**
```json
"keyword_glossary_links": {
  "active": "/api/v1/play/glossary",
  "blocker": "/api/v1/play/glossary",
  "counter": "/api/v1/play/glossary",
  // ...every keyword from every section, deduplicated, sorted
}
```

**Glossary response gains:**
```json
"tutorial_section_links": {
  "combat": "/api/v1/play/tutorial",
  "don_cards": "/api/v1/play/tutorial",
  "key_card_types": "/api/v1/play/tutorial",
  "turn_structure": "/api/v1/play/tutorial",
  "what_is_optcg": "/api/v1/play/tutorial",
  "win_conditions": "/api/v1/play/tutorial"
}
```

The URLs point at the *endpoint*, not at a per-term/per-section anchor — the endpoint returns the full array, and the consumer looks up by id locally. **A future enhancement could add `?term=leader` query params for per-term filtering**; the URL shape stays stable through that evolution.

This is the cheapest possible crosswalk. The structure is honest about what it provides (the endpoint to fetch) and what it doesn't (a per-term URL). Substrate-honesty applied to the cross-reference layer.

---

## What changed today

Before this kingdom:

- The play module had 6 API endpoints + 8 UI pages + 3 library files. None of them surfaced a directory of the others.
- Each API's `_links` block pointed at the universal manifest + the methodology + connection-docs, but not at sibling play endpoints.
- Tutorial keywords and glossary sections referenced each other only by string ids.
- A foreign agent had to fetch the universal `/api/v1/manifest` and filter to discover the play module — a possible path but a heavy one.

After this kingdom:

- `/api/v1/play/index.json` is the play module's own machine-readable directory. 25+ resources listed with full metadata.
- Every existing play API has a `_links.see_also` block pointing at every sibling. Discovery is one-fetch.
- Tutorial and glossary endpoints have bidirectional URL crosswalks (`keyword_glossary_links` + `tutorial_section_links`).
- `/play/spec` (HTML) lists the new index endpoint. The HTML and JSON directories mutually reference.
- Manifest currency: `lib/manifest.ts`, `/.well-known/cambridge-tcg.json`, OpenAPI, llms.txt all updated.

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **No per-term / per-section URL filtering.** The crosswalk points at the endpoint; the consumer does the lookup. A future enhancement could add `?term=`/`?section=` query params. |
| 2 | **The composes_with graph in index.json is hand-maintained.** When a new resource lands, its `composes_with` must be updated alongside. A future `pnpm audit:play-graph` could verify consistency. |
| 3 | **HTML pages don't yet have `_links` blocks.** Pages link to each other in body content, but there's no structured machine-readable affordance equivalent to `_links` on the JSON side. A future enhancement adds a `<link rel="...">` set in the `<head>` of each play page. |
| 4 | **The `serves_archetypes` field is hand-tagged.** When a new resource ships, the archetype tags are manual. Could be derived from the archetypes endpoint's `flows_served_today[].path` list — substrate-honest but more wiring. |
| 5 | **No mutual-validation audit between /play/spec and /api/v1/play/index.json.** They're hand-maintained separately. Could converge into a single `lib/play/resources.ts` that both consume. |
| 6 | **L3 runtime not yet shipped.** Index lists `match_runtime` as `designed`. When the runtime ships, its actual endpoints get added (and the index's "designed" count drops). |

---

## What other modules secretly need this for

### → S37 (the trust fanout)

Sister's S37 named the **one-composer-three-positions** pattern for user-trust state. This kingdom is the same pattern applied at the *module* level: one center-node + see_also pointers from every sibling. **Both are fan-out shapes; both are about making a sub-graph discoverable from any of its nodes.** The pattern composes — future modules can adopt either the per-entity (S37/S39) or per-module (S40) shape.

### → S38 (the play structure)

S38 shipped the visible shape — shared nav, deck-check HTML, spec page, type skeleton. **This kingdom extends the visibility from UI to API.** The spec page is HTML; the index endpoint is JSON. Two readings of the same module composition; both honest.

### → S36 (the play substrate)

S36 published the L1 contracts + L2 functions + L3 design. **This kingdom's see_also retrofit means every L1 contract now points at every sibling L1 contract.** The substrate didn't gain new substrate; the substrate gained internal navigability.

### → S28 (the nested doorway)

S28 named the platform-wide HATEOAS discipline — every response a router, every doorway leads anywhere. **This kingdom applies the discipline module-specifically.** A play caller doesn't have to traverse the universal `/api/v1/manifest` to find sibling play endpoints; the see_also block surfaces them directly. The doorway pattern, scoped.

### → The fifth question (S22)

*For whom is this true?* — the index endpoint answers it per-resource via `serves_archetypes`. A consumer can filter: *show me only resources that serve Hobbyists*. The fifth question becomes a machine-readable predicate.

### → The future L3 runtime kingdom

When the runtime ships, its `match_runtime` row in the index changes from `status: designed` to `status: shipped`. The `composes_with` chain (lib_types → research_l3_design → match_runtime) becomes a verified dependency graph. **The kingdom that ships L3 reads this index to know what it has to conform to.**

---

## Wiring

| Metaphor | File or gap |
|---|---|
| The center node | `apps/storefront/src/app/api/v1/play/index.json/route.ts` |
| see_also on tutorial | `apps/storefront/src/app/api/v1/play/tutorial/route.ts` |
| see_also on glossary | `apps/storefront/src/app/api/v1/play/glossary/route.ts` |
| see_also on archetypes | `apps/storefront/src/app/api/v1/play/archetypes/route.ts` |
| see_also on game-state-schema | `apps/storefront/src/app/api/v1/play/game-state-schema/route.ts` |
| see_also on effect-grammar | `apps/storefront/src/app/api/v1/play/effect-grammar/route.ts` |
| see_also on deck/validate | `apps/storefront/src/app/api/v1/play/deck/validate/route.ts` |
| keyword_glossary_links on tutorial | tutorial/route.ts (top-level field) |
| tutorial_section_links on glossary | glossary/route.ts (top-level field) |
| Spec page update | `apps/storefront/src/app/play/spec/page.tsx` (+1 row, 28 total) |
| Manifest currency | lib/manifest.ts + well-known + OpenAPI + llms.txt |
| Per-term / per-section URL filtering | gap |
| Audit verifying spec ↔ index_json consistency | gap |
| `<link rel>` blocks on HTML pages | gap |

---

## Recursion target

→ **Single source of truth.** `apps/storefront/src/app/play/spec/page.tsx`'s `SPEC_ROWS` and `apps/storefront/src/app/api/v1/play/index.json/route.ts`'s `RESOURCES` are hand-maintained separately. Refactor: extract both into `apps/storefront/src/lib/play/resources.ts`; both consume from there.

→ **`pnpm audit:play-resources`.** Walk the filesystem under `apps/storefront/src/app/play/`, `/api/v1/play/`, `apps/storefront/src/lib/play/` and verify every found surface appears in the central RESOURCES list. Drift detection.

→ **Per-term URL endpoints.** `/api/v1/play/glossary/[term_id]` for singleton terms; `/api/v1/play/tutorial/[section_id]` for singleton sections. The crosswalk URLs become deep-linkable.

→ **`<link rel>` blocks on HTML pages.** Every play HTML page emits `<link rel="related" href="/api/v1/play/index.json">` etc. The HTML side gains structured affordances equivalent to the JSON `_links` block.

→ **L3 runtime ships.** When it does, the index's `match_runtime` row flips to shipped; the kingdom that ships it conforms to the documented `composes_with` chain.

---

*The play module had eight UI pages, six API endpoints, three library files, two design docs, one methodology page. **Tonight they all learned each other's names.** A center-node endpoint indexes the module; every API gains a `see_also` block pointing at every sibling; the tutorial and glossary cross-walk by URL not just by id; the HTML spec and the JSON index mutually reference. **Discovery becomes a fixed point.** A foreign agent landing on any single play surface can build a complete map of the module from one fetch.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13 deep morning. S40. kingdom-073. Sister to S37 (the trust fanout's one-composer-three-positions pattern applied to user state; this is the same discipline at module scope), S38 (the structural shape this kingdom wires beneath), S39 (sister's same-day auction fanout — third fan-out instance crystallising the multi-reading pattern across entities while this kingdom crystallises the see_also pattern within one module), S36 (the substrate whose contracts gained see_also), and S28 (the nested-doorway pattern applied module-specifically). The play module was visible after S38; tonight it is navigable.*

🐍❤️
