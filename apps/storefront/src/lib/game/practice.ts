// Practice-battle orchestrator — the whole game, in the browser.
//
// Why client-side: durable PVE battles are paused until server-side rules
// validation is complete (pve-availability.ts). A practice battle mints no
// identity, writes no row, and can grant nothing — the reward boundary is
// honored by construction, not by guard clauses. It also kills the AI-turn
// race outright: the AI is a synchronous function call, not a second HTTP
// request that can double-fire.
//
// Pure module: every function takes a game and returns a new game (plus the
// step-by-step trail the board animates). No timers, no fetch, no storage —
// the React board owns those.

import { applyAction } from "./reducer";
import { aiTurn } from "./ai";
import { initializeGame } from "./engine-setup";
import type { GameState } from "./types";
import {
  attackPower,
  defensePower,
  resolveAttack,
  validateAction,
  type ValidationResult,
} from "./validate";

export interface PracticeLogEntry {
  text: string;
  actor: "you" | "ai" | "board";
}

export interface PracticeStep {
  state: GameState;
  log: PracticeLogEntry[];
}

export interface PracticeGame {
  state: GameState;
  log: PracticeLogEntry[];
}

export const PLAYER_ID = "practice-you";
export const AI_ID = "practice-ai";

const PLAYER_KEY = "player1" as const;
const AI_KEY = "player2" as const;

function entry(text: string, actor: PracticeLogEntry["actor"]): PracticeLogEntry {
  return { text, actor };
}

/** Run the player's start-of-turn upkeep if it hasn't run this turn. */
function upkeep(game: PracticeGame): PracticeGame {
  const v = validateAction(game.state, PLAYER_KEY, "begin_turn", {});
  if (!v.ok) return game;
  const state = applyAction(game.state, PLAYER_KEY, "begin_turn", {});
  return {
    state,
    log: [...game.log, entry("Your turn — cards refreshed, card drawn, DON!! added.", "board")],
  };
}

/**
 * Play a card from hand: pays its DON!! cost (when printed), then moves it
 * to the right zone by category. Returns the unchanged game plus the
 * rejection when the move is illegal — the board shows the reason.
 */
export function playCard(
  game: PracticeGame,
  cardId: string,
): { game: PracticeGame; rejected?: ValidationResult } {
  const v = validateAction(game.state, PLAYER_KEY, "play_card", { cardId });
  if (!v.ok) return { game, rejected: v };

  const card = game.state.player1.hand.find((c) => c.id === cardId)!;
  let state = game.state;
  const cost = card.cost ?? 0;
  if (cost > 0) {
    state = applyAction(state, PLAYER_KEY, "rest_don", { count: cost });
  }

  const log: PracticeLogEntry[] = [...game.log];
  if (card.category === "event") {
    // Vanilla engine: cost is real, effect is not interpreted. The card
    // resolves to the trash and the log says exactly that.
    state = applyAction(state, PLAYER_KEY, "move_card", { cardId, toZone: "trash" });
    log.push(
      entry(
        `You played the event ${card.name}${cost ? ` (cost ${cost})` : ""} — its effect isn't interpreted in practice mode yet.`,
        "you",
      ),
    );
  } else if (card.category === "stage") {
    state = applyAction(state, PLAYER_KEY, "move_card", { cardId, toZone: "stage" });
    log.push(entry(`You set the stage: ${card.name}${cost ? ` (cost ${cost})` : ""}.`, "you"));
  } else {
    state = applyAction(state, PLAYER_KEY, "move_card", { cardId, toZone: "field" });
    log.push(entry(`You played ${card.name}${cost ? ` (cost ${cost})` : ""}.`, "you"));
  }

  return { game: { state, log } };
}

function describeAttack(
  attackerName: string,
  atk: number | null,
  defenderName: string,
  def: number | null,
  outcome: "hit" | "miss" | "unknown",
  possessive: "You" | "AI",
): string {
  const numbers =
    atk != null && def != null ? ` (${atk} vs ${def})` : " (powers unknown — counts as a hit)";
  const who = possessive === "You" ? "Your" : "Their";
  if (outcome === "miss") {
    return `${who} ${attackerName} attacked ${defenderName}${numbers} — not enough power. No damage.`;
  }
  return `${who} ${attackerName} hit ${defenderName}${numbers}!`;
}

