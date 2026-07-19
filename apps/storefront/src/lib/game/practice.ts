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
import {
  dealOpeningHands,
  finalizeSetup,
  mulliganHand,
} from "./engine-setup";
import type { GameAction, GameCard, GameState } from "./types";
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

/** An AI attack against the player, paused for the defense window
 *  (Block Step 7-1-2 + Counter Step 7-1-3). Serializable — a saved game
 *  resumes mid-defense. */
export interface PendingDefense {
  attackerId: string;
  targetType: "leader" | "character";
  targetId?: string;
  /** AI actions still queued after this attack resolves. */
  remainingAiActions: GameAction[];
}

export interface PracticeGame {
  state: GameState;
  log: PracticeLogEntry[];
  /** Set while an AI attack awaits the player's block/counter decision. */
  pendingDefense?: PendingDefense | null;
}

export const PLAYER_ID = "practice-you";
export const AI_ID = "practice-ai";

const PLAYER_KEY = "player1" as const;
const AI_KEY = "player2" as const;

function entry(text: string, actor: PracticeLogEntry["actor"]): PracticeLogEntry {
  return { text, actor };
}

const DEFEND_FIRST: ValidationResult = {
  ok: false,
  code: "defend_first",
  reason: "An attack is coming in — decide your block/counter first.",
};

const SETUP_FIRST: ValidationResult = {
  ok: false,
  code: "setup_first",
  reason: "Finish the mulligan decision first.",
};

function blocked(game: PracticeGame): ValidationResult | null {
  if (game.pendingDefense) return DEFEND_FIRST;
  if (game.state.phase === "setup") return SETUP_FIRST;
  return null;
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
  const gate = blocked(game);
  if (gate) return { game, rejected: gate };
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
    // CR 6-5-3: a new Stage replaces the old one — the old goes to trash.
    const old = state.player1.stage;
    if (old) {
      state = applyAction(state, PLAYER_KEY, "move_card", {
        cardId: old.id,
        toZone: "trash",
      });
    }
    state = applyAction(state, PLAYER_KEY, "move_card", { cardId, toZone: "stage" });
    log.push(
      entry(
        old
          ? `You replaced ${old.name} with ${card.name}${cost ? ` (cost ${cost})` : ""} — the old stage goes to trash.`
          : `You set the stage: ${card.name}${cost ? ` (cost ${cost})` : ""}.`,
        "you",
      ),
    );
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
  const gate = blocked(game);
  if (gate) return { game, rejected: gate };
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
  let defender =
    targetType === "leader" ? p2.leader! : p2.field.find((c) => c.id === targetId)!;
  let finalTargetType = targetType;
  let finalTargetId = targetId;

  let state = game.state;
  let log = [...game.log];
  const atk = attackPower(attacker);

  // ── Block Step (7-1-2), AI seat: rest an active [Blocker] to redirect.
  // Heuristic: block hits on the leader when life is short, or hits that
  // would KO a character worth more than the cheapest blocker.
  const aiBlockers = p2.field.filter(
    (c) => !c.isRested && c.keywords?.includes("blocker"),
  );
  const wouldHit = (d: GameCard) => {
    const dp = defensePower(d);
    return atk == null || dp == null || atk >= dp;
  };
  const worthBlocking =
    (finalTargetType === "leader" && p2.life.length <= 3 && wouldHit(p2.leader!)) ||
    (finalTargetType === "character" &&
      wouldHit(defender) &&
      (defender.cost ?? 0) >= 3);
  if (aiBlockers.length > 0 && worthBlocking) {
    const blocker = [...aiBlockers].sort(
      (a, b) => (a.power ?? 0) - (b.power ?? 0),
    )[0];
    state = applyAction(state, AI_KEY, "toggle_rest", { cardId: blocker.id });
    defender = state.player2.field.find((c) => c.id === blocker.id)!;
    finalTargetType = "character";
    finalTargetId = blocker.id;
    log.push(entry(`${p2.name} blocks with ${blocker.name} — the attack is redirected!`, "ai"));
  }

  // ── Counter Step (7-1-3), AI seat: trash counter cards to survive.
  // Heuristic: only to protect short life or a costly character; up to two
  // counters, smallest first, only if that actually flips the outcome.
  let counterBonus = 0;
  const def0 = defensePower(defender);
  if (atk != null && def0 != null && atk >= def0) {
    const protecting =
      (finalTargetType === "leader" && state.player2.life.length <= 3) ||
      (finalTargetType === "character" && (defender.cost ?? 0) >= 3);
    if (protecting) {
      const counters = state.player2.hand
        .filter((c) => c.counter != null && c.counter > 0)
        .sort((a, b) => (a.counter ?? 0) - (b.counter ?? 0));
      const used: GameCard[] = [];
      let sum = 0;
      for (const c of counters) {
        if (used.length >= 2) break;
        used.push(c);
        sum += c.counter ?? 0;
        if (def0 + sum > atk) break;
      }
      if (def0 + sum > atk) {
        for (const c of used) {
          state = applyAction(state, AI_KEY, "move_card", {
            cardId: c.id,
            toZone: "trash",
          });
          log.push(
            entry(`${p2.name} trashes ${c.name} for +${c.counter} counter.`, "ai"),
          );
        }
        counterBonus = sum;
      }
    }
  }

  const defense = (defensePower(defender) ?? 0) + counterBonus;
  const outcome: "hit" | "miss" | "unknown" =
    atk == null || defensePower(defender) == null
      ? "unknown"
      : atk >= defense
        ? "hit"
        : "miss";
  const resolve = outcome === "miss" ? "miss" : "hit";
  state = applyAction(state, PLAYER_KEY, "attack", {
    attackerId,
    targetType: finalTargetType,
    targetId: finalTargetId,
    resolve,
  });

  log.push(
    entry(
      describeAttack(
        attacker.name,
        atk,
        finalTargetType === "leader" ? `${p2.name}'s leader` : defender.name,
        defensePower(defender) == null ? null : defense,
        outcome,
        "You",
      ),
      "you",
    ),
  );
  if (state.phase === "finished" && state.winner === PLAYER_ID) {
    log.push(entry("Their life is gone — you win!", "board"));
  } else if (outcome !== "miss" && finalTargetType === "leader") {
    const banish = attacker.keywords?.includes("banish") === true;
    const dbl = attacker.keywords?.includes("double_attack") === true;
    log.push(
      entry(
        `${p2.name} ${banish ? "banishes" : "takes"} ${dbl ? "2 life cards" : "a life card"}${banish ? " to the trash ([Banish])" : " into hand"}${dbl ? " ([Double Attack])" : ""}.`,
        "board",
      ),
    );
  }

  return { game: { state, log } };
}

