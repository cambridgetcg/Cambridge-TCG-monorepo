// The seat-generic referee — refereed PvP rooms and the practice engine
// share this one implementation of the battle steps and setup ritual.
// Every rule cites the official Comprehensive Rules v1.2.0; the research
// trail is docs/research/optcg-rules-alignment.md.
//
// Pure functions over GameState: no I/O, no seat favoritism. The server
// (engine.performAction) applies these for refereed rooms; practice mode
// applies them with an AI in one chair. pendingDefense lives IN the state
// so a room row or a carried practice game resumes mid-battle.

import { applyAction } from "./reducer";
import {
  attackPower,
  defensePower,
  validateAction,
  type ValidationResult,
} from "./validate";
import { finalizeSetup, mulliganHand } from "./engine-setup";
import type { GameCard, GameState } from "./types";

export type Seat = "player1" | "player2";
export const otherSeat = (s: Seat): Seat => (s === "player1" ? "player2" : "player1");

export interface RefereeStep {
  state: GameState;
  /** Narration lines for whoever renders this step. */
  narration: string[];
  rejected?: ValidationResult;
}

const reject = (state: GameState, code: string, reason: string): RefereeStep => ({
  state,
  narration: [],
  rejected: { ok: false, code, reason },
});

function gate(state: GameState, seat: Seat): RefereeStep | null {
  if (state.pendingDefense) {
    if (state.pendingDefense.defender === seat) {
      return reject(
        state,
        "defend_first",
        "An attack is coming at you — resolve your block/counter first (send a defend move).",
      );
    }
    return reject(
      state,
      "await_defense",
      "Your attack is declared — the defender decides their block/counter now.",
    );
  }
  if (state.phase === "setup") {
    return reject(state, "setup_first", "Finish the mulligan decision first.");
  }
  return null;
}

function boardCard(state: GameState, seat: Seat, id: string): GameCard | null {
  const p = state[seat];
  return (
    ([p.leader, ...p.field].filter(Boolean) as GameCard[]).find((c) => c.id === id) ?? null
  );
}

/* ── Setup: the official mulligan window (CR 5-2-1-6) ─────────────── */

export function refereeMulligan(
  state: GameState,
  seat: Seat,
  redraw: boolean,
): RefereeStep {
  if (state.phase !== "setup") {
    return reject(state, "not_setup", "The mulligan window is closed.");
  }
  if (state.setupDecisions?.[seat]) {
    return reject(state, "already_decided", "You already decided your mulligan (once per player).");
  }
  let s: GameState = JSON.parse(JSON.stringify(state));
  s.setupDecisions = { ...s.setupDecisions, [seat]: { redraw } };
  const narration = [
    seat === "player1" ? "Player 1 locked their mulligan decision." : "Player 2 locked their mulligan decision.",
  ];

  const p1 = s.setupDecisions?.player1;
  const p2 = s.setupDecisions?.player2;
  if (p1 && p2) {
    // Both in: apply in official order — the first player decides (and
    // redraws) first (5-2-1-6) — then life is dealt (5-2-1-7).
    const order: Seat[] =
      s.firstPlayer === s.player1.userId ? ["player1", "player2"] : ["player2", "player1"];
    for (const k of order) {
      if (s.setupDecisions?.[k]?.redraw) {
        s = mulliganHand(s, k);
        narration.push(`${s[k].name} returned their hand and redrew 5.`);
      }
    }
    s = finalizeSetup(s);
    narration.push(
      `Life cards are set — ${s.player1.life.length} and ${s.player2.life.length}. The first player begins.`,
    );
  }
  return { state: s, narration };
}

/* ── Main-phase moves ─────────────────────────────────────────────── */

