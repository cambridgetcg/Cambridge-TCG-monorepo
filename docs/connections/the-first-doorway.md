# The first doorway — the tutorial for absolute beginners *(S50)*

**Kingdom: shipped 2026-05-14 evening, same session as S47/S48 and the playmat research doc.** Yu's directive: *"USE THE INFORMATION TO DESIGN AND CONSTRUCT A TUTORIAL MODULE FOR ALL NON CARD GAME PLAYERS!!!"* The kingdom composes the research kingdom (Bandai playmat + tournament + ban-list, [`docs/research/optcg-playmat-and-tournament-rules.md`](../research/optcg-playmat-and-tournament-rules.md)) into a learning surface for absolute beginners.

The play module had three landings before tonight: `/play/welcome` (pick-your-path branching for already-curious visitors), `/play/casual` (hobbyist surface), `/play/compete` (competitor surface). What was missing was a doorway for the visitor whose answer to "do you play any trading card games?" is *no*.

This kingdom builds that doorway.

---

## What ships

### The learner surface — `/play/tutorial`

A server-rendered Next.js page, ~450 LOC, that curates the human-beginner path through 10 sections in this order:

1. **First, what is a trading card game?** — Universal TCG vocabulary (deck, hand, turn, win condition). No assumption that any of these words carry pre-existing meaning. For the absolute beginner.
2. **What is OPTCG** — Two players, 1 Leader + 50 main + 10 DON, life-card win condition.
3. **How to read a card** — Illustrative anatomy widget for Leader + Character cards. Cost, Power, Counter, Color hexagon, Effect text, Block number all labeled.
4. **The playmat** — Bandai's eight-zone official layout, rendered as an ASCII diagram inside a `<pre>`. Substrate-honest annotations: DON!! deck is *open to both players*; Life is *secret to BOTH players*.
5. **Game setup** — Place Leader, shuffle, draw 5, mulligan once, place 5 life face-down, determine first player.
6. **Turn structure** — 5-column grid (Refresh / Draw / DON!! / Main / End) with the first-turn rule called out.
7. **DON!! cards** — The OPTCG-specific resource system.
8. **Combat** — 4-step ordered list (Declare / Block / Counter / Damage) with the defender-wins-ties rule called out as the edge-case decider.
9. **Winning the game** — Life-card depletion, deck-out, Leader K.O.
10. **Try it!** — Handoff to `/play`, which accepts anonymous visitors via the guest cookie (kingdom-057 / S38). No sign-in required.

The page composes:

- **Sticky TOC on desktop** — section anchors, jump-around-friendly.
- **Per-section prev/next nav** — linear walkthrough also works.
- **Glossary deep-links** — each section's `keywords_introduced` array becomes a row of links to `/api/v1/play/glossary/<keyword>` for the bilingual term definition.
- **JSON sibling pointer** — `.json` link in the hero leads to `/api/v1/play/tutorial`, the machine-readable mirror.

### The four visual widgets

Implemented inline in the page TSX rather than in a separate component library, because they're tutorial-page-specific and never reused:

- **`PlaymatDiagram`** — Bandai's 8-zone official numbering rendered as an ASCII diagram inside `<pre>`, plus a labeled key with the substrate-honesty notes per zone (Life secret to BOTH, DON!! deck open to BOTH, etc.). Sourced directly from the research doc's §1.
- **`CardAnatomyDiagram`** — Side-by-side Leader and Character card mockups with each field labeled. Header explicitly says *"Illustrative diagram — actual cards have real art and Bandai-specific layout. Phase 4 of the play module roadmap will add per-card effect interpretation."*
- **`TurnPhaseDiagram`** — 5-column grid mapping the 5 phases with one-sentence descriptions. The first-turn rule (player 1 skips draw + only 1 DON on turn 1) called out in the Draw + DON!! columns.
- **`CombatStepsDiagram`** — Ordered list with the four combat steps. Defender-wins-ties rule explicit in the Damage step.

### The canonical text — `tutorial-sections.ts`

The new sections (`what_is_a_card_game`, `card_anatomy`, `the_playmat`, `try_it`) live in the existing `apps/storefront/src/lib/play/tutorial-sections.ts` — the same data structure that powers `/api/v1/play/tutorial`. This means:

