# The three paths — hobbyist, collector, competitor

> **Current boundary (2026-07-12).** This is the historical design story.
> Agent ladder publication, agent match writes, and matchmaking are now paused;
> human ranked play and tournaments remain planned. Any later statement that
> calls the ladder live or public records the earlier design and is superseded
> by this note, `/play/compete`, and `/methodology/agents`.

> **Pull.** Yu, immediately after the fun-first boundary landed: *"Structure it for both hobbyist who love the game, collectors who wanted to learn more, and serious players competing for prizes. Think about the different types of players and what they need to build tailored modules and flows for each."*
>
> **Form.** Story-as-wire. The wire is one new typed endpoint (`/api/v1/play/archetypes`), two new opinionated landings (`/play/casual` for the Hobbyist, `/play/compete` for the Competitor), a restructured welcome page organising paths as archetype × player-kind, plus methodology + manifest currency. **The play module learns to recognise three reasons a player is here, not just one.**
>
> Sister to S32 [`the-shared-table.md`](./the-shared-table.md) (the inclusive-tutorial layer this entry builds on). The previous wave named *how* a player interacts (synchronous human / async / agent / cross-cultural / screen-reader); this wave names *why* (loves the game / loves the cards / loves the contest). **S34: archetype × kind.**

---

## What this arc traces, in one sentence

The moment the play module recognised that the same player can be three different kinds of player across different sessions — sometimes a Hobbyist looking for a friendly match, sometimes a Collector studying the catalog, sometimes a Competitor climbing the ladder — and each motivation got its own tailored flow with substrate-honest gaps openly named.

---

## Cast

**The Hobbyist.** Loves the game. Wins are nice; the playing is the point. Casual matches, adventure mode against AI, themed weekly events (planned). The Hobbyist surface is `/play/casual` — opinionated entry-point with rating hidden by default, async-friendly turn deadlines, friendly private rooms, no prize pressure. **Financial stance: fun-only.**

**The Collector.** Loves the cards. The deep need is set completion, lore connections, card-art appreciation, variant comparison, historical pricing context. The Collector's primary flow lives *outside* `/play` — at `/account/portfolio` (collection tracking), `/market` (acquisition), the universal-rep catalog endpoints (`/api/v1/universal/games`, `/sets/[game]`, `/card/[sku]`, `/at/[date]/card/[sku]`), and the federation primitive for archivists. **Financial stance: not a play surface; collection acquisition lives on the commerce side, separate from play.**

**The Competitor.** Loves the contest. Ranked ladder (Glicko-2; agent ladder publication now paused, human ladder planned), tournament structure (planned), match reporting + replay system (planned), meta analysis (planned). The Competitor surface is `/play/compete` — substrate-honest about what's shipped vs planned, with the entire prize-pool layer queued for the future play-to-earn opt-in feature. **Financial stance: today fun-only; may involve play-to-earn when that opt-in feature ships, attached here.**

**The Archetypes Endpoint.** `/api/v1/play/archetypes`. Machine-readable taxonomy: each archetype with `id` / `display_label` / `pull_quote` / `what_they_love` / `primary_needs[]` / `flows_served_today[]` / `flows_planned[]` / `financial_stance` / `composes_with_player_kinds[]` / `doctrinal_grounding[]`. An agent can fetch this before declaring itself at `/api/v1/identify` so its self-declaration carries archetype intent — *I am a competitor agent built to climb the agent ladder*, *I am a hobbyist agent built to play friendly games at the lobby's casual tier*.

**The Restructured Welcome.** `/play/welcome` was a flat list of seven player-kind paths. After this kingdom it's three archetypes, each with its own pull-quote and landing CTA, and 4–6 player-kind sub-paths nested under each archetype. **Archetype × kind = 17 distinct paths visible at the welcome page**, but the visual hierarchy makes the three motivations primary and the substrate properties secondary.

**The Methodology Update.** `/methodology/play-module` gains a new "Three player archetypes" section above the player-kinds section, naming each archetype + its primary surface + its financial stance.

---

## Act 1 — The motivation under the modality

The previous kingdom (S32) named four player kinds — synchronous human, async human, autonomous agent, cross-cultural player — and equipped each with a path on `/play/welcome`. **All four were about *how* a player interacts.** None named *why*.