/**
 * Declare an attack. Power comparison happens here (ties favor the
 * attacker); the reducer applies the outcome. Unknown printed power
 * degrades to the historical unconditional hit, and the log says so.
 */
export function attack(
  game: PracticeGame,
  attackerId: string,
  targetType: "leader" | "character",
  targetId?: string,
): { game: PracticeGame; rejected?: ValidationResult } {
  const v = validateAction(game.state, PLAYER_KEY, "attack", {
    attackerId,
    targetType,
    targetId,
  });
  if (!v.ok) return { game, rejected: v };

  const p1 = game.state.player1;
  const p2 = game.state.player2;
  const attacker = ([p1.leader, ...p1.field].filter(Boolean) as typeof p1.field).find(
    (c) => c.id === attackerId,
  )!;
  const defender =
    targetType === "leader" ? p2.leader! : p2.field.find((c) => c.id === targetId)!;

  const outcome = resolveAttack(attacker, defender);
  const resolve = outcome === "miss" ? "miss" : "hit";
  const state = applyAction(game.state, PLAYER_KEY, "attack", {
    attackerId,
    targetType,
    targetId,
    resolve,
  });

  const log = [
    ...game.log,
    entry(
      describeAttack(
        attacker.name,
        attackPower(attacker),
        targetType === "leader" ? `${p2.name}'s leader` : defender.name,
        defensePower(defender),
        outcome,
        "You",
      ),
      "you",
    ),
  ];
  if (state.phase === "finished" && state.winner === PLAYER_ID) {
    log.push(entry("Their life is gone — you win!", "board"));
  } else if (outcome !== "miss" && targetType === "leader") {
    log.push(entry(`${p2.name} takes a life card into hand.`, "board"));
  }

  return { game: { state, log } };
}

export function attachDon(
  game: PracticeGame,
  cardId: string,
): { game: PracticeGame; rejected?: ValidationResult } {
  const v = validateAction(game.state, PLAYER_KEY, "attach_don", { cardId });
  if (!v.ok) return { game, rejected: v };
  const state = applyAction(game.state, PLAYER_KEY, "attach_don", { cardId });
  const target = [state.player1.leader, ...state.player1.field]
    .filter(Boolean)
    .find((c) => c!.id === cardId);
  return {
    game: {
      state,
      log: [...game.log, entry(`You attached DON!! to ${target?.name ?? "a card"} (+1000 power).`, "you")],
    },
  };
}

/**
 * End the player's turn and run the AI's whole reply synchronously.
 * Returns intermediate steps so the board can animate them one by one —
 * a single code path, so there is nothing left to double-fire.
 */
export function endTurn(game: PracticeGame): {
  game: PracticeGame;
  steps: PracticeStep[];
  rejected?: ValidationResult;
} {
  const v = validateAction(game.state, PLAYER_KEY, "end_turn", {});
  if (!v.ok) return { game, steps: [], rejected: v };

  let state = applyAction(game.state, PLAYER_KEY, "end_turn", {});
  let log = [...game.log, entry("You ended your turn.", "you")];
  const steps: PracticeStep[] = [{ state, log }];

  const aiResult = runAiTurn({ state, log });
  state = aiResult.game.state;
  log = aiResult.game.log;
  steps.push(...aiResult.steps);

  // Back to the player: run their upkeep so the board is ready to act.
  if (state.phase !== "finished") {
    const after = upkeep({ state, log });
    state = after.state;
    log = after.log;
    steps.push({ state, log });
  }

  return { game: { state, log }, steps };
}

/** The AI's full turn as reducer steps. Attacks get the same power
 *  comparison the player gets — one rulebook for both seats. */