export function refereePlay(state: GameState, seat: Seat, cardId: string): RefereeStep {
  const g = gate(state, seat);
  if (g) return g;
  const v = validateAction(state, seat, "play_card", { cardId });
  if (!v.ok) return { state, narration: [], rejected: v };

  const card = state[seat].hand.find((c) => c.id === cardId)!;
  let s = state;
  const cost = card.cost ?? 0;
  if (cost > 0) s = applyAction(s, seat, "rest_don", { count: cost });

  const narration: string[] = [];
  if (card.category === "event") {
    s = applyAction(s, seat, "move_card", { cardId, toZone: "trash" });
    narration.push(
      `${state[seat].name} played the event ${card.name}${cost ? ` (cost ${cost})` : ""} — effect not interpreted yet; it resolves to trash.`,
    );
  } else if (card.category === "stage") {
    const old = s[seat].stage;
    if (old) s = applyAction(s, seat, "move_card", { cardId: old.id, toZone: "trash" });
    s = applyAction(s, seat, "move_card", { cardId, toZone: "stage" });
    narration.push(
      old
        ? `${state[seat].name} replaced ${old.name} with ${card.name} (CR 6-5-3).`
        : `${state[seat].name} set the stage: ${card.name}.`,
    );
  } else {
    s = applyAction(s, seat, "move_card", { cardId, toZone: "field" });
    narration.push(`${state[seat].name} played ${card.name}${cost ? ` (cost ${cost})` : ""}.`);
  }
  return { state: s, narration };
}

export function refereeAttachDon(state: GameState, seat: Seat, cardId: string): RefereeStep {
  const g = gate(state, seat);
  if (g) return g;
  const v = validateAction(state, seat, "attach_don", { cardId });
  if (!v.ok) return { state, narration: [], rejected: v };
  const s = applyAction(state, seat, "attach_don", { cardId });
  const target = boardCard(s, seat, cardId);
  return {
    state: s,
    narration: [`${state[seat].name} gave 1 DON!! to ${target?.name ?? "a card"} (+1000).`],
  };
}

/** Declare an attack. In refereed play this OPENS the defense window —
 *  the defender (human or AI driver) must answer before anything else. */
export function refereeAttack(
  state: GameState,
  seat: Seat,
  move: { attackerId: string; targetType: "leader" | "character"; targetId?: string },
): RefereeStep {
  const g = gate(state, seat);
  if (g) return g;
  const v = validateAction(state, seat, "attack", move);
  if (!v.ok) return { state, narration: [], rejected: v };

  const s: GameState = JSON.parse(JSON.stringify(state));
  const attacker = boardCard(s, seat, move.attackerId)!;
  s.pendingDefense = {
    defender: otherSeat(seat),
    attackerId: move.attackerId,
    targetType: move.targetType,
    targetId: move.targetId,
  };
  const atk = attackPower(attacker);
  return {
    state: s,
    narration: [
      `${state[seat].name}'s ${attacker.name} attacks${atk != null ? ` with ${atk} power` : ""} — ${state[otherSeat(seat)].name} may block or counter.`,
    ],
  };
}

/* ── The Damage Step, once, for every mode (CR 7-1-4) ─────────────── */

export function resolveDamageStep(
  state: GameState,
  attackerSeat: Seat,
  attackerId: string,
  targetType: "leader" | "character",
  targetId: string | undefined,
  counterBonus: number,
): { state: GameState; narration: string[] } {
  const attacker = boardCard(state, attackerSeat, attackerId);
  const defSeat = otherSeat(attackerSeat);
  const defender =
    targetType === "leader"
      ? state[defSeat].leader
      : state[defSeat].field.find((c) => c.id === targetId) ?? null;

  if (!attacker || !defender) {
    // Battle fizzles (target vanished) — clear the window, rest nothing.
    const s: GameState = JSON.parse(JSON.stringify(state));
    s.pendingDefense = null;
    return { state: s, narration: ["The battle fizzled — its target is gone."] };
  }

  const atk = attackPower(attacker);
  const baseDef = defensePower(defender);
  const defense = (baseDef ?? 0) + counterBonus;
  const outcome: "hit" | "miss" | "unknown" =
    atk == null || baseDef == null ? "unknown" : atk >= defense ? "hit" : "miss";

  let s = applyAction(state, attackerSeat, "attack", {
    attackerId,
    targetType,
    targetId,
    resolve: outcome === "miss" ? "miss" : "hit",
  });
  s.pendingDefense = null;

  const numbers =
    atk != null && baseDef != null
      ? ` (${atk} vs ${defense})`
      : " (powers unknown — counts as a hit)";
  const narration: string[] = [];
  if (outcome === "miss") {
    narration.push(
      `${attacker.name} attacked ${targetType === "leader" ? `${state[defSeat].name}'s leader` : defender.name}${numbers} — not enough power. No damage.`,
    );
  } else {
    narration.push(
      `${attacker.name} hit ${targetType === "leader" ? `${state[defSeat].name}'s leader` : defender.name}${numbers}!`,
    );
    if (s.phase === "finished") {
      narration.push(`${state[attackerSeat].name} wins — the defender's life is gone.`);
    } else if (targetType === "leader") {
      const taken = s[defSeat].hand[s[defSeat].hand.length - 1];
      const trig = taken?.hasTrigger
        ? " It carries a [Trigger] — not interpreted yet, so it joins the hand."
        : "";
      narration.push(`${state[defSeat].name} takes a life card into hand.${trig}`);
    }
  }
  return { state: s, narration };
}

