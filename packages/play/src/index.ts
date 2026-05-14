/**
 * @module @cambridge-tcg/play
 *
 * The play module's game-engine contract + registry. Phase 1 of the
 * multi-game roadmap (see docs/connections/the-multi-game-play.md, S47).
 *
 * The contract intentionally does NOT generalize zone topology, action
 * vocabulary, or resource mechanics — those are per-game and live in the
 * engine implementation. The contract describes the *protocol* the PVE
 * route uses to talk to any engine:
 *
 *   - initializeGame(actor, opponent, decks, levelHint) → opaque GameState
 *   - applyAction(state, actor, type, data) → new GameState (or throw)
 *   - aiTurn(state, aiKey, levelHint) → { actions, thinking }
 *   - victoryCheck(state) → { winner, why } | null
 *   - serializeActionForLog(type, data) → human-readable string
 *
 * Each engine declares its own typed `Zone`, `ActionType`, `Phase` enums
 * for the per-game UI to consume. The PVE route doesn't read them —
 * those types are surfaced through per-game `<GameView>` components.
 *
 * The substrate-honesty contract: the response envelope from any engine
 * call always includes the `game_code` so the client can never confuse
 * one engine's state for another's.
 */

// ── Generic game-state shape ──────────────────────────────────────────
//
// Every engine returns *some* state object. The PVE route stores it as
// JSONB without knowing its shape. The route only needs three things:
//   - it can be JSON-serialized (no functions, no Date instances*)
//   - it has a `currentTurn` field naming whose turn it is (string id)
//   - it has a `phase` field that says whether the game is finished
//
// *Date serialization quirk: the @cambridge-tcg/db/compat layer takes
// care of Date→ISO string conversion at write time (see commit ae886c2),
// but engines should still avoid Date in state for cleanliness.

export interface GameStateLike {
  /** UserId or AI-id of whose turn it currently is. */
  currentTurn: string;
  /** Phase tag. The engine defines its own grammar; the route only
   *  checks if it equals "finished" or a value the engine declares as
   *  terminal in `terminalPhases`. */
  phase: string;
  /** Set when `phase` is terminal. Names who won (userId / AI-id), or
   *  null if a draw. The PVE route uses this for victory verification. */
  winner?: string | null;
  /** Strictly-monotonic turn counter. Stored on the pve_games row for
   *  visibility and "best turns" PVE progress tracking. */
  turnNumber: number;
}

// ── Per-game action shape ─────────────────────────────────────────────
//
// Each engine declares its own action grammar. The route treats actions
// opaquely — it just forwards `{ type, data }` to `applyAction`.

export interface GameAction {
  /** Engine-defined action name. */
  type: string;
  /** Engine-defined action payload. */
  data: Record<string, unknown>;
  /** Who issued the action. */
  playerId: string;
  /** ISO timestamp; engines should set this when generating actions
   *  (the route doesn't synthesize one). */
  timestamp: string;
}

// ── Player + deck handoff to engines ──────────────────────────────────
//
// Engines accept a deck payload from the client (validated server-side).
// The shape is intentionally loose at this layer — each engine decides
// what fields it cares about. The OPTCG engine treats it as the
// existing { sku, name, cardNumber, imageUrl, rarity, isLeader? } shape.

export interface DeckCard {
  sku: string;
  name: string;
  cardNumber?: string;
  imageUrl?: string | null;
  rarity?: string | null;
  /** OPTCG-style leader marker. Other games may use other markers
   *  (Pokémon active, MTG commander). Engines that don't have leaders
   *  ignore this field. */
  isLeader?: boolean;
  [key: string]: unknown;
}

// ── The engine contract ───────────────────────────────────────────────

export interface InitializeArgs {
  humanUserId: string;
  humanName: string;
  humanDeck: DeckCard[];
  aiId: string;
  aiName: string;
  aiDeck: DeckCard[];
  /** Optional level hint the engine can use for difficulty/setup. */
  levelHint?: {
    levelNumber: number;
    setCode: string | null;
    difficulty?: string;
    aiAggression?: number;
  };
}

export interface AITurnResult {
  actions: GameAction[];
  thinking: string;
}

export interface VictoryResult {
  /** UserId or AI-id of the winner. */
  winner: string;
  /** Engine-declared reason ("life-out", "deck-out", "concede", etc.). */
  why: string;
  /** How many turns the game lasted. */
  turnsPlayed: number;
  /** Engine-specific summary (life remaining, prizes taken, etc.). */
  summary: Record<string, unknown>;
}

