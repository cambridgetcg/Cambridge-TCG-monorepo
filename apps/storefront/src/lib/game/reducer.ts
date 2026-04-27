// Pure action reducer shared by the server engine, the PVE client board, and tests.
// Takes state + an action, returns a new state. Never touches I/O.

import type { GameCard, GamePhase, GameState } from "./types";

export function applyAction(
  state: GameState,
  playerKey: "player1" | "player2",
  type: string,
  data: Record<string, unknown>,
): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const player = s[playerKey];
  const opponent = playerKey === "player1" ? s.player2 : s.player1;

  switch (type) {
    case "move_card": {
      const { cardId, toZone, faceDown } = data as {
        cardId: string;
        toZone: string;
        faceDown?: boolean;
      };
      const allCards = [
        ...player.hand,
        ...player.field,
        player.leader,
        player.stage,
        ...player.life,
        ...player.trash,
        ...player.deck,
      ].filter(Boolean) as GameCard[];
      const card = allCards.find((c) => c.id === cardId);
      if (!card) break;

      const removeFrom = (zone: GameCard[]) => zone.filter((c) => c.id !== cardId);
      player.hand = removeFrom(player.hand);
      player.field = removeFrom(player.field);
      player.life = removeFrom(player.life);
      player.trash = removeFrom(player.trash);
      player.deck = removeFrom(player.deck);
      if (player.leader?.id === cardId) player.leader = null;
      if (player.stage?.id === cardId) player.stage = null;

      card.zone = toZone as GameCard["zone"];
      card.faceDown = faceDown ?? false;
      if (toZone === "field") player.field.push(card);
      else if (toZone === "hand") {
        card.faceDown = false;
        player.hand.push(card);
      } else if (toZone === "trash") {
        card.faceDown = false;
        player.trash.push(card);
      } else if (toZone === "life") {
        card.faceDown = true;
        player.life.push(card);
      } else if (toZone === "stage") player.stage = card;
      else if (toZone === "leader") player.leader = card;
      break;
    }

    case "toggle_rest": {
      const { cardId } = data as { cardId: string };
      const cards = [player.leader, ...player.field, player.stage].filter(Boolean) as GameCard[];
      const card = cards.find((c) => c.id === cardId);
      if (card) card.isRested = !card.isRested;
      break;
    }

    case "attach_don": {
      const { cardId } = data as { cardId: string };
      if (player.donActive <= 0) break;
      const cards = [player.leader, ...player.field].filter(Boolean) as GameCard[];
      const card = cards.find((c) => c.id === cardId);
      if (card) {
        card.attachedDon++;
        player.donActive--;
      }
      break;
    }

    case "detach_don": {
      const { cardId } = data as { cardId: string };
      const cards = [player.leader, ...player.field].filter(Boolean) as GameCard[];
      const card = cards.find((c) => c.id === cardId);
      if (card && card.attachedDon > 0) {
        card.attachedDon--;
        player.donActive++;
      }
      break;
    }

    case "rest_don": {
      const { count } = data as { count: number };
      const toRest = Math.min(count, player.donActive);
      player.donActive -= toRest;
      player.donRested += toRest;
      break;
    }

    case "refresh_all": {
      if (player.leader) player.leader.isRested = false;
      player.field.forEach((c) => (c.isRested = false));
      if (player.stage) player.stage.isRested = false;
      player.donActive += player.donRested;
      player.donRested = 0;
      break;
    }

    case "draw_card": {
      if (player.deck.length === 0) break;
      const card = player.deck.shift()!;
      card.zone = "hand";
      card.faceDown = false;
      player.hand.push(card);
      break;
    }

    case "add_don": {
      const count = s.turnNumber === 1 && s.firstPlayer === player.userId ? 1 : 2;
      const toAdd = Math.min(count, player.donDeck);
      player.donDeck -= toAdd;
      player.donActive += toAdd;
      break;
    }

    case "take_damage": {
      if (player.life.length === 0) break;
      const lifeCard = player.life.shift()!;
      lifeCard.zone = "hand";
      lifeCard.faceDown = false;
      player.hand.push(lifeCard);
      player.lifeCount = player.life.length;
      break;
    }

    case "attack": {
      const { attackerId, targetType, targetId } = data as {
        attackerId: string;
        targetType: "leader" | "character";
        targetId?: string;
      };
      const ownBoard = [player.leader, ...player.field].filter(Boolean) as GameCard[];
      const attacker = ownBoard.find((c) => c.id === attackerId);
      if (!attacker || attacker.isRested) break;

      attacker.isRested = true;

      if (targetType === "leader") {
        if (opponent.life.length > 0) {
          const lifeCard = opponent.life.shift()!;
          lifeCard.zone = "hand";
          lifeCard.faceDown = false;
          opponent.hand.push(lifeCard);
          opponent.lifeCount = opponent.life.length;
        } else {
          s.phase = "finished";
          s.winner = player.userId;
        }
      } else if (targetType === "character" && targetId) {
        const idx = opponent.field.findIndex((c) => c.id === targetId);
        if (idx >= 0) {
          const char = opponent.field.splice(idx, 1)[0];
          char.zone = "trash";
          char.attachedDon = 0;
          char.isRested = false;
          opponent.trash.push(char);
        }
      }
      break;
    }

    case "next_phase": {
      const phases: GamePhase[] = ["refresh", "draw", "don", "main", "end"];
      const idx = phases.indexOf(s.phase as GamePhase);
      if (idx >= 0 && idx < phases.length - 1) {
        s.phase = phases[idx + 1];
      }
      break;
    }

    case "end_turn": {
      s.currentTurn =
        s.currentTurn === s.player1.userId ? s.player2.userId : s.player1.userId;
      s.turnNumber++;
      s.phase = "refresh";
      break;
    }
  }

  return s;
}
