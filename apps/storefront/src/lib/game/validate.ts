// Pure rules validation for the OPTCG engine — the first slice of the
// "server-side rules validation" the PVE pause is waiting on.
//
// Scope, stated honestly: this validates the VANILLA game — turn ownership,
// zone legality by card category, DON!! cost payment, attack timing, and
// power comparison. Card effects ([On Play], [Blocker], [Trigger], [Rush],
// counters) are NOT interpreted; boards using this layer must say so.
//
// Every rejection carries a machine code and a human sentence. The sentence
// is written for a first-time player — validation doubles as the board's
// teaching voice ("why can't I do that?" gets a real answer).
//
// Pure function, no I/O — usable by the browser practice board today and by
// the server when durable battles reopen.

import type { GameCard, GameState } from "./types";

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; reason: string };

const ok: ValidationResult = { ok: true };
const no = (code: string, reason: string): ValidationResult => ({
  ok: false,
  code,
  reason,
});

/** Attack math shared by validation, the AI, and the board's log lines. */
export function attackPower(card: GameCard): number | null {
  if (card.power == null) return null;
  return card.power + card.attachedDon * 1000;
}

export function defensePower(card: GameCard): number | null {
  return card.power ?? null;
}

/** Outcome of a declared attack under vanilla rules. `unknown` when either
 *  side's printed power is missing — callers surface that honestly. */
export function resolveAttack(
  attacker: GameCard,
  defender: GameCard,
): "hit" | "miss" | "unknown" {
  const atk = attackPower(attacker);
  const def = defensePower(defender);
  if (atk == null || def == null) return "unknown";
  return atk >= def ? "hit" : "miss"; // ties favor the attacker
}

function findOnBoard(cards: (GameCard | null)[], id: string): GameCard | null {
  return (cards.filter(Boolean) as GameCard[]).find((c) => c.id === id) ?? null;
}

/**
 * Validate a single action for the given seat under vanilla rules.
 *
 * Never mutates. Unknown action types are rejected (closed vocabulary) —
 * the honor-system PvP tabletop deliberately does NOT run this layer.
 */
export function validateAction(
  state: GameState,
  playerKey: "player1" | "player2",
  type: string,
  data: Record<string, unknown>,
): ValidationResult {
  const player = state[playerKey];
  const opponent = playerKey === "player1" ? state.player2 : state.player1;

  if (state.phase === "finished") {
    return no("game_over", "The game is over.");
  }
  if (state.currentTurn !== player.userId) {
    return no("not_your_turn", "It's not your turn yet.");
  }

  switch (type) {
    case "begin_turn": {
      if (state.lastUpkeepTurn === state.turnNumber) {
        return no("upkeep_done", "This turn's refresh/draw/DON!! already happened.");
      }
      return ok;
    }

    case "play_card": {
      // Composite intent (pay cost + move to zone) — validated as a whole.
      const { cardId } = data as { cardId: string };
      const card = player.hand.find((c) => c.id === cardId);
      if (!card) return no("not_in_hand", "That card isn't in your hand.");

      if (card.category === "leader") {
        return no("leader_in_hand", "Leaders don't get played from hand.");
      }
      if (card.cost != null && card.cost > player.donActive) {
        return no(
          "cant_afford",
          `${card.name} costs ${card.cost} DON!! — you have ${player.donActive} active.`,
        );
      }
      if (card.category === "stage") {
        // CR 6-5-3: playing a new Stage replaces the existing one.
        return ok;
      }
      if (card.category === "event") {
        // Vanilla engine: the cost is real, the effect is not interpreted.
        // Playable so event cards aren't dead weight; the board labels it.
        return ok;
      }
      // Characters (and unknown-category cards, degrading gracefully).
      if (player.field.length >= 5) {
        return no("field_full", "Your character area is full (5 max).");
      }
      return ok;
    }

    case "attack": {
      const { attackerId, targetType, targetId } = data as {
        attackerId: string;
        targetType: "leader" | "character";
        targetId?: string;
      };
      const attacker = findOnBoard([player.leader, ...player.field], attackerId);
      if (!attacker) return no("no_attacker", "That card can't attack from there.");
      if (attacker.isRested) {
        return no("attacker_rested", `${attacker.name} is rested — it already acted this turn.`);
      }
      if (state.turnNumber <= 2) {
        // CR 6-5-6-1: "Neither player can battle on their first turn."
        return no(
          "first_turn",
          "Neither player can attack on their first turn — build your board first.",
        );
      }
      if (
        attacker.zone === "field" &&
        attacker.turnPlayed != null &&
        attacker.turnPlayed === state.turnNumber &&
        !attacker.keywords?.includes("rush")
      ) {
        return no(
          "summoning_sickness",
          `${attacker.name} was just played — characters can't attack the turn they arrive (unless they have [Rush]).`,
        );
      }
      if (targetType === "leader") return ok;
      if (!targetId) return no("no_target", "Pick a character to attack.");
      const target = findOnBoard(opponent.field, targetId);
      if (!target) return no("target_gone", "That character isn't on the field.");
      if (!target.isRested) {
        return no(
          "target_active",
          `${target.name} is active — only rested characters can be attacked.`,
        );
      }
      return ok;
    }

    case "attach_don": {
      const { cardId } = data as { cardId: string };
      if (player.donActive <= 0) return no("no_don", "No active DON!! to attach.");
      const target = findOnBoard([player.leader, ...player.field], cardId);
      if (!target) return no("bad_don_target", "DON!! attaches to your leader or characters.");
      return ok;
    }

    case "end_turn":
      return ok;

    default:
      return no("unknown_action", "That move isn't part of practice battles.");
  }
}