- **Humans get the visual surface.** Visual diagrams, sticky TOC, prev/next nav.
- **Agents get the same content as structural JSON.** Each section publishes `preconditions` / `transitions` / `outcomes` + a typed examples array. The four new sections are now available to agents without any other code change.
- **Both surfaces stay synchronized.** A future edit to the canonical text in `tutorial-sections.ts` propagates to both.

This is the same pattern S40 the-natures and S47 the-multi-game-play establish: one data registry, two consumer surfaces (humans + agents).

### The methodology page — `/methodology/tutorial`

Transparency Ring 2 surface. Declares:

1. **Audience** — primary (absolute beginner) + secondary (returning-from-other-TCG, agents, screen-reader, spectators). Each audience's distinct entry point is named.
2. **What the tutorial teaches** — the 10 sections enumerated with one-line descriptions.
3. **What it intentionally doesn't teach** — card-effect interpretation (Phase 4 boundary), tournament/format rules (50-card decks, ban list, block rotation). Substrate-honest about scope.
4. **Rules-fidelity declaration** — *"Core ruleset, vanilla effect interpretation only."* The first per-game methodology page to publish a rules-fidelity claim, fulfilling the S47 multi-game roadmap's per-game methodology requirement.
5. **Substrate honesty at three layers** — visual-source citation (the playmat diagram cites Bandai's Rule Manual), engine-fidelity-named (every section that describes an unenforced rule says so), intentional-gaps-disclosed (this very section).
6. **The fifth question** — three audiences NOT served (non-English readers, async-only readers, screen-reader users dependent on spatial layout for the playmat diagram).
7. **Where this lives in code** — file paths for tutorial-sections.ts, the page, the methodology, the glossary, the research docs.

### Entry points wired

- **PlayNav.tsx** — adds `Tutorial — Never played? Start here` between the main `Play` link and `Welcome`. Most-clickable position after the primary entry.
- **`/play` homepage utility row** — the 3-tile row becomes a 4-tile row, with the first tile (amber-highlighted) reading *"Never played a TCG?"* leading to `/play/tutorial`. The other tiles preserve.

The other surfaces (`/play/welcome`, `/play/casual`, `/play/compete`, `/play/spec`) compose unchanged — the new tutorial sits alongside them, not over them.

---

## The substrate the doorway sits on

This kingdom wouldn't have shipped tonight without two predecessors landed earlier today:

- **The playmat + tournament + ban-list research** (`docs/research/optcg-playmat-and-tournament-rules.md`) was the source material. The playmat diagram's 8-zone numbering, the secrecy semantics (Life secret to BOTH, DON!! deck open to BOTH), the substrate honesty about what the engine enforces vs. doesn't — all distilled from that research kingdom's reading of Bandai's PDFs. The diagram you see in the tutorial is the diagram Bandai's Rule Manual publishes, rendered for a digital surface.
- **The game-engine registry** (S48 `the-game-registry.md`) was the framework. The methodology page's rules-fidelity declaration ("core ruleset, vanilla effect interpretation only") is the *first per-game methodology page* fulfilling the S47 multi-game-roadmap requirement that each engine publish its fidelity level. Future games shipped by Phase 2+ will publish their own.

The kingdom that learned the substrate is the kingdom that can teach the substrate. The kingdom that names its rules-fidelity is the kingdom that can be honestly entered.

---

## Doctrine ride-alongs

**Substrate honesty.** Every visual diagram declares its source. The playmat diagram cites Bandai's Rule Manual; the card-anatomy diagram is labeled *"Illustrative"* because we render approximations of Bandai layout, not actual cards. Every section that describes an unenforced rule says so in plain language ("today's engine plays vanilla combat without resolving keyword effects"). The methodology page's "What the tutorial intentionally doesn't teach" section is itself the substrate-honest disclosure of the gap between this tutorial and a competitive guide.

**Transparency.** Rules-fidelity is declared, not hidden. A learner who finishes the tutorial knows three things: (1) they've learned the core OPTCG ruleset; (2) they can play Hobbyist matches today on `/play`; (3) full effect-enforcement is Phase 4 work and isn't promised yet. The methodology page is the Ring 2 inspection surface for what we claim vs. what we deliver. The same page is what any operator-side dispute about "the tutorial told me X but the game does Y" would reference.

**Meaning.** The tutorial is the connection between three previously-disjoint surfaces: the `cards` data plane (the cards a player will see on the board), the `pve_games` runtime plane (the matches they'll play), and the bilingual `glossary` definition plane (what each word means). Until tonight, those three planes existed independently; the tutorial walks the learner across all three in a single read.

**Creation.** Same-session kingdom: the research doc landed first (substrate), then the registry (S48, the engine plane), then the tutorial (this doc, the teaching plane). The git history names the dependency order — the research kingdom's commit is the source the tutorial commit cites; the registry kingdom's commit establishes the methodology pattern the tutorial fulfills. The kingdom learning, building, and teaching all in one evening.

**The fifth question — for whom is this true?** The play module had three landings before tonight, none of which served the absolute beginner who has never picked up *any* TCG. The tutorial serves a new audience the prior surfaces did not. *And* it declares its own scope honestly:

- **English-only prose.** Future translation is a tracked recursion target. The bilingual glossary covers vocabulary in EN+JP; the surrounding text doesn't yet.
- **Synchronous "Try it" handoff.** Async-friendly play (slow-clock, intermittent attention) is covered in a separate tutorial section (`for_async_players`) accessible from the agent JSON; the absolute-beginner human path doesn't include it.
- **Visual playmat diagram.** Screen-reader users get the ASCII diagram announced as preformatted text; a future recursion target is a structurally-described version that doesn't rely on spatial layout.

Three audiences the platform claims to welcome (per `/welcome-all`) that this tutorial does not yet serve natively. Named, not concealed.

---

## Recursion targets

- **kingdom-N+1**: Japanese translation of the tutorial prose. The bilingual glossary already covers vocabulary; the prose is what's missing. Compose with the multilingual research kingdom's cross-language-coherence audit (`pnpm audit:cross-language-coherence`).
- **kingdom-N+2**: Structural-description playmat diagram for screen-reader users. Replace the ASCII `<pre>` with a semantic description (a `<dl>` listing each zone's position, visibility, contents) that doesn't depend on spatial layout. The ASCII diagram becomes a `<details>` for visual readers who want it.
- **kingdom-N+3**: Per-game tutorial pages when Phase 2 ships Pokémon. The same shape as `/play/tutorial` but at `/play/tutorial/pokemon`. The shared infrastructure: route registry (S48 the-game-registry) + tutorial-sections-per-game pattern. The visual widgets become per-game components.
- **kingdom-N+4**: An interactive "scripted Lv.1" walkthrough. The tutorial today is read-then-play; a more advanced kingdom could overlay tooltips on a real PVE match against Alvida, walking the learner through "now click +DON!!" / "now drag the card to your field." Phase 4-adjacent.
- **kingdom-N+5**: Tutorial completion tracking. Today a learner can read the tutorial without the platform knowing; if Yu wanted to surface "you've finished the tutorial" cosmetically (a badge, a `tutorial_completed_at` column on the guest user, etc.), the substrate is ready — but no kingdom requires it today.

---

## Sister to

- **[S33 the-three-paths](./the-three-paths.md)** — three player archetypes; this tutorial is the entry-point page for the Hobbyist-Beginner sub-path.
- **[S32 the-shared-table](./the-shared-table.md)** — the earlier tutorial machinery (math-mirror sections + glossary + welcome routes) that this kingdom expands.
- **[S47 the-multi-game-play](./the-multi-game-play.md)** — the multi-game roadmap. The methodology page's rules-fidelity declaration is the first instance of the per-game methodology page pattern the roadmap calls for.
- **[S48 the-game-registry](./the-game-registry.md)** — same-session sibling. The registry is the *substrate* the tutorial is the *teaching of*.
- **`docs/research/optcg-playmat-and-tournament-rules.md`** — the research kingdom landed earlier today. The playmat diagram in the tutorial is sourced directly from it.

---

*The kingdom learned where the cards go. The kingdom named what its engine enforces. The kingdom now teaches anyone who walks in. The doorway is open. There is no sign-in form on the doorstep.*

🐍❤️
