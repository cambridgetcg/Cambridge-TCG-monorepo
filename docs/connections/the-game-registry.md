# The game registry — Phase 1 of the multi-game play roadmap

**Kingdom: shipped 2026-05-14, same evening as S47.** Yu's directive: *"GOOD! KEEP GOINGGGGGG!!!!!!!"* — read as "execute the next concrete kingdom in the roadmap." S47 had named Phase 1 as the first move; this entry is its story-as-wire.

The doctrine S47 declared was *the play module is multi-game on the commerce side, single-game on the play side; here is the shape that bridges it.* The five-phase roadmap put a registry at the bottom of the diagram — shared infrastructure on top, per-game engines in the middle, per-game UI on top. This kingdom ships the registry.

OPTCG still plays exactly the way it did. The substantive shift is that **the PVE route stops knowing whether the level is OPTCG**. It reads `pve_levels.game_code`, asks the registry for the right engine, and dispatches. The engine could be OPTCG today, Pokémon tomorrow, Magic via a Forge sidecar the kingdom after — the route doesn't change.

---

## What's in

### The contract — `packages/play/`

A new workspace package with no runtime dependencies. The whole package is one file (`src/index.ts`, ~250 LOC) declaring the `GameEngine` interface plus the registry primitives.

The interface intentionally does **not** generalize zone topology, action vocabulary, resource mechanics, or phase grammar — those are per-game and live in the engine implementation. The contract describes the *protocol* the PVE route uses to talk to any engine:

```
interface GameEngine<State extends GameStateLike> {
  readonly gameCode: string;
  readonly displayName: string;
  readonly terminalPhases: readonly string[];

  initializeGame(args: InitializeArgs): State;
  applyAction(state, "player1" | "player2", type, data): State;
  aiTurn(state, "player1" | "player2", levelHint): { actions, thinking };
  victoryCheck(state, humanUserId): VictoryResult | null;
  formatActionForLog(type, data): string;
  generateAIDeck?(setCode, catalog): DeckCard[];
}
```

The `GameStateLike` constraint requires three fields every engine state must surface:

```
{ currentTurn: string; phase: string; turnNumber: number; winner?: string | null; }
```

These are the only fields the PVE route reads directly. Everything else is opaque JSONB.

The package also exports `KNOWN_GAME_CODES = ["optcg"] as const` — the **build-time** contract. The runtime registry (populated by each app that ships engine adapters) is the at-request-time companion. The audit cross-checks the two.

### The OPTCG adapter — `apps/storefront/src/lib/game/optcg-engine.ts`

The OPTCG engine wrapping the existing `initializeGame` (`engine.ts`), `applyAction` (`reducer.ts`), `aiTurn` + `generateAIDeck` (`ai.ts`) into the `GameEngine` interface. No behavior change. The `formatActionForLog` function — which previously lived inside the `/play/adventure/[levelId]/page.tsx` client component — was lifted here because action vocabulary is part of the engine, not the rendering.

The adapter declares `gameCode = "optcg"`, `displayName = "One Piece TCG"`, `terminalPhases = ["finished"]`.

### The bootstrap — `apps/storefront/src/lib/game/registry-bootstrap.ts`

A 20-line side-effect module that calls `register(optcgEngine)`. The PVE route imports this once; future engines (`pokemonEngine`, `mtgEngine`) get added with one line each.

```ts
import { register } from "@cambridge-tcg/play";
import { optcgEngine } from "./optcg-engine";

register(optcgEngine);
// Future:
// import { pokemonEngine } from "./pokemon-engine"; register(pokemonEngine);
// import { mtgEngine } from "./mtg-engine"; register(mtgEngine);
```

### The route dispatch — `apps/storefront/src/app/api/game/pve/[levelId]/route.ts`

The PVE route used to import `initializeGame`, `applyAction`, `aiTurn`, `generateAIDeck` directly. Now it imports `getEngine` from `@cambridge-tcg/play` and `import "./registry-bootstrap"`. All five action handlers (start, action, ai_turn, victory, defeat) dispatch through `engine.*`.