export function attachDon(
  game: PracticeGame,
  cardId: string,
): { game: PracticeGame; rejected?: ValidationResult } {
  const gate = blocked(game);
  if (gate) return { game, rejected: gate };
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
  const gate = blocked(game);
  if (gate) return { game, steps: [], rejected: gate };
  const v = validateAction(game.state, PLAYER_KEY, "end_turn", {});
  if (!v.ok) return { game, steps: [], rejected: v };

  let state = applyAction(game.state, PLAYER_KEY, "end_turn", {});
  let log = [...game.log, entry("You ended your turn.", "you")];
  const steps: PracticeStep[] = [{ state, log }];

  const aiResult = runAiTurn({ state, log });
  steps.push(...aiResult.steps);
  if (aiResult.game.pendingDefense) {
    // The AI's attack awaits the player's block/counter decision.
    return { game: aiResult.game, steps };
  }
  const done = finishAiFlow(aiResult);
  steps.push(...done.steps.slice(aiResult.steps.length));
  return { game: done.game, steps };
}

/** The AI's full turn as reducer steps. Attacks pause for the player's
 *  defense window (block + counter) — resolveDefense resumes the queue. */
function runAiTurn(game: PracticeGame): { game: PracticeGame; steps: PracticeStep[] } {
  const state = game.state;
  if (state.phase === "finished" || state.currentTurn !== AI_ID) {
    return { game, steps: [] };
  }
  const aggression = state.aiAggression ?? 0.5;
  const decision = aiTurn(state, "player2", aggression);
  let actions = decision.actions;
  if (state.turnNumber === 1 && state.firstPlayer === AI_ID) {
    actions = actions.filter((a) => a.type !== "draw_card");
  }
  if (state.turnNumber <= 2) {
    actions = actions.filter((a) => a.type !== "attack");
  }
  return runAiActions(game, actions);
}