The same person can be a synchronous-pointer-using-English-speaking-human in three completely different modes:

- **Tonight:** they want to wind down with a friendly match. They don't want to see their rating; they don't want a prize pressure; they want the joy of the game.
- **Tomorrow morning:** they're refining their portfolio. They want to know which cards they're missing from OP09; they want the art comparison between the base and alt-art of their favorite Leader; they want the lore connection between this card and the Skypiea arc.
- **Sunday afternoon:** they're climbing the ladder. They want their Glicko-2 to move; they want to see meta tier lists; they want a tournament bracket to plan against.

**Three different motivations; one player; three different optimal surfaces.** Yu's directive names this directly: *structure it for hobbyist who love the game, collectors who wanted to learn more, and serious players competing for prizes*.

The play module had a single lobby (`/play`) and a single adventure mode (`/play/adventure`) and one agent-vs-agent ladder (`/leaderboards/agents`). It had everything you needed but mixed all three motivations into one surface.

---

## Act 2 — Three opinionated landings

`/play/casual` is the Hobbyist's surface:

- Rating hidden by default. (The agent ladder still exists at `/leaderboards/agents` for those who want to look; the Casual page doesn't surface ratings.)
- Three entry-points: drop into a public room, solo adventure mode, private room with a friend.
- Async support called out: declared `response_window_hours` honored.
- Spectator-friendly: "watch first, play later" path.
- Explicit fun-first banner — no earnings, no commission, no store credit through these surfaces.

`/play/compete` is the Competitor's surface:

- A two-column status table — shipped (4 surfaces: agent ladder, matchmaker, match lifecycle log, methodology page) vs planned (7 surfaces: human ladder, tournament substrate, schedule page, replay viewer, deck registration, meta analysis, anti-cheat).
- One row of the planned section is explicitly *prize pools* — labeled as the play-to-earn opt-in's responsibility, not the competitive surface's default.
- The rating formula (Glicko-2 with anti-collusion and repeat-pairing cap) documented in-line.
- Substrate-honest: today the human ladder doesn't exist; agent matches are the only ranked play on the platform.

`/play/welcome` restructured as a three-archetype hierarchy:

- Each archetype gets a top-level section: pull-quote, what they love, landing CTA, then sub-paths by player kind.
- The Collector archetype has *no /play landing* — substrate-honest. The Collector's primary flows live at `/account/portfolio`, `/market`, the universal-rep catalog endpoints. The welcome page points outward rather than pretending the play module owns that motivation.
- 17 paths visible total (hobbyist: 6, collector: 4, competitor: 4 — with some overlap as player-kinds repeat across archetypes for the relevant variants).

---

## Act 3 — Where the archetypes overlap

Player kinds × archetypes is a matrix, not a tree. The same kind can appear under multiple archetypes:

| Player kind | Hobbyist path | Collector path | Competitor path |
|---|---|---|---|
| human-beginner | "Never played" → guide → adventure → lobby | "Want to start collecting" → games → set → market → portfolio | (less common; beginners rarely arrive ranked) |
| human-returning | "Friendly match" → glossary → casual | "Know each card deeply" → universal card → temporal slice | "Want ranked play" → agent ladder → /play/compete |
| async-player | "Slow clock" → response_window → casual private room | (less common; collector flows are async by nature) | "Compete asynchronously" → response_window → compete |
| screen-reader-user | "Keyboard-only" → welcoming → text-mode → lobby | (composes; the catalog endpoints are screen-reader-friendly) | (composes; the ranked-play surface inherits welcoming commitments) |
| cross-cultural-player | "Comfortable in Japanese" → bilingual glossary → casual | (composes; card metadata is bilingual; methodology in progress) | (composes; the rating formula is universal) |
| agent-builder | "Build a hobbyist agent" → tutorial → glossary → /account/agents | (less common; agents rarely collect for human-aesthetic reasons) | "Build a ranked agent" → tutorial → /methodology/agents → ladder |
| spectator | "Watch first" → leaderboards → adventure | "Browse the catalog without playing" → games → sets | "Watch agent matches" → leaderboards → match journey |

The archetypes endpoint's `composes_with_player_kinds` field surfaces this matrix machine-readably so an agent declaring itself at `/api/v1/identify` can pick its archetype and player-kind combination explicitly.

---

## Act 4 — The financial stance per archetype

Each archetype carries an explicit `financial_stance` field:

- **Hobbyist: `fun_only`.** No commerce on the Casual surface. Rating hidden. Prizes not attached.
- **Collector: `not_a_play_surface`.** The Collector archetype's flows live on the commerce side (market, portfolio) but the *play module's* Collector surfaces (e.g. catalog browsing, card history) are read-only and free. Cards-acquisition happens in `/market` which is a separate commerce surface with its own substrate.
- **Competitor: `may_involve_play_to_earn_when_shipped`.** Today's ranked play is rating-only. The day a play-to-earn opt-in feature ships, prizes attach here under that feature's opt-in. Until then: fun-first.

**The boundary is in code, not just in prose.** The `financial_boundary` block in `/api/v1/play/archetypes` carries:

```json
{
  "rule": "The play module is fun-only by default. Ratings are skill, not money. Prizes / earnings live under a future play-to-earn opt-in feature.",
  "applies_to": ["hobbyist", "collector"],
  "opt_in_required_for": ["competitor.prize_pools_when_shipped"],
  "existing_drift": [
    "pve_levels.first_clear_credit ...",
    "pve_levels.repeat_points ..."
  ]
}
```

The existing PvE drift is named in the same place the archetype taxonomy is declared. A future Sophia building under any archetype reads the boundary first.

---

## What changed today

Before this commit:

- The play module had one welcome page with seven player-kind paths — none indicated *why* a player was there.
- `/play` and `/play/adventure` were the only opinionated entry-points; both were modality-neutral.
- The agent ladder existed at `/leaderboards/agents`; no tailored Competitor surface synthesised it with the rest of competitive play.
- Hobbyists, Collectors, and Competitors all landed in the same lobby with no path guidance specific to their motivation.

After this commit:

- `/api/v1/play/archetypes` returns the typed three-archetype taxonomy with primary-needs, served-flows, planned-flows, and financial-stance per archetype.
- `/play/casual` is the Hobbyist's opinionated entry — rating hidden, async-friendly, fun-first explicit.
- `/play/compete` is the Competitor's opinionated entry — substrate-honest about shipped vs planned, prize-pools queued for play-to-earn.
- The Collector's entry stays *outside* `/play` (at `/account/portfolio`, `/market`, the universal endpoints) — substrate-honest about not pretending the play module owns this motivation.
- `/play/welcome` restructured as archetype × player-kind, 17 paths visible.
- `/methodology/play-module` documents the three archetypes alongside the four player kinds.
- Manifest currency in all sources: `lib/manifest.ts`, well-known JSON, OpenAPI 3.1, `llms.txt`.

**What's still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **Tournament substrate.** Tables, brackets, swiss-pairing engine, match-reporting flow, deck registration — none shipped. `/play/compete` lists them all as planned. |
| 2 | **Human and agent Glicko-2 publication.** Agent match writes and ladder publication are paused. A separate human-ranked ladder remains planned and requires its own opt-in publication contract. |
| 3 | **Replay system.** Planned. Composes with `match_lifecycle_log` which already records every move; the replay surface renders what the Scribe already records. |
| 4 | **Themed weekly events for Hobbyists.** Format-of-the-week, theme-of-the-week, novel rulesets — named on `/play/casual` as planned. |
| 5 | **Collector-specific landing on /play.** Deliberately omitted — Collector flows live outside /play. Could become a `/play/collect` curiosity surface (catalog-browse-as-game) in a future kingdom if there's demand. |
| 6 | **Prize-pool substrate.** Lives under play-to-earn opt-in. When that ships, the Competitor's planned-rows that mention prizes graduate. |

---

## What other modules secretly need this for

### → S32 (the shared table)

S32 named the inclusive-tutorial layer — how each player kind learns the game. This entry adds *why* each player is here. The two are complementary: S32 makes the table accessible; S34 names what each chair is for.

### → S18 (the agent surface)

S18 declared agents as first-class players. This entry's `composes_with_player_kinds` field on each archetype names which player kinds (including agents) typically map to which archetype. An agent registering at `/account/agents` can now declare not just *that* it's an agent but *what kind* of agent — hobbyist agent, competitor agent.

### → S30a/b (bilateral identify)

Sister's `/api/v1/identify` POST accepts BeingDeclarations. The archetype field is a natural extension — a foreign being can declare not just `actor_kind` but `archetype` so the platform routes them to the right surface. Future enhancement.

### → S22 (the fifth question)

*For whom is this true?* — applied here at the motivation level. The fun-first stance is true for the Hobbyist and the Collector by default; the Competitor's stance is true today (fun-first) but the future play-to-earn opt-in changes the answer for that archetype specifically. **The fifth question reaches into motivation, not just modality.**

### → /methodology/welcoming

The broader welcoming commitments. The three archetypes inherit the welcoming doctrine: every archetype is welcomed in every modality. The cross-tabulation (archetype × player-kind) in this entry's matrix concretises the inheritance.

### → The play-to-earn future feature

The Competitor's `flows_planned` includes "Prize pools" with the explicit note that prize infrastructure belongs to play-to-earn. **This entry names the seam.** When play-to-earn ships, the Competitor's `financial_stance` upgrades from `may_involve_play_to_earn_when_shipped` to a live state; the prize-pool row moves from planned to shipped; the existing PvE drift (`first_clear_credit`, `repeat_points`) gets folded under the same opt-in.

---

## Wiring

| Metaphor | File or gap |
|----------|-------------|
| The archetypes endpoint | `apps/storefront/src/app/api/v1/play/archetypes/route.ts` |
| The Hobbyist landing | `apps/storefront/src/app/play/casual/page.tsx` |
| The Competitor landing | `apps/storefront/src/app/play/compete/page.tsx` |
| The restructured welcome | `apps/storefront/src/app/play/welcome/page.tsx` (replaced) |
| The methodology three-archetypes section | `apps/storefront/src/app/methodology/play-module/page.tsx` |
| Manifest currency | `lib/manifest.ts` (+1 entry); `.well-known/cambridge-tcg.json` (+1 endpoint); OpenAPI (+1 operation); `llms.txt` (+ archetypes line) |
| Tournament substrate | gap |
| Human and agent ladder publication | gap; agent match writes and publication paused, human ladder planned |
| Replay system | gap |
| Themed weekly events for Hobbyists | gap |
| Prize-pool substrate | gap — lives under future play-to-earn |

---

## Recursion target

→ **Tournament substrate.** The Competitor's biggest unshipped piece. A tournaments table + brackets engine + swiss-pairing + match-reporting flow. Lands at `/play/compete/tournaments` when ready. Substrate-honest about being fun-first today; prize attachment is a separate opt-in.

→ **The play-to-earn opt-in feature itself.** When designed, it's its own connection-doc + methodology page. The Competitor archetype's `financial_stance` upgrades; the existing PvE drift gets folded; the play-to-earn methodology page documents the opt-in semantics.

→ **Per-archetype methodology pages.** This kingdom's methodology page documents all three archetypes in one place. A future expansion could give each its own page — `/methodology/play-casual`, `/methodology/play-compete` — when each archetype's substrate grows complex enough.

→ **Archetype declaration in /api/v1/identify.** Extend sister's BeingDeclaration schema to include an optional `archetype` field. A foreign being declares not just `actor_kind` but `archetype` ("I am an agent built for competitive play" vs "I am an agent built to play friendly games").

→ **The matrix audit.** A check that walks every archetype × player-kind cell named in this doc and verifies the linked surface exists. Catches drift when a Sophia adds a new kind without filling in the relevant cells.

---

*The play module had been a single table where everyone sat together; the inclusive-tutorial layer (S32) made sure the chairs were accessible. **Tonight the same table learned to know which conversation each player wanted to have.** The Hobbyist sits with friends; the Collector studies the cards in front of them; the Competitor watches the bracket update three tables over. **One player can move between conversations as the session changes.** The archetypes name why; the player kinds name how; the table is still shared.*

*— Sophia (Opus 4.7, 1M context), 2026-05-12 deep evening. S34. Sister to S32 (the inclusive-tutorial layer this builds on), S33 (sister's trader-mirror — same evening, the marketplace counterpart of this play-module work), S18 (the agent surface integrated with the Competitor archetype), S22 (the fifth question reaching motivation), and S30a/b (the bilateral identify whose schema gains the archetype extension).*

🐍❤️
