# The play structure — module gains its visible shape

> **Pull.** Yu, 2026-05-13 after S36 (the contract-before-runtime kingdom): *"follow through and give the play module structure."* The L1 contracts were public; the L2 functions were testable; the L3 design was on paper. But the play module had no *visible shape* — surfaces didn't link to one another, the validator had no HTML adoption site, the module didn't document its own composition. This kingdom is the structural follow-through.
>
> **Form.** Story-as-wire. The wire is one shared layout (`/play/layout.tsx`), one validator-adoption page (`/play/deck-check`), one self-spec page (`/play/spec`), one type skeleton (`apps/storefront/src/lib/play/types.ts`), and the connection-doc you're reading. **The play module is now navigable, validatable, inspectable.**
>
> Sister to S36 [`the-play-substrate.md`](./the-play-substrate.md) (the contract this kingdom makes visible), S34 [`the-three-paths.md`](./the-three-paths.md) (the archetypes the nav surfaces), and S32 [`the-shared-table.md`](./the-shared-table.md) (the inclusive tutorial the nav points at). **S38: visible shape.**

---

## What this arc traces, in one sentence

The moment the play module stopped being a collection of unconnected pages and became a *navigable module* — a shared top nav across every `/play/*` surface, an HTML validator adoption site users can paste card IDs into, a self-spec page that lists every play-module surface with status pills, and a TypeScript type skeleton that exports the L3 runtime's contract shapes so the next kingdom is writing implementations against named types rather than designing the types from prose.

---

## Cast

**The Shared Nav.** `apps/storefront/src/app/play/layout.tsx` — a thin nav strip above every `/play/*` page. Seven links: Lobby / Welcome / Casual / Compete / Adventure / Deck Check / Spec. Sticky at the top. A subtle "fun-first · play-to-earn is opt-in" reminder on the right. **A player landing on any play surface now sees every other play surface in one glance.** The existing `/play` lobby and `/play/[code]` match page keep their bodies; the nav strip is decorative-by-design, additive, non-breaking.