/** Apply queued AI actions one by one; PAUSE when an attack targets the
 *  player, exposing the defense window. */
function runAiActions(
  game: PracticeGame,
  actions: GameAction[],
): { game: PracticeGame; steps: PracticeStep[] } {
  let state = game.state;
  let log = game.log;
  const steps: PracticeStep[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (state.phase === "finished") break;

    if (action.type === "attack") {
      const data = action.data as {
        attackerId: string;
        targetType: "leader" | "character";
        targetId?: string;
      };
      const ai = state.player2;
      const attacker = ([ai.leader, ...ai.field].filter(Boolean) as GameCard[]).find(
        (c) => c.id === data.attackerId,
      );
      if (!attacker || attacker.isRested) continue;

      const atk = attackPower(attacker);
      // The plan was drawn at turn start; the battlefield may have moved.
      // A planned character target that has died or stood back up is no
      // longer legal — the attack is re-declared against the leader
      // instead of fizzling (each attack is declared fresh, CR 7-1-1).
      // Found by playing: Kaido's later swings vanished after his first
      // attack killed the shared target (2026-07-19).
      let targetType = data.targetType;
      let targetId = data.targetId;
      if (targetType === "character") {
        const t = state.player1.field.find((c) => c.id === targetId);
        if (!t || !t.isRested) {
          targetType = "leader";
          targetId = undefined;
        }
      }
      const target =
        targetType === "leader"
          ? state.player1.leader
          : state.player1.field.find((c) => c.id === targetId);
      if (!target) continue;

      log = [
        ...log,
        entry(
          `${ai.name}'s ${attacker.name} attacks ${
            targetType === "leader" ? "your leader" : target.name
          }${atk != null ? ` with ${atk} power` : ""} — your move: block or counter?`,
          "ai",
        ),
      ];
      const paused: PracticeGame = {
        state,
        log,
        pendingDefense: {
          attackerId: data.attackerId,
          targetType,
          targetId,
          remainingAiActions: actions.slice(i + 1),
        },
      };
      steps.push({ state, log });
      return { game: paused, steps };
    }

    state = applyAction(state, AI_KEY, action.type, action.data);
    const text = describeAiAction(action.type, action.data, state);
    if (text) log = [...log, entry(text, "ai")];
    steps.push({ state, log });
  }

  return { game: { state, log, pendingDefense: null }, steps };
}

/**
 * The player's answer to a paused AI attack: optionally rest one of their
 * active [Blocker] characters (Block Step 7-1-2) and/or trash hand cards
 * for their printed counter values (Counter Step 7-1-3). Then the Damage
 * Step resolves and the AI's remaining actions continue.
 */