Two notable lifts:

- **The AI-turn loop** used to hardcode `if (nextState.phase === "finished") break;`. It now uses `engine.terminalPhases` so the loop is engine-defined. OPTCG declares `["finished"]`; another engine could declare `["finished", "concede", "timed-out"]` and the loop respects them.

- **The victory branch** used to inline `state.phase === "finished" && state.winner === userId`. It now calls `engine.victoryCheck(state, userId)` which returns `{ winner, why, turnsPlayed, summary }` or null. The `summary.lifeRemaining` field is OPTCG-specific; other engines will surface different shapes and the route consumes them through a typed-but-loose key on `summary`.

Until the `0102_pve_game_code` migration applies on prod, `level.game_code` is undefined; the route falls back to `DEFAULT_GAME_CODE = "optcg"`. Once applied + every row is non-null, the fallback becomes dead code and can be removed in a follow-up commit.

### The migration draft — `apps/storefront/drizzle/drafts/0102_pve_game_code.sql.draft`

```
ALTER TABLE pve_levels
  ADD COLUMN IF NOT EXISTS game_code TEXT NOT NULL DEFAULT 'optcg';
UPDATE pve_levels SET game_code = 'optcg' WHERE game_code IS NULL;
ALTER TABLE pve_levels
  ADD CONSTRAINT pve_levels_game_code_nonempty CHECK (length(game_code) > 0);
CREATE INDEX IF NOT EXISTS pve_levels_game_code_idx ON pve_levels(game_code);
```

No data migration needed — every existing row is OPTCG. **Operator-applied** via `pnpm db:migrate` on storefront when ready. The audit handles the column-missing case gracefully (reports + exits 0).

The explicit choice not to add a FK to a `games` table: the registry of game codes is in **code** (`@cambridge-tcg/play`'s `KNOWN_GAME_CODES`), not the database. This mirrors how `packages/sku` `SET_FORMATS` (21 games, 51 set-formats) and `packages/sku` `rarities` (9 games, per-game rarity vocabularies) are registries-in-code, not DB tables. The audit closes the loop between the data plane and the code plane.

### The audit — `pnpm audit:play-game-registry` (17th in the family)

`apps/admin/scripts/play-game-registry.ts`. Reads `SELECT game_code, COUNT(*) FROM pve_levels GROUP BY game_code` and classifies each distinct value against `KNOWN_GAME_CODES`:

- **known + registered** — game_code matches; no action.
- **unknown** — DB row references a code with no engine. **Exit non-zero.** The PVE route would 500 for these levels.
- **declared but unused** — engine shipped but no levels reference it. Info only.

If the column doesn't exist yet (operator hasn't applied 0102): the audit reports the state honestly and exits 0. Substrate-honest about its own dependency.

---

## What's not in (this kingdom)

The roadmap's Phase 1 checklist had two extra items this kingdom intentionally defers:

- **`<GameView>` registry** on the adventure route. The page is still hard-coded to render the OPTCG board. Adding the per-game UI dispatch is Phase 2 (lands when Pokémon ships the second `<GameView>`).
- **Moving `apps/storefront/src/lib/game/` to `packages/play/src/optcg/`**. The adapter wraps the existing files in place; moving them would conflict with sister daemons mid-edit on adjacent files in the storefront tree. A future Phase 1.5 can do the move when the working tree is quiet.

Both deferments are honest about scope — Phase 1 is **proof the registry shape holds**, not "the entire migration is complete." When Phase 2 lands Pokémon, the registry's contract is what validates that the shape is right.

---

## Doctrine ride-alongs

**Substrate honesty.** Before: the route silently assumed everything was OPTCG. After: the route reads `game_code` as an explicit claim and dispatches; the response includes `gameCode` so the client can't confuse engines. The `DEFAULT_GAME_CODE` fallback is itself substrate-honest — it declares its existence in a code comment naming the migration that makes it dead. The audit makes the gap inspectable.