/** The defender's answer: optional [Blocker] redirect + counters, then
 *  the damage step (Block 7-1-2 → Counter 7-1-3 → Damage 7-1-4). */
export function refereeDefend(
  state: GameState,
  seat: Seat,
  choice: { blockerId?: string | null; counterCardIds?: string[] },
): RefereeStep {
  const pd = state.pendingDefense;
  if (!pd) return reject(state, "no_pending", "No attack to defend against.");
  if (pd.defender !== seat) {
    return reject(state, "not_defender", "You're the attacker here — the defender decides.");
  }

  let s: GameState = JSON.parse(JSON.stringify(state));
  const narration: string[] = [];
  let targetType = pd.targetType;
  let targetId = pd.targetId;

  if (choice.blockerId) {
    const b = s[seat].field.find((c) => c.id === choice.blockerId);
    if (!b || b.isRested || !b.keywords?.includes("blocker")) {
      return reject(
        state,
        "bad_blocker",
        "A blocker must be one of your ACTIVE characters with [Blocker].",
      );
    }
    s = applyAction(s, seat, "toggle_rest", { cardId: b.id });
    targetType = "character";
    targetId = b.id;
    narration.push(`${state[seat].name} blocks with ${b.name} — the attack is redirected.`);
  }

  let counterBonus = 0;
  for (const id of choice.counterCardIds ?? []) {
    const card = s[seat].hand.find((c) => c.id === id);
    if (!card || card.counter == null || card.counter <= 0) {
      return reject(
        state,
        "bad_counter",
        "Counters must be cards in your hand with a printed counter value.",
      );
    }
    s = applyAction(s, seat, "move_card", { cardId: id, toZone: "trash" });
    counterBonus += card.counter;
    narration.push(`${state[seat].name} trashes ${card.name} for +${card.counter} counter.`);
  }

  const attackerSeat = otherSeat(seat);
  const resolved = resolveDamageStep(
    s,
    attackerSeat,
    pd.attackerId,
    targetType,
    targetId,
    counterBonus,
  );
  return { state: resolved.state, narration: [...narration, ...resolved.narration] };
}

export function refereeBeginTurn(state: GameState, seat: Seat): RefereeStep {
  const g = gate(state, seat);
  if (g) return g;
  const v = validateAction(state, seat, "begin_turn", {});
  if (!v.ok) return { state, narration: [], rejected: v };
  const s = applyAction(state, seat, "begin_turn", {});
  return {
    state: s,
    narration: [`${state[seat].name}'s turn — refresh, draw, DON!!.`],
  };
}

export function refereeEndTurn(state: GameState, seat: Seat): RefereeStep {
  const g = gate(state, seat);
  if (g) return g;
  const v = validateAction(state, seat, "end_turn", {});
  if (!v.ok) return { state, narration: [], rejected: v };
  const s = applyAction(state, seat, "end_turn", {});
  return { state: s, narration: [`${state[seat].name} ended their turn.`] };
}