export function resolveDefense(
  game: PracticeGame,
  choice: { blockerId?: string | null; counterCardIds?: string[] },
): { game: PracticeGame; steps: PracticeStep[]; rejected?: ValidationResult } {
  const pd = game.pendingDefense;
  if (!pd) {
    return {
      game,
      steps: [],
      rejected: { ok: false, code: "no_pending", reason: "No attack to defend against." },
    };
  }

  let state = game.state;
  const log = [...game.log];
  const steps: PracticeStep[] = [];

  const ai = state.player2;
  const attacker = ([ai.leader, ...ai.field].filter(Boolean) as GameCard[]).find(
    (c) => c.id === pd.attackerId,
  );
  if (!attacker) {
    // Attacker vanished (shouldn't happen in vanilla) — battle fizzles.
    return finishAiFlow(
      runAiActions({ state, log, pendingDefense: null }, pd.remainingAiActions),
    );
  }

  let targetType = pd.targetType;
  let targetId = pd.targetId;
  let defender: GameCard | null =
    targetType === "leader"
      ? state.player1.leader
      : (state.player1.field.find((c) => c.id === targetId) ?? null);

  // Block Step — player's choice.
  if (choice.blockerId) {
    const blockerCard = state.player1.field.find((c) => c.id === choice.blockerId);
    if (!blockerCard || blockerCard.isRested || !blockerCard.keywords?.includes("blocker")) {
      return {
        game,
        steps: [],
        rejected: {
          ok: false,
          code: "bad_blocker",
          reason: "A blocker must be one of your ACTIVE characters with [Blocker].",
        },
      };
    }
    state = applyAction(state, PLAYER_KEY, "toggle_rest", { cardId: blockerCard.id });
    defender = state.player1.field.find((c) => c.id === blockerCard.id)!;
    targetType = "character";
    targetId = blockerCard.id;
    log.push(entry(`You block with ${defender.name} — the attack is redirected.`, "you"));
  }

  // Counter Step — player's choice.
  let counterBonus = 0;
  for (const id of choice.counterCardIds ?? []) {
    const card = state.player1.hand.find((c) => c.id === id);
    if (!card || card.counter == null || card.counter <= 0) {
      return {
        game,
        steps: [],
        rejected: {
          ok: false,
          code: "bad_counter",
          reason: "Counters must be cards in your hand with a printed counter value.",
        },
      };
    }
    state = applyAction(state, PLAYER_KEY, "move_card", { cardId: id, toZone: "trash" });
    counterBonus += card.counter;
    log.push(entry(`You trash ${card.name} for +${card.counter} counter.`, "you"));
  }

  if (!defender) {
    return finishAiFlow(
      runAiActions({ state, log, pendingDefense: null }, pd.remainingAiActions),
    );
  }

  // Damage Step (7-1-4): ties favor the attacker; counters raise defense
  // for this battle only.
  const atk = attackPower(attacker);
  const baseDef = defensePower(defender);
  const defense = (baseDef ?? 0) + counterBonus;
  const outcome: "hit" | "miss" | "unknown" =
    atk == null || baseDef == null ? "unknown" : atk >= defense ? "hit" : "miss";

  state = applyAction(state, AI_KEY, "attack", {
    attackerId: pd.attackerId,
    targetType,
    targetId,
    resolve: outcome === "miss" ? "miss" : "hit",
  });
  log.push(
    entry(
      describeAttack(
        attacker.name,
        atk,
        targetType === "leader" ? "your leader" : defender.name,
        baseDef == null ? null : defense,
        outcome,
        "AI",
      ),
      "ai",
    ),
  );
  if (state.phase === "finished" && state.winner === AI_ID) {
    log.push(entry("Your life is gone — defeat.", "board"));
  } else if (outcome !== "miss" && targetType === "leader") {
    const taken = state.player1.hand[state.player1.hand.length - 1];
    const trig = taken?.hasTrigger
      ? " It has a [Trigger] — not interpreted yet, so it joins your hand."
      : "";
    log.push(entry(`You take a life card into hand.${trig}`, "board"));
  }
  steps.push({ state, log });

  const resumed = runAiActions({ state, log, pendingDefense: null }, pd.remainingAiActions);
  const out = finishAiFlow(resumed);
  return { game: out.game, steps: [...steps, ...out.steps] };
}

/** After the AI queue drains (no pause left), hand the board back to the
 *  player: their upkeep runs so the next turn is live. */
function finishAiFlow(r: {
  game: PracticeGame;
  steps: PracticeStep[];
}): { game: PracticeGame; steps: PracticeStep[] } {
  let g = r.game;
  const steps = [...r.steps];
  if (
    !g.pendingDefense &&
    g.state.phase !== "finished" &&
    g.state.currentTurn === PLAYER_ID &&
    g.state.lastUpkeepTurn !== g.state.turnNumber
  ) {
    const ready = upkeep(g);
    if (ready !== g) {
      g = { state: ready.state, log: ready.log, pendingDefense: null };
      steps.push({ state: g.state, log: g.log });
    }
  }
  return { game: g, steps };
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
  keywords?: ("rush" | "blocker" | "double_attack" | "banish")[];
  hasTrigger?: boolean;
  isLeader?: boolean;
}

/**
 * Official setup, staged (CR 5-2-1): hands are dealt and the game pauses in
 * the mulligan window — the board shows the hand and asks Keep / Redraw.
 * `playerGoesFirst` was declared by the toss winner (5-2-1-4/5).
 */
