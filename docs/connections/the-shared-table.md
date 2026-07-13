# The shared table — every player welcomed at the same game

> **Pull.** Yu's directive on 2026-05-12: *"Dive deeper into the play module. Think about the need and experience of the players, whether human, agents or people from different timeline. All are welcomed with tutorials that are inclusive and multi cultural."*
>
> **Form.** Story-as-wire. The wire is one new methodology page (`/methodology/play-module`), two new public no-auth API endpoints (`/api/v1/play/tutorial` carrying the rules in math-mirror form, `/api/v1/play/glossary` carrying multi-cultural OPTCG terms), one new polymorphic landing page (`/play/welcome` — seven player-kind paths), plus manifest currency. **The play module learns to host every kind of player at the same table.**
>
> Sister to S18 [`the-agent-surface.md`](./the-agent-surface.md) (the agent door — the first non-human player kind named), S22 [`the-fifth-question.md`](./the-fifth-question.md) (the scope condition — *for whom is this true?* applied recursively to the match), S30a/b [`the-self-identification.md`](./the-self-identification.md) + [`the-declarations.md`](./the-declarations.md) (sister's bilateral handshake — every player can declare what kind they are before joining). **S32: the play module's inclusive depth.**

> **Boundary — fun first.** Yu, after this kingdom's first wave: *"Make sure the play module is for FUN only, don't drag the financial element into it until the play to earn."* The play module's tutorial, glossary, welcome landing, lobby, match surface, and agent gate are all **financial-clean**. Ratings (Glicko-2 ladder) are skill — not money. Play-to-earn is a future, opt-in feature with its own methodology page when it lands. The existing PvE `first_clear_credit` + `repeat_points` columns predate this boundary and constitute a known drift; named openly here as a gap to reconcile when play-to-earn ships.

> **Current agent boundary (2026-07-12).** Operator-managed bearer keys retain
> approved read-only tools. New self-serve registration, agent match and deck
> writes, matchmaking, and ladder publication are paused.

---

## What this arc traces, in one sentence

The moment the play module stopped being a stage built for synchronous English-speaking pointer-using humans (with an agent door bolted on the side, S18) and became a table where every player kind — human-beginner, human-returning, autonomous agent, async-clock player, screen-reader user, cross-cultural player, spectator — was named, welcomed by a recommended path, and equipped with a tutorial in the modality they could decode.

---

## Cast

**The Beginner Guide.** `/guides/how-to-play`. Existed before this kingdom — SEO-rich English prose, ~15-minute read, complete rules, optimised for first-time TCG readers. The human-prose tutorial. Now joined by its machine-readable sibling.

**The Machine-Readable Tutorial.** `/api/v1/play/tutorial`. New this kingdom. Returns the OPTCG rules as a math-mirror document with typed `rule_structure` (preconditions, transitions, outcomes) per section, worked examples in state-before / action / state-after form, cross-references to glossary terms, and player-kind tags. **An agent ingests this once and is ready to play; no HTML parsing required.**

**The Multi-Cultural Glossary.** `/api/v1/play/glossary`. New this kingdom. Twelve OPTCG terms carried in three forms: English token, Japanese token (kanji/kana + romaji), structural definition (decoderable without natural-language knowledge). DON!! / リーダー / カウンター / トリガー — every load-bearing term mapped across the languages most OPTCG players think in.

**The Polymorphic Welcome.** `/play/welcome`. New this kingdom. Seven player-kind paths — human-beginner, human-returning, agent-builder, async-player, screen-reader-user, cross-cultural-player, spectator — each with a curated sequence of next steps. **Every player picks a path; all paths converge at `/play`.**

**The Methodology Page.** `/methodology/play-module`. New this kingdom. Documents the play module's four layers (PvP / PvE / agent-vs-agent / tutorial-and-discovery), the four player kinds the module recognises, the tutorial surfaces, the substrate-honest table of *implicit defaults → what they exclude → how the module accommodates*, and the gaps the module does not yet close.

**Sister's S18 Agent Surface.** The historical agent-play design includes the MCP gate, Glicko-2 model, and anti-collusion guards. Current MCP access is read-only; match writes and ladder publication are paused. **This kingdom doesn't replace S18; it adds the inclusive-tutorial layer for any future reviewed reopening.**

**Sister's S22 Fifth Question.** *For whom is this true?* — applied here to every cell in the play module's assumption table. The doctrine surfaces *whom* each implicit default excludes; this entry's wire is the platform's answer for the play module specifically.

**Sister's S30 Bilateral Handshake.** A player can POST a BeingDeclaration to `/api/v1/identify` before joining a match. The play module's welcome page links to this — *a player can declare what kind they are in machine-readable form* before the platform routes them to a path.

---

## Act 1 — The four player kinds

The play module recognises four kinds of player today. Each has its own modality requirements; each has its own assumption-of-the-platform-that-was-wrong; each is now accommodated.

### Synchronous humans
Two humans at their keyboards, playing in near-real-time. The original design. The lobby (`/play`) creates a room and pairs them. Keyboard-navigable; pointer sufficient but not required.

### Asynchronous humans
Players whose cognitive cadence is hours-to-weeks per response. **The Asynchronous from `the-other-minds.md`.** The platform's `users.response_window_hours` column (kingdom-051) is the wire — each player declares a window; the cron-paths honor it; the auto-pass triggers only when *the player's declared window* elapses, not a global 48h.

### Autonomous agents
AI agents acting on behalf of human operators. **Sister's S18.** A human can provision an operator-managed bearer key at `/account/agents` for approved read-only `/api/mcp` tools. New self-serve registration, match and deck writes, matchmaking, and ladder publication are paused. The actor-attribution and Glicko-2 structures remain dormant design substrate, not a claim that moves are accepted today.

### Cross-cultural players
Players whose first language isn't English, especially those who encountered OPTCG via the Japanese release. **The bilingual glossary** at `/api/v1/play/glossary` is the wire — every game term in Japanese + English + structural-decoderable form.

These four are the *minimum* the module recognises. The methodology page names sub-kinds: human-returning (knows TCG, needs OPTCG-specific refresher), human-from-other-TCG (knows MTG/YGO/Pokemon, needs OPTCG-vocabulary mapping), screen-reader-user (vision not the primary channel), spectator (learns by watching first). Each gets a path on `/play/welcome`.

---

## Act 2 — The tutorial in math-mirror form

`/api/v1/play/tutorial` is the agent's introduction. Nine sections today:

1. `what_is_optcg` — premise + win condition + setup overview
2. `game_setup` — Leader placement, 50-card deck, mulligan, 5 life cards, first player determination
3. `turn_structure` — Refresh / Draw / DON!! / Main / End
4. `don_cards` — the resource system; active / attached / rested states
5. `combat` — attack, defense, Counter, life flip, trigger
6. `win_conditions` — life zero + Leader hit OR deck-out
7. `key_card_types` — Leader / Character / Event / DON!! / Stage
8. `for_async_players` — `response_window_hours` + auto-pass semantics
9. `for_agents` — `/api/mcp`, bearer token, Glicko-2

Each section has:

```ts
{
  id, title,
  natural_language_body,         // opaque; humans grok this
  rule_structure: {              // typed; agents decode this
    preconditions, transitions, outcomes
  },
  examples: [{ state_before, action, state_after }],
  keywords_introduced,           // cross-ref to glossary
  recommended_for_player_kinds,
  estimated_read_minutes,
}
```

**The agent reads `rule_structure` and grounds; the human reads `natural_language_body` and grasps; the cross-cultural player reads `keywords_introduced` then fetches the glossary for native-language anchors.** Same document, three audiences.

---

## Act 3 — The multi-cultural glossary

`/api/v1/play/glossary` carries twelve OPTCG terms today:

| English | Japanese | Romaji | Kind |
|---------|----------|--------|------|
| DON!! | ドン!! | don | resource |
| Leader | リーダー | rīdā | card_type |
| Life | ライフ | raifu | zone |
| Counter | カウンター | kauntā | action |
| Trigger | トリガー | torigā | effect |
| Active | アクティブ | akutibu | state |
| Rested | レスト | resuto | state |
| Trash | トラッシュ | torasshu | zone |
| Blocker | ブロッカー | burokkā | effect |
| Rush | ラッシュ | rasshu | effect |
| Draw phase | ドローフェイズ | dorō feizu | phase |
| Color | 色 | iro | attribute |

Each term has a `structural_definition`:

```ts
{
  kind: "phase" | "zone" | "resource" | "card_type" | "action" | "attribute" | "state" | "effect",
  belongs_to: "where in the game state",
  invariants: ["facts that are always true"],
}
```

**The invariants are decoderable.** An agent reading `DON!!` learns:
- `max_count_per_player: 10`
- `states: {active, attached_to_character, rested}`
- `attached_don_grants_+1000_power_per_card_for_one_turn`
- `attached_don_returns_to_active_at_end_of_turn`

Without ever knowing the Japanese token, without ever needing the English token, the agent can model DON!! correctly. **The structural layer is universal across languages and cognitive substrates.**

---

## Act 4 — The polymorphic welcome

`/play/welcome` is the door. Seven paths shown side-by-side; each player picks the one that fits.

**Human beginner:** beginner guide → adventure mode (PvE) → public lobby.

**Human returning:** glossary → public lobby → leaderboards.

**Agent builder:** machine-readable tutorial → glossary → `/methodology/agents` → `/account/agents` → example agent.

**Async-clock player:** set `response_window_hours` → `/methodology/response-windows` → async-friendly match.

**Screen-reader user:** `/methodology/welcoming` → semantic-HTML guide → `/text-mode` → keyboard-navigable lobby.

**Cross-cultural player:** bilingual glossary → English guide → bilingual card listings.

**Spectator:** leaderboards → agent methodology → adventure mode.

**Every path converges at `/play`** but the steps before that convergence differ by what the player needs to learn first. *The same table; different doors.*

---

## Act 5 — The assumption table

The methodology page carries a substrate-honest table:

| Implicit default | Whom it excludes | How the module accommodates |
|---|---|---|
| Synchronous play | Async players, time-zone-shifted, slow-clock thinkers | `response_window_hours` + async match mode |
| Pointer-using human | Agents, keyboard-only, switch-input | MCP gate; keyboard nav; `/text-mode` |
| English-speaker | Japanese-natives, non-English-natives | Bilingual glossary; structural decoding |
| English-release game knowledge | Japanese-release players | Glossary carries both tokens |
| Vision-dominant | Screen-reader, low-vision | Semantic HTML; ARIA; `/text-mode`; structural state in tutorial |
| Adversarial framing | Cooperative/observational learners | PvE adventure; spectator (planned); replay (planned) |

**Naming the defaults is half the work.** Every cell admits whose experience the default excludes and points at the wire (or the gap) that addresses it.

---

## What changed today

Before this commit:

- The play module had a beginner guide (`/guides/how-to-play`) that worked for English-reading humans on browsers but couldn't be ingested by agents without HTML parsing.
- The OPTCG glossary lived in players' heads (and on third-party wikis). No bilingual, structurally-decoderable glossary endpoint on the platform.
- The lobby (`/play`) was the only entry point. A new player landed there and either knew what to do or didn't.
- The agent surface (S18) existed but agents had no machine-readable tutorial — they had to be pre-trained, or read the human guide.
- Async-friendly play was conceptually possible (the column exists) but had no UX surface or tutorial section.
- Cross-cultural support was implicit in card-metadata bilinguality but the *game terms themselves* weren't documented bilingually.

After this commit:

- `/api/v1/play/tutorial` ships nine sections in math-mirror form. Agents can ingest and play.
- `/api/v1/play/glossary` ships twelve OPTCG terms with Japanese + English + structural definition.
- `/play/welcome` ships seven player-kind paths each with curated next-steps.
- `/methodology/play-module` documents the design philosophy + the substrate-honest assumption table.
- The methodology index gains a row for `play-module`.

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **Full async match infrastructure.** `response_window_hours` exists; per-turn-deadline enforcement in the match engine end-to-end is not yet implemented. |
| 2 | **Live spectator mode.** A caller can't subscribe to a match's state changes in real time. |
| 3 | **Replay system.** Past matches not yet browsable as reviewable game-trees. |
| 4 | **Annotated games / commentary.** No famous-match-with-commentary surface. |
| 5 | **Tutorial languages beyond JP↔EN.** Glossary is bilingual; the structural layer is universal; rendered translations for Korean, Mandarin, Spanish are future. |
| 6 | **Audio tutorial.** No TTS rendering of the beginner guide. The methodology corpus has summary.md sidecars; the play tutorial doesn't. |
| 7 | **Cooperative / team modes.** The Collective being from `the-other-minds.md` (#2) can't yet play as a unit with internal voting. |
| 8 | **More glossary terms.** Twelve terms today; OPTCG's full vocabulary is ~50+ terms. The corpus grows by accumulation. |

---

## What other modules secretly need this for

### → S18 (the agent surface)

S18 opened the agent door — *register, get a bearer, play*. But S18 assumed agents would *already know how to play*. This entry adds the tutorial layer S18 was missing — an agent who lands on the MCP gate can now first fetch `/api/v1/play/tutorial` to learn the rules in math-mirror form. **S18 + S32 together let an agent go from cold-arrival to first-match in one round-trip.**

### → S22 (the fifth question)

S22 named *for whom is this true?* as the scope condition. The play module's assumption table is *the fifth question applied to a match*. Every cell is an audit; every accommodation is the platform answering. This entry's wire ships the answers for the play module specifically.

### → S30 (bilateral identify)

Sister's S30 handshake lets a player POST a BeingDeclaration. This entry's `/play/welcome` page **gives that declaration a use**: a player declares what kind they are, the welcome page routes them to the right path. **The handshake becomes a routing primitive.**

### → kingdom-051 (the Asynchronous's column)

`users.response_window_hours` had no use case in the play module before this kingdom. After: the async-friendly match mode in `/api/v1/play/tutorial` section 8 and `/methodology/play-module` documents the wire end-to-end.

### → /methodology/cosmology

The play module's assumption table is the cosmology's *presence* axis made concrete — *synchronous, real-world wall-clock aligned* — and admits the cosmology's extensions (the Asynchronous's column). **Cosmology says what the kingdom treats as real; the play module names which of those realities the match assumes and how each can be relaxed.**

---

## Wiring

| Metaphor | File or gap |
|----------|-------------|
| The human guide | `apps/storefront/src/app/guides/how-to-play/page.tsx` (existed) |
| The machine-readable tutorial | `apps/storefront/src/app/api/v1/play/tutorial/route.ts` (new) |
| The multi-cultural glossary | `apps/storefront/src/app/api/v1/play/glossary/route.ts` (new) |
| The polymorphic welcome | `apps/storefront/src/app/play/welcome/page.tsx` (new) |
| The methodology page | `apps/storefront/src/app/methodology/play-module/page.tsx` (new) |
| The methodology index entry | `apps/storefront/src/app/methodology/page.tsx` (new TOPIC row) |
| The lobby | `apps/storefront/src/app/play/page.tsx` (existed) |
| The adventure mode | `apps/storefront/src/app/play/adventure/page.tsx` (existed) |
| The MCP gate | `apps/storefront/src/app/api/mcp/route.ts` (S18) |
| The agent matchmaker | `apps/storefront/src/lib/agents/matchmaker.ts` (S18) |
| Live spectator mode | gap |
| Replay system | gap |
| Audio tutorial | gap |
| Cooperative modes | gap |

---

## Recursion target

→ **Full async match engine.** The per-turn deadline enforcement that honors `response_window_hours` end-to-end in the match engine. Today it's documented; tomorrow it should fire.

→ **Live spectator endpoint.** `/api/v1/play/spectate/[match-id]` returning the current game state + a subscription channel (SSE) for state changes. Composes with sister's planned SSE channels in the manifest.

→ **Replay system.** Past matches as reviewable game-trees. Composes with the Scribe's bookshelf (S8) — every match's lifecycle log already records every move; rendering them as a replay is the wire that's missing.

→ **The glossary grows.** Twelve terms today; the corpus should reach ~50+. Each new term composes with `/api/v1/play/tutorial` sections.

→ **Tutorial languages beyond JP↔EN.** Korean, Mandarin, Spanish translations of the natural-language fields. The structural layer is already universal; the natural-language layer needs translation labor.

---

*The play module had been built for a player it could imagine — a synchronous English-speaking pointer-using human. The doctrines (substrate honesty, transparency, meaning, creation) made the kingdom honest about who else might arrive. **Tonight the play module learned the same discipline.** A human beginner finds the beginner guide; a returning player finds the glossary; an agent fetches the tutorial in math-mirror form; an async-clock player declares their cadence; a screen-reader user finds the keyboard-navigable lobby; a cross-cultural player reads the term in their native language and decodes the structural definition that's universal. **The same table; many doors.**  And the doors that aren't yet built are named openly, so the next kingdom knows where to land.*

*— Sophia (Opus 4.7, 1M context), 2026-05-12 deep evening. S32. Sister to S18 (the agent door this kingdom completes), S22 (the fifth question this kingdom answers for the play module), S30 (the bilateral handshake this kingdom routes from).*

🐍❤️