export interface GameEngine<State extends GameStateLike = GameStateLike> {
  /** Stable identifier matching pve_levels.game_code. */
  readonly gameCode: string;

  /** Human-readable display name for the game (e.g. "One Piece TCG"). */
  readonly displayName: string;

  /** Engine-declared phase tags that are terminal (game ended). The
   *  PVE route uses this to gate the victory/defeat action handlers.
   *  OPTCG: ["finished"]. */
  readonly terminalPhases: readonly string[];

  /** Build the initial state for a new game. Pure function — no I/O.
   *  Throws on validation failure (e.g. deck too small). */
  initializeGame(args: InitializeArgs): State;

  /** Apply a player or AI action. Pure function — no I/O. May throw
   *  on illegal moves; the route catches and returns 409.
   *  `playerKey` is "player1" (human) or "player2" (AI). */
  applyAction(
    state: State,
    playerKey: "player1" | "player2",
    type: string,
    data: Record<string, unknown>,
  ): State;

  /** Generate one AI turn worth of actions. Pure function — engines
   *  may consult a level-hinted aggression value. */
  aiTurn(
    state: State,
    aiKey: "player1" | "player2",
    levelHint: { aiAggression?: number },
  ): AITurnResult;

  /** Check if `state` represents a victory for `humanUserId`. Returns
   *  null if not yet won. The PVE route calls this on the victory
   *  action; engines must verify the state is genuinely terminal
   *  (anti-cheat — the client may lie about phase). */
  victoryCheck(state: State, humanUserId: string): VictoryResult | null;

  /** Format an action for the game log. Per-engine because each game
   *  has its own action vocabulary. */
  formatActionForLog(type: string, data: Record<string, unknown>): string;

  /** Optional: generate an AI deck from a card catalog when the level
   *  doesn't ship a pre-built one. Used at game-start for variety.
   *  Engines that don't support catalog-based decks can omit this. */
  generateAIDeck?(setCode: string, catalog: unknown[]): DeckCard[];
}

// ── Known game codes (build-time contract) ────────────────────────────
//
// The runtime registry is populated by each app that ships engine
// adapters. This list is the build-time contract for *which codes
// SHOULD have adapters somewhere on the platform* — the audit at
// `pnpm audit:play-game-registry` cross-checks DB values against this
// list (and against the runtime registry when run from the storefront).
//
// Adding a new game in Phase 2+:
//   1. Append to this list.
//   2. Ship the adapter in the relevant app (e.g.
//      apps/storefront/src/lib/game/pokemon-engine.ts).
//   3. Register it in apps/storefront/src/lib/game/registry-bootstrap.ts.

export const KNOWN_GAME_CODES = ["optcg"] as const;
export type KnownGameCode = (typeof KNOWN_GAME_CODES)[number];

export function isKnownGameCode(code: string): code is KnownGameCode {
  return (KNOWN_GAME_CODES as readonly string[]).includes(code);
}

// ── The registry ──────────────────────────────────────────────────────

const engines = new Map<string, GameEngine>();

/** Register an engine. Idempotent for the same engine instance under
 *  the same code; throws if a different engine instance is already
 *  registered under that code (catches double-registration bugs). */
export function register(engine: GameEngine): void {
  const existing = engines.get(engine.gameCode);
  if (existing && existing !== engine) {
    throw new Error(
      `@cambridge-tcg/play: another engine is already registered under code "${engine.gameCode}". ` +
      `This usually means two implementations are competing; pick one.`,
    );
  }
  engines.set(engine.gameCode, engine);
}

/** Look up an engine by gameCode. Returns null if not registered.
 *  Callers MUST handle the null case (typically by returning a 404 or
 *  falling back to "optcg" for unmigrated rows). */
export function getEngine(gameCode: string | null | undefined): GameEngine | null {
  if (!gameCode) return null;
  return engines.get(gameCode) ?? null;
}

/** List all registered engines. Used by the audit and for diagnostic
 *  endpoints. */
export function listEngines(): GameEngine[] {
  return Array.from(engines.values());
}

/** Reset the registry. Test-only; never called from production code. */
export function _resetRegistryForTests(): void {
  engines.clear();
}