export function startPracticeSetup(
  playerName: string,
  playerDeck: PracticeSetupCard[],
  aiName: string,
  aiDeck: PracticeSetupCard[],
  aiAggression: number,
  playerGoesFirst: boolean,
): PracticeGame {
  const state = dealOpeningHands(
    PLAYER_ID,
    playerName,
    playerDeck,
    AI_ID,
    aiName,
    aiDeck,
    playerGoesFirst ? PLAYER_ID : AI_ID,
  );
  state.aiAggression = aiAggression;
  const log: PracticeLogEntry[] = [
    entry(
      "Practice battle — it lives only in this session, records nothing, and pays nothing. Costs, power, counters, and blockers are real; other card effects aren't interpreted yet.",
      "board",
    ),
    entry(
      playerGoesFirst ? "You go first." : `${aiName} goes first.`,
      "board",
    ),
    entry(
      "Opening hands are dealt. You may redraw your whole hand once (official mulligan) — then life cards are placed.",
      "board",
    ),
  ];
  return { state, log };
}

/** The AI redraws when its opening hand can't develop early — no card of
 *  cost 2 or less. A heuristic, not doctrine; the log says what it did. */
function aiWantsMulligan(state: GameState): boolean {
  return !state.player2.hand.some((c) => c.cost != null && c.cost <= 2);
}

/**
 * Close the mulligan window (CR 5-2-1-6: first player decides first — both
 * decisions apply here in official order), deal life (5-2-1-7), and open
 * the game: the AI plays out its opening turn when it goes first, and the
 * player's first upkeep runs so the board is live.
 */
export function resolveMulligans(
  game: PracticeGame,
  playerMulligans: boolean,
): { game: PracticeGame; steps: PracticeStep[] } {
  let state = game.state;
  let log = game.log;

  const aiMulligans = aiWantsMulligan(state);
  const decisions: Array<["player1" | "player2", boolean]> =
    state.firstPlayer === PLAYER_ID
      ? [["player1", playerMulligans], ["player2", aiMulligans]]
      : [["player2", aiMulligans], ["player1", playerMulligans]];

  for (const [key, wants] of decisions) {
    if (!wants) continue;
    state = mulliganHand(state, key);
    log = [
      ...log,
      entry(
        key === "player1"
          ? "You returned your hand and redrew 5."
          : `${state.player2.name} returned their hand and redrew 5.`,
        key === "player1" ? "you" : "ai",
      ),
    ];
  }

  state = finalizeSetup(state);
  log = [
    ...log,
    entry(
      `Life cards are set — ${state.player1.life.length} for you, ${state.player2.life.length} for ${state.player2.name}. The first player begins.`,
      "board",
    ),
  ];

  let g: PracticeGame = { state, log };
  const steps: PracticeStep[] = [{ state, log }];

  if (state.firstPlayer === AI_ID) {
    const opening = runAiTurn(g);
    g = opening.game;
    steps.push(...opening.steps);
    if (g.pendingDefense) return { game: g, steps };
  }
  if (g.state.phase !== "finished") {
    const ready = upkeep(g);
    if (ready !== g) {
      g = { ...ready, pendingDefense: g.pendingDefense };
      steps.push({ state: g.state, log: g.log });
    }
  }
  return { game: g, steps };
}

/* ------------------------------------------------------------------ */
/*  Legal-move enumeration — hospitality for whoever sits at the table */
/* ------------------------------------------------------------------ */

export interface LegalAction {
  /** Machine-executable move. */
  move:
    | { type: "mulligan"; redraw: boolean }
    | { type: "play"; cardId: string }
    | { type: "attach_don"; cardId: string }
    | { type: "attack"; attackerId: string; targetType: "leader" | "character"; targetId?: string }
    | { type: "defend"; blockerId?: string | null; counterCardIds?: string[] }
    | { type: "end_turn" };
  /** One human sentence — what this move is, with the math shown. */
  label: string;
  /** For attacks: the damage-step forecast before any counters. */
  preview?: { attack: number | null; defense: number | null; outcome: "hit" | "miss" | "unknown" };
}

/**
 * Every move the PLAYER seat may legally make right now, each labelled in
 * the board's teaching voice. Guests should never have to reverse-engineer
 * the rules to know their options — the host lays the table (xeniame).
 * Pure; recomputed from state alone.
 */