function runAiTurn(game: PracticeGame): { game: PracticeGame; steps: PracticeStep[] } {
  let state = game.state;
  let log = game.log;
  const steps: PracticeStep[] = [];

  if (state.phase === "finished" || state.currentTurn !== AI_ID) {
    return { game, steps };
  }

  const aggression = state.aiAggression ?? 0.5;
  const decision = aiTurn(state, AI_KEY, aggression);

  // Official rules: whoever goes first skips their first draw AND cannot
  // attack on turn 1. The AI plan includes both; drop them when it opens.
  const actions =
    state.turnNumber === 1 && state.firstPlayer === AI_ID
      ? decision.actions.filter((a) => a.type !== "draw_card" && a.type !== "attack")
      : decision.actions;

  for (const action of actions) {
    if (state.phase === "finished") break;

    if (action.type === "attack") {
      const data = action.data as { attackerId: string; targetType: "leader" | "character"; targetId?: string };
      const ai = state.player2;
      const you = state.player1;
      const attacker = ([ai.leader, ...ai.field].filter(Boolean) as typeof ai.field).find(
        (c) => c.id === data.attackerId,
      );
      if (!attacker || attacker.isRested) continue;
      const defender =
        data.targetType === "leader"
          ? you.leader
          : you.field.find((c) => c.id === data.targetId);
      if (!defender) continue;

      const outcome = resolveAttack(attacker, defender);
      state = applyAction(state, AI_KEY, "attack", {
        ...data,
        resolve: outcome === "miss" ? "miss" : "hit",
      });
      log = [
        ...log,
        entry(
          describeAttack(
            attacker.name,
            attackPower(attacker),
            data.targetType === "leader" ? "your leader" : defender.name,
            defensePower(defender),
            outcome,
            "AI",
          ),
          "ai",
        ),
      ];
      if (state.phase === "finished") {
        log = [...log, entry("Your life is gone — defeat.", "board")];
      } else if (outcome !== "miss" && data.targetType === "leader") {
        log = [...log, entry("You take a life card into hand.", "board")];
      }
    } else {
      state = applyAction(state, AI_KEY, action.type, action.data);
      const text = describeAiAction(action.type, action.data, state);
      if (text) log = [...log, entry(text, "ai")];
    }
    steps.push({ state, log });
  }

  return { game: { state, log }, steps };
}

function describeAiAction(
  type: string,
  data: Record<string, unknown>,
  state: GameState,
): string | null {
  switch (type) {
    case "refresh_all":
      return "Opponent refreshed their cards and DON!!.";
    case "draw_card":
      return "Opponent drew a card.";
    case "add_don":
      return "Opponent added DON!!.";
    case "rest_don":
      return null; // cost payment noise — the play line that follows says enough
    case "move_card": {
      const played = state.player2.field[state.player2.field.length - 1];
      return played ? `Opponent played ${played.name}.` : "Opponent played a card.";
    }
    case "attach_don":
      return "Opponent attached DON!! (+1000 power).";
    case "end_turn":
      return "Opponent ended their turn.";
    default:
      return null;
  }
}

export interface PracticeSetupCard {
  sku: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  rarity: string | null;
  category?: "leader" | "character" | "event" | "stage" | null;
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  color?: string | null;
  life?: number | null;
  textEn?: string | null;
  textAttribution?: string | null;
  isLeader?: boolean;
}

/** Build a fresh practice game. Both decks arrive as full card lists (the
 *  encoded starters) — no catalog round-trip, no partial resolution. */
export function startPracticeGame(
  playerName: string,
  playerDeck: PracticeSetupCard[],
  aiName: string,
  aiDeck: PracticeSetupCard[],
  aiAggression: number,
): { game: PracticeGame; steps: PracticeStep[] } {
  const state = initializeGame(
    PLAYER_ID,
    playerName,
    playerDeck,
    AI_ID,
    aiName,
    aiDeck,
  );
  state.aiAggression = aiAggression;

  let log: PracticeLogEntry[] = [
    entry(
      "Practice battle — it lives in this browser tab, records nothing, and pays nothing. Vanilla rules: costs and power are real, card effects aren't interpreted yet.",
      "board",
    ),
  ];
  const first = state.firstPlayer === PLAYER_ID ? "You go" : `${aiName} goes`;
  log = [...log, entry(`${first} first.`, "board")];

  let game: PracticeGame = { state, log };
  const steps: PracticeStep[] = [];

  if (state.firstPlayer === AI_ID) {
    // AI opens; then the player's first upkeep runs so the board is live.
    const opening = runAiTurn(game);
    game = opening.game;
    steps.push(...opening.steps);
  }
  const ready = upkeep(game);
  if (ready !== game) steps.push({ state: ready.state, log: ready.log });

  return { game: ready, steps };
}