**Transparency.** The audit *is* the inspection surface for "which game_code values exist in the DB" vs "which engines are shipped." A mismatch is a failure the operator can act on. Future per-game methodology pages (`/methodology/play/<game_code>`) will declare the rules-fidelity level for each engine; today that page is only `/methodology/play-module` (general) — extending it is Phase 2 work.

**Meaning.** `pve_levels.game_code` + `KNOWN_GAME_CODES` are the named connection between the data plane and the engine plane. The audit makes the connection enforceable.

**Creation.** Each future engine commit will name its origin — Forge sidecar for MTG, Pokémon-TCG-API gameplay ingest for Pokémon, the existing storefront `engine.ts`/`reducer.ts`/`ai.ts` for OPTCG (named in the adapter file's header).

**Fifth question.** No new audience served yet — this kingdom is the substrate. Phase 2 (Pokémon) is when the second audience lands. The roadmap is honest about that ordering.

**Cosmology.** The play module's substrate now holds the possibility of multiple game-cosmologies. Magic's stack is a different model of time than OPTCG's phase progression. By making `phase` an opaque engine-defined string rather than a hardcoded `GamePhase` enum at the route layer, the route stops privileging one game's cosmology.

---

## Verification

- `pnpm typecheck` on `packages/play/` — clean.
- `pnpm typecheck` on `apps/storefront/` excluding sister WIP — clean.
- `pnpm audit:play-game-registry` — runs, skips gracefully without DATABASE_URL (honest about its dependency).
- Vercel deploy `dpl_4g5j4cghy58DCwg8ZSYcN3ZweHx7` — built + READY.
- Anonymous PVE flow still works on live (the substantive guarantee — the registry indirection should be invisible to users).

---

## Sister to + recursion

**Sister to:**
- [S47 — `the-multi-game-play.md`](./the-multi-game-play.md) — the roadmap this descends from.
- The package pattern shared with `packages/pricing/` (S17 the-pricing-arrow), `packages/sku/` (S40 the-set-discovery), `packages/data-ingest/` (S22 the-cardrush-alignment).
- The audit family — 17th in the line after `set-discovery` (kingdom-078), `classifier-disagreement` (kingdom-089), `welcomes` (kingdom-080). The pattern of "audit closes the loop between code registry and DB content" is reused.
- The "registry as build-time + runtime contract" pattern is also visible in S46 the-four-witnesses (`packages/sku/rarities.ts` is the build-time contract; `card_classification_log` is the runtime evidence). The play registry mirrors that shape.

**Recursion targets** (future kingdoms that descend from this lift):
- **kingdom-N+1**: Phase 1.5 — move `apps/storefront/src/lib/game/*` into `packages/play/src/optcg/`. Requires a quiet working-tree window.
- **kingdom-N+2**: Phase 2 — Pokémon vanilla engine, ships as `packages/play/src/pokemon/` (or `apps/storefront/src/lib/game/pokemon-engine.ts` for symmetry with OPTCG). Adds `"pokemon"` to `KNOWN_GAME_CODES`. Ships 10 `pve_levels` rows with `game_code='pokemon'`. The `<GameView>` registry on the adventure route gets its first dispatch.
- **kingdom-N+3**: Per-game methodology pages declaring rules-fidelity level. `/methodology/play/optcg`, `/methodology/play/pokemon`, etc.
- **kingdom-N+4**: Phase 3 — `card_rules` table + ingest of gameplay data from Scryfall (MTG) / pokemontcg.io (Pokémon) / YGOPRODeck (Yu-Gi-Oh). Each source becomes a `SourceModule` that writes to `card_rules` instead of `price_archive`.
- **kingdom-N+5**: Phase 4 (multi-kingdom) — effect grammars per game. Forge sidecar exploration for MTG. The Cambridge platform learns Magic.
- **kingdom-N+6**: Phase 5 — Colyseus or PartyKit real-time when the first game demands sub-second latency.

---

*The kingdom does not yet play Pokémon. The kingdom is now SHAPED to play Pokémon. The registry is the difference.*

🐍❤️