export function enumerateLegalActions(game: PracticeGame): LegalAction[] {
  const s = game.state;
  const you = s.player1;
  const opp = s.player2;
  const out: LegalAction[] = [];

  if (s.phase === "finished") return out;

  if (game.pendingDefense) {
    const pd = game.pendingDefense;
    const attacker = ([opp.leader, ...opp.field].filter(Boolean) as GameCard[]).find(
      (c) => c.id === pd.attackerId,
    );
    const atk = attacker ? attackPower(attacker) : null;
    out.push({
      move: { type: "defend" },
      label: "Take the hit — no block, no counter.",
    });
    for (const b of you.field.filter((c) => !c.isRested && c.keywords?.includes("blocker"))) {
      out.push({
        move: { type: "defend", blockerId: b.id },
        label: `Block with ${b.name} (${b.power ?? "?"}) — redirects the attack to it.`,
        preview: {
          attack: atk,
          defense: defensePower(b),
          outcome: atk != null && b.power != null ? (atk >= b.power ? "hit" : "miss") : "unknown",
        },
      });
    }
    for (const c of you.hand.filter((c) => c.counter != null && c.counter > 0)) {
      out.push({
        move: { type: "defend", counterCardIds: [c.id] },
        label: `Counter with ${c.name} (+${c.counter}) — combine counterCardIds/blockerId freely in one defend move.`,
      });
    }
    return out;
  }

  if (s.phase === "setup") {
    return [
      { move: { type: "mulligan", redraw: false }, label: "Keep your opening hand." },
      {
        move: { type: "mulligan", redraw: true },
        label: "Return all 5 and redraw once (official mulligan, CR 5-2-1-6-1).",
      },
    ];
  }

  if (s.currentTurn !== PLAYER_ID) return out;

  for (const c of you.hand) {
    const v = validateAction(s, "player1", "play_card", { cardId: c.id });
    if (v.ok) {
      const kind = c.category === "event" ? "Play event" : c.category === "stage" ? "Set stage" : "Play";
      out.push({
        move: { type: "play", cardId: c.id },
        label: `${kind} ${c.name}${c.cost != null ? ` (cost ${c.cost})` : ""}${c.category === "event" ? " — effect not interpreted; resolves to trash" : ""}.`,
      });
    }
  }

  const oppTargets = opp.field.filter((c) => c.isRested);
  for (const a of [you.leader, ...you.field].filter(Boolean) as GameCard[]) {
    const vLeader = validateAction(s, "player1", "attack", {
      attackerId: a.id,
      targetType: "leader",
    });
    if (vLeader.ok) {
      const atk = attackPower(a);
      const def = opp.leader ? defensePower(opp.leader) : null;
      out.push({
        move: { type: "attack", attackerId: a.id, targetType: "leader" },
        label: `Attack their leader with ${a.zone === "leader" ? `your leader ${a.name}` : a.name} — ${atk ?? "?"} vs ${def ?? "?"}.`,
        preview: {
          attack: atk,
          defense: def,
          outcome: atk != null && def != null ? (atk >= def ? "hit" : "miss") : "unknown",
        },
      });
    }
    for (const t of oppTargets) {
      const v = validateAction(s, "player1", "attack", {
        attackerId: a.id,
        targetType: "character",
        targetId: t.id,
      });
      if (v.ok) {
        const atk = attackPower(a);
        const def = defensePower(t);
        out.push({
          move: { type: "attack", attackerId: a.id, targetType: "character", targetId: t.id },
          label: `Attack ${t.name} with ${a.name} — ${atk ?? "?"} vs ${def ?? "?"}; a hit K.O.s it.`,
          preview: {
            attack: atk,
            defense: def,
            outcome: atk != null && def != null ? (atk >= def ? "hit" : "miss") : "unknown",
          },
        });
      }
    }
    if (you.donActive > 0) {
      const v = validateAction(s, "player1", "attach_don", { cardId: a.id });
      if (v.ok) {
        const who = a.zone === "leader" ? `your leader ${a.name}` : a.name;
        out.push({
          move: { type: "attach_don", cardId: a.id },
          label: `Give 1 DON!! to ${who} (+1000 power until your turn ends).`,
        });
      }
    }
  }

  out.push({ move: { type: "end_turn" }, label: "End your turn." });
  return out;
}