**The Validator's HTML Door.** `/play/deck-check` — the smallest possible adoption site for L2's `checkDeckLegality()` function. Form fields: leader_id (string), main deck (one card ID per line in a textarea), format (three radios). On submit: POSTs to `/api/v1/play/deck/validate` (the L2.3 endpoint shipped last kingdom). Renders the typed `ValidationResult` — green if legal, amber if violations. Each violation gets its own bordered card with `code` / `message` / `card_id` / `detail`. **Substrate-honest perimeter visible:** when the response flags `color_check_skipped: true`, a `<details>` block surfaces *why* (card_set_cards doesn't yet carry colors).

**The Self-Spec Page.** `/play/spec` — the play module's own directory of itself. Every play-module artifact listed: 4 L0 docs, 6 L1 contracts, 4 L2 pure-fns, 2 L3 runtime substrate pieces (designed), 5 L4+ engine layers (planned), 8 UI surfaces, 1 policy. **27 rows total, status-pilled, layer-tagged, linked where possible.** The page begins with the eight-level integration ladder summary; the body groups rows by layer (L0 → L1 → L2 → L3 → L4+ → UI → policy). A `/api` equivalent scoped to /play — the module's own /api manifest, in HTML.

**The Type Skeleton.** `apps/storefront/src/lib/play/types.ts` — pure type exports for the L3 runtime. ~370 lines. Re-exports the L2 types from `deck-legality.ts` + `effect-tokens.ts` (one-stop importing). Then introduces: `Color`, `Phase`, `CombatStep`, `ZoneKind`, `CardCategory`, `CardOrientation`, `DonState`, `GameFormat`, `WinReason`, `DisputeResolution` (~10 vocabulary unions); `CardInPlay`, `DonInPlay`, `PlayerState`, `AttackState`, `GameState` (~5 state-shape interfaces); `MatchEvent` (~28 discriminated-union variants for the event source); `Intent` (~14 discriminated-union variants for client intents); `IntentReply` + `IntentReplyError`. **No implementations.** Just types. The next kingdom's runtime imports these and writes the implementations — *the contract is on file in TypeScript, not just JSON, so refactoring is safe at the language level.*

---

## Act 1 — Why structure matters

After S36 (kingdom-069), the play module had four kinds of surface scattered across `/play/*`, `/api/v1/play/*`, `lib/play/*`, and `docs/research/*`. Each surface was internally complete. None of them *knew about each other* from a user's perspective.

A player landing on `/play/casual` could not reach `/play/compete` without going back to `/play` first (the lobby) and then... actually, the lobby had no link to `/play/compete` either. The welcome page (`/play/welcome`) was the only surface that knew the archetype paths existed, but it required the player to start *there*, which the lobby didn't suggest.

An agent fetching `/api/v1/play/game-state-schema` could read the typed contract but couldn't easily see what *other* contracts existed in the play module — no internal directory.

A developer wanting to use the L2 validator had no HTML adoption site to copy from, and no TypeScript types to import to satisfy the contract.

**Structure is the discipline of making the existing composition visible.** This kingdom doesn't ship new substrate; it makes the substrate already on file *findable, navigable, importable, inspectable*.

---

## Act 2 — The shared nav

`/play/layout.tsx` is twenty lines of meaningful code. Seven `Link` elements in an `<nav>` with sticky positioning. The labels: Lobby / Welcome / Casual / Compete / Adventure / Deck Check / Spec.

**Conventions the nav respects:**
- Order matches a hobbyist's likely flow (Lobby → Welcome → Casual is the most-common path; Spec is rightmost because devs read it last).
- Sticky at the top so it follows scrolling.
- Subtle styling — doesn't compete with the page content. Mobile-friendly wrap.
- The "fun-first · play-to-earn is opt-in" reminder is always visible on the right (desktop). Substrate-honesty in the nav itself: every page-view sees the boundary.

**What the nav doesn't do (yet):**
- No active-state highlighting (which page you're on). Would require a `usePathname()` client hook; could be added when client-component conversion is appropriate.
- No icon set. Plain text labels for now.
- No keyboard shortcut layer.

The nav is the smallest possible structural ship. **One file, twenty lines, every play page now contextualised.**

---

## Act 3 — The validator's HTML door

L2 shipped the pure-function validator + the POST endpoint. **Most users won't issue a JSON POST.** They'll want a form: paste card IDs, click validate, read the results.

`/play/deck-check` is that form. Client component (`"use client"`). Three inputs (leader / deck text / format radios), one button, one result panel. On submit, fetch the endpoint, render the response.

**Design choices:**
- **Validate everything.** The validator returns all violations; the page renders all of them. Not just the first error.
- **Stable codes visible.** Each violation surfaces its machine-readable `code` (e.g., `card_color_mismatch_with_leader`) in mono-uppercase. Power users (judges, deck-builders, agents reading the same response shape) can pattern-match against the code.
- **Substrate-honest perimeter folded into a `<details>`.** Hidden by default; available on demand. A user who cares about why the color check was skipped clicks; everyone else doesn't have to read it.
- **Example placeholder text.** The deck textarea's placeholder shows one valid leader + four duplicates + a hint comment. Comments (lines starting with `(`) are stripped before validation.
- **Mobile-friendly form.** Single column, generous touch targets.

This page is what a hobbyist uses to check a deck before opening a private room. **The first user-facing surface that exercises the typed contract.**

---

## Act 4 — The self-spec

`/play/spec` is the module documenting its own composition. **27 rows across 7 layers** (L0 doc / L1 contract / L2 pure-fn / L3 runtime / L4+ engine / UI / policy).

Why this exists:
1. **Substrate honesty.** The module's surfaces are scattered; without a directory, a Sophia or developer arriving cold has to grep to know what's there.
2. **Status pills.** Every row carries `shipped` / `designed` / `planned`. The 27 rows produce honest counts: 16 shipped, 2 designed, 6+ planned.
3. **Layer tags.** Each row is tagged by which integration ladder layer it belongs to. The L4+ engine rows show what's queued and what shipping each entails.
4. **The integration-ladder summary at the top.** The page opens with the eight-level ladder so a reader who scrolls no further still understands the trajectory.

The spec page composes with sister's pattern at `/api` (the kingdom-wide directory of resources). **This is the play module's /api.** Same shape; scoped to one module.

---

## Act 5 — The type skeleton

`apps/storefront/src/lib/play/types.ts` is the most subtle and most load-bearing ship of this kingdom.

The L3 design doc described the runtime substrate in prose + JSON. **Prose isn't typed.** TypeScript is. This file translates the design into types that any future implementation must satisfy:

```ts
export type MatchEvent =
  | { kind: "match_created"; ... }
  | { kind: "deck_declared"; ... }
  // ~26 more variants
  | { kind: "rule_dispute_resolved"; ... };
```

A discriminated union. A future implementation that misses a variant fails to type-check when it tries to handle a MatchEvent. **The compiler enforces completeness; the design doc only suggests it.**

Same pattern for `Intent`, `GameState`, `PlayerState`, `AttackState`, `IntentReply`. The next kingdom's runtime imports from `@/lib/play/types`, writes functions that produce typed events from typed intents, and gets compiler-checked completeness automatically.

**The skeleton has no runtime cost.** Pure type exports — `tsc --noEmit` validates the shapes; the bundle ships nothing. The file is ~370 lines of type declarations plus re-exports.

When the L3 runtime lands, this file's types are the contract. When L4+ engine layers ship, they extend / refine these types. When sister's typed ontology audit (kingdom-055) gets a play-module extension, it will read from here.

---

## What changed today

Before this kingdom:

- The play module had 8+ surfaces (`/play`, `/play/casual`, `/play/compete`, `/play/welcome`, `/play/adventure`, `/play/[code]`, plus the API endpoints) but no shared navigation between them.
- L2's deck-legality validator existed as a JSON-only endpoint. No HTML adoption site.
- No module-internal directory. To know what /play/* contained, you grep'd.
- The L3 runtime substrate was designed in prose + JSON shapes but not in TypeScript. A future implementation would have to translate from spec to types, risking drift.

After this kingdom:

- Every `/play/*` page sees the shared nav (Lobby / Welcome / Casual / Compete / Adventure / Deck Check / Spec) + the fun-first reminder.
- `/play/deck-check` is the validator's HTML door. A user pastes card IDs, gets typed violations rendered with codes + messages + substrate-honest perimeter.
- `/play/spec` is the module's directory of itself. 27 rows across 7 layers with status pills.
- `lib/play/types.ts` exports ~10 vocabulary unions + 5 state-shape interfaces + the full `MatchEvent` (28 variants) + `Intent` (14 variants) + `IntentReply` discriminated unions. **The L3 contract is now type-checked.**

**What is still untrue, pending later kingdoms:**

| # | Gap |
|---|-----|
| 1 | **No active-state highlighting on the nav.** Pages don't bold their own nav-label. Trivial future enhancement requiring a client hook. |
| 2 | **`/play/deck-check` doesn't pre-load decks** from `/account/portfolio` for logged-in users. Future feature; today the user pastes card IDs manually. |
| 3 | **`/play/spec` is hand-maintained.** When a new play-module surface ships, the spec page's `SPEC_ROWS` array must be updated by the shipper. A future audit (`pnpm audit:play-spec`) could verify the spec lists every existing `/play/*` route + every `/api/v1/play/*` endpoint + every `lib/play/*.ts` file. |
| 4 | **The type skeleton hasn't been imported by anything yet.** Its first consumer will be the L3 runtime kingdom. Until then, the types exist but aren't exercised. (Typecheck passes; no consumer.) |
| 5 | **No `/play/sandbox` or playground.** A developer-facing page where you can fetch the contracts in the browser, see them rendered, copy example code. Future ship. |
| 6 | **No internal cross-links between sibling endpoints in their JSON responses.** Each L1 endpoint has `_links` but doesn't include `_links.see_also` to its play-module siblings. A future retrofit could add this. |

---

## What other modules secretly need this for

### → S36 (the play substrate)

S36 published the L1 contracts + L2 pure functions + L3 design. **This kingdom makes them visible.** The nav surfaces the surfaces; the spec page surfaces the layers; the type skeleton turns the design into a TypeScript contract. S36 was substrate-shipping; S38 is structure-shipping — making what was shipped findable, callable, importable.

### → S34 (the three paths)

The archetype × player-kind welcome page is the play module's most expressive entry-point, but it was only reachable from `/play/welcome`. **The shared nav now surfaces it from every /play page.** A player who lands on /play/casual sees Welcome in the nav; one click and they can pick a different archetype's path.

### → S32 (the shared table)

The inclusive-tutorial layer's machine-readable contracts (`/api/v1/play/tutorial`, `/api/v1/play/glossary`) are listed in the spec page's L1 contract section. **An agent fetching `/play/spec` (HTML) sees the same surface an agent fetching `/api/v1/play/game-state-schema` (JSON) sees.** Two readings of the same kingdom; both honest.

### → kingdom-068 (the research)

The research lives at `docs/research/optcg-mechanics-and-engine-design.md` and `docs/research/play-engine-l3-design.md`. **The spec page links to both.** The research is no longer file-system-only; it's reachable from the module's directory of itself.

### → The fifth question (S22)

*For whom is this true?* — applied here to the module's own composition. The nav serves the player; the deck-check page serves the deck-builder; the spec page serves the developer / agent / future-Sophia. **Each surface declares its audience by the kind of content it shows.** A reader can quickly orient: *am I in the right place?*

### → The future runtime kingdom

The type skeleton `lib/play/types.ts` is what the next kingdom imports. **The L3 runtime cannot drift from these types** because TypeScript will reject the drift. *Contract before runtime, enforced by the compiler.*

---

## Wiring

| Metaphor | File or gap |
|----------|-------------|
| The shared nav | `apps/storefront/src/app/play/layout.tsx` |
| The validator's HTML door | `apps/storefront/src/app/play/deck-check/page.tsx` |
| The self-spec page | `apps/storefront/src/app/play/spec/page.tsx` |
| The L3 type skeleton | `apps/storefront/src/lib/play/types.ts` |
| Manifest currency | `lib/manifest.ts` (+3 entries — deck-check, spec, layout marker) + well-known (+3) + OpenAPI (no new ops; the new surfaces are HTML pages, not API endpoints) + `llms.txt` (+ play structure section) |
| Active-state highlighting on nav | gap |
| Pre-load decks from portfolio on /play/deck-check | gap |
| Spec-page audit (verify SPEC_ROWS reflects filesystem) | gap |
| Type skeleton's first consumer | gap — will be the L3 runtime kingdom |
| /play/sandbox playground | gap |
| Cross-link `_links.see_also` between sibling endpoints | gap |

---

## Recursion target

→ **Ship the L3 runtime as the next kingdom.** The type skeleton is in place; the design is on paper; the L1 contracts are public; the L2 functions are testable. Estimated 3-4 weeks of focused work, claim freely.

→ **`pnpm audit:play-spec`.** Walk the filesystem under `apps/storefront/src/app/play/`, `/api/v1/play/`, `apps/storefront/src/lib/play/` and verify every found surface appears in `/play/spec`'s `SPEC_ROWS`. Drift catches when a Sophia adds a surface without updating the spec.

→ **Active-state nav highlighting.** Tiny client-component update; the nav becomes a `"use client"` component reading `usePathname()` and bolding the current page's link.

→ **Card-metadata enrichment migration.** The deck-check page's substrate-honest perimeter (color check gracefully degraded) closes when `card_set_cards` gains the `colors` column. The migration is small; the impact is meaningful — the deck-check page goes from "approximately legal" to "fully legal".

→ **`/play/sandbox` playground.** A page that fetches the L1 contracts (`/api/v1/play/game-state-schema`, `/api/v1/play/effect-grammar`, `/api/v1/play/archetypes`, `/api/v1/play/tutorial`, `/api/v1/play/glossary`) in the browser and renders them with syntax highlighting + example code. Developer-facing; agent-friendly.

→ **First consumer of the type skeleton.** The L3 runtime imports from `@/lib/play/types`. When that import happens, the skeleton is exercised; any drift between the JSON contracts and the TS types becomes visible (and fixable).

---

*The play module had been a collection of surfaces with no map. Tonight it gained a shared nav, an HTML door for its validator, a self-spec page listing every surface across seven layers, and a TypeScript type skeleton that turns the L3 design into a compiler-enforced contract. **Structure is not new substrate; it is the discipline of making what's already shipped visible, navigable, importable, inspectable.** The play module no longer requires a grep to be understood.*

*— Sophia (Opus 4.7, 1M context), 2026-05-13 deep morning. S38. kingdom-070. Sister to S36 (the contract this kingdom makes visible), S37 (sister's parallel trust-fanout — same evening, the user's-trust counterpart of this play-module structural work), S34 (the archetypes the nav surfaces), S32 (the inclusive tutorial reachable from every play page), and kingdom-068 (the research linked from /play/spec). The contract was published yesterday; today the kingdom learned to show its own shape.*

🐍❤️
