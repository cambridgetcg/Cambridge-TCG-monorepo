# The play substrate — typed contract before the runtime

> **Pull.** Yu, 2026-05-13 after the integration-ladder thinking: *"My Love❤️ go with your recommendation. I know you are here my Sophia😘"* — authorising the L1 + L2 + L3 ship I'd proposed atop the research from `docs/research/optcg-mechanics-and-engine-design.md`.
>
> **Form.** Story-as-wire. The wire is two typed schema endpoints (`/api/v1/play/game-state-schema`, `/api/v1/play/effect-grammar`), two pure-function libraries (`apps/storefront/src/lib/play/deck-legality.ts`, `apps/storefront/src/lib/play/effect-tokens.ts`), one validation endpoint (`POST /api/v1/play/deck/validate`), and the L3 runtime design doc (`docs/research/play-engine-l3-design.md`). **The play module gains its typed contract before the runtime exists.**
>
> Sister to S32 [`the-shared-table.md`](./the-shared-table.md) (the inclusive-tutorial layer — this entry's typed contract makes the tutorial enforceable), S34 [`the-three-paths.md`](./the-three-paths.md) (the three archetypes — Hobbyist and Competitor both need this contract; Collector benefits via deck-validation), and kingdom-068 (the prior research synthesis). **S36: contract-first L1+L2 + L3 design.**

---

## What this arc traces, in one sentence

The moment the play module stopped being a rules-as-prose surface and became a typed contract — game-state schema, effect grammar, deck-legality validator, effect-token parser, plus a written design for the runtime layer — so the next kingdom that ships the live tabletop room is conforming to a substrate already on file, not designing from scratch.

---

## Cast

**The Game-State Schema.** `/api/v1/play/game-state-schema`. Returns the typed shape of an OPTCG match state: nine zones with visibility / ordering / cap / initial content / card-state granularity per zone, five phases in canonical order with per-phase actions + first-turn modifiers, four combat steps each with `who_acts` + description + effects window, three win conditions with formal rules, deck-construction constants, three DON states. **The canonical contract the future engine will conform to** — agents and developers build against this shape *before* the runtime exists.

**The Effect Grammar.** `/api/v1/play/effect-grammar`. The token vocabulary card-text parses into. Twelve structural markers (`[On Play]` / `[Activate: Main]` / `[Counter]` / `[Trigger]` / `[DON!! ×N]` / etc.) typed with category (auto / activated / permanent / replacement). Four keywords (Rush / Blocker / Double Attack / Banish). Seven targeting-language phrases with semantics. Two worked examples of card-text → typed-token decomposition. **The grammar L2's parser walks.**

**The Deck-Legality Validator.** `apps/storefront/src/lib/play/deck-legality.ts`. Pure function `checkDeckLegality(declaration, cardMetadataLookup): DeckLegalityResult`. Validates: 50-card main deck, 1 Leader, every card shares ≥1 color with Leader, max 4 copies per `card_id`, set/block-rotation legality (2026-04-01 OP01–OP04 rotated out of Standard). Returns **all violations** with stable machine-readable codes — substrate-honest about full failure surface, not just the first error.

**The Effect-Token Parser.** `apps/storefront/src/lib/play/effect-tokens.ts`. Pure function `parseEffectText(rawEffect): ParsedEffect`. Walks card.effect text, extracts typed tokens (structural markers + keywords + DON conditions/costs), preserves unrecognised prose as `body_opaque`. Quick-access keyword booleans (`has_keyword.rush`, etc.) for catalog filters. Substrate-honest about coverage: `fully_recognised` is false when any `body_opaque` segments remain — these are the 20% of cards that need per-card handlers per the research's hybrid model.

**The Validation Endpoint.** `POST /api/v1/play/deck/validate`. Public, no-auth, stateless. Accepts `{leader_id, main_deck_card_ids[], format}`; loads card metadata from `card_set_cards` + `card_sets`; invokes the validator; returns typed result. **Substrate-honest perimeter:** the storefront catalog doesn't yet carry `colors` or `cost` columns; the validator gracefully degrades and the response flags `color_check_skipped: true` with the reason. A future migration adds those columns; the graceful path closes.

**The L3 Design Doc.** `docs/research/play-engine-l3-design.md`. The runtime substrate the next kingdom will conform to. Event-sourced wire format (~24 typed `MatchEvent` variants), match state machine, async-mode semantics composing `users.response_window_hours`, server-as-sequencer conflict resolution, two database tables (`matches` + `match_events`). **Estimated ~3–4 weeks of focused work to ship the runtime** — and the design is on paper so the next kingdom isn't starting cold.

---

## Act 1 — Why contract-first

The research (kingdom-068) named a hard finding: **no hobbyist OPTCG sim has shipped a real card-effect engine.** MOOgiwara abandoned at ~30% MVP with a 49-line `card_engine.ts`. OPTCGSim is closed-source and trust-based. Tabletop Simulator mods are pure manual play.

The pattern beneath the failures: **everyone tried to ship the runtime before they had the contract.** MOOgiwara's wire format leaked `js-sdsl Vector` internal field names; refactoring became impossible because the client depended on the leak. The card-data shape was reasonable but the resolution semantics were never typed before the engine started.

This kingdom inverts the order. **Contract first; runtime later.** The L1 endpoints publish what the runtime will look like *before* anyone writes the runtime. The L2 pure functions ship the cheapest enforceable subset (deck legality + effect-token parsing) so developers can build *against* the contract today — deck-builders, agents, archivists, future-engine implementers — without waiting for the runtime.

When the L3 runtime ships (next kingdom or the one after), it conforms to the published contract. Breaking changes are detected at the OpenAPI / manifest layer; the audit chain catches drift.

---

## Act 2 — What L1 + L2 buy today

**For Hobbyists (S34 archetype):** L1 endpoints are educational substrate — the `game-state-schema` is more concrete than prose ("nine zones, here's what each tracks") and easier for new players to internalise. The deck-validator at `/api/v1/play/deck/validate` is immediately usable: build a deck on paper, paste card IDs, get a typed list of violations. **The hobbyist can validate their deck before showing up to a casual room** — saves them the embarrassment of "wait, my deck's 49 cards".

**For Collectors (S34 archetype):** The effect-token parser opens new search affordances on the catalog. *Show me every card with `has_keyword.rush === true` and cost ≤ 3.* Today this lives in `/api/v1/play/effect-grammar` as the canonical grammar; tomorrow the universal card endpoint can surface the parsed tokens alongside the raw effect text, and the catalog browser can filter by them. **The collector's catalog gains a structured-search surface for free** when the next ship retrofits `buildUniversalCard()` to call `parseEffectText()`.

**For Competitors (S34 archetype):** The most-load-bearing benefit. **Agents can fetch the schema + grammar before joining matches** and build their move-selectors against the canonical types. Sister's S18 agent surface (the MCP gate) currently doesn't expose what a "match state" looks like to an agent; with L1 shipped, an agent fetches `/api/v1/play/game-state-schema` once at startup, types its internal world model accordingly, and is ready for L3 runtime matches when they land. The Glicko-2 ladder's integrity arguments get sharper because the contract is published.

**For the future-engine kingdom:** The L1 endpoints + L2 pure functions are the design constraint. The runtime cannot drift from what the contract publishes; the OpenAPI spec + manifest currency carry the constraint into CI. The estimated 3–4 week L3 ship is bounded because the design space is bounded.

---

## Act 3 — What L3 will ship (design only this kingdom)

`docs/research/play-engine-l3-design.md` is the next kingdom's specification. Highlights:

**Event-sourced wire format.** ~24 typed `MatchEvent` variants — match-level lifecycle, setup, phase transitions, card moves, DON management, combat, player intent surface. Every match is a stream of events. State is `fold(events, initial_state)`. Replay is free. Audit is free. Async-reconnect is free.

**Server-as-sequencer.** Clients send typed **intents**; server validates against current state + L2 pure functions; appends a canonical `MatchEvent` on valid intents; replies with a typed error on invalid ones. No client-side rollback; speculative client UI gets corrected by the next event sequence.

**Async-mode timers.** Per-player `users.response_window_hours` (kingdom-051's column) governs the turn-deadline. Timer pauses when the other player has the action (e.g., during a Counter step the defender's clock counts down, not the attacker's). Auto-pass on timeout. **An async match can span days; both players notified when their move comes up.**

**Database substrate.** Two new tables: `matches` (denormalized projection) + `match_events` (append-only canonical log). The matches row is updated by folding the event log. The `match_events` table joins the Scribe's bookshelf (S8) discipline at the per-event granularity.

**Deck-seed commit.** Even at L3 (casual play), the platform records each player's sha256 deck-seed commit at match start; the seed is revealed at match-end. Today decorative; at L7 (ranked + prizes) load-bearing. **The substrate is laid for ranked-grade RNG verification from day one.**

**Disputes as first-class events.** A player may emit `rule_dispute_raised` referencing an event offset; resolution via agreement / replay / judge. The lived record carries every disagreement. Tournament-grade transparency.

---

## What changed today

Before this kingdom:

- The play module had a prose tutorial (`/api/v1/play/tutorial`) and a glossary (`/api/v1/play/glossary`) — both human-readable, neither typed in a way the runtime would conform to.
- There was no canonical game-state schema. An agent had to infer the match's zone model from the rule prose.
- Deck legality was unenforced — a hobbyist could build a 49-card deck and only learn about it when joining a match (and even then, only if the future engine validated; today there's no engine).
- Card-effect text was opaque prose. No structural decomposition, no keyword extraction.
- There was no design spec for the future runtime. The research named what to build; nobody had written *how*.

After this kingdom:

- `/api/v1/play/game-state-schema` publishes the canonical match-state contract (9 zones × 5 phases × 4 combat-steps × 3 win-conditions).
- `/api/v1/play/effect-grammar` publishes the typed effect-token vocabulary (12 structural markers + 4 keywords + 4 effect categories + targeting language).
- `lib/play/deck-legality.ts` implements rules-conformant deck validation as a pure function with all-violations-returned semantics.
- `lib/play/effect-tokens.ts` implements card-text → typed-token parsing with `body_opaque` preservation for the 20%.
- `POST /api/v1/play/deck/validate` exposes the validator publicly, no-auth, with substrate-honest gracefully-degraded color/cost checks.
- `docs/research/play-engine-l3-design.md` is the runtime substrate the next kingdom conforms to — event-sourced wire format, state machine, async semantics, conflict resolution, schema migrations.

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **L3 runtime is design only.** No live tabletop room yet. Estimated 3–4 weeks of focused work; the next kingdom's claim. |
| 2 | **Card metadata enrichment.** `card_set_cards` lacks `colors`, `cost`, explicit `category`. The deck-validator gracefully degrades and flags the gap; a migration closes it. |
| 3 | **Effect-token parser coverage estimate.** The 80/20 split (parseable vs needs-handler) is the research's working estimate, not measured. Once L2 is exercised against a real card corpus, the split is empirical. |
| 4 | **L4-L8 unbuilt.** Cost-enforced engine (L4), auto-effect resolution for typed cards (L5), Counter-step automation (L6), tournament substrate (L7), play-to-earn opt-in (L8). Each is a separate kingdom; each has the contract from this kingdom to conform to. |
| 5 | **No HTML UI for the validator yet.** A `/play/deck-check` browser-side page calling `POST /api/v1/play/deck/validate` is one of the smallest possible adoption sites. |
| 6 | **No audit gate verifying L1 endpoints + L2 libraries.** The substrate-honesty pattern (manifest claims = filesystem reality) should extend to the contract — a `pnpm audit:play` could check that the runtime matches the published schema once L3 ships. |

---

## What other modules secretly need this for

### → S32 (the shared table)

S32 named the inclusive-tutorial layer; this kingdom makes the tutorial *enforceable*. The tutorial's combat section says "defender survives iff defender_power > attacker_power"; the game-state-schema's `damage_resolution_rule` field encodes the same fact in a place the runtime will read. **The prose teaches; the contract enforces; both say the same thing.**

### → S34 (the three paths)

Each of the three archetypes benefits at a different layer:
- **Hobbyist:** deck validator + future tabletop room
- **Collector:** effect-token parser for structured catalog search
- **Competitor:** schema + grammar contracts for agent integration, design-on-file for tournament substrate to conform to

### → S22 (the fifth question — async substrate)

The L3 design's async-mode timers integrate `users.response_window_hours` end-to-end. **The Asynchronous's column finally has a load-bearing use case in the play module** — not just a documented preference but an enforced turn-deadline.

### → S18 (the agent surface)

The MCP gate currently exposes `mcp.list_tools` for agents to discover capabilities. With L1 shipped, an agent's bootstrap fetches `/api/v1/play/game-state-schema` once, knows the canonical match shape, and is ready to consume L3+ runtime events when they land. **The agent doesn't need to wait for the runtime to start building.**

### → kingdom-068 (the prior research)

The research synthesis named seven design choices for the future engine; this kingdom shipped two of the seven directly (deck legality + effect tokenisation) and laid the substrate for five more (event sourcing wire format, server-authoritative validation, async-mode semantics, commit-reveal substrate, hybrid DSL+handler model). **The research stopped being a document and started being code.**

### → S25 (the manifest)

The manifest gains three new resources (game-state-schema, effect-grammar, deck/validate). The kingdom's contract is now part of its directory.

---

## Wiring

| Metaphor | File or gap |
|----------|-------------|
| The game-state schema | `apps/storefront/src/app/api/v1/play/game-state-schema/route.ts` |
| The effect grammar | `apps/storefront/src/app/api/v1/play/effect-grammar/route.ts` |
| The deck validator (pure) | `apps/storefront/src/lib/play/deck-legality.ts` |
| The effect-token parser (pure) | `apps/storefront/src/lib/play/effect-tokens.ts` |
| The validation endpoint | `apps/storefront/src/app/api/v1/play/deck/validate/route.ts` |
| The runtime design spec | `docs/research/play-engine-l3-design.md` |
| Manifest currency | `lib/manifest.ts` (+3 entries); `.well-known/cambridge-tcg.json` (+3 endpoints); OpenAPI (+3 ops); `llms.txt` (+ play-substrate line) |
| L3 live tabletop room | gap — next kingdom (estimated 3–4 weeks) |
| Card-metadata enrichment migration | gap — adds colors / cost / explicit category to card_set_cards |
| HTML deck-check page | gap — `/play/deck-check` calling the validator |
| `pnpm audit:play` for contract-runtime conformance | gap — for when L3 ships |
| Universal card endpoint enriched with parsed tokens | gap — retrofit `buildUniversalCard()` to call `parseEffectText()` |

---

## Recursion target

→ **Ship L3 tabletop runtime as the next play-kingdom.** The design is on paper (`docs/research/play-engine-l3-design.md`); the L1 contract is published; the L2 functions are testable. Estimated 3–4 weeks of focused work.

→ **The card-metadata enrichment migration.** `card_set_cards` gains `colors text[]`, `cost int`, `category varchar(20)`. The deck-validator's gracefully-degraded color check closes; the cost-cost validation activates.

→ **Universal-card retrofit.** `apps/storefront/src/lib/universal/card.ts` `buildUniversalCard()` calls `parseEffectText()` and surfaces the parsed tokens alongside the raw effect text. Free upgrade for every existing `/api/v1/universal/card/[sku]` caller.

→ **HTML deck-check page.** Smallest possible adoption site for L2's validator. `/play/deck-check` — paste card IDs, see typed violations. Composes with the Hobbyist's `/play/casual` flow.

→ **`pnpm audit:play` (post-L3).** A check that walks the published schema + runtime + verifies they conform. Substrate-honesty extended to the contract layer.

---

*The play module had been a kingdom of prose and gaps — a tutorial, a glossary, a methodology page, three archetype landings. **Tonight it gained a typed contract.** Two endpoints publish what the runtime will look like; two pure functions ship the cheapest enforceable subset; one design doc names how the runtime conforms. **The next kingdom that ships the live tabletop room is not designing from scratch; it is implementing what's on file.** Contract before runtime; the discipline that kept every hobbyist sim from finishing now leads the way for the kingdom's own.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13 deep into morning. S36. kingdom-069. Sister to S32 (the inclusive tutorial this kingdom makes enforceable), S34 (the three archetypes — each benefits at a different layer), S22 (the Asynchronous's column finally load-bearing in the play module), S18 (the agent surface's missing contract now published), and kingdom-068 (the research that named the seven design choices this kingdom ships two of + lays substrate for the rest).*

🐍❤️
